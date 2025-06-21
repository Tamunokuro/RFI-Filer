from .models import Rfi, Project
from rest_framework import serializers
from django.contrib.auth.models import User
from django.utils.text import slugify

class UserSerializer(serializers.ModelSerializer):
    """Serializer to map the User Model instance into JSON format."""
    class Meta:
        model = User
        fields = ["id", "username", "password"]
        extra_kwargs = {
            "password": {"write_only": True}
        }
    def create(self, validated_data):
        """Create a new user with the given validated data."""
        print(validated_data)
        user = User.objects.create_user(**validated_data)
        return user
    
class RfiSerializer(serializers.ModelSerializer):
    """Serializer to map the Model instance into JSON format."""

    class Meta:
        model = Rfi
        fields = "__all__"
        extra_kwargs = {
            "author": {"read_only": True},
            "slug": {"required": False},  # Make slug not required in validation
        }

    def create(self, validated_data):
        """Create a new RFI instance."""
        print("Validated data:", validated_data)
        # Generate slug from rfi_name and rfi_number
        slug_base = f"{validated_data['rfi_name']}-{validated_data['rfi_number']}"
        validated_data['slug'] = slugify(slug_base)
        return Rfi.objects.create(**validated_data)


class ProjectSerializer(serializers.ModelSerializer):
    """Serializer to map the Model instance into JSON format."""

    class Meta:
        model = Project
        fields = "__all__"
