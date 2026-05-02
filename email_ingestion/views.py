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
from .models import EmailConfig, InboundEmail
from .parsing.dataclasses import ParsedEmail
from .pipeline.rfi_creator import RfiCreator
from .providers.base import ProviderError
from .providers.factory import get_provider
from .serializer import (
    ApproveEmailSerializer,
    EmailConfigSerializer,
    InboundEmailDetailSerializer,
    InboundEmailListSerializer,
    RejectEmailSerializer,
)

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Permission helpers
# ---------------------------------------------------------------------------

class IsAdminMember(IsAuthenticated):
    """Authenticated + Member.is_admin."""

    def has_permission(self, request, view):
        if not super().has_permission(request, view):
            return False
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

    permission_classes = [IsAuthenticated]
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
    """GET /api/email/inbound/{id}/"""

    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        inbound = get_object_or_404(
            InboundEmail.objects
            .select_related("project", "rfi")
            .prefetch_related("attachments"),
            pk=pk,
        )
        serializer = InboundEmailDetailSerializer(inbound, context={"request": request})
        return Response(serializer.data)


# ---------------------------------------------------------------------------
# Approve
# ---------------------------------------------------------------------------

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

    permission_classes = [IsAuthenticated]

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

    permission_classes = [IsAuthenticated]

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

    permission_classes = [IsAuthenticated]

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
