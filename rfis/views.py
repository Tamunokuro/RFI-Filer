import re
from django.db.models import Count, Q
from django.db import IntegrityError, transaction
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status, permissions
from rest_framework.pagination import PageNumberPagination
from django.utils.http import urlsafe_base64_encode, urlsafe_base64_decode
from django.core.mail import send_mail
from django.contrib.auth import get_user_model
from django.contrib.auth.tokens import default_token_generator
from django.utils.encoding import force_bytes, force_str
from django.conf import settings

from rest_framework.parsers import MultiPartParser, FormParser

from .models import Project, Rfi, Member, ProjectMembership, RfiComment, RfiReadState, RfiAttachment
from .serializer import (
    ProjectSerializer, RfiSerializer, MemberSerializer, ProjectMembershipSerializer, RegisterSerializer,
    RfiCommentSerializer, OfficialResponseSerializer, RfiAttachmentSerializer,
    MemberProfileUpdateSerializer,
)


ALLOWED_ATTACHMENT_CONTENT_TYPES = {
    "application/pdf",
    "image/jpeg", "image/png", "image/gif", "image/webp",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "text/csv",
    "video/mp4", "video/quicktime", "video/webm",
}
MAX_ATTACHMENT_SIZE_BYTES = 50 * 1024 * 1024  # 50 MB
from rest_framework_simplejwt.views import TokenObtainPairView
from .serializer import CustomTokenObtainPairSerializer


OFFICIAL_RESPONDER_ROLES = {
    Member.Role.PROJECT_DESIGNER,
    Member.Role.CONTRACT_ADMIN,
    Member.Role.PROJECT_MANAGER,
}



User = get_user_model()

class UserCreateView(APIView):
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        serializer = RegisterSerializer(data=request.data)
        if serializer.is_valid():
            user = serializer.save()
            member = user.member

            return Response(
                {
                    "id": user.id,
                    "username": user.username,
                    "email": user.email,
                    "member": {
                        "id": member.id,
                        "name": member.name,
                        "email": member.email,
                        "role": member.role,
                        "company": member.company,
                        "discipline": member.discipline,
                        "phone": member.phone,
                        "is_admin": member.is_admin,
                    },
                },
                status=status.HTTP_201_CREATED,
            )
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
    
class MeView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def _member_payload(self, user, member):
        return {
            "id": user.id,
            "username": user.username,
            "email": user.email,
            "role": member.role if member else "",
            "member": {
                "id": member.id,
                "name": member.name,
                "email": member.email,
                "role": member.role,
                "company": member.company,
                "discipline": member.discipline,
                "phone": member.phone,
                "is_admin": member.is_admin,
            } if member else None,
        }

    def get(self, request):
        user = request.user
        member = getattr(user, "member", None)
        return Response(self._member_payload(user, member))

    def patch(self, request):
        user = request.user
        member = getattr(user, "member", None)
        if member is None:
            return Response(
                {"detail": "No member profile associated with this account."},
                status=status.HTTP_404_NOT_FOUND,
            )

        serializer = MemberProfileUpdateSerializer(member, data=request.data, partial=True)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        updated_member = serializer.save()

        # Keep User.email in sync with Member.email
        new_email = serializer.validated_data.get("email")
        if new_email and new_email != user.email:
            user.email = new_email
            user.save(update_fields=["email"])

        return Response(self._member_payload(user, updated_member))
    
class ForgotPasswordView(APIView):
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        email = request.data.get("email")
        generic_response = {
            "detail": "If an account with that email exists, a reset link has been sent."
        }

        if not email:
            return Response(
                {"email": ["Email is required."]},
                status=status.HTTP_400_BAD_REQUEST,
            )

        user = User.objects.filter(email=email).first()
        if not user:
            return Response(generic_response, status=status.HTTP_200_OK)

        uid = urlsafe_base64_encode(force_bytes(user.pk))
        token = default_token_generator.make_token(user)

        reset_link = f"{settings.FRONTEND_URL}/reset-password/{uid}/{token}"

        send_mail(
            subject="Reset your password",
            message=f"Use this link to reset your password:\n{reset_link}",
            from_email=None,
            recipient_list=[user.email],
        )

        return Response(generic_response, status=status.HTTP_200_OK)
    
class ResetPasswordView(APIView):
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        uid = request.data.get("uid")
        token = request.data.get("token")
        password = request.data.get("password")
        confirm_password = request.data.get("confirm_password")

        if not all([uid, token, password, confirm_password]):
            return Response(
                {"detail": "uid, token, password, and confirm_password are required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if password != confirm_password:
            return Response(
                {"confirm_password": ["Passwords do not match."]},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            user_id = force_str(urlsafe_base64_decode(uid))
            user = User.objects.get(pk=user_id)
        except Exception:
            return Response(
                {"detail": "Invalid reset link."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if not default_token_generator.check_token(user, token):
            return Response(
                {"detail": "Invalid or expired token."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        user.set_password(password)
        user.save()

        return Response(
            {"detail": "Password reset successful."},
            status=status.HTTP_200_OK,
        )
    
class StandardPagination(PageNumberPagination):
    page_size = 10
    page_query_param = "page"

# ---------- Projects ---------

class ProjectListCreate(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        # optional search ?q=
        q = request.query_params.get("q", "")
        qs = (Project.objects
              .annotate(rfi_count=Count("rfis"))
              .select_related("project_manager"))
        if q:
            qs = qs.filter(project_name__icontains=q) | qs.filter(project_number__icontains=q) | qs.filter(project_manager__name__icontains=q)
        data = ProjectSerializer(qs, many=True).data
        return Response(data)

    def post(self, request):
        serializer = ProjectSerializer(data=request.data)
        if serializer.is_valid():
            obj = serializer.save()  # project_manager is passed as member ID
            return Response(ProjectSerializer(obj).data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

class ProjectMembers(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, pk):
        project = get_object_or_404(Project.objects.prefetch_related("members"), pk=pk)
        members = project.members.select_related("user").all()
        return Response(MemberSerializer(members, many=True).data)

class ProjectNextRfiNumber(APIView):
    """
    GET /api/projects/<pk>/next-rfi-number/
    Inspects every existing RFI for the project, finds the highest numeric
    suffix in the rfi_number field, and returns the next value formatted as
    RFI-XXX (3-digit zero-padded).  Falls back to RFI-001 for new projects.
    """
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, pk):
        project = get_object_or_404(Project, pk=pk)
        numbers = Rfi.objects.filter(project=project).values_list("rfi_number", flat=True)

        max_num = 0
        for rfi_number in numbers:
            # Match the last run of digits in the string, e.g. "RFI-007" → 7
            match = re.search(r"(\d+)\s*$", rfi_number.strip())
            if match:
                max_num = max(max_num, int(match.group(1)))

        next_number = f"RFI-{max_num + 1:03d}"
        return Response({"next_rfi_number": next_number})


class ProjectDetail(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get_object(self, pk):
        return get_object_or_404(Project.objects.annotate(rfi_count=Count("rfis")).select_related("project_manager"), pk=pk)

    def get(self, request, pk):
        proj = self.get_object(pk)
        return Response(ProjectSerializer(proj).data)

    def put(self, request, pk):
        proj = self.get_object(pk)
        serializer = ProjectSerializer(proj, data=request.data)
        if serializer.is_valid():
            proj = serializer.save()
            return Response(ProjectSerializer(proj).data)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    def patch(self, request, pk):
        proj = self.get_object(pk)
        serializer = ProjectSerializer(proj, data=request.data, partial=True)
        if serializer.is_valid():
            proj = serializer.save()
            return Response(ProjectSerializer(proj).data)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    def delete(self, request, pk):
        proj = self.get_object(pk)
        proj.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


# ---------- RFIs ----------


class RfiListCreate(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        qs = Rfi.objects.select_related("project", "author").prefetch_related(
            "designers", "contract_administrators"
        )

        project_id = request.query_params.get("project")
        if project_id:
            qs = qs.filter(project_id=project_id)

        # `assigned_to` kept as query-param name for backwards compat (MemberDetail page).
        # Matches members that appear as a designer OR contract administrator.
        member_id = request.query_params.get("assigned_to")
        if member_id:
            qs = qs.filter(
                Q(designers__id=member_id) | Q(contract_administrators__id=member_id)
            ).distinct()

        status_filter = request.query_params.get("status")
        if status_filter:
            qs = qs.filter(status=status_filter)

        term = request.query_params.get("search")
        if term:
            qs = qs.filter(
                Q(rfi_name__icontains=term) |
                Q(rfi_number__icontains=term) |
                Q(trade__icontains=term) |
                Q(project__project_number__icontains=term) |
                Q(project__project_name__icontains=term) |
                Q(designers__name__icontains=term) |
                Q(contract_administrators__name__icontains=term)
            ).distinct()

        paginator = StandardPagination()
        page = paginator.paginate_queryset(qs.order_by("-received_date", "-id"), request)
        serializer = RfiSerializer(page, many=True)
        return paginator.get_paginated_response(serializer.data)

    def post(self, request):
        # Support comma-separated designers / contract_administrators in addition to JSON arrays.
        data = request.data.copy()
        for field in ("designers", "contract_administrators"):
            raw = data.get(field)
            if isinstance(raw, str):
                ids = [s.strip() for s in raw.split(",") if s.strip()]
                if ids:
                    data.setlist(field, ids) if hasattr(data, "setlist") else data.update({field: ids})

        serializer = RfiSerializer(data=data, context={"request": request})
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        try:
            rfi = serializer.save(author=request.user)
        except IntegrityError as e:
            msg = str(e)
            if "uniq_rfi_per_project" in msg:
                return Response(
                    {"rfi_number": ["An RFI with this number already exists for the selected project."]},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            if "due_not_before_received" in msg:
                return Response(
                    {"due_date": ["Due date cannot be before the received date."]},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            # Unknown integrity error -> re-raise so you see it in logs
            raise

        # Re-serialize to include read-only/nested fields (designers_detail, contract_administrators_detail, etc.)
        return Response(RfiSerializer(rfi).data, status=status.HTTP_201_CREATED)


class RfiDetail(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get_object(self, pk):
        return get_object_or_404(
            Rfi.objects.select_related("project", "project__project_manager", "author").prefetch_related(
                "designers", "contract_administrators"
            ),
            pk=pk,
        )

    def get(self, request, pk):
        rfi = self.get_object(pk)
        return Response(RfiSerializer(rfi).data)

    def put(self, request, pk):
        rfi = self.get_object(pk)
        serializer = RfiSerializer(rfi, data=request.data, context={"request": request})
        if serializer.is_valid():
            rfi = serializer.save()  # designers / contract_administrators handled in serializer.update
            return Response(RfiSerializer(rfi).data)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    def patch(self, request, pk):
        rfi = self.get_object(pk)
        serializer = RfiSerializer(rfi, data=request.data, partial=True, context={"request": request})
        if serializer.is_valid():
            rfi = serializer.save()
            return Response(RfiSerializer(rfi).data)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    def delete(self, request, pk):
        rfi = self.get_object(pk)
        rfi.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


# ---------- RFI Discussion / Official Response ----------

class RfiCommentListCreate(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, pk):
        rfi = get_object_or_404(Rfi, pk=pk)
        qs = rfi.comments.select_related("author").all()
        return Response(RfiCommentSerializer(qs, many=True).data)

    def post(self, request, pk):
        rfi = get_object_or_404(Rfi, pk=pk)
        member = getattr(request.user, "member", None)
        if member is None:
            return Response(
                {"detail": "Only project members can post comments."},
                status=status.HTTP_403_FORBIDDEN,
            )
        if rfi.status == Rfi.Status.CLOSED:
            return Response(
                {"detail": "This RFI is closed and no longer accepts new comments."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        serializer = RfiCommentSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        comment = RfiComment.objects.create(
            rfi=rfi,
            author=member,
            body=serializer.validated_data["body"],
            is_official_response=False,
        )
        return Response(RfiCommentSerializer(comment).data, status=status.HTTP_201_CREATED)


class RfiOfficialResponse(APIView):
    permission_classes = [permissions.IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser]

    def post(self, request, pk):
        rfi = get_object_or_404(Rfi, pk=pk)
        member = getattr(request.user, "member", None)
        if member is None or member.role not in OFFICIAL_RESPONDER_ROLES:
            return Response(
                {"detail": "Only Project Designers, Contract Administrators, or Project Managers "
                           "may submit an official response."},
                status=status.HTTP_403_FORBIDDEN,
            )
        if rfi.status == Rfi.Status.CLOSED:
            return Response(
                {"detail": "This RFI is already closed."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        serializer = OfficialResponseSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        body = serializer.validated_data["body"]
        files = request.FILES.getlist("files")

        # Validate every file before touching the database
        file_errors = []
        for f in files:
            if f.size > MAX_ATTACHMENT_SIZE_BYTES:
                file_errors.append({"filename": f.name, "error": "File exceeds 50 MB limit."})
            elif f.content_type and f.content_type.lower() not in ALLOWED_ATTACHMENT_CONTENT_TYPES:
                file_errors.append({"filename": f.name, "error": f"File type '{f.content_type}' is not permitted."})
        if file_errors:
            return Response(
                {"detail": "One or more files were rejected.", "errors": file_errors},
                status=status.HTTP_400_BAD_REQUEST,
            )

        now = timezone.now()
        with transaction.atomic():
            RfiComment.objects.create(
                rfi=rfi,
                author=member,
                body=body,
                is_official_response=True,
            )
            rfi.status = Rfi.Status.CLOSED
            rfi.official_response = body
            rfi.responded_by = member
            rfi.responded_at = now
            rfi.closed_at = now
            rfi.save(update_fields=[
                "status", "official_response", "responded_by", "responded_at", "closed_at",
            ])
            for f in files:
                RfiAttachment.objects.create(
                    rfi=rfi,
                    uploaded_by=member,
                    file=f,
                    original_filename=f.name,
                    content_type=(f.content_type or "").lower(),
                    size=f.size,
                    is_official_response=True,
                )

        return Response(
            RfiSerializer(rfi, context={"request": request}).data,
            status=status.HTTP_200_OK,
        )


class RfiMarkRead(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, pk):
        rfi = get_object_or_404(Rfi, pk=pk)
        member = getattr(request.user, "member", None)
        if member is None:
            return Response(
                {"detail": "No member profile associated with this user."},
                status=status.HTTP_403_FORBIDDEN,
            )
        state, _ = RfiReadState.objects.get_or_create(rfi=rfi, member=member)
        state.save()  # auto_now updates last_read_at
        return Response({"last_read_at": state.last_read_at})


class RfiAttachmentListCreate(APIView):
    permission_classes = [permissions.IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser]

    def get(self, request, pk):
        rfi = get_object_or_404(Rfi, pk=pk)
        qs = rfi.attachments.select_related("uploaded_by").all()
        return Response(
            RfiAttachmentSerializer(qs, many=True, context={"request": request}).data
        )

    def post(self, request, pk):
        rfi = get_object_or_404(Rfi, pk=pk)
        member = getattr(request.user, "member", None)

        files = request.FILES.getlist("file") or request.FILES.getlist("files")
        if not files:
            return Response(
                {"detail": "No file uploaded. Send one or more files as 'file'."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        created = []
        errors = []
        for f in files:
            if f.size > MAX_ATTACHMENT_SIZE_BYTES:
                errors.append({"filename": f.name, "error": "File exceeds 50MB limit."})
                continue
            content_type = (f.content_type or "").lower()
            if content_type and content_type not in ALLOWED_ATTACHMENT_CONTENT_TYPES:
                errors.append({
                    "filename": f.name,
                    "error": f"Content type '{content_type}' is not permitted.",
                })
                continue
            att = RfiAttachment.objects.create(
                rfi=rfi,
                uploaded_by=member,
                file=f,
                original_filename=f.name,
                content_type=content_type,
                size=f.size,
            )
            created.append(att)

        data = RfiAttachmentSerializer(created, many=True, context={"request": request}).data
        if errors and not created:
            return Response({"detail": "No files accepted.", "errors": errors},
                            status=status.HTTP_400_BAD_REQUEST)
        return Response(
            {"created": data, "errors": errors},
            status=status.HTTP_201_CREATED,
        )


class RfiAttachmentDetail(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def delete(self, request, pk, attachment_id):
        attachment = get_object_or_404(RfiAttachment, pk=attachment_id, rfi_id=pk)
        member = getattr(request.user, "member", None)
        is_uploader = member is not None and attachment.uploaded_by_id == member.id
        is_admin = bool(member and member.is_admin)
        if not (is_uploader or is_admin):
            return Response(
                {"detail": "Only the uploader or an admin can delete this attachment."},
                status=status.HTTP_403_FORBIDDEN,
            )
        # Remove the underlying file from disk too.
        if attachment.file:
            attachment.file.delete(save=False)
        attachment.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class RfiUnreadSummary(APIView):
    """Returns { "<rfi_id>": <unread_count>, ... } for the current member across all RFIs."""
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        member = getattr(request.user, "member", None)
        if member is None:
            return Response({})

        read_map = dict(
            RfiReadState.objects.filter(member=member).values_list("rfi_id", "last_read_at")
        )

        unread = {}
        # Only count non-self comments so you don't badge yourself.
        comments = (
            RfiComment.objects
            .exclude(author=member)
            .values("rfi_id", "created_at")
        )
        for row in comments:
            rfi_id = row["rfi_id"]
            created = row["created_at"]
            last_read = read_map.get(rfi_id)
            if last_read is None or created > last_read:
                unread[str(rfi_id)] = unread.get(str(rfi_id), 0) + 1

        return Response(unread)


class RfiNotifications(APIView):
    """
    GET /api/rfis/notifications/
    Returns one entry per RFI that has unread comments for the current member,
    ordered by most-recent activity first.  Includes enough detail to render a
    notification panel (RFI number/name, project, author name, message snippet,
    timestamp, unread count).
    """
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        member = getattr(request.user, "member", None)
        if member is None:
            return Response([])

        read_map = dict(
            RfiReadState.objects.filter(member=member).values_list("rfi_id", "last_read_at")
        )

        # Fetch all comments not authored by the current member, newest first,
        # with related data pre-loaded to avoid N+1 queries.
        comments = (
            RfiComment.objects
            .exclude(author=member)
            .select_related("rfi", "rfi__project", "author")
            .order_by("-created_at")
        )

        # Group by RFI — the first comment we encounter per RFI is the latest.
        rfi_map = {}
        for comment in comments:
            rfi_id = comment.rfi_id
            last_read = read_map.get(rfi_id)
            if last_read is not None and comment.created_at <= last_read:
                continue  # this comment has been read

            if rfi_id not in rfi_map:
                rfi = comment.rfi
                rfi_map[rfi_id] = {
                    "rfi_id": rfi_id,
                    "rfi_number": rfi.rfi_number,
                    "rfi_name": rfi.rfi_name,
                    "rfi_slug": rfi.slug,
                    "project_number": rfi.project.project_number,
                    "project_name": rfi.project.project_name,
                    "unread_count": 0,
                    "latest_author": comment.author.name if comment.author else "Unknown",
                    "latest_body": comment.body[:150],
                    "latest_at": comment.created_at,
                    "is_official": comment.is_official_response,
                }
            rfi_map[rfi_id]["unread_count"] += 1

        result = sorted(rfi_map.values(), key=lambda x: x["latest_at"], reverse=True)
        for item in result:
            item["latest_at"] = item["latest_at"].isoformat()

        return Response(result)


class RfiMarkAllRead(APIView):
    """
    POST /api/rfis/mark-all-read/
    Marks every RFI that has unread comments as read for the current member.
    """
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        member = getattr(request.user, "member", None)
        if member is None:
            return Response(
                {"detail": "No member profile associated with this user."},
                status=status.HTTP_403_FORBIDDEN,
            )

        read_map = dict(
            RfiReadState.objects.filter(member=member).values_list("rfi_id", "last_read_at")
        )

        unread_rfi_ids = set()
        for row in RfiComment.objects.exclude(author=member).values("rfi_id", "created_at"):
            rfi_id = row["rfi_id"]
            last_read = read_map.get(rfi_id)
            if last_read is None or row["created_at"] > last_read:
                unread_rfi_ids.add(rfi_id)

        for rfi_id in unread_rfi_ids:
            state, _ = RfiReadState.objects.get_or_create(rfi_id=rfi_id, member=member)
            state.save()  # auto_now refreshes last_read_at

        return Response({"marked": len(unread_rfi_ids)})


# ---------- Members (optional) ----------

class MemberListCreate(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        qs = Member.objects.select_related("user")
        return Response(MemberSerializer(qs, many=True).data)

    def post(self, request):
        # if you want the logged-in user to create their own profile
        serializer = MemberSerializer(data=request.data)
        if serializer.is_valid():
            member = serializer.save(user=request.user)
            return Response(MemberSerializer(member).data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class MemberDetail(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get_object(self, pk):
        return get_object_or_404(Member.objects.select_related("user"), pk=pk)

    def get(self, request, pk):
        return Response(MemberSerializer(self.get_object(pk)).data)

    def put(self, request, pk):
        member = self.get_object(pk)
        serializer = MemberSerializer(member, data=request.data)
        if serializer.is_valid():
            member = serializer.save()
            return Response(MemberSerializer(member).data)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    def patch(self, request, pk):
        member = self.get_object(pk)
        serializer = MemberSerializer(member, data=request.data, partial=True)
        if serializer.is_valid():
            member = serializer.save()
            return Response(MemberSerializer(member).data)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    def delete(self, request, pk):
        self.get_object(pk).delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


# ---------- Project Memberships (optional) ----------

class ProjectMembershipListCreate(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        qs = ProjectMembership.objects.select_related("project", "member")
        return Response(ProjectMembershipSerializer(qs, many=True).data)

    def post(self, request):
        # If you want to support nested creation per project, accept ?project=<id>
        project_id = request.query_params.get("project")
        serializer = ProjectMembershipSerializer(data=request.data)
        if serializer.is_valid():
            if project_id:
                membership = serializer.save(project_id=project_id)
            else:
                membership = serializer.save()
            return Response(ProjectMembershipSerializer(membership).data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class ProjectMembershipDetail(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get_object(self, pk):
        return get_object_or_404(ProjectMembership.objects.select_related("project", "member"), pk=pk)

    def get(self, request, pk):
        return Response(ProjectMembershipSerializer(self.get_object(pk)).data)

    def put(self, request, pk):
        obj = self.get_object(pk)
        serializer = ProjectMembershipSerializer(obj, data=request.data)
        if serializer.is_valid():
            obj = serializer.save()
            return Response(ProjectMembershipSerializer(obj).data)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    def patch(self, request, pk):
        obj = self.get_object(pk)
        serializer = ProjectMembershipSerializer(obj, data=request.data, partial=True)
        if serializer.is_valid():
            obj = serializer.save()
            return Response(ProjectMembershipSerializer(obj).data)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    def delete(self, request, pk):
        self.get_object(pk).delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
    

#-----Customer Token Pair--------
class CustomTokenObtainPairView(TokenObtainPairView):
    serializer_class = CustomTokenObtainPairSerializer


# ---------- AI (ChatGPT) ----------

class ChatGPTCompletion(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        """
        POST body options:
          - prompt (str): user prompt (required if messages not provided)
          - system (str): optional system instruction
          - model (str): defaults to gpt-4o-mini
          - temperature (float): defaults to 0.7
          - max_tokens (int): defaults to 512
          - rfi_id (int): if provided, include RFI context in system message
          - messages (list[{role, content}]): optional full messages list
        """
        data = request.data or {}
        model = data.get("model", "gpt-4o-mini")
        temperature = float(data.get("temperature", 0.7))
        max_tokens = int(data.get("max_tokens", 512))

        messages = data.get("messages")
        prompt = data.get("prompt")
        system = data.get("system")
        rfi_id = data.get("rfi_id")

        built_messages = []
        # Build optional context from an RFI record
        if rfi_id:
            rfi = get_object_or_404(
                Rfi.objects.select_related("project").prefetch_related(
                    "designers", "contract_administrators"
                ), pk=rfi_id
            )
            rfi_ctx = build_rfi_context(rfi)
            sys_base = (
                "You are a helpful assistant for construction project RFIs. "
                "Use the provided RFI context to draft clear, concise responses; "
                "call out missing info and propose next steps when appropriate.\n\n"
            )
            system = f"{sys_base}RFI Context:\n{rfi_ctx}\n" + (f"\nAdditional Instruction:\n{system}" if system else "")

        if messages and isinstance(messages, list):
            built_messages = messages
        else:
            if system:
                built_messages.append({"role": "system", "content": system})
            if not prompt:
                return Response({"detail": "Either provide 'messages' or a 'prompt'."}, status=400)
            built_messages.append({"role": "user", "content": prompt})

        try:
            content, usage = chatgpt_chat(
                messages=built_messages,
                model=model,
                temperature=temperature,
                max_tokens=max_tokens,
            )
        except ChatGPTError as e:
            return Response({"detail": str(e)}, status=502)
        except Exception as e:
            return Response({"detail": f"Unexpected error: {e}"}, status=500)

        return Response({
            "model": model,
            "message": content,
            "usage": usage,
        })
