from django.db.models import Count
from django.shortcuts import get_object_or_404
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status, permissions
from rest_framework.pagination import PageNumberPagination
from django.db.models import Q
from django.db import IntegrityError

from .models import Project, Rfi, Member, ProjectMembership
from .serializer import (
    ProjectSerializer, RfiSerializer, MemberSerializer, ProjectMembershipSerializer, UserSerializer
)

class UserCreateView(APIView):
    permission_classes = [permissions.AllowAny]  # allow registration without auth

    def post(self, request):
        serializer = UserSerializer(data=request.data)
        if serializer.is_valid():
            user = serializer.save()
            data = UserSerializer(user).data  # password is write_only, so it won't be returned
            return Response(data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
    
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