"""
email_ingestion.views
~~~~~~~~~~~~~~~~~~~~~~
Review-queue API endpoints.

Endpoints
---------
GET    /api/email/inbound/               List inbound emails (filterable by status)
GET    /api/email/inbound/{id}/          Full detail of one inbound email
POST   /api/email/inbound/{id}/approve/  Reviewer approves → creates RFI
POST   /api/email/inbound/{id}/reject/   Reviewer rejects with optional reason
POST   /api/email/inbound/{id}/retry/    Re-run matching on a pending/error email

GET    /api/email/configs/               List all EmailConfigs
POST   /api/email/configs/               Create a new EmailConfig
GET    /api/email/configs/{id}/          Retrieve one EmailConfig
PATCH  /api/email/configs/{id}/          Update (partial)
DELETE /api/email/configs/{id}/          Delete
POST   /api/email/configs/{id}/test/     Test IMAP connection

All endpoints require authentication. Config management additionally requires
is_admin on the Member profile.
"""

from __future__ import annotations

import logging

from django.db.models import Q
from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.pagination import PageNumberPagination
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .matching.composite import CompositeProjectMatcher
from .models import EmailConfig, EmailFolder, InboundEmail
from .parsing.dataclasses import ParsedEmail
from .pipeline.rfi_creator import RfiCreator
from .providers.base import ProviderError
from .providers.factory import get_provider
from .serializer import (
    ApproveEmailSerializer,
    EmailConfigSerializer,
    EmailFolderSerializer,
    InboundEmailDetailSerializer,
    InboundEmailListSerializer,
    RejectEmailSerializer,
)

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Permission helpers
# ---------------------------------------------------------------------------

class IsAdminMember(IsAuthenticated):
    """
    Authenticated AND (Member.is_admin OR Django superuser/staff).

    Django superusers and staff users are always granted access so that the
    site owner can manage email configs even before they have explicitly set
    is_admin=True on their Member profile.
    """

    def has_permission(self, request, view):
        if not super().has_permission(request, view):
            return False
        # Django superusers and staff users bypass the Member.is_admin check
        if request.user.is_superuser or request.user.is_staff:
            return True
        member = getattr(request.user, "member", None)
        return bool(member and member.is_admin)


# ---------------------------------------------------------------------------
# Pagination
# ---------------------------------------------------------------------------

class EmailPagination(PageNumberPagination):
    page_size = 20
    page_size_query_param = "page_size"
    max_page_size = 100


# ---------------------------------------------------------------------------
# Inbound email — list
# ---------------------------------------------------------------------------

class InboundEmailListView(APIView):
    """
    GET /api/email/inbound/

    Query params
    ------------
    status    filter by status value (pending, auto_created, approved, rejected, error)
    search    partial match on subject or sender_email
    """

    permission_classes = [IsAdminMember]
    pagination_class = EmailPagination

    def get(self, request):
        qs = (
            InboundEmail.objects
            .select_related("project", "rfi")
            .prefetch_related("attachments")
            .order_by("-received_at")
        )

        status_filter = request.query_params.get("status")
        if status_filter:
            qs = qs.filter(status=status_filter)

        email_type_filter = request.query_params.get("email_type")
        if email_type_filter:
            qs = qs.filter(email_type=email_type_filter)

        folder_filter = request.query_params.get("folder")
        if folder_filter:
            qs = qs.filter(folder_id=folder_filter)

        config_filter = request.query_params.get("config")
        if config_filter:
            qs = qs.filter(email_config_id=config_filter)

        search = request.query_params.get("search", "").strip()
        if search:
            qs = qs.filter(
                Q(subject__icontains=search) | Q(sender_email__icontains=search)
            )

        paginator = self.pagination_class()
        page = paginator.paginate_queryset(qs, request, view=self)
        serializer = InboundEmailListSerializer(page, many=True, context={"request": request})
        return paginator.get_paginated_response(serializer.data)


# ---------------------------------------------------------------------------
# Inbound email — detail
# ---------------------------------------------------------------------------

class InboundEmailDetailView(APIView):
    """
    GET    /api/email/inbound/{id}/
    DELETE /api/email/inbound/{id}/
    """

    permission_classes = [IsAdminMember]

    def get(self, request, pk):
        inbound = get_object_or_404(
            InboundEmail.objects
            .select_related("project", "rfi")
            .prefetch_related("attachments"),
            pk=pk,
        )
        serializer = InboundEmailDetailSerializer(inbound, context={"request": request})
        return Response(serializer.data)

    def delete(self, request, pk):
        inbound = get_object_or_404(InboundEmail, pk=pk)
        inbound.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


# ---------------------------------------------------------------------------
# Approve
# ---------------------------------------------------------------------------

class BulkDeleteInboundEmailView(APIView):
    """
    POST /api/email/inbound/bulk-delete/

    Body: { "ids": [1, 2, 3] }

    Deletes every InboundEmail whose PK is in the list.
    Returns the count of records actually removed.
    """

    permission_classes = [IsAdminMember]

    def post(self, request):
        ids = request.data.get("ids", [])
        if not isinstance(ids, list) or not ids:
            return Response(
                {"detail": "Provide a non-empty list of ids."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        deleted_count, _ = InboundEmail.objects.filter(pk__in=ids).delete()
        return Response({"deleted": deleted_count})


class ApproveEmailView(APIView):
    """
    POST /api/email/inbound/{id}/approve/

    Body (JSON)
    -----------
    {
        "project_id": 3,
        "rfi_name":   "Roof drainage clarification",
        "question":   "Please clarify ...",
        "trade":      "M",
        "due_date":   "2025-06-01"
    }

    All fields except project_id are optional and fall back to auto-parsed values.
    """

    permission_classes = [IsAdminMember]

    def post(self, request, pk):
        inbound = get_object_or_404(InboundEmail, pk=pk)

        if inbound.status not in (InboundEmail.Status.PENDING, InboundEmail.Status.ERROR):
            return Response(
                {"detail": f"Cannot approve an email with status '{inbound.get_status_display()}'."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        serializer = ApproveEmailSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        validated = serializer.validated_data
        project = validated["project_id"]  # Already resolved to a Project instance

        # Apply reviewer overrides
        inbound.project = project
        inbound.parsed_rfi_name = validated.get("rfi_name") or inbound.parsed_rfi_name
        inbound.parsed_question = validated.get("question") or inbound.parsed_question
        inbound.parsed_trade = validated.get("trade") or inbound.parsed_trade
        inbound.save(update_fields=["project", "parsed_rfi_name", "parsed_question", "parsed_trade"])

        creator = RfiCreator()
        rfi = creator.auto_create_rfi(inbound)

        if rfi is None:
            return Response(
                {"detail": "RFI creation failed. Check server logs."},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

        # Override due date if provided
        due_date = validated.get("due_date")
        if due_date:
            rfi.due_date = due_date
            rfi.save(update_fields=["due_date"])

        # Assign designers / contract admins if the reviewer picked any
        # (validated to Member instances by the serializer).
        # auto_create_rfi leaves both empty.
        designers = validated.get("designer_ids")
        if designers:
            rfi.designers.set(designers)
        contract_admins = validated.get("contract_admin_ids")
        if contract_admins:
            rfi.contract_administrators.set(contract_admins)

        # Mark as manually approved (auto_create_rfi sets AUTO_CREATED)
        inbound.refresh_from_db()
        inbound.status = InboundEmail.Status.APPROVED
        inbound.save(update_fields=["status"])

        logger.info(
            "User %s approved InboundEmail #%d → RFI %s",
            request.user.username,
            inbound.pk,
            rfi.rfi_number,
        )

        return Response(
            {
                "detail": "RFI created successfully.",
                "rfi_id": rfi.id,
                "rfi_number": rfi.rfi_number,
                "slug": rfi.slug,
            },
            status=status.HTTP_201_CREATED,
        )


# ---------------------------------------------------------------------------
# Reject
# ---------------------------------------------------------------------------

class RejectEmailView(APIView):
    """POST /api/email/inbound/{id}/reject/"""

    permission_classes = [IsAdminMember]

    def post(self, request, pk):
        inbound = get_object_or_404(InboundEmail, pk=pk)

        if inbound.status not in (InboundEmail.Status.PENDING, InboundEmail.Status.ERROR):
            return Response(
                {"detail": f"Cannot reject an email with status '{inbound.get_status_display()}'."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        serializer = RejectEmailSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        inbound.status = InboundEmail.Status.REJECTED
        inbound.rejection_reason = serializer.validated_data.get("reason", "")
        inbound.save(update_fields=["status", "rejection_reason"])

        logger.info(
            "User %s rejected InboundEmail #%d — reason: %s",
            request.user.username,
            inbound.pk,
            inbound.rejection_reason or "(none)",
        )

        return Response({"detail": "Email rejected."})


# ---------------------------------------------------------------------------
# Retry matching
# ---------------------------------------------------------------------------

class RetryEmailView(APIView):
    """
    POST /api/email/inbound/{id}/retry/

    Re-runs the project matcher. Accepts optional override text from the
    reviewer so that edits made in the UI (rfi_name, question) are used
    as the matching input rather than the original stored email text.

    Body (JSON — all optional)
    --------------------------
    {
        "subject_hint":  "RFI – 2024-001 – Roof drainage",
        "body_hint":     "We need clarification on the pipe size..."
    }

    If omitted, falls back to the original stored subject / body_text.
    """

    permission_classes = [IsAdminMember]

    def post(self, request, pk):
        inbound = get_object_or_404(InboundEmail, pk=pk)

        if inbound.status not in (InboundEmail.Status.PENDING, InboundEmail.Status.ERROR):
            return Response(
                {"detail": "Only PENDING or ERROR emails can be retried."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Use reviewer-supplied hints if provided, otherwise fall back to
        # the original stored text. This lets the user guide the matcher
        # by typing a cleaner subject or more descriptive question.
        subject_hint = request.data.get("subject_hint", "").strip()
        body_hint    = request.data.get("body_hint", "").strip()

        match_subject = subject_hint or inbound.subject
        match_body    = body_hint    or inbound.body_text

        pseudo_parsed = ParsedEmail(
            message_id=inbound.message_id,
            received_at=inbound.received_at,
            sender_name=inbound.sender_name,
            sender_email=inbound.sender_email,
            subject=match_subject,
            body_text=match_body,
        )

        # Run diagnostics before full matching so we can report what was found
        import re as _re
        from rfis.models import Project as _Project

        _PROJECT_NUMBER_PATTERN = _re.compile(
            r"(?:project\s*[:#]?\s*|#\s*)?([A-Z0-9]{1,6}[-/]\d{3,6}(?:[-/][A-Z0-9]+)?)",
            _re.IGNORECASE,
        )
        search_text = f"{match_subject} {match_body[:500]}"
        extracted_numbers = list({
            c.upper() for c in _PROJECT_NUMBER_PATTERN.findall(search_text)
        })
        total_projects = _Project.objects.count()

        match = CompositeProjectMatcher().match(pseudo_parsed)

        # Persist the new match result and save the hints as parsed fields
        inbound.project      = match.project
        inbound.confidence   = match.confidence
        inbound.match_reason = match.reason
        inbound.status       = InboundEmail.Status.PENDING
        inbound.error_message = ""

        if subject_hint:
            inbound.parsed_rfi_name = subject_hint[:200]
        if body_hint:
            inbound.parsed_question = body_hint

        inbound.save(update_fields=[
            "project", "confidence", "match_reason",
            "status", "error_message",
            "parsed_rfi_name", "parsed_question",
        ])

        return Response({
            "detail": "Re-matching complete.",
            "confidence": match.confidence,
            "match_reason": match.reason,
            "project_id": match.project.id if match.project else None,
            "project_name": match.project.project_name if match.project else None,
            "diagnostics": {
                "subject_used": match_subject,
                "extracted_numbers": extracted_numbers,
                "total_projects_in_db": total_projects,
            },
        })


# ---------------------------------------------------------------------------
# EmailConfig — CRUD
# ---------------------------------------------------------------------------

class EmailConfigListCreateView(APIView):
    """
    GET  /api/email/configs/   list all configs (any authenticated user)
    POST /api/email/configs/   create new config (admin only)
    """

    def get_permissions(self):
        if self.request.method == "POST":
            return [IsAdminMember()]
        return [IsAuthenticated()]

    def get(self, request):
        configs = EmailConfig.objects.all().order_by("label")
        serializer = EmailConfigSerializer(configs, many=True)
        return Response(serializer.data)

    def post(self, request):
        serializer = EmailConfigSerializer(data=request.data)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class EmailConfigDetailView(APIView):
    """
    GET    /api/email/configs/{id}/
    PATCH  /api/email/configs/{id}/
    DELETE /api/email/configs/{id}/
    """

    permission_classes = [IsAdminMember]

    def _get_object(self, pk):
        return get_object_or_404(EmailConfig, pk=pk)

    def get(self, request, pk):
        return Response(EmailConfigSerializer(self._get_object(pk)).data)

    def patch(self, request, pk):
        config = self._get_object(pk)
        serializer = EmailConfigSerializer(config, data=request.data, partial=True)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    def delete(self, request, pk):
        self._get_object(pk).delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


# ---------------------------------------------------------------------------
# Test connection
# ---------------------------------------------------------------------------

class TestEmailConfigView(APIView):
    """POST /api/email/configs/{id}/test/"""

    permission_classes = [IsAdminMember]

    def post(self, request, pk):
        config = get_object_or_404(EmailConfig, pk=pk)
        try:
            provider = get_provider(config)
            ok = provider.test_connection()
        except (ProviderError, Exception) as exc:
            logger.exception("Connection test failed for config #%d", pk)
            return Response({"ok": False, "detail": str(exc)})

        if ok:
            return Response({"ok": True, "detail": f"Connected to {config.imap_host} successfully."})
        return Response({"ok": False, "detail": "Login failed. Check username and password."})


class PollEmailConfigView(APIView):
    """
    POST /api/email/configs/{id}/poll/

    Runs the ingestion pipeline for a single EmailConfig immediately,
    rather than waiting for the scheduled cron job.  Returns the number
    of new emails processed and the updated last_polled_at timestamp.
    """

    permission_classes = [IsAdminMember]

    def post(self, request, pk):
        from .pipeline.pipeline import EmailIngestionPipeline

        config = get_object_or_404(EmailConfig, pk=pk)

        if not config.is_active:
            return Response(
                {"detail": "This inbox is paused. Enable it before polling."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            count = EmailIngestionPipeline().run_one(config)
        except Exception as exc:
            logger.exception("On-demand poll failed for config #%d", pk)
            return Response(
                {"ok": False, "detail": str(exc)},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

        # Re-read the timestamp that _process_config just wrote
        config.refresh_from_db(fields=["last_polled_at"])

        noun = "email" if count == 1 else "emails"
        return Response({
            "ok": True,
            "emails_processed": count,
            "last_polled_at": config.last_polled_at,
            "detail": f"Poll complete — {count} new {noun} processed.",
        })


# ---------------------------------------------------------------------------
# EmailFolder — CRUD
# ---------------------------------------------------------------------------

class ApplyEmailFoldersView(APIView):
    """
    POST /api/email/folders/apply/

    Re-runs keyword-based folder matching against every InboundEmail in the
    database.  Useful after adding or editing folders so that existing emails
    get assigned without needing to be re-fetched.

    Returns the number of emails whose folder assignment changed.
    """

    permission_classes = [IsAdminMember]

    def post(self, request):
        from .pipeline.pipeline import _match_folder
        from .parsing.dataclasses import ParsedEmail as _ParsedEmail

        updated = 0
        for email in InboundEmail.objects.select_related("folder").iterator(chunk_size=200):
            pseudo = _ParsedEmail(
                message_id=email.message_id or "",
                received_at=email.received_at,
                sender_name=email.sender_name or "",
                sender_email=email.sender_email or "",
                subject=email.subject or "",
                body_text=email.body_text or "",
            )
            new_folder = _match_folder(pseudo)
            if new_folder != email.folder:
                email.folder = new_folder
                email.save(update_fields=["folder"])
                updated += 1

        noun = "email" if updated == 1 else "emails"
        return Response({
            "detail": f"Done — {updated} {noun} re-filed.",
            "updated": updated,
        })


class EmailFolderListCreateView(APIView):
    """
    GET  /api/email/folders/   list all folders (any authenticated user)
    POST /api/email/folders/   create new folder (admin only)
    """

    def get_permissions(self):
        if self.request.method == "POST":
            return [IsAdminMember()]
        return [IsAuthenticated()]

    def get(self, request):
        folders = EmailFolder.objects.all()
        serializer = EmailFolderSerializer(folders, many=True)
        return Response(serializer.data)

    def post(self, request):
        serializer = EmailFolderSerializer(data=request.data)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class EmailFolderDetailView(APIView):
    """
    GET    /api/email/folders/{id}/
    PATCH  /api/email/folders/{id}/
    DELETE /api/email/folders/{id}/
    """

    permission_classes = [IsAdminMember]

    def _get_object(self, pk):
        return get_object_or_404(EmailFolder, pk=pk)

    def get(self, request, pk):
        return Response(EmailFolderSerializer(self._get_object(pk)).data)

    def patch(self, request, pk):
        folder = self._get_object(pk)
        serializer = EmailFolderSerializer(folder, data=request.data, partial=True)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    def delete(self, request, pk):
        self._get_object(pk).delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
