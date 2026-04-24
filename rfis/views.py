from django.db.models import Count
from django.shortcuts import get_object_or_404
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status, permissions
from rest_framework.pagination import PageNumberPagination
from django.db.models import Q
from django.db import IntegrityError
from django.utils.http import urlsafe_base64_encode, urlsafe_base64_decode
from django.core.mail import send_mail
from django.contrib.auth import get_user_model
from django.contrib.auth.tokens import default_token_generator
from django.utils.encoding import force_bytes, force_str
from django.conf import settings

from .models import Project, Rfi, Member, ProjectMembership
from .serializer import (
    ProjectSerializer, RfiSerializer, MemberSerializer, ProjectMembershipSerializer, RegisterSerializer
)
from rest_framework_simplejwt.views import TokenObtainPairView
from .serializer import CustomTokenObtainPairSerializer



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

    def get(self, request):
        user = request.user
        member = getattr(user, "member", None)

        return Response({
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
            } if member else None
        })
    
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
        qs = Rfi.objects.select_related("project", "author").prefetch_related("assigned_to")

        project_id = request.query_params.get("project")
        if project_id:
            qs = qs.filter(project_id=project_id)

        term = request.query_params.get("search")
        if term:
            qs = qs.filter(
                Q(rfi_name__icontains=term) |
                Q(rfi_number__icontains=term) |
                Q(trade__icontains=term) |
                Q(project__project_number__icontains=term) |
                Q(project__project_name__icontains=term) |
                Q(assigned_to__name__icontains=term)
            ).distinct()

        paginator = StandardPagination()
        page = paginator.paginate_queryset(qs.order_by("-received_date", "-id"), request)
        serializer = RfiSerializer(page, many=True)
        return paginator.get_paginated_response(serializer.data)

    def post(self, request):
        # Support comma-separated assigned_to (e.g., "1,2,3") in addition to JSON arrays.
        data = request.data.copy()
        assigned_raw = data.get("assigned_to")
        if isinstance(assigned_raw, str):
            # Split on commas and strip whitespaces; ignore empty segments
            ids = [s.strip() for s in assigned_raw.split(",") if s.strip()]
            if ids:
                data.setlist("assigned_to", ids) if hasattr(data, "setlist") else data.update({"assigned_to": ids})

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

        # Re-serialize to include read-only/nested fields (assigned_to_detail, project_* fields if you added them)
        return Response(RfiSerializer(rfi).data, status=status.HTTP_201_CREATED)
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        qs = Rfi.objects.select_related("project", "author").prefetch_related("assigned_to")

        # project filter
        project_id = request.query_params.get("project")
        if project_id:
            qs = qs.filter(project_id=project_id)

        # search filter (match your frontend ?search=)
        term = request.query_params.get("search")
        if term:
            qs = qs.filter(
                Q(rfi_name__icontains=term) |
                Q(rfi_number__icontains=term) |
                Q(trade__icontains=term) |
                Q(project__project_number__icontains=term) |
                Q(project__project_name__icontains=term) |
                Q(assigned_to__name__icontains=term)
            ).distinct()

        paginator = StandardPagination()
        page = paginator.paginate_queryset(qs.order_by("-received_date", "-id"), request)
        serializer = RfiSerializer(page, many=True)
        return paginator.get_paginated_response(serializer.data)
    



class RfiDetail(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get_object(self, pk):
        return get_object_or_404(
            Rfi.objects.select_related("project", "project__project_manager", "author").prefetch_related("assigned_to"),
            pk=pk,
        )

    def get(self, request, pk):
        rfi = self.get_object(pk)
        return Response(RfiSerializer(rfi).data)

    def put(self, request, pk):
        rfi = self.get_object(pk)
        serializer = RfiSerializer(rfi, data=request.data, context={"request": request})
        if serializer.is_valid():
            rfi = serializer.save()  # assigned_to handled in serializer.update
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
                Rfi.objects.select_related("project").prefetch_related("assigned_to"), pk=rfi_id
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
