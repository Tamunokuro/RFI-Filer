from django.contrib.auth import get_user_model
from rest_framework import serializers
from .models import Rfi, Project, Member, ProjectMembership


# ---------- User ----------
class UserSerializer(serializers.ModelSerializer):
    class Meta:
        model = get_user_model()
        fields = ["id", "username", "password"]
        extra_kwargs = {"password": {"write_only": True}}

    def create(self, validated_data):
        return get_user_model().objects.create_user(**validated_data)


# ---------- Member ----------
class MemberSerializer(serializers.ModelSerializer):
    class Meta:
        model = Member
        fields = "__all__"
        extra_kwargs = {
            "user": {"read_only": True},  # set from request if you expose create member API
        }


# ---------- RFI ----------
class RfiSerializer(serializers.ModelSerializer):
    project_number = serializers.CharField(source="project.project_number", read_only=True)
    project_name = serializers.CharField(source="project.project_name", read_only=True)
    project_manager_name = serializers.CharField(
        source="project.project_manager.name", read_only=True, default=""
    )

    # writable IDs for assigning members
    assigned_to = serializers.PrimaryKeyRelatedField(
        queryset=Member.objects.all(), many=True, required=False
    )
    # read-only detail for display
    assigned_to_detail = MemberSerializer(source="assigned_to", many=True, read_only=True)
    # write project as PK; author comes from request.user
    project = serializers.PrimaryKeyRelatedField(queryset=Project.objects.all())
    author = serializers.PrimaryKeyRelatedField(read_only=True)

  
    class Meta:
        model = Rfi
        fields = [
            "id", "project", "project_number", "project_name", "project_manager_name",
            "author", "trade", "rfi_name", "rfi_number",
            "assigned_to", "assigned_to_detail",
            "received_date", "due_date", "remarks", "slug",
        ]
        read_only_fields = ["id", "slug", "author"]

    def validate(self, attrs):
        project = attrs.get("project") or getattr(self.instance, "project", None)
        assignees = attrs.get("assigned_to")
        if project and assignees:
            project_member_ids = set(project.members.values_list("id", flat=True))
            invalid = [m.id for m in assignees if m.id not in project_member_ids]
            if invalid:
                raise serializers.ValidationError(
                    {"assigned_to": "All assignees must be members of this project."}
                )
        return attrs

    def create(self, validated_data):
        assignees = validated_data.pop("assigned_to", [])
        rfi = Rfi.objects.create(**validated_data)  # slug auto-set in model
        if assignees:
            rfi.assigned_to.set(assignees)
        return rfi

    def update(self, instance, validated_data):
        assignees = validated_data.pop("assigned_to", None)
        rfi = super().update(instance, validated_data)
        if assignees is not None:
            rfi.assigned_to.set(assignees)
        return rfi


# ---------- Project Membership (optional API surface) ----------
class ProjectMembershipSerializer(serializers.ModelSerializer):
    member = MemberSerializer(read_only=True)
    member_id = serializers.PrimaryKeyRelatedField(source="member", queryset=Member.objects.all(), write_only=True)

    class Meta:
        model = ProjectMembership
        fields = ["id", "project", "member", "member_id", "role", "discipline", "is_project_admin", "joined_at"]
        read_only_fields = ["id", "joined_at", "project"]


# ---------- Project ----------
class ProjectSerializer(serializers.ModelSerializer):
    # annotate rfi_count in the queryset (preferred); or use a method field
    rfi_count = serializers.IntegerField(read_only=True)
    rfis = RfiSerializer(many=True, read_only=True)  # reverse name is "rfis"
    project_manager_name = serializers.CharField(source="project_manager.name", read_only=True)

    class Meta:
        model = Project
        fields = [
            "id", "project_name", "project_number",
            "project_manager", "project_manager_name",
            "rfi_count", "rfis", "slug",
        ]
        read_only_fields = ["slug"]