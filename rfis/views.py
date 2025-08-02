from django.shortcuts import render
from django.db.models import Count
from django.contrib.auth.models import User
from rest_framework.response import Response
from rest_framework import status, generics
from rest_framework.permissions import IsAuthenticated, AllowAny
from rest_framework.pagination import PageNumberPagination
from django.db.models import Q
from rest_framework.views import APIView
from rfis.serializer import UserSerializer, RfiSerializer, ProjectSerializer
from rfis.models import Rfi, Project


# Create your views here.
class UserCreateView(generics.CreateAPIView):
    """API to create a new user"""
    queryset = User.objects.all()
    serializer_class = UserSerializer
    permission_classes = [AllowAny]


class ProjectCreateView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = ProjectSerializer(data=request.data)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class ProjectListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        """Get all projects"""
        try:
            projects = Project.objects.prefetch_related('rfis').annotate(rfi_count=Count('project_rfis'))
            if not projects.exists():
                return Response(
                    {"message": "There are no projects"}, 
                    status=status.HTTP_200_OK
                )
            serializer = ProjectSerializer(projects, many=True)
            return Response(serializer.data, status=status.HTTP_200_OK)
        except Exception as e:
            return Response(
                {"message": f"Error fetching projects: {str(e)}"}, 
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )


class RfiCreateView(APIView):
    """API to create an RFI"""
    permission_classes = [IsAuthenticated]

    def post(self, request):
        """Create a new RFI"""
        serializer = RfiSerializer(data=request.data)
        if serializer.is_valid():
            # Add the current user as the author
            serializer.save(author=request.user)
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        print("Serializer errors:", serializer.errors)  # Log validation errors
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class RfiListView(APIView):
    permission_classes = [AllowAny]

    """Get all RFIs with optional search and pagination"""
    def get(self, request):
        # Get search query from ?search=
        search_query = request.query_params.get('search', '')

        # Filter queryset based on search input (optional)
        queryset = Rfi.objects.all().order_by('-id')
        if search_query:
            queryset = queryset.filter(
                Q(rfi_name__icontains=search_query) |
                Q(rfi_number__icontains=search_query) |
                Q(project_name__icontains=search_query) |
                Q(project_number__icontains=search_query) |
                Q(assigned_to__icontains=search_query)
            )

        # Apply pagination manually
        paginator = PageNumberPagination()
        paginator.page_size = 10
        result_page = paginator.paginate_queryset(queryset, request)

        # Serialize and return paginated data
        serializer = RfiSerializer(result_page, many=True)
        return paginator.get_paginated_response(serializer.data)


class RfiDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, slug):
        """Get a single RFI"""
        try:
            rfi = Rfi.objects.get(slug=slug)
            rfi = RfiSerializer(rfi, many=False)
        except Rfi.DoesNotExist:
            return Response(
                {"message": "The RFI does not exist"}, status=status.HTTP_404_NOT_FOUND
            )

        serialized_rfi = RfiSerializer(rfi.data)
        return Response(serialized_rfi.data, status=status.HTTP_200_OK)


class RfiUpdateView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, pk, slug):
        try:
            rfi = Rfi.objects.get(pk=pk, slug=slug)
            serializer = RfiSerializer(rfi)
            return Response(serializer.data, status=status.HTTP_200_OK)
        except Rfi.DoesNotExist:
            return Response({"message": "RFI not found"}, status=status.HTTP_404_NOT_FOUND)

    def patch(self, request, pk, slug):
        """Update a single RFI"""
        try:
            rfi = Rfi.objects.get(pk=pk, slug=slug)
        except Rfi.DoesNotExist:
            return Response(
                {"message": "The RFI does not exist"}, status=status.HTTP_404_NOT_FOUND
            )
        serializer = RfiSerializer(rfi, data=request.data, partial=True)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data, status=status.HTTP_200_OK)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    def put(self, request, pk, slug):
        """Update a single RFI"""
        try:
            rfi = Rfi.objects.get(pk=pk, slug=slug)
        except Rfi.DoesNotExist:
            return Response(
                {"message": "The RFI does not exist"}, status=status.HTTP_404_NOT_FOUND
            )
        serializer = RfiSerializer(rfi, data=request.data)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data, status=status.HTTP_200_OK)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
    
class RfiDeleteView(APIView):
    permission_classes = [IsAuthenticated]

    def delete(self, request, pk, slug):
        """Delete a single RFI"""
        try:
            rfi = Rfi.objects.get(pk=pk, slug=slug)
            rfi.delete()
            return Response(
                {"message": "RFI deleted successfully"}, status=status.HTTP_204_NO_CONTENT
            )
        except Rfi.DoesNotExist:
            return Response(
                {"message": "The RFI does not exist"}, status=status.HTTP_404_NOT_FOUND
            )
