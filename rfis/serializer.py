from django.contrib.auth import get_user_model
from rest_framework import serializers
from .models import Rfi, Project, Member, ProjectMembership, Member
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer

User = get_user_model()

class RegisterSerializer(serializers.ModelSerializer):
    email = serializers.EmailField(required=True)
    confirm_password = serializers.CharField(write_only=True)

    # Member fields
    name = serializers.CharField(max_length=100)
    company = serializers.CharField(max_length=100, required=False, allow_blank=True)
    discipline = serializers.ChoiceField(
        choices=Member.Discipline.choices, required=False, allow_blank=True
    )
    role = serializers.ChoiceField(choices=Member.Role.choices)
    phone = serializers.CharField(max_length=20, required=False, allow_blank=True)

    class Meta:
        model = User
        fields = [
            "id",
            "username",
            "email",
            "password",
            "confirm_password",
            "name",
            "company",
            "discipline",
            "role",
            "phone",
        ]
        extra_kwargs = {
            "password": {"write_only": True, "min_length": 8},
        }

    def validate_email(self, value):
        if User.objects.filter(email=value).exists():
            raise serializers.ValidationError("A user with this email already exists.")
        if Member.objects.filter(email=value).exists():
            raise serializers.ValidationError("A member with this email already exists.")
        return value

    def validate(self, attrs):
        if attrs["password"] != attrs["confirm_password"]:
            raise serializers.ValidationError(
                {"confirm_password": "Passwords do not match."}
            )
        return attrs

    def create(self, validated_data):
        confirm_password = validated_data.pop("confirm_password")
        name = validated_data.pop("name")
        company = validated_data.pop("company", "")
        discipline = validated_data.pop("discipline", "")
        role = validated_data.pop("role")
        phone = validated_data.pop("phone", "")
        email = validated_data["email"]

        user = User.objects.create_user(**validated_data)

        Member.objects.create(
            user=user,
            name=name,
            email=email,
            company=company,
            discipline=discipline,
            role=role,
            phone=phone,
        )

        return user

class MemberSerializer(serializers.ModelSerializer):
    class Meta:
        model = Member
        fields = "__all__"
        extra_kwargs = {
            "user": {"read_only": True},  # set from request if you expose create member API
        }

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

class ProjectMembershipSerializer(serializers.ModelSerializer):
    member = MemberSerializer(read_only=True)
    member_id = serializers.PrimaryKeyRelatedField(source="member", queryset=Member.objects.all(), write_only=True)

    class Meta:
        model = ProjectMembership
        fields = ["id", "project", "member", "member_id", "role", "discipline", "is_project_admin", "joined_at"]
        read_only_fields = ["id", "joined_at", "project"]

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

class CustomTokenObtainPairSerializer(TokenObtainPairSerializer):
    @classmethod
    def get_token(cls, user):
        return super().get_token(user)

    def validate(self, attrs):
        data = super().validate(attrs)

        data["username"] = self.user.username

        try:
            member = Member.objects.get(user=self.user)
            data["member_id"] = member.id
            data["display_name"] = member.name or self.user.username
        except Member.DoesNotExist:
            data["member_id"] = None
            data["display_name"] = self.user.username

        return data