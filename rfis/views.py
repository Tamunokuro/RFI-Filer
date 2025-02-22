from django.shortcuts import render
from rest_framework.response import Response
from rest_framework import status
from rest_framework.views import APIView
from rfis.serializer import RfiSerializer, ProjectSerializer
from rfis.models import Rfi, Project

# Create your views here.
class ProjectCreateView(APIView):
    def post(self, request):
        serializer = ProjectSerializer(data=request.data)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

class ProjectListView(APIView):
    def get(self, request):
        """Get all projects"""
        try:
            projects = ProjectSerializer(Project.objects.all(), many=True)
        except Project.DoesNotExist:
            return Response(
                {"message": "There are no projects"}, status=status.HTTP_404_NOT_FOUND
            )
        return Response(projects.data, status=status.HTTP_200_OK)

class RfiCreateView(APIView):
    """API to create an RFI"""

    def post(self, request):
        """ "Create a new RFI"""
        serializer = RfiSerializer(data=request.data)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

class RfiListView(APIView):
    def get(self, request):
        """Get all RFIs"""
        rfis = RfiSerializer(Rfi.objects.all(), many=True)
        return Response(rfis.data, status=status.HTTP_200_OK)

class RfiDetailView(APIView):
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
    def patch(self, request, rfi_number, slug):
        """Update a single RFI"""
        try:
            rfi = Rfi.objects.get(rfi_number=rfi_number, slug=slug)
        except Rfi.DoesNotExist:
            return Response(
                {"message": "The RFI does not exist"}, status=status.HTTP_404_NOT_FOUND
            )
        serializer = RfiSerializer(rfi, data=request.data, partial=True)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data, status=status.HTTP_200_OK)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    def put(self, request, rfi_number, slug):
        """Update a single RFI"""
        try:
            rfi = Rfi.objects.get(rfi_number=rfi_number, slug=slug)
        except Rfi.DoesNotExist:
            return Response(
                {"message": "The RFI does not exist"}, status=status.HTTP_404_NOT_FOUND
            )
        serializer = RfiSerializer(rfi, data=request.data)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data, status=status.HTTP_200_OK)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
