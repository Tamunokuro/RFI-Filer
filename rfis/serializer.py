from django.contrib.auth import get_user_model
from rest_framework import serializers
from .models import (
    Rfi, Project, Member, ProjectMembership, RfiComment, RfiReadState,
    RfiAttachment, RfiRevision, OfficialResponseRevision, ContractChange,
    RfiCommentAttachment, RfiWatcher,
)
from .notifications import notify_rfi_assigned
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
        fields = [
            "id", "user", "name", "email", "company", "discipline",
            "role", "phone", "is_admin", "date_joined", "email_notifications",
        ]
        extra_kwargs = {
            "user": {"read_only": True},
            "date_joined": {"read_only": True},
        }


class MemberProfileUpdateSerializer(serializers.ModelSerializer):
    """Allows a member to update only their own name, email and notification prefs."""

    class Meta:
        model = Member
        fields = ["name", "email", "email_notifications"]

    def validate_name(self, value):
        if not value or not value.strip():
            raise serializers.ValidationError("Name cannot be blank.")
        return value.strip()

    def validate_email(self, value):
        qs = Member.objects.filter(email=value)
        if self.instance:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise serializers.ValidationError("A member with this email already exists.")
        return value

class RfiSerializer(serializers.ModelSerializer):
    project_number = serializers.CharField(source="project.project_number", read_only=True)
    project_name = serializers.CharField(source="project.project_name", read_only=True)
    project_manager_name = serializers.CharField(
        source="project.project_manager.name", read_only=True, default=""
    )

    # Designers — writable IDs + read-only detail
    designers = serializers.PrimaryKeyRelatedField(
        queryset=Member.objects.all(), many=True, required=False
    )
    designers_detail = MemberSerializer(source="designers", many=True, read_only=True)

    # Contract Administrators — writable IDs + read-only detail
    contract_administrators = serializers.PrimaryKeyRelatedField(
        queryset=Member.objects.all(), many=True, required=False
    )
    contract_administrators_detail = MemberSerializer(
        source="contract_administrators", many=True, read_only=True
    )

    # write project as PK; author comes from request.user
    project = serializers.PrimaryKeyRelatedField(queryset=Project.objects.all())
    author = serializers.PrimaryKeyRelatedField(read_only=True)

    responded_by_name = serializers.CharField(source="responded_by.name", read_only=True, default="")
    official_response_attachments = serializers.SerializerMethodField()

    # Revision lineage
    parent_rfi = serializers.PrimaryKeyRelatedField(
        queryset=Rfi.objects.all(), required=False, allow_null=True
    )
    parent_rfi_number = serializers.CharField(
        source="parent_rfi.rfi_number", read_only=True, default=""
    )
    parent_rfi_name = serializers.CharField(
        source="parent_rfi.rfi_name", read_only=True, default=""
    )
    parent_rfi_slug = serializers.CharField(
        source="parent_rfi.slug", read_only=True, default=""
    )
    child_rfi_count = serializers.SerializerMethodField()
    child_rfis = serializers.SerializerMethodField()

    def get_child_rfi_count(self, obj):
        return obj.child_rfis.count()

    def get_child_rfis(self, obj):
        """Return minimal data for each child (revision) RFI."""
        return [
            {
                "id":         c.id,
                "rfi_number": c.rfi_number,
                "rfi_name":   c.rfi_name,
                "slug":       c.slug,
                "status":     c.status,
            }
            for c in obj.child_rfis.order_by("rfi_number")
        ]

    def get_official_response_attachments(self, obj):
        qs = obj.attachments.filter(is_official_response=True)
        return RfiAttachmentSerializer(qs, many=True, context=self.context).data

    class Meta:
        model = Rfi
        fields = [
            "id", "project", "project_number", "project_name", "project_manager_name",
            "author", "trade", "rfi_name", "rfi_number",
            "designers", "designers_detail",
            "contract_administrators", "contract_administrators_detail",
            "received_date", "due_date", "question", "proposed_solution",
            "drawing_number", "drawing_revision", "drawing_title",
            "spec_section", "spec_section_title",
            "priority",
            "slug",
            "status", "official_response", "responded_by", "responded_by_name",
            "responded_at", "closed_at", "official_response_attachments",
            "return_note",
            "parent_rfi", "parent_rfi_number", "parent_rfi_name", "parent_rfi_slug",
            "child_rfi_count", "child_rfis",
            "escalated",
        ]
        read_only_fields = [
            "id", "slug", "author",
            "status", "official_response", "responded_by", "responded_by_name",
            "responded_at", "closed_at", "official_response_attachments",
            "return_note",
            "parent_rfi_number", "parent_rfi_name", "parent_rfi_slug",
            "child_rfi_count", "child_rfis", "escalated",
        ]

    def _validate_project_members(self, project, members, field_name):
        if not members:
            return
        project_member_ids = set(project.members.values_list("id", flat=True))
        invalid = [m.id for m in members if m.id not in project_member_ids]
        if invalid:
            raise serializers.ValidationError(
                {field_name: f"All {field_name.replace('_', ' ')} must be members of this project."}
            )

    def validate(self, attrs):
        project = attrs.get("project") or getattr(self.instance, "project", None)
        if project:
            self._validate_project_members(project, attrs.get("designers"), "designers")
            self._validate_project_members(
                project, attrs.get("contract_administrators"), "contract_administrators"
            )
        return attrs

    def _actor_name(self):
        """Return the display name of the user making this request, or ''."""
        request = self.context.get("request")
        if request and hasattr(request.user, "member"):
            return request.user.member.name
        return ""

    def _fire_assigned_notifications(self, rfi, new_members):
        """Send rfi_assigned notifications to `new_members` (a set/list of Member)."""
        request = self.context.get("request")
        actor_name = self._actor_name()
        for member in new_members:
            # Don't notify someone who assigned themselves
            if request and hasattr(request.user, "member") and request.user.member == member:
                continue
            notify_rfi_assigned(member, rfi, actor_name)

    def create(self, validated_data):
        designers = validated_data.pop("designers", [])
        contract_admins = validated_data.pop("contract_administrators", [])
        rfi = Rfi.objects.create(**validated_data)
        if designers:
            rfi.designers.set(designers)
        if contract_admins:
            rfi.contract_administrators.set(contract_admins)
        # Notify everyone assigned at creation time
        self._fire_assigned_notifications(rfi, list(designers) + list(contract_admins))
        return rfi

    def update(self, instance, validated_data):
        designers = validated_data.pop("designers", None)
        contract_admins = validated_data.pop("contract_administrators", None)

        # Capture current assignees before the update
        old_designers = set(instance.designers.all())
        old_cas = set(instance.contract_administrators.all())

        rfi = super().update(instance, validated_data)

        new_designers = set()
        new_cas = set()

        if designers is not None:
            new_designers = set(designers) - old_designers  # only newly added
            rfi.designers.set(designers)
        if contract_admins is not None:
            new_cas = set(contract_admins) - old_cas
            rfi.contract_administrators.set(contract_admins)

        # Notify only the newly added assignees
        self._fire_assigned_notifications(rfi, new_designers | new_cas)
        return rfi

class ProjectMembershipSerializer(serializers.ModelSerializer):
    member = MemberSerializer(read_only=True)
    member_id = serializers.PrimaryKeyRelatedField(source="member", queryset=Member.objects.all(), write_only=True)
    project_number = serializers.CharField(source="project.project_number", read_only=True)
    project_name   = serializers.CharField(source="project.project_name",   read_only=True)

    class Meta:
        model = ProjectMembership
        fields = [
            "id", "project", "project_number", "project_name",
            "member", "member_id", "role", "discipline", "is_project_admin", "joined_at",
        ]
        read_only_fields = ["id", "joined_at", "project", "project_number", "project_name"]

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
            "sla_days",
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
            data["role"] = member.role
        except Member.DoesNotExist:
            data["member_id"] = None
            data["display_name"] = self.user.username
            data["role"] = ""

        return data


class RfiCommentAttachmentSerializer(serializers.ModelSerializer):
    file_url = serializers.SerializerMethodField()

    class Meta:
        model = RfiCommentAttachment
        fields = ["id", "file_url", "original_filename", "content_type", "size", "uploaded_at"]
        read_only_fields = ["id", "file_url", "original_filename", "content_type", "size", "uploaded_at"]

    def get_file_url(self, obj):
        if not obj.file:
            return None
        request = self.context.get("request")
        url = obj.file.url
        return request.build_absolute_uri(url) if request else url


class RfiCommentSerializer(serializers.ModelSerializer):
    author_name    = serializers.CharField(source="author.name",    read_only=True, default="")
    author_role    = serializers.CharField(source="author.role",    read_only=True, default="")
    author_company = serializers.CharField(source="author.company", read_only=True, default="")
    attachments    = RfiCommentAttachmentSerializer(many=True, read_only=True)

    # body is optional when files are attached — view enforces "body or files"
    body = serializers.CharField(required=False, allow_blank=True, default="")

    class Meta:
        model = RfiComment
        fields = [
            "id", "rfi", "author", "author_name", "author_role", "author_company",
            "body", "is_official_response", "created_at", "updated_at", "attachments",
        ]
        read_only_fields = [
            "id", "rfi", "author", "author_name", "author_role", "author_company",
            "is_official_response", "created_at", "updated_at", "attachments",
        ]


class RfiAttachmentSerializer(serializers.ModelSerializer):
    file_url = serializers.SerializerMethodField()
    uploaded_by_name = serializers.CharField(source="uploaded_by.name", read_only=True, default="")

    class Meta:
        model = RfiAttachment
        fields = [
            "id", "rfi", "file", "file_url", "original_filename",
            "content_type", "size", "uploaded_by", "uploaded_by_name",
            "uploaded_at", "is_official_response", "response_revision",
        ]
        read_only_fields = [
            "id", "rfi", "file_url", "original_filename", "content_type",
            "size", "uploaded_by", "uploaded_by_name", "uploaded_at",
            "is_official_response", "response_revision",
        ]
        extra_kwargs = {"file": {"write_only": True}}

    def get_file_url(self, obj):
        if not obj.file:
            return None
        request = self.context.get("request")
        url = obj.file.url
        if request is not None:
            return request.build_absolute_uri(url)
        return url


class OfficialResponseSerializer(serializers.Serializer):
    body = serializers.CharField()

    def validate_body(self, value):
        if not value or not value.strip():
            raise serializers.ValidationError("Official response cannot be empty.")
        return value


class RfiRevisionSerializer(serializers.ModelSerializer):
    revised_by_name = serializers.CharField(source="revised_by.name", read_only=True, default="")

    class Meta:
        model = RfiRevision
        fields = [
            "id", "rfi", "revised_by", "revised_by_name",
            "revised_at", "revision_number", "changes",
            "rfi_status_at_revision",
        ]
        read_only_fields = fields


class OfficialResponseRevisionSerializer(serializers.ModelSerializer):
    responded_by_name = serializers.CharField(source="responded_by.name", read_only=True, default="")
    attachments = RfiAttachmentSerializer(many=True, read_only=True)

    class Meta:
        model = OfficialResponseRevision
        fields = [
            "id", "rfi", "body", "responded_by", "responded_by_name",
            "responded_at", "response_number", "attachments",
        ]
        read_only_fields = fields


class ContractChangeSerializer(serializers.ModelSerializer):
    project_number = serializers.CharField(source="project.project_number", read_only=True)
    project_name = serializers.CharField(source="project.project_name", read_only=True)
    rfi_number = serializers.CharField(source="rfi.rfi_number", read_only=True, default="")
    rfi_name = serializers.CharField(source="rfi.rfi_name", read_only=True, default="")
    rfi_slug = serializers.CharField(source="rfi.slug", read_only=True, default="")
    created_by_name = serializers.CharField(source="created_by.name", read_only=True, default="")
    issued_by_name = serializers.CharField(source="issued_by.name", read_only=True, default="")
    anticipated_type_display = serializers.CharField(
        source="get_anticipated_type_display", read_only=True
    )
    issued_type_display = serializers.CharField(
        source="get_issued_type_display", read_only=True, default=""
    )
    status_display = serializers.CharField(source="get_status_display", read_only=True)

    class Meta:
        model = ContractChange
        fields = [
            "id", "project", "project_number", "project_name",
            "rfi", "rfi_number", "rfi_name", "rfi_slug",
            "response_revision",
            "anticipated_type", "anticipated_type_display",
            "issued_type", "issued_type_display",
            "reference_number", "description", "notes",
            "status", "status_display",
            "created_by", "created_by_name",
            "issued_by", "issued_by_name",
            "created_at", "updated_at", "issued_at",
        ]
        read_only_fields = [
            "id", "project_number", "project_name",
            "rfi_number", "rfi_name", "rfi_slug",
            "anticipated_type_display", "issued_type_display", "status_display",
            "created_by", "created_by_name",
            "issued_by", "issued_by_name",
            "created_at", "updated_at", "issued_at",
        ]

    def validate_anticipated_type(self, value):
        if value not in dict(ContractChange.ChangeType.choices):
            raise serializers.ValidationError("Invalid change type.")
        return value

    def validate_description(self, value):
        if not value or not value.strip():
            raise serializers.ValidationError("Description cannot be empty.")
        return value.strip()