import re
from datetime import date, timedelta
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

from rest_framework.parsers import MultiPartParser, FormParser, JSONParser

from .models import (
    Project, Rfi, Member, ProjectMembership,
    RfiComment, RfiReadState, RfiAttachment, RfiCommentAttachment,
    RfiRevision, OfficialResponseRevision, ContractChange,
    Notification, RfiWatcher, AuditLog,
)
from .serializer import (
    ProjectSerializer, RfiSerializer, MemberSerializer, ProjectMembershipSerializer, RegisterSerializer,
    RfiCommentSerializer, RfiCommentAttachmentSerializer, OfficialResponseSerializer, RfiAttachmentSerializer,
    MemberProfileUpdateSerializer, RfiRevisionSerializer, OfficialResponseRevisionSerializer,
    ContractChangeSerializer,
)
from .email_utils import (
    notify_rfi_assigned as _email_rfi_assigned,
    notify_rfi_comment as _email_rfi_comment,
    notify_official_response as _email_official_response,
    notify_rfi_returned as _email_rfi_returned,
    notify_status_change as _email_status_change,
    notify_watcher_added as _email_watcher_added,
    notify_mention as _email_mention,
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
    Member.Role.SUB_CONSULTANT,
    Member.Role.CONTRACT_ADMIN,
    Member.Role.PROJECT_MANAGER,
}

# Only these roles (the technical design team) may submit a *revised* official
# response after the RFI is already in "responded" state.
RESPONSE_REVISOR_ROLES = {
    Member.Role.PROJECT_DESIGNER,
    Member.Role.SUB_CONSULTANT,
}

# Roles whose RFI edits are restricted to "under_review" status only
# (they are the "requester" side of the workflow).
REQUESTER_ROLES = {
    Member.Role.CONTRACTOR,
    Member.Role.CONTRACT_ADMIN,
    Member.Role.PROJECT_MANAGER,
    Member.Role.CLIENT,
}

# Designer / technical-team roles — they respond to RFIs rather than raising them.
DESIGNER_ROLES = {
    Member.Role.PROJECT_DESIGNER,
    Member.Role.SUB_CONSULTANT,
}

# RFI fields whose changes are tracked in RfiRevision records.
TRACKED_RFI_FIELDS = [
    "rfi_name", "question", "proposed_solution",
    "trade", "due_date", "received_date",
]


def _capture_rfi_snapshot(rfi):
    """Snapshot all tracked scalar fields + M2M for before/after comparison."""
    snap = {f: str(getattr(rfi, f, "") or "") for f in TRACKED_RFI_FIELDS}
    snap["designers"] = sorted(m.name for m in rfi.designers.all())
    snap["contract_administrators"] = sorted(m.name for m in rfi.contract_administrators.all())
    return snap


def _diff_snapshots(before, after):
    """Return only fields that changed, with before/after values."""
    changes = {}
    for field in set(before) | set(after):
        b, a = before.get(field), after.get(field)
        if b != a:
            changes[field] = {"before": b, "after": a}
    return changes


def _audit(rfi, actor, action: str, **detail):
    """Create an AuditLog entry. Swallows all errors so it never breaks a response."""
    try:
        AuditLog.objects.create(rfi=rfi, actor=actor, action=action, detail=detail)
    except Exception:  # noqa: BLE001
        pass


def _watchers_list(rfi):
    """Return a list of Member objects watching this RFI."""
    return list(Member.objects.filter(watched_rfis__rfi=rfi))


# Valid forward transitions for the RFI status workflow.
# Keys are the current status; values are the set of allowed next statuses.
# "closed" is a terminal state — no transitions out of it.
VALID_TRANSITIONS: dict[str, set[str]] = {
    Rfi.Status.OPEN:         {Rfi.Status.SUBMITTED, Rfi.Status.CLOSED},
    Rfi.Status.SUBMITTED:    {Rfi.Status.UNDER_REVIEW, Rfi.Status.CLOSED},
    Rfi.Status.UNDER_REVIEW: {Rfi.Status.RESPONDED, Rfi.Status.RETURNED, Rfi.Status.CLOSED},
    Rfi.Status.RESPONDED:    {Rfi.Status.CLOSED},
    Rfi.Status.RETURNED:     {Rfi.Status.SUBMITTED, Rfi.Status.CLOSED},
    Rfi.Status.CLOSED:       set(),
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
                "email_notifications": member.email_notifications,
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

# Roles permitted to create / edit projects.  Admins (is_admin=True) are
# permitted regardless of role.
PROJECT_EDITOR_ROLES = {
    Member.Role.PROJECT_MANAGER,
    Member.Role.CONTRACT_ADMIN,
}


def _member_project_ids(member):
    """
    Returns the list of project IDs accessible to *member*.
    Returns None for admins (signal: no filter — they see everything).
    Returns [] when the user has no member profile or no memberships.
    """
    if member is None:
        return []
    if member.is_admin:
        return None  # None = unrestricted
    return list(
        Project.objects.filter(
            Q(members=member) | Q(project_manager=member)
        ).values_list("id", flat=True).distinct()
    )


def _can_create_project(member):
    if member is None:
        return False
    if member.is_admin:
        return True
    return member.role in PROJECT_EDITOR_ROLES


def _can_manage_project(member, project):
    """Admins, the project's PM, or any project_admin membership can manage."""
    if member is None:
        return False
    if member.is_admin:
        return True
    if project.project_manager_id == member.id:
        return True
    return ProjectMembership.objects.filter(
        project=project, member=member, is_project_admin=True
    ).exists()


class ProjectListCreate(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        member = getattr(request.user, "member", None)
        # optional search ?q=
        q = request.query_params.get("q", "")

        base_qs = Project.objects.annotate(rfi_count=Count("rfis")).select_related("project_manager")

        if member and member.is_admin:
            # Admins see every project
            qs = base_qs
        elif member:
            # Regular members only see projects they belong to
            qs = base_qs.filter(
                Q(members=member) | Q(project_manager=member)
            ).distinct()
        else:
            qs = Project.objects.none()

        if q:
            qs = qs.filter(
                Q(project_name__icontains=q) |
                Q(project_number__icontains=q) |
                Q(project_manager__name__icontains=q)
            )
        data = ProjectSerializer(qs, many=True).data
        return Response(data)

    def post(self, request):
        member = getattr(request.user, "member", None)
        if not _can_create_project(member):
            return Response(
                {"detail": "Only admins, Project Managers, or Contract "
                           "Administrators can create projects."},
                status=status.HTTP_403_FORBIDDEN,
            )
        serializer = ProjectSerializer(data=request.data)
        if serializer.is_valid():
            obj = serializer.save()  # project_manager is passed as member ID
            # Auto-add the project manager (if any) as a project member +
            # project_admin so they immediately appear on the team list.
            if obj.project_manager_id:
                ProjectMembership.objects.get_or_create(
                    project=obj,
                    member_id=obj.project_manager_id,
                    defaults={
                        "role": Member.Role.PROJECT_MANAGER,
                        "is_project_admin": True,
                    },
                )
            # The creator is also added as a project_admin so they retain
            # management rights (separate from the PM if different).
            if member and member.id != obj.project_manager_id:
                ProjectMembership.objects.get_or_create(
                    project=obj,
                    member=member,
                    defaults={
                        "role": member.role,
                        "is_project_admin": True,
                    },
                )
            return Response(ProjectSerializer(obj).data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

class ProjectMembers(APIView):
    """
    GET    /api/projects/<pk>/members/             — list members
    POST   /api/projects/<pk>/members/             — add a member to the project
    PATCH  /api/projects/<pk>/members/<member_id>/ — update a membership row
    DELETE /api/projects/<pk>/members/<member_id>/ — remove the member
    """
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, pk):
        project = get_object_or_404(Project.objects.prefetch_related("members"), pk=pk)
        # Return the membership rows so the UI can show role + project-admin badge
        memberships = (
            ProjectMembership.objects
            .filter(project=project)
            .select_related("member", "member__user")
        )
        return Response(ProjectMembershipSerializer(memberships, many=True).data)

    def post(self, request, pk):
        project = get_object_or_404(Project, pk=pk)
        member = getattr(request.user, "member", None)
        if not _can_manage_project(member, project):
            return Response(
                {"detail": "You do not have permission to manage this project's members."},
                status=status.HTTP_403_FORBIDDEN,
            )

        target_member_id = request.data.get("member_id") or request.data.get("member")
        if not target_member_id:
            return Response({"member_id": ["This field is required."]}, status=400)

        try:
            target = Member.objects.get(pk=target_member_id)
        except (Member.DoesNotExist, ValueError, TypeError):
            return Response({"member_id": ["Member not found."]}, status=400)

        if ProjectMembership.objects.filter(project=project, member=target).exists():
            return Response(
                {"detail": "This member is already on the project."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        role = request.data.get("role") or target.role
        if role not in dict(Member.Role.choices):
            return Response({"role": [f"'{role}' is not a valid role."]}, status=400)

        discipline = request.data.get("discipline", "") or ""
        if discipline and discipline not in dict(Member.Discipline.choices):
            return Response({"discipline": [f"'{discipline}' is not a valid discipline."]}, status=400)

        is_project_admin = bool(request.data.get("is_project_admin", False))

        membership = ProjectMembership.objects.create(
            project=project,
            member=target,
            role=role,
            discipline=discipline,
            is_project_admin=is_project_admin,
        )

        # ── In-app notification ───────────────────────────────────────────────
        actor_name = member.name if member else "A team manager"
        Notification.objects.create(
            recipient=target,
            verb=Notification.Verb.PROJECT_ADDED,
            actor_name=actor_name,
            project=project,
            extra={
                "project_number": project.project_number,
                "project_name":   project.project_name,
                "role":           role,
            },
        )

        # ── Email notification ────────────────────────────────────────────────
        if target.email:
            frontend_url = getattr(settings, "FRONTEND_URL", "").rstrip("/")
            project_url  = f"{frontend_url}/projects/{project.pk}"
            try:
                send_mail(
                    subject=f"You've been added to {project.project_name}",
                    message=(
                        f"Hi {target.name},\n\n"
                        f"{actor_name} has added you to the project "
                        f"\"{project.project_name}\" ({project.project_number}) "
                        f"with the role of {role}.\n\n"
                        f"View the project here:\n{project_url}\n\n"
                        f"— RFI Filer"
                    ),
                    from_email=getattr(settings, "DEFAULT_FROM_EMAIL", "noreply@rfifiler.com"),
                    recipient_list=[target.email],
                    fail_silently=True,
                )
            except Exception:
                pass  # never let email failure break the API response

        return Response(
            ProjectMembershipSerializer(membership).data,
            status=status.HTTP_201_CREATED,
        )


class ProjectMemberDetail(APIView):
    """
    PATCH  /api/projects/<pk>/members/<member_id>/ — update role/discipline/admin flag
    DELETE /api/projects/<pk>/members/<member_id>/ — remove from project
    """
    permission_classes = [permissions.IsAuthenticated]

    def _get_membership(self, project_pk, member_id):
        return get_object_or_404(
            ProjectMembership.objects.select_related("project", "member"),
            project_id=project_pk,
            member_id=member_id,
        )

    def patch(self, request, pk, member_id):
        membership = self._get_membership(pk, member_id)
        actor = getattr(request.user, "member", None)
        if not _can_manage_project(actor, membership.project):
            return Response(
                {"detail": "You do not have permission to update memberships on this project."},
                status=status.HTTP_403_FORBIDDEN,
            )

        for field in ("role", "discipline", "is_project_admin"):
            if field in request.data:
                value = request.data[field]
                if field == "role" and value not in dict(Member.Role.choices):
                    return Response({"role": [f"'{value}' is not a valid role."]}, status=400)
                if field == "discipline" and value and value not in dict(Member.Discipline.choices):
                    return Response({"discipline": [f"'{value}' is not a valid discipline."]}, status=400)
                if field == "is_project_admin":
                    value = bool(value)
                setattr(membership, field, value)
        membership.save()
        return Response(ProjectMembershipSerializer(membership).data)

    def delete(self, request, pk, member_id):
        membership = self._get_membership(pk, member_id)
        actor = getattr(request.user, "member", None)
        if not _can_manage_project(actor, membership.project):
            return Response(
                {"detail": "You do not have permission to remove members from this project."},
                status=status.HTTP_403_FORBIDDEN,
            )
        # Don't allow removing the project's PM via this endpoint — that
        # should be done by reassigning the PM through the project edit form.
        if membership.project.project_manager_id == membership.member_id:
            return Response(
                {"detail": "Reassign the project manager before removing them from the team."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        membership.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

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

        # If ?parent_rfi_id=<id> is supplied, suggest the next .N revision number
        # for the given parent RFI (e.g. "RFI-003" → "RFI-003.1", "RFI-003.2" …).
        parent_rfi_id = request.query_params.get("parent_rfi_id")
        if parent_rfi_id:
            try:
                parent = Rfi.objects.get(pk=parent_rfi_id, project=project)
            except (Rfi.DoesNotExist, ValueError):
                return Response({"detail": "Parent RFI not found in this project."}, status=404)

            base = parent.rfi_number
            existing = Rfi.objects.filter(
                project=project, rfi_number__startswith=f"{base}."
            ).values_list("rfi_number", flat=True)

            max_sub = 0
            for num in existing:
                # match "RFI-003.2" → "2"
                m = re.search(r"\.(\d+)\s*$", num.strip())
                if m:
                    max_sub = max(max_sub, int(m.group(1)))

            next_number = f"{base}.{max_sub + 1}"
            return Response({"next_rfi_number": next_number})

        max_num = 0
        for rfi_number in numbers:
            # Only match top-level numbers (no dot); e.g. "RFI-007" → 7
            if "." not in rfi_number:
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
        member = getattr(request.user, "member", None)
        if not _can_manage_project(member, proj):
            return Response(
                {"detail": "You do not have permission to edit this project."},
                status=status.HTTP_403_FORBIDDEN,
            )
        serializer = ProjectSerializer(proj, data=request.data)
        if serializer.is_valid():
            proj = serializer.save()
            return Response(ProjectSerializer(proj).data)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    def patch(self, request, pk):
        proj = self.get_object(pk)
        member = getattr(request.user, "member", None)
        if not _can_manage_project(member, proj):
            return Response(
                {"detail": "You do not have permission to edit this project."},
                status=status.HTTP_403_FORBIDDEN,
            )
        serializer = ProjectSerializer(proj, data=request.data, partial=True)
        if serializer.is_valid():
            proj = serializer.save()
            return Response(ProjectSerializer(proj).data)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    def delete(self, request, pk):
        proj = self.get_object(pk)
        member = getattr(request.user, "member", None)
        # Hard delete is admin-only. Others must archive (not yet implemented).
        if member is None or not member.is_admin:
            return Response(
                {"detail": "Only admins may delete projects."},
                status=status.HTTP_403_FORBIDDEN,
            )
        proj.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


# ---------- Dashboard ----------


class DashboardView(APIView):
    """
    GET /api/dashboard/

    Returns a single payload that powers the home-screen dashboard:
      - stats          : KPI counters (total open, overdue, due this week, critical)
      - project_breakdown : per-project open/overdue/due-soon counts + ball-in-court split
      - due_this_week  : lightweight list of RFIs due within 7 days
      - in_your_court  : RFIs where the authenticated user currently needs to act
    """
    permission_classes = [permissions.IsAuthenticated]

    ACTIVE = ["open", "submitted", "under_review", "responded"]

    # Ball-in-court: which status bucket "owns" the action
    BIC_SUBMITTER = ["open"]
    BIC_DESIGNER  = ["submitted", "under_review"]
    BIC_CA        = ["responded"]

    def get(self, request):
        member    = getattr(request.user, "member", None)
        today     = date.today()
        week_end  = today + timedelta(days=7)

        # Resolve the member's accessible project IDs first (small query, no M2M
        # join on the RFI table).  Doing the scoping this way avoids inflated
        # COUNT() results that occur when the M2M join produces duplicate rows
        # inside annotate() calls.
        if member:
            my_project_ids = list(
                Project.objects
                .filter(Q(members=member) | Q(project_manager=member))
                .values_list("id", flat=True)
                .distinct()
            )
        else:
            my_project_ids = []

        active_qs = (
            Rfi.objects
            .filter(project_id__in=my_project_ids, status__in=self.ACTIVE)
            .select_related("project")
        )

        # ── KPI counters ──────────────────────────────────────────────────────
        total_open    = active_qs.count()
        overdue_count = active_qs.filter(due_date__lt=today).count()
        due_week_cnt  = active_qs.filter(due_date__gte=today, due_date__lte=week_end).count()
        critical_cnt  = active_qs.filter(priority="critical").count()

        # ── Per-project breakdown (one DB round-trip via annotations) ─────────
        project_stats = list(
            active_qs
            .values("project__id", "project__project_number", "project__project_name")
            .annotate(
                open_count    = Count("id"),
                overdue_count = Count("id", filter=Q(due_date__lt=today)),
                due_week      = Count("id", filter=Q(due_date__gte=today,
                                                      due_date__lte=week_end)),
                critical      = Count("id", filter=Q(priority="critical")),
                with_submitter= Count("id", filter=Q(status__in=self.BIC_SUBMITTER)),
                with_designer = Count("id", filter=Q(status__in=self.BIC_DESIGNER)),
                with_ca       = Count("id", filter=Q(status__in=self.BIC_CA)),
            )
            .order_by("-overdue_count", "-open_count")
        )

        # ── Due this week — lightweight summary dicts ─────────────────────────
        due_week_rfis = (
            active_qs
            .filter(due_date__gte=today, due_date__lte=week_end)
            .order_by("due_date", "-priority")
            [:25]
        )

        # ── In your court ─────────────────────────────────────────────────────
        in_your_court_data = []
        if member:
            court_qs = (
                Rfi.objects
                .filter(status__in=self.ACTIVE)
                .select_related("project")
                .filter(
                    Q(status__in=self.BIC_DESIGNER, designers=member) |
                    Q(status__in=self.BIC_CA,        contract_administrators=member) |
                    Q(status__in=self.BIC_SUBMITTER, author=request.user)
                )
                .distinct()
                .order_by("due_date")
                [:20]
            )
            in_your_court_data = [self._rfi_summary(r, today) for r in court_qs]

        return Response({
            "stats": {
                "total_open":    total_open,
                "overdue":       overdue_count,
                "due_this_week": due_week_cnt,
                "critical":      critical_cnt,
            },
            "project_breakdown": [
                {
                    "project_id":     p["project__id"],
                    "project_number": p["project__project_number"],
                    "project_name":   p["project__project_name"],
                    "open":           p["open_count"],
                    "overdue":        p["overdue_count"],
                    "due_this_week":  p["due_week"],
                    "critical":       p["critical"],
                    "with_submitter": p["with_submitter"],
                    "with_designer":  p["with_designer"],
                    "with_ca":        p["with_ca"],
                }
                for p in project_stats
            ],
            "due_this_week": [self._rfi_summary(r, today) for r in due_week_rfis],
            "in_your_court": in_your_court_data,
        })

    @staticmethod
    def _rfi_summary(rfi, today):
        due       = rfi.due_date
        days_left = (due - today).days if due else None
        return {
            "id":             rfi.id,
            "slug":           rfi.slug,
            "rfi_number":     rfi.rfi_number,
            "rfi_name":       rfi.rfi_name,
            "status":         rfi.status,
            "priority":       rfi.priority,
            "due_date":       str(due) if due else None,
            "days_left":      days_left,
            "project_id":     rfi.project_id,
            "project_number": rfi.project.project_number,
            "project_name":   rfi.project.project_name,
        }


# ---------- RFIs ----------


class RfiListCreate(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        # Scope to projects the requesting user is a member of or manages.
        member = getattr(request.user, "member", None)
        if member:
            my_project_ids = list(
                Project.objects
                .filter(Q(members=member) | Q(project_manager=member))
                .values_list("id", flat=True)
                .distinct()
            )
        else:
            my_project_ids = []

        qs = (
            Rfi.objects
            .filter(project_id__in=my_project_ids)
            .select_related("project", "author")
            .prefetch_related("designers", "contract_administrators")
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
            # Accept either a single value ("open") or a comma-separated list
            # ("open,submitted,under_review") so the UI can fetch all active RFIs
            # in a single request without multiple round-trips.
            statuses = [s.strip() for s in status_filter.split(",") if s.strip()]
            qs = qs.filter(status__in=statuses)

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

        if request.query_params.get("due_this_week"):
            today    = date.today()
            week_end = today + timedelta(days=7)
            qs = qs.filter(due_date__gte=today, due_date__lte=week_end)

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

        _audit(rfi, getattr(request.user, "member", None), "created")
        # Re-serialize to include read-only/nested fields (designers_detail, contract_administrators_detail, etc.)
        return Response(RfiSerializer(rfi).data, status=status.HTTP_201_CREATED)


class RfiDetail(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get_object(self, pk, member=None):
        qs = Rfi.objects.select_related(
            "project", "project__project_manager", "author"
        ).prefetch_related("designers", "contract_administrators")

        project_ids = _member_project_ids(member)
        if project_ids is not None:
            # None means admin (unrestricted); a list (possibly empty) filters
            qs = qs.filter(project_id__in=project_ids)

        return get_object_or_404(qs, pk=pk)

    def get(self, request, pk):
        member = getattr(request.user, "member", None)
        rfi = self.get_object(pk, member=member)
        return Response(RfiSerializer(rfi).data)

    def put(self, request, pk):
        member = getattr(request.user, "member", None)
        rfi = self.get_object(pk, member=member)
        serializer = RfiSerializer(rfi, data=request.data, context={"request": request})
        if serializer.is_valid():
            rfi = serializer.save()  # designers / contract_administrators handled in serializer.update
            return Response(RfiSerializer(rfi).data)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    def patch(self, request, pk):
        member = getattr(request.user, "member", None)
        rfi = self.get_object(pk, member=member)
        role = getattr(member, "role", None)

        # ── Permission: who can edit at which status ──────────────────────────
        # Closed RFIs are immutable for everyone.
        if rfi.status == Rfi.Status.CLOSED:
            return Response(
                {"detail": "Closed RFIs cannot be edited."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Designer roles (Project Designer, Sub Consultant) only edit while
        # the RFI is still open (draft). Once submitted they should be
        # responding, not rewriting the question.
        if role in DESIGNER_ROLES and rfi.status != Rfi.Status.OPEN:
            return Response(
                {"detail": "Designers can only edit an RFI while it is in open (draft) status."},
                status=status.HTTP_403_FORBIDDEN,
            )

        # Requester roles (Contractor, CA, PM, Client) may edit only when the
        # RFI is open (draft) or actively under review. At every other stage
        # (submitted, responded) the document is locked from their side.
        if role in REQUESTER_ROLES and rfi.status not in (Rfi.Status.OPEN, Rfi.Status.UNDER_REVIEW):
            return Response(
                {"detail": "You can only edit this RFI when it is open (draft) or under review."},
                status=status.HTTP_403_FORBIDDEN,
            )

        # ── Snapshot before for revision tracking ─────────────────────────────
        # Revisions are recorded only when the RFI is under_review so that
        # designers see exactly what changed during the review cycle.
        track_revision = rfi.status == Rfi.Status.UNDER_REVIEW
        before_snap = _capture_rfi_snapshot(rfi) if track_revision else None

        serializer = RfiSerializer(rfi, data=request.data, partial=True, context={"request": request})
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        with transaction.atomic():
            rfi = serializer.save()

            if track_revision and before_snap:
                after_snap = _capture_rfi_snapshot(rfi)
                changes = _diff_snapshots(before_snap, after_snap)
                if changes:
                    from django.db.models import Max
                    last_num = rfi.revisions.aggregate(n=Max("revision_number"))["n"] or 0
                    RfiRevision.objects.create(
                        rfi=rfi,
                        revised_by=member,
                        revision_number=last_num + 1,
                        changes=changes,
                        rfi_status_at_revision=rfi.status,
                    )
                    _audit(rfi, member, "rfi_revised", changes=changes)

        _audit(rfi, member, "updated")
        return Response(RfiSerializer(rfi, context={"request": request}).data)

    def delete(self, request, pk):
        member = getattr(request.user, "member", None)
        rfi = self.get_object(pk, member=member)
        rfi.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


# ---------- RFI PDF Export ----------

class RfiPdfExport(APIView):
    """
    GET /api/rfis/<pk>/pdf/

    Generates and streams a formal PDF document for the requested RFI.
    The PDF is suitable for distribution, record-keeping, and contract use.
    Requires authentication (same as all other RFI endpoints).
    """

    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, pk):
        from django.http import HttpResponse
        from .pdf import build_rfi_pdf

        rfi = get_object_or_404(
            Rfi.objects
            .select_related("project", "project__project_manager", "responded_by")
            .prefetch_related("designers", "contract_administrators", "attachments"),
            pk=pk,
        )

        # Deep-link back to the RFI in the web application (appears in the footer).
        # settings.FRONTEND_URL defaults to "http://localhost:5173" in dev.
        frontend_url = getattr(settings, "FRONTEND_URL", "").rstrip("/")
        app_url = f"{frontend_url}/rfi/{rfi.id}/{rfi.slug}" if frontend_url else None

        # Build absolute URLs for every attachment so the PDF can link to them.
        # request.build_absolute_uri() handles scheme + host automatically,
        # turning "/media/rfi_attachments/7/spec.pdf" into a full URL.
        attachment_urls = {
            att.id: request.build_absolute_uri(att.file.url)
            for att in rfi.attachments.all()
            if att.file
        }

        buf = build_rfi_pdf(rfi, app_url=app_url, attachment_urls=attachment_urls)

        # Sanitise the filename — strip characters that break Content-Disposition
        safe_name = f"{rfi.rfi_number} - {rfi.rfi_name}"
        safe_name = "".join(c for c in safe_name if c.isalnum() or c in " -_.")
        filename = f"{safe_name}.pdf"

        response = HttpResponse(buf.read(), content_type="application/pdf")
        response["Content-Disposition"] = f'attachment; filename="{filename}"'
        return response


# ---------- RFI Status Transition ----------

class RfiTransition(APIView):
    """
    POST /api/rfis/<pk>/transition/

    Advances an RFI through the status workflow.  Accepts ``{"status": "<new>"}``
    and validates that the transition is allowed from the RFI's current state.

    Allowed transitions
    -------------------
    open         → submitted | closed
    submitted    → under_review | closed
    under_review → responded | closed
    responded    → closed
    closed       → (terminal — no further transitions)

    Any authenticated project member may trigger a transition.
    Setting ``closed_at`` is handled automatically when reaching the
    ``closed`` state.
    """

    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, pk):
        rfi = get_object_or_404(Rfi, pk=pk)
        new_status = (request.data.get("status") or "").strip()

        # Validate the requested status value
        valid_values = {s.value for s in Rfi.Status}
        if new_status not in valid_values:
            return Response(
                {"detail": f"'{new_status}' is not a valid status. "
                           f"Choose one of: {', '.join(sorted(valid_values))}."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        allowed_next = VALID_TRANSITIONS.get(rfi.status, set())
        if new_status not in allowed_next:
            if not allowed_next:
                detail = f"RFI is already closed and cannot be transitioned further."
            else:
                readable = ", ".join(sorted(allowed_next))
                detail = (
                    f"Cannot transition from '{rfi.status}' to '{new_status}'. "
                    f"Allowed next status values: {readable}."
                )
            return Response({"detail": detail}, status=status.HTTP_400_BAD_REQUEST)

        # Block closure while any contract change is still pending — the
        # RFI can only be closed once every flagged formal instruction has
        # been issued (or explicitly cancelled).
        if new_status == Rfi.Status.CLOSED:
            pending = rfi.contract_changes.filter(status=ContractChange.Status.PENDING)
            pending_count = pending.count()
            if pending_count:
                return Response(
                    {
                        "detail": (
                            f"This RFI has {pending_count} pending contract "
                            f"change{'s' if pending_count != 1 else ''}. "
                            "Mark them as issued or cancelled before closing."
                        ),
                        "pending_contract_changes": pending_count,
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )

        old_status = rfi.status
        update_fields = ["status"]
        rfi.status = new_status

        # Stamp closed_at when the RFI reaches the terminal state
        if new_status == Rfi.Status.CLOSED and rfi.closed_at is None:
            rfi.closed_at = timezone.now()
            update_fields.append("closed_at")

        rfi.save(update_fields=update_fields)

        # Audit + email
        member = getattr(request.user, "member", None)
        _audit(rfi, member, "status_changed",
               from_status=old_status, to_status=new_status)
        watchers = _watchers_list(rfi)
        _email_status_change(rfi, new_status, member, watchers)

        return Response(
            RfiSerializer(rfi, context={"request": request}).data,
            status=status.HTTP_200_OK,
        )


# ---------- Return to Submitter ----------

class RfiReturn(APIView):
    """
    POST /api/rfis/<pk>/return/

    Allows a designer / CA / PM to bounce an RFI back to the submitter
    with an explanatory note.  The RFI must be in ``under_review`` status.

    Body:
        note (str, required) — reason for the return
    """
    permission_classes = [permissions.IsAuthenticated]

    # Roles that may return an RFI
    RETURN_ROLES = {
        Member.Role.PROJECT_DESIGNER,
        Member.Role.SUB_CONSULTANT,
        Member.Role.CONTRACT_ADMIN,
        Member.Role.PROJECT_MANAGER,
    }

    def post(self, request, pk):
        rfi = get_object_or_404(Rfi, pk=pk)
        member = getattr(request.user, "member", None)

        if member is None or member.role not in self.RETURN_ROLES:
            return Response(
                {"detail": "Only designers, sub-consultants, contract administrators, "
                           "or project managers may return an RFI."},
                status=status.HTTP_403_FORBIDDEN,
            )

        if rfi.status != Rfi.Status.UNDER_REVIEW:
            return Response(
                {"detail": "Only RFIs that are under review can be returned to the submitter."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        note = (request.data.get("note") or "").strip()
        if not note:
            return Response(
                {"note": ["Please provide a reason for returning this RFI."]},
                status=status.HTTP_400_BAD_REQUEST,
            )

        rfi.status      = Rfi.Status.RETURNED
        rfi.return_note = note
        rfi.save(update_fields=["status", "return_note"])

        # Post a system comment so the reason is visible in the discussion thread
        RfiComment.objects.create(
            rfi=rfi,
            author=member,
            body=f"[Returned to submitter]\n\n{note}",
            is_official_response=False,
        )

        # In-app notification for the submitter
        submitter_member = getattr(rfi.author, "member", None)
        if submitter_member and submitter_member != member:
            Notification.objects.create(
                recipient=submitter_member,
                verb=Notification.Verb.RFI_RETURNED,
                actor_name=member.name,
                project=rfi.project,
                extra={
                    "rfi_id":         rfi.id,
                    "rfi_slug":       rfi.slug,
                    "rfi_number":     rfi.rfi_number,
                    "rfi_name":       rfi.rfi_name,
                    "project_number": rfi.project.project_number,
                    "project_name":   rfi.project.project_name,
                    "return_note":    note,
                },
            )

        _audit(rfi, member, "returned_to_submitter", note=note)
        _email_rfi_returned(rfi, member, note)

        return Response(
            RfiSerializer(rfi, context={"request": request}).data,
            status=status.HTTP_200_OK,
        )


# ---------- RFI Watchers ----------

class RfiWatcherList(APIView):
    """
    GET  /api/rfis/<pk>/watchers/    — list watchers
    POST /api/rfis/<pk>/watchers/    — add a watcher (body: {"member_id": N})
    """
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, pk):
        rfi = get_object_or_404(Rfi, pk=pk)
        watchers = rfi.watchers.select_related("member").all()
        data = [
            {
                "id":         w.id,
                "member_id":  w.member_id,
                "name":       w.member.name,
                "email":      w.member.email,
                "role":       w.member.role,
                "company":    w.member.company,
                "added_at":   w.added_at.isoformat(),
            }
            for w in watchers
        ]
        return Response(data)

    def post(self, request, pk):
        rfi = get_object_or_404(Rfi, pk=pk)
        actor = getattr(request.user, "member", None)

        member_id = request.data.get("member_id")
        if not member_id:
            return Response({"member_id": ["This field is required."]},
                            status=status.HTTP_400_BAD_REQUEST)

        try:
            target = Member.objects.get(pk=member_id)
        except (Member.DoesNotExist, ValueError, TypeError):
            return Response({"member_id": ["Member not found."]},
                            status=status.HTTP_400_BAD_REQUEST)

        watcher, created = RfiWatcher.objects.get_or_create(rfi=rfi, member=target)
        if not created:
            return Response(
                {"detail": f"{target.name} is already watching this RFI."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        _audit(rfi, actor, "watcher_added", watcher_name=target.name)
        _email_watcher_added(rfi, target, actor)

        return Response(
            {
                "id":        watcher.id,
                "member_id": watcher.member_id,
                "name":      target.name,
                "email":     target.email,
                "role":      target.role,
                "company":   target.company,
                "added_at":  watcher.added_at.isoformat(),
            },
            status=status.HTTP_201_CREATED,
        )


class RfiWatcherDetail(APIView):
    """
    DELETE /api/rfis/<pk>/watchers/<member_id>/
    """
    permission_classes = [permissions.IsAuthenticated]

    def delete(self, request, pk, member_id):
        rfi = get_object_or_404(Rfi, pk=pk)
        actor = getattr(request.user, "member", None)
        watcher = get_object_or_404(RfiWatcher, rfi=rfi, member_id=member_id)

        # Only the watcher themselves, or an admin/PM, can remove a watcher
        is_self  = actor is not None and actor.id == int(member_id)
        is_admin = actor is not None and actor.is_admin
        is_pm    = actor is not None and actor.role == Member.Role.PROJECT_MANAGER

        if not (is_self or is_admin or is_pm):
            return Response(
                {"detail": "You do not have permission to remove this watcher."},
                status=status.HTTP_403_FORBIDDEN,
            )

        removed_name = watcher.member.name
        watcher.delete()
        _audit(rfi, actor, "watcher_removed", watcher_name=removed_name)
        return Response(status=status.HTTP_204_NO_CONTENT)


# ---------- Audit Log ----------

class RfiAuditLogView(APIView):
    """
    GET /api/rfis/<pk>/audit-log/

    Returns a chronological (newest-first) audit trail for an RFI.
    """
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, pk):
        rfi = get_object_or_404(Rfi, pk=pk)
        entries = rfi.audit_logs.select_related("actor").all()
        data = [
            {
                "id":         e.id,
                "action":     e.action,
                "actor_name": e.actor.name if e.actor else "System",
                "actor_role": e.actor.role if e.actor else "",
                "detail":     e.detail,
                "timestamp":  e.timestamp.isoformat(),
            }
            for e in entries
        ]
        return Response(data)


# ---------- Response-Time Analytics ----------

class AnalyticsView(APIView):
    """
    GET /api/analytics/

    Returns response-time analytics for the authenticated user's projects.

    Payload:
      - avg_days_by_project  : [{project_number, project_name, avg_days, count}]
      - avg_days_by_trade    : [{trade, avg_days, count}]
      - monthly_counts       : [{month (YYYY-MM), opened, closed}]
      - priority_breakdown   : [{priority, count}]
      - status_breakdown     : [{status, count}]
      - overdue_rate         : float (0-1)
    """
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        from django.db.models.functions import TruncMonth
        from collections import defaultdict

        member = getattr(request.user, "member", None)
        if member:
            my_project_ids = list(
                Project.objects
                .filter(Q(members=member) | Q(project_manager=member))
                .values_list("id", flat=True)
                .distinct()
            )
        else:
            my_project_ids = []

        base_qs = Rfi.objects.filter(project_id__in=my_project_ids)
        today = date.today()

        # ── Avg response days — computed in Python to avoid ORM date-subtraction
        # quirks with timezone-aware datetimes across different DB backends.
        responded_rows = (
            base_qs
            .filter(responded_at__isnull=False, received_date__isnull=False)
            .values("project__project_number", "project__project_name",
                    "trade", "received_date", "responded_at")
        )

        proj_days  = defaultdict(list)   # (number, name) → [days, ...]
        trade_days = defaultdict(list)   # trade → [days, ...]

        for row in responded_rows:
            recv = row["received_date"]        # date
            resp = row["responded_at"]         # datetime (possibly tz-aware)
            if recv and resp:
                resp_date = resp.date() if hasattr(resp, "date") else resp
                delta = (resp_date - recv).days
                key = (row["project__project_number"], row["project__project_name"])
                proj_days[key].append(delta)
                trade_days[row["trade"] or "—"].append(delta)

        avg_days_by_project = sorted([
            {
                "project_number": k[0],
                "project_name":   k[1],
                "avg_days":       round(sum(v) / len(v), 1),
                "count":          len(v),
            }
            for k, v in proj_days.items()
        ], key=lambda x: x["project_number"])

        avg_days_by_trade = sorted([
            {
                "trade":    t,
                "avg_days": round(sum(v) / len(v), 1),
                "count":    len(v),
            }
            for t, v in trade_days.items()
        ], key=lambda x: x["trade"])

        # Overall weighted average
        all_days = [d for v in proj_days.values() for d in v]
        overall_avg_days = round(sum(all_days) / len(all_days), 1) if all_days else None

        # ── Monthly opened / closed counts ────────────────────────────────────
        # Use timezone-aware datetime so filter comparisons against DateTimeField
        # (closed_at) don't trigger naive-datetime warnings in USE_TZ=True projects.
        twelve_months_ago = timezone.make_aware(
            timezone.datetime(today.year, today.month, 1)
        ) - timedelta(days=365)

        opened_by_month = (
            base_qs
            .filter(received_date__gte=twelve_months_ago)
            .annotate(month=TruncMonth("received_date"))
            .values("month")
            .annotate(opened=Count("id"))
        )
        closed_by_month = (
            base_qs
            .filter(closed_at__isnull=False, closed_at__gte=twelve_months_ago)
            .annotate(month=TruncMonth("closed_at"))
            .values("month")
            .annotate(closed=Count("id"))
        )

        monthly = {}
        for row in opened_by_month:
            key = row["month"].strftime("%Y-%m")
            monthly.setdefault(key, {"month": key, "opened": 0, "closed": 0})
            monthly[key]["opened"] = row["opened"]
        for row in closed_by_month:
            key = row["month"].strftime("%Y-%m")
            monthly.setdefault(key, {"month": key, "opened": 0, "closed": 0})
            monthly[key]["closed"] = row["closed"]

        monthly_counts = sorted(monthly.values(), key=lambda x: x["month"])

        # ── Priority breakdown (all RFIs, not just open) ──────────────────────
        priority_breakdown = list(
            base_qs
            .values("priority")
            .annotate(count=Count("id"))
            .order_by("priority")
        )

        # ── Status breakdown ──────────────────────────────────────────────────
        status_breakdown = list(
            base_qs
            .values("status")
            .annotate(count=Count("id"))
            .order_by("status")
        )

        # ── Overdue rate (active RFIs) ────────────────────────────────────────
        active_statuses = ["open", "submitted", "under_review", "responded", "returned"]
        active_count  = base_qs.filter(status__in=active_statuses).count()
        overdue_count = base_qs.filter(
            status__in=active_statuses, due_date__lt=today
        ).count()
        overdue_rate = round(overdue_count / active_count, 4) if active_count else 0.0

        return Response({
            "avg_days_by_project":  avg_days_by_project,
            "avg_days_by_trade":    avg_days_by_trade,
            "overall_avg_days":     overall_avg_days,
            "total_responded":      len(all_days),
            "monthly_counts":       monthly_counts,
            "priority_breakdown":   priority_breakdown,
            "status_breakdown":     status_breakdown,
            "overdue_rate":         overdue_rate,
            "active_count":         active_count,
            "overdue_count":        overdue_count,
        })


# ---------- RFI Discussion / Official Response ----------

class RfiCommentListCreate(APIView):
    permission_classes = [permissions.IsAuthenticated]
    # JSONParser for text-only posts; Multipart/Form for posts that include files
    parser_classes     = [MultiPartParser, FormParser, JSONParser]

    def get(self, request, pk):
        rfi = get_object_or_404(Rfi, pk=pk)
        ctx = {"request": request}
        qs  = rfi.comments.select_related("author").prefetch_related("attachments").all()
        return Response(RfiCommentSerializer(qs, many=True, context=ctx).data)

    def post(self, request, pk):
        rfi    = get_object_or_404(Rfi, pk=pk)
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

        files = request.FILES.getlist("files")
        body  = (request.data.get("body") or "").strip()

        if not body and not files:
            return Response(
                {"body": ["Please enter a message or attach a file."]},
                status=status.HTTP_400_BAD_REQUEST,
            )

        comment = RfiComment.objects.create(
            rfi=rfi,
            author=member,
            body=body,
            is_official_response=False,
        )

        # Save allowed attachments
        for f in files:
            if f.content_type not in ALLOWED_ATTACHMENT_CONTENT_TYPES:
                continue
            if f.size > MAX_ATTACHMENT_SIZE_BYTES:
                continue
            RfiCommentAttachment.objects.create(
                comment=comment,
                file=f,
                original_filename=f.name,
                content_type=f.content_type or "",
                size=f.size,
            )

        _notify_mentions(comment, rfi, author=member)
        watchers = _watchers_list(rfi)
        _email_rfi_comment(rfi, comment, watchers, exclude_member=member)
        _audit(rfi, member, "comment_added",
               comment_id=comment.id, preview=body[:100])
        ctx = {"request": request}
        return Response(RfiCommentSerializer(comment, context=ctx).data, status=status.HTTP_201_CREATED)


def _notify_mentions(comment, rfi, author):
    """
    Parse ``@Member Name`` patterns from a comment body and create a
    Notification(verb=MENTIONED) for each matching project member.

    Detection strategy: for each member of the RFI's project, check whether
    ``@<name>`` appears verbatim in the body.  This is intentionally exact so
    that the frontend's insertion of ``@Full Name `` works reliably, while still
    being O(members) rather than requiring a complex NLP parse.
    """
    body = comment.body
    if "@" not in body:
        return

    project_members = (
        Member.objects
        .filter(projects=rfi.project)
        .exclude(pk=author.pk)   # don't notify yourself
        .select_related()
    )

    notified_pks = set()
    for m in project_members:
        if m.pk in notified_pks:
            continue
        if f"@{m.name}" in body:
            notified_pks.add(m.pk)
            Notification.objects.create(
                recipient=m,
                verb=Notification.Verb.MENTIONED,
                actor_name=author.name,
                project=rfi.project,
                extra={
                    "rfi_id":          rfi.id,
                    "rfi_slug":        rfi.slug,
                    "rfi_number":      rfi.rfi_number,
                    "rfi_name":        rfi.rfi_name,
                    "project_id":      rfi.project_id,
                    "project_number":  rfi.project.project_number,
                    "project_name":    rfi.project.project_name,
                    "comment_id":      comment.id,
                    "comment_preview": body[:120],
                },
            )
            _email_mention(rfi, comment, m, author.name)


class RfiOfficialResponse(APIView):
    permission_classes = [permissions.IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser]

    def post(self, request, pk):
        rfi = get_object_or_404(Rfi, pk=pk)
        member = getattr(request.user, "member", None)
        if member is None or member.role not in OFFICIAL_RESPONDER_ROLES:
            return Response(
                {"detail": "Only Project Designers, Sub Consultants, Contract Administrators, "
                           "or Project Managers may submit an official response."},
                status=status.HTTP_403_FORBIDDEN,
            )

        # Determine whether this is an initial response or a revision.
        if rfi.status == Rfi.Status.CLOSED:
            return Response(
                {"detail": "This RFI is closed and no longer accepts official responses."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        elif rfi.status == Rfi.Status.RESPONDED:
            # Only the design team (Project Designer / Sub Consultant) may
            # submit a revised response after the initial one.
            if member.role not in RESPONSE_REVISOR_ROLES:
                return Response(
                    {"detail": "Only Project Designers or Sub Consultants may submit a "
                               "revised official response."},
                    status=status.HTTP_403_FORBIDDEN,
                )
            is_revision = True
        elif rfi.status == Rfi.Status.UNDER_REVIEW:
            is_revision = False
        else:
            return Response(
                {"detail": "An official response can only be submitted when the RFI is "
                           "under review."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        serializer = OfficialResponseSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        body = serializer.validated_data["body"]
        files = request.FILES.getlist("files")

        # Optional flag: a formal contract change is anticipated.
        # Frontend sends this when the responder ticks "Formal instruction
        # to follow" and picks a type (PCN / SI / CD / CO / Other).
        contract_change_type = (request.data.get("contract_change_type") or "").strip()
        contract_change_description = (
            request.data.get("contract_change_description") or ""
        ).strip()
        if contract_change_type:
            valid_types = {c.value for c in ContractChange.ChangeType}
            if contract_change_type not in valid_types:
                return Response(
                    {
                        "contract_change_type": (
                            f"'{contract_change_type}' is not a valid change type. "
                            f"Choose one of: {', '.join(sorted(valid_types))}."
                        )
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )
            if not contract_change_description:
                # Default the description to the response body so the
                # contract-change record is never created empty.
                contract_change_description = body

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

        from django.db.models import Max

        now = timezone.now()
        with transaction.atomic():
            # Determine next response_number (1 = original, 2+ = revisions)
            last_resp_num = rfi.response_revisions.aggregate(n=Max("response_number"))["n"] or 0
            resp_num = last_resp_num + 1

            # Persist the response revision record for the audit trail
            response_rev = OfficialResponseRevision.objects.create(
                rfi=rfi,
                body=body,
                responded_by=member,
                response_number=resp_num,
            )

            # Post a discussion comment so the thread stays in sync
            RfiComment.objects.create(
                rfi=rfi,
                author=member,
                body=body,
                is_official_response=True,
            )

            # Keep the top-level RFI fields pointing at the latest response
            rfi.status = Rfi.Status.RESPONDED
            rfi.official_response = body
            rfi.responded_by = member
            rfi.responded_at = now
            rfi.save(update_fields=[
                "status", "official_response", "responded_by", "responded_at",
            ])

            # Attach any uploaded files, linking them to this specific revision
            for f in files:
                RfiAttachment.objects.create(
                    rfi=rfi,
                    uploaded_by=member,
                    file=f,
                    original_filename=f.name,
                    content_type=(f.content_type or "").lower(),
                    size=f.size,
                    is_official_response=True,
                    response_revision=response_rev,
                )

            # Flag a pending contract change if the responder asked for one.
            # This keeps the RFI from being closed until the formal
            # instruction is issued or cancelled.
            if contract_change_type:
                ContractChange.objects.create(
                    project=rfi.project,
                    rfi=rfi,
                    response_revision=response_rev,
                    anticipated_type=contract_change_type,
                    description=contract_change_description,
                    created_by=member,
                )

        # Audit + email
        watchers = _watchers_list(rfi)
        _audit(rfi, member, "official_response_submitted",
               response_number=resp_num, preview=body[:120])
        _email_official_response(rfi, member, body, watchers)

        return Response(
            RfiSerializer(rfi, context={"request": request}).data,
            status=status.HTTP_200_OK,
        )


class RfiRevisionList(APIView):
    """
    GET /api/rfis/<pk>/revisions/

    Returns the ordered list of content revisions for an RFI (newest first).
    Each revision contains the ``changes`` diff so the UI can display exactly
    what was altered during the under-review cycle.
    """
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, pk):
        rfi = get_object_or_404(Rfi, pk=pk)
        revisions = rfi.revisions.select_related("revised_by").all()
        return Response(RfiRevisionSerializer(revisions, many=True).data)


class OfficialResponseRevisionList(APIView):
    """
    GET /api/rfis/<pk>/response-history/

    Returns the full history of official responses for an RFI (newest first).
    Each record includes the response body, who submitted it, when, and any
    attachments that were uploaded with that specific revision.
    """
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, pk):
        rfi = get_object_or_404(Rfi, pk=pk)
        revisions = (
            rfi.response_revisions
            .select_related("responded_by")
            .prefetch_related("attachments__uploaded_by")
            .all()
        )
        return Response(
            OfficialResponseRevisionSerializer(revisions, many=True, context={"request": request}).data
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


# ---------- Contract Changes ----------

# Roles permitted to create / update contract change records.  These are the
# same roles that drive the response workflow plus admins.
CONTRACT_CHANGE_EDITOR_ROLES = {
    Member.Role.PROJECT_DESIGNER,
    Member.Role.SUB_CONSULTANT,
    Member.Role.CONTRACT_ADMIN,
    Member.Role.PROJECT_MANAGER,
}


def _can_edit_contract_change(member):
    """A member may edit a contract change if they're an editor role or an admin."""
    if member is None:
        return False
    if member.is_admin:
        return True
    return member.role in CONTRACT_CHANGE_EDITOR_ROLES


class ContractChangeList(APIView):
    """
    GET /api/contract-changes/                 — global list (filterable)
    POST /api/contract-changes/                — create a new pending change

    Query params:
      ?project=<id>     — filter by project
      ?rfi=<id>         — filter by RFI
      ?status=pending   — comma-separated list also accepted
      ?type=PCN         — comma-separated anticipated_type filter
      ?search=<term>    — searches reference, description, project, RFI
    """
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        qs = ContractChange.objects.select_related(
            "project", "rfi", "created_by", "issued_by", "response_revision",
        )

        project_id = request.query_params.get("project")
        if project_id:
            qs = qs.filter(project_id=project_id)

        rfi_id = request.query_params.get("rfi")
        if rfi_id:
            qs = qs.filter(rfi_id=rfi_id)

        status_filter = request.query_params.get("status")
        if status_filter:
            statuses = [s.strip() for s in status_filter.split(",") if s.strip()]
            qs = qs.filter(status__in=statuses)

        type_filter = request.query_params.get("type")
        if type_filter:
            types = [t.strip() for t in type_filter.split(",") if t.strip()]
            qs = qs.filter(anticipated_type__in=types)

        term = request.query_params.get("search")
        if term:
            qs = qs.filter(
                Q(reference_number__icontains=term) |
                Q(description__icontains=term) |
                Q(project__project_number__icontains=term) |
                Q(project__project_name__icontains=term) |
                Q(rfi__rfi_number__icontains=term) |
                Q(rfi__rfi_name__icontains=term)
            ).distinct()

        return Response(ContractChangeSerializer(qs, many=True).data)

    def post(self, request):
        member = getattr(request.user, "member", None)
        if not _can_edit_contract_change(member):
            return Response(
                {"detail": "You do not have permission to create contract changes."},
                status=status.HTTP_403_FORBIDDEN,
            )

        serializer = ContractChangeSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        # Validate that the linked RFI (if any) belongs to the same project.
        rfi = serializer.validated_data.get("rfi")
        project = serializer.validated_data.get("project")
        if rfi and project and rfi.project_id != project.id:
            return Response(
                {"rfi": ["Linked RFI must belong to the same project."]},
                status=status.HTTP_400_BAD_REQUEST,
            )

        change = serializer.save(created_by=member)
        return Response(
            ContractChangeSerializer(change).data,
            status=status.HTTP_201_CREATED,
        )


class ContractChangeDetail(APIView):
    """
    GET    /api/contract-changes/<pk>/   — fetch one record
    PATCH  /api/contract-changes/<pk>/   — update fields (issue / cancel / edit)
    DELETE /api/contract-changes/<pk>/   — admins only
    """
    permission_classes = [permissions.IsAuthenticated]

    def get_object(self, pk):
        return get_object_or_404(
            ContractChange.objects.select_related(
                "project", "rfi", "created_by", "issued_by", "response_revision",
            ),
            pk=pk,
        )

    def get(self, request, pk):
        return Response(ContractChangeSerializer(self.get_object(pk)).data)

    def patch(self, request, pk):
        change = self.get_object(pk)
        member = getattr(request.user, "member", None)
        if not _can_edit_contract_change(member):
            return Response(
                {"detail": "You do not have permission to update contract changes."},
                status=status.HTTP_403_FORBIDDEN,
            )

        previous_status = change.status
        serializer = ContractChangeSerializer(change, data=request.data, partial=True)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        new_status = serializer.validated_data.get("status", previous_status)

        # When transitioning to "issued" we stamp issued_at / issued_by and
        # require at least the reference number so the record is auditable.
        if new_status == ContractChange.Status.ISSUED and previous_status != ContractChange.Status.ISSUED:
            ref = serializer.validated_data.get(
                "reference_number", change.reference_number
            )
            if not ref or not ref.strip():
                return Response(
                    {"reference_number": ["A reference number is required to mark a change as issued."]},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            change = serializer.save(issued_by=member, issued_at=timezone.now())
        else:
            change = serializer.save()

        return Response(ContractChangeSerializer(change).data)

    def delete(self, request, pk):
        change = self.get_object(pk)
        member = getattr(request.user, "member", None)
        # Only admins can hard-delete; everyone else must use the cancelled status.
        if member is None or not member.is_admin:
            return Response(
                {"detail": "Only admins may delete contract changes. "
                           "Use the cancelled status instead."},
                status=status.HTTP_403_FORBIDDEN,
            )
        change.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


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
        # Scope to projects this member belongs to.
        project_ids = _member_project_ids(member)
        comments_qs = RfiComment.objects.exclude(author=member).values("rfi_id", "created_at")
        if project_ids is not None:
            comments_qs = comments_qs.filter(rfi__project_id__in=project_ids)
        comments = comments_qs

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
        # Scope to projects this member belongs to so they never see activity
        # from projects they have not been added to.
        project_ids = _member_project_ids(member)
        comments_qs = (
            RfiComment.objects
            .exclude(author=member)
            .select_related("rfi", "rfi__project", "author")
            .order_by("-created_at")
        )
        if project_ids is not None:
            comments_qs = comments_qs.filter(rfi__project_id__in=project_ids)
        comments = comments_qs

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

        # Scope to this member's projects only
        project_ids = _member_project_ids(member)
        mark_qs = RfiComment.objects.exclude(author=member).values("rfi_id", "created_at")
        if project_ids is not None:
            mark_qs = mark_qs.filter(rfi__project_id__in=project_ids)

        unread_rfi_ids = set()
        for row in mark_qs:
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

    # Roles that may view the full cross-project team directory.
    # All other roles (designers, contractors, clients, …) are restricted to
    # the member lists exposed on individual project pages.
    DIRECTORY_ROLES = {Member.Role.PROJECT_MANAGER}

    def get(self, request):
        member = getattr(request.user, "member", None)
        is_allowed = request.user.is_staff or (
            member and member.role in self.DIRECTORY_ROLES
        )
        if not is_allowed:
            return Response(
                {"detail": "You do not have permission to view the team directory."},
                status=status.HTTP_403_FORBIDDEN,
            )

        # Optional filters used by the team directory:
        #   ?role=Project Manager
        #   ?search=jane
        qs = Member.objects.select_related("user")
        role = request.query_params.get("role")
        if role:
            qs = qs.filter(role=role)
        term = request.query_params.get("search")
        if term:
            qs = qs.filter(
                Q(name__icontains=term) | Q(email__icontains=term) |
                Q(company__icontains=term) | Q(user__username__icontains=term)
            )
        return Response(MemberSerializer(qs, many=True).data)

    def post(self, request):
        # if you want the logged-in user to create their own profile
        serializer = MemberSerializer(data=request.data)
        if serializer.is_valid():
            member = serializer.save(user=request.user)
            return Response(MemberSerializer(member).data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class MemberInvite(APIView):
    """
    POST /api/members/invite/

    Admin-only. Creates a new ``User`` + ``Member`` with an unusable random
    password and emails the recipient a password-set link (re-using the
    existing forgot-password token flow).

    Body fields:
        name (required)
        email (required, must be unique)
        role (required, one of Member.Role)
        company, discipline, phone, is_admin (all optional)
    """
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        actor = getattr(request.user, "member", None)
        if actor is None or not actor.is_admin:
            return Response(
                {"detail": "Only admins can invite new members."},
                status=status.HTTP_403_FORBIDDEN,
            )

        name  = (request.data.get("name") or "").strip()
        email = (request.data.get("email") or "").strip().lower()
        role  = (request.data.get("role") or "").strip()
        company    = (request.data.get("company") or "").strip()
        discipline = (request.data.get("discipline") or "").strip()
        phone      = (request.data.get("phone") or "").strip()
        make_admin = bool(request.data.get("is_admin", False))

        errors = {}
        if not name:
            errors["name"] = ["Name is required."]
        if not email:
            errors["email"] = ["Email is required."]
        elif User.objects.filter(email__iexact=email).exists() or Member.objects.filter(email__iexact=email).exists():
            errors["email"] = ["A user with this email already exists."]
        if not role:
            errors["role"] = ["Role is required."]
        elif role not in dict(Member.Role.choices):
            errors["role"] = [f"'{role}' is not a valid role."]
        if discipline and discipline not in dict(Member.Discipline.choices):
            errors["discipline"] = [f"'{discipline}' is not a valid discipline."]
        if errors:
            return Response(errors, status=status.HTTP_400_BAD_REQUEST)

        # Generate a unique username from the email local-part.
        from django.utils.crypto import get_random_string
        base_username = email.split("@", 1)[0][:30] or "user"
        username = base_username
        i = 1
        while User.objects.filter(username=username).exists():
            i += 1
            username = f"{base_username}{i}"[:30]

        with transaction.atomic():
            user = User.objects.create(
                username=username,
                email=email,
            )
            user.set_unusable_password()
            user.save(update_fields=["password"])

            new_member = Member.objects.create(
                user=user,
                name=name,
                email=email,
                company=company,
                discipline=discipline,
                role=role,
                phone=phone,
                is_admin=make_admin,
            )

        # Send the password-set email (mirrors ForgotPasswordView).
        try:
            uid = urlsafe_base64_encode(force_bytes(user.pk))
            token = default_token_generator.make_token(user)
            reset_link = f"{settings.FRONTEND_URL}/reset-password/{uid}/{token}"
            send_mail(
                subject="You have been invited to RFI Filer",
                message=(
                    f"Hi {name},\n\n"
                    f"{actor.name} has invited you to RFI Filer.\n"
                    f"Set your password to activate your account:\n{reset_link}\n"
                ),
                from_email=None,
                recipient_list=[email],
                fail_silently=True,
            )
            email_sent = True
        except Exception:
            email_sent = False

        return Response(
            {**MemberSerializer(new_member).data, "invite_email_sent": email_sent},
            status=status.HTTP_201_CREATED,
        )


class MemberDetail(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get_object(self, pk):
        return get_object_or_404(Member.objects.select_related("user"), pk=pk)

    def _can_edit(self, actor, target):
        # Admins or the member themselves
        return actor is not None and (actor.is_admin or actor.id == target.id)

    def get(self, request, pk):
        return Response(MemberSerializer(self.get_object(pk)).data)

    def put(self, request, pk):
        member = self.get_object(pk)
        actor = getattr(request.user, "member", None)
        if not self._can_edit(actor, member):
            return Response({"detail": "Not allowed."}, status=status.HTTP_403_FORBIDDEN)
        serializer = MemberSerializer(member, data=request.data)
        if serializer.is_valid():
            member = serializer.save()
            return Response(MemberSerializer(member).data)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    def patch(self, request, pk):
        member = self.get_object(pk)
        actor = getattr(request.user, "member", None)
        if not self._can_edit(actor, member):
            return Response({"detail": "Not allowed."}, status=status.HTTP_403_FORBIDDEN)
        # Non-admins cannot escalate themselves to admin
        data = request.data.copy() if hasattr(request.data, "copy") else dict(request.data)
        if not (actor and actor.is_admin) and "is_admin" in data:
            data.pop("is_admin", None)
        serializer = MemberSerializer(member, data=data, partial=True)
        if serializer.is_valid():
            member = serializer.save()
            return Response(MemberSerializer(member).data)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    def delete(self, request, pk):
        member = self.get_object(pk)
        actor = getattr(request.user, "member", None)
        if actor is None or not actor.is_admin:
            return Response({"detail": "Only admins can remove members."},
                            status=status.HTTP_403_FORBIDDEN)
        member.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


# ---------- Project Memberships (optional) ----------

class ProjectMembershipListCreate(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        qs = ProjectMembership.objects.select_related("project", "member")
        member_id = request.query_params.get("member")
        if member_id:
            qs = qs.filter(member_id=member_id)
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
    

# ── In-app Notifications ──────────────────────────────────────────────────────

def _check_due_reminders(member):
    """
    Lazy check: called every time the notification bell polls.
    Creates RFI_DUE_SOON notifications for any RFI due exactly 3 days from
    today that the member is involved with, skipping duplicates.
    """
    due_date_target = date.today() + timedelta(days=3)

    # Projects this member belongs to (or manages)
    my_project_ids = list(
        Project.objects.filter(
            Q(members=member) | Q(project_manager=member)
        ).values_list("id", flat=True).distinct()
    )
    if not my_project_ids:
        return

    active_statuses = ["open", "submitted", "under_review", "returned"]
    rfis = (
        Rfi.objects
        .filter(
            project_id__in=my_project_ids,
            due_date=due_date_target,
            status__in=active_statuses,
        )
        .select_related("project")
        .prefetch_related("designers", "contract_administrators")
    )

    for rfi in rfis:
        # Send reminder to designers and contract admins assigned to this RFI
        recipients = set(
            list(rfi.designers.all()) + list(rfi.contract_administrators.all())
        )
        for recipient in recipients:
            already = Notification.objects.filter(
                recipient=recipient,
                verb=Notification.Verb.RFI_DUE_SOON,
                extra__rfi_id=rfi.id,
            ).exists()
            if not already:
                Notification.objects.create(
                    recipient=recipient,
                    verb=Notification.Verb.RFI_DUE_SOON,
                    actor_name="System",
                    project=rfi.project,
                    extra={
                        "rfi_id":          rfi.id,
                        "rfi_slug":        rfi.slug,
                        "rfi_number":      rfi.rfi_number,
                        "rfi_name":        rfi.rfi_name,
                        "project_id":      rfi.project.id,
                        "project_number":  rfi.project.project_number,
                        "project_name":    rfi.project.project_name,
                        "due_date":        str(rfi.due_date),
                        "days_remaining":  3,
                    },
                )


class NotificationList(APIView):
    """
    GET  /api/notifications/           — list unread notifications for the caller
    POST /api/notifications/mark-read/ — mark all as read
    """
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        member = getattr(request.user, "member", None)
        if not member:
            return Response([])

        # Lazy due-date check: create any missing 3-day reminders before returning results
        _check_due_reminders(member)

        qs = (
            Notification.objects
            .filter(recipient=member, read=False)
            .select_related("project")
            .order_by("-created_at")
        )
        data = [
            {
                "id":             n.id,
                "verb":           n.verb,
                "actor_name":     n.actor_name,
                "project_id":     n.extra.get("project_id") or n.project_id,
                "project_number": n.extra.get("project_number", ""),
                "project_name":   n.extra.get("project_name", ""),
                # project_added fields
                "role":           n.extra.get("role", ""),
                # rfi_assigned / rfi_due_soon fields
                "rfi_id":         n.extra.get("rfi_id"),
                "rfi_slug":       n.extra.get("rfi_slug", ""),
                "rfi_name":       n.extra.get("rfi_name", ""),
                "rfi_number":     n.extra.get("rfi_number", ""),
                "due_date":       n.extra.get("due_date", ""),
                "days_remaining": n.extra.get("days_remaining"),
                # mentioned fields
                "comment_id":      n.extra.get("comment_id"),
                "comment_preview": n.extra.get("comment_preview", ""),
                "created_at":     n.created_at.isoformat(),
                "read":           n.read,
            }
            for n in qs
        ]
        return Response(data)


class NotificationMarkRead(APIView):
    """POST /api/notifications/mark-read/ — mark all unread notifications as read."""
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        member = getattr(request.user, "member", None)
        if not member:
            return Response({"marked": 0})
        count = Notification.objects.filter(recipient=member, read=False).update(read=True)
        return Response({"marked": count})


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
