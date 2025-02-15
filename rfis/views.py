from django.shortcuts import render
from rest_framework.response import Response
from rest_framework import status
from rest_framework.views import APIView
from rfis.serializer import RfiSerializer
from rfis.models import Rfi

# Create your views here.
class RfiCreateView(APIView):
    """API to create an RFI"""

    def post(self, request):
        """ "Create a new RFI"""
        rfi = RfiSerializer(data=request.data)
        if rfi.is_valid():
            rfi.save()
            return Response(rfi.data, status=status.HTTP_201_CREATED)
        return Response(rfi.errors, status=status.HTTP_400_BAD_REQUEST)


class RfiListView(APIView):
    def get(self, request):
        """Get all RFIs"""
        rfi = RfiSerializer(Rfi.objects.all(), many=True)
        return Response(rfi.data, status=status.HTTP_200_OK)
