from .models import Rfi, Project
from rest_framework import serializers
from django.contrib.auth.models import User

class UserSerializer(serializers.ModelSerializer):
    """Serializer to map the User Model instance into JSON format."""
    class Meta:
        model = User
        fields = ("id", "username", "password")
        extra_kwargs = {
            "password": {"write_only": True},
        }
        def create(self, validated_data):
            """Create a new user with the given validated data."""
            user = User.objects.create_user(**validated_data)
            return user
    
class RfiSerializer(serializers.ModelSerializer):
    """Serializer to map the Model instance into JSON format."""

    class Meta:
        model = Rfi
        fields = "__all__"
        extra_kwargs = {
            "author": {"read_only": True},
        }


class ProjectSerializer(serializers.ModelSerializer):
    """Serializer to map the Model instance into JSON format."""

    class Meta:
        model = Project
        fields = "__all__"
