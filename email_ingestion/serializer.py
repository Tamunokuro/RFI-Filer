"""
email_ingestion.serializer
~~~~~~~~~~~~~~~~~~~~~~~~~~~
DRF serializers for the email ingestion review queue.

InboundEmailAttachmentSerializer  — individual attachment on an inbound email
InboundEmailListSerializer        — lightweight list view (no body text)
InboundEmailDetailSerializer      — full detail including body + attachments
ApproveEmailSerializer            — validates editable fields before RFI creation
RejectEmailSerializer             — validates a rejection reason
EmailConfigSerializer             — CRUD for watched inbox settings
"""

from rest_framework import serializers

from .models import EmailConfig, InboundEmail, InboundEmailAttachment


# ---------------------------------------------------------------------------
# Attachments
# ---------------------------------------------------------------------------

class InboundEmailAttachmentSerializer(serializers.ModelSerializer):
    url = serializers.SerializerMethodField()

    class Meta:
        model = InboundEmailAttachment
        fields = ["id", "original_filename", "content_type", "size", "url"]
        read_only_fields = fields

    def get_url(self, obj):
        request = self.context.get("request")
        if obj.file and request:
            return request.build_absolute_uri(obj.file.url)
        return None


# ---------------------------------------------------------------------------
# Inbound email — list (lightweight)
# ---------------------------------------------------------------------------

class InboundEmailListSerializer(serializers.ModelSerializer):
    """
    Used for the review queue table — omits body_text to keep payloads small.
    """
    project_name = serializers.CharField(source="project.project_name", default=None)
    project_number = serializers.CharField(source="project.project_number", default=None)
    status_display = serializers.CharField(source="get_status_display", read_only=True)
    attachment_count = serializers.SerializerMethodField()
    rfi_number = serializers.CharField(source="rfi.rfi_number", default=None)

    class Meta:
        model = InboundEmail
        fields = [
            "id",
            "received_at",
            "fetched_at",
            "sender_name",
            "sender_email",
            "subject",
            "project_name",
            "project_number",
            "confidence",
            "match_reason",
            "status",
            "status_display",
            "attachment_count",
            "rfi_number",
        ]
        read_only_fields = fields

    def get_attachment_count(self, obj):
        return obj.attachments.count()


# ---------------------------------------------------------------------------
# Inbound email — detail (full, includes body + attachments)
# ---------------------------------------------------------------------------

class InboundEmailDetailSerializer(serializers.ModelSerializer):
    project_name = serializers.CharField(source="project.project_name", default=None)
    project_number = serializers.CharField(source="project.project_number", default=None)
    project_id = serializers.IntegerField(source="project.id", default=None)
    status_display = serializers.CharField(source="get_status_display", read_only=True)
    attachments = InboundEmailAttachmentSerializer(many=True, read_only=True)
    rfi_number = serializers.CharField(source="rfi.rfi_number", default=None)
    rfi_id = serializers.IntegerField(source="rfi.id", default=None)
    rfi_slug = serializers.CharField(source="rfi.slug", default=None)

    class Meta:
        model = InboundEmail
        fields = [
            "id",
            "received_at",
            "fetched_at",
            "sender_name",
            "sender_email",
            "subject",
            "body_text",
            "project_id",
            "project_name",
            "project_number",
            "confidence",
            "match_reason",
            "parsed_rfi_name",
            "parsed_question",
            "parsed_trade",
            "status",
            "status_display",
            "attachments",
            "rfi_number",
            "rfi_id",
            "rfi_slug",
            "rejection_reason",
            "error_message",
        ]
        read_only_fields = fields


# ---------------------------------------------------------------------------
# Approve — staff edits parsed fields before the RFI is created
# ---------------------------------------------------------------------------

class ApproveEmailSerializer(serializers.Serializer):
    """
    Payload sent when a reviewer approves a pending email.
    All fields are optional — unset fields fall back to the auto-parsed values.
    """
    project_id = serializers.IntegerField(
        help_text="Project to file this RFI under (required if not auto-matched)."
    )
    rfi_name = serializers.CharField(max_length=200, required=False, allow_blank=True)
    question = serializers.CharField(required=False, allow_blank=True)
    trade = serializers.CharField(max_length=10, required=False, allow_blank=True)
    due_date = serializers.DateField(required=False, allow_null=True)

    def validate_project_id(self, value):
        from rfis.models import Project
        try:
            return Project.objects.get(pk=value)
        except Project.DoesNotExist:
            raise serializers.ValidationError(f"Project with id={value} does not exist.")


# ---------------------------------------------------------------------------
# Reject
# ---------------------------------------------------------------------------

class RejectEmailSerializer(serializers.Serializer):
    reason = serializers.CharField(
        required=False,
        allow_blank=True,
        default="",
        help_text="Optional explanation stored on the InboundEmail record.",
    )


# ---------------------------------------------------------------------------
# EmailConfig — watched inbox CRUD
# ---------------------------------------------------------------------------

class EmailConfigSerializer(serializers.ModelSerializer):
    provider_display = serializers.CharField(source="get_provider_display", read_only=True)
    last_polled_at = serializers.DateTimeField(read_only=True)

    # Never expose the raw password in list/detail responses
    password = serializers.CharField(write_only=True, required=False, allow_blank=True)

    class Meta:
        model = EmailConfig
        fields = [
            "id",
            "label",
            "provider",
            "provider_display",
            "imap_host",
            "imap_port",
            "username",
            "password",
            "mailbox",
            "is_active",
            "auto_create_threshold",
            "last_polled_at",
        ]
        read_only_fields = ["id", "last_polled_at", "provider_display"]

    def validate_auto_create_threshold(self, value):
        if not (0.0 <= value <= 1.0):
            raise serializers.ValidationError("Threshold must be between 0.0 and 1.0.")
        return value

    def update(self, instance, validated_data):
        # If password field was omitted on a PATCH, keep the existing one
        if not validated_data.get("password"):
            validated_data.pop("password", None)
        return super().update(instance, validated_data)
