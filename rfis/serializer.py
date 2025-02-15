from .models import Rfi
from rest_framework import serializers


class RfiSerializer(serializers.ModelSerializer):
    """Serializer to map the Model instance into JSON format."""

    class Meta:
        model = Rfi
        fields = "__all__"

    def create(self, validated_data):
        """Create and return a new `Rfi` instance, given the validated data"""
        try:
            rfi = Rfi.objects.create(**validated_data)
        except KeyError as e:
            raise serializers.ValidationError(
                f"Missing required field: {e}. Please provide this field."
            )
        return rfi
