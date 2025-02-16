from .models import Rfi, Project
from rest_framework import serializers


class RfiSerializer(serializers.ModelSerializer):
    """Serializer to map the Model instance into JSON format."""

    class Meta:
        model = Rfi
        fields = "__all__"


class ProjectSerializer(serializers.ModelSerializer):
    """Serializer to map the Model instance into JSON format."""

    class Meta:
        model = Project
        fields = "__all__"
