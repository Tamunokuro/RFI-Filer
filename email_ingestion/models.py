from django.db import models
from rfis.models import Project, Rfi


class EmailConfig(models.Model):
    """
    Connection settings for a watched IMAP inbox.
    One row per mailbox the poller should monitor.
    """

    class Provider(models.TextChoices):
        GMAIL = "gmail", "Gmail"
        OUTLOOK = "outlook", "Outlook / Microsoft 365"
        OTHER = "other", "Other (custom host)"

    label = models.CharField(
        max_length=100,
        help_text='Friendly name, e.g. "RFI Inbox"',
    )
    provider = models.CharField(
        max_length=20,
        choices=Provider.choices,
        default=Provider.GMAIL,
    )
    # IMAP connection — pre-filled defaults per provider, overridable
    imap_host = models.CharField(
        max_length=200,
        default="imap.gmail.com",
    )
    imap_port = models.PositiveIntegerField(default=993)
    username = models.EmailField(help_text="The email address to log in with")
    # Stored as plain text here for simplicity; move to env / secrets manager
    # in production.
    password = models.CharField(
        max_length=500,
        help_text="App password (Gmail) or account password",
    )
    mailbox = models.CharField(
        max_length=100,
        default="INBOX",
        help_text='IMAP folder to watch, e.g. "INBOX" or "RFIs"',
    )
    is_active = models.BooleanField(default=True)
    last_polled_at = models.DateTimeField(null=True, blank=True)

    # Gmail-specific: restrict fetching to the Primary tab only.
    # Uses Gmail's X-GM-RAW IMAP extension ("in:primary is:unread").
    # Has no effect for non-Gmail providers.
    gmail_primary_only = models.BooleanField(
        default=True,
        help_text=(
            "Gmail only — fetch emails from the Primary tab only, "
            "ignoring Promotions, Social, and Updates."
        ),
    )

    # Auto-create threshold: emails scored at or above this go straight to
    # an RFI without manual review.
    auto_create_threshold = models.FloatField(
        default=0.85,
        help_text="Confidence score (0–1) above which an RFI is created automatically",
    )

    class Meta:
        verbose_name = "Email Config"
        verbose_name_plural = "Email Configs"
        ordering = ["label"]

    def __str__(self):
        return f"{self.label} ({self.username})"

    def save(self, *args, **kwargs):
        """Auto-fill IMAP host/port when provider changes."""
        if self.provider == self.Provider.GMAIL:
            self.imap_host = "imap.gmail.com"
            self.imap_port = 993
        elif self.provider == self.Provider.OUTLOOK:
            self.imap_host = "outlook.office365.com"
            self.imap_port = 993
        super().save(*args, **kwargs)


class InboundEmail(models.Model):
    """
    One row per email fetched from the inbox.
    Acts as an audit log whether the email ended up as an RFI or not.
    """

    class Status(models.TextChoices):
        PENDING = "pending", "Pending Review"
        AUTO_CREATED = "auto_created", "Auto-created RFI"
        APPROVED = "approved", "Manually Approved"
        REJECTED = "rejected", "Rejected"
        ERROR = "error", "Processing Error"

    email_config = models.ForeignKey(
        EmailConfig,
        on_delete=models.SET_NULL,
        null=True,
        related_name="inbound_emails",
    )

    # De-duplication key — RFC 2822 Message-ID header
    message_id = models.CharField(max_length=500, unique=True, db_index=True)

    received_at = models.DateTimeField(
        help_text="Date/time the email was sent (from headers)"
    )
    fetched_at = models.DateTimeField(
        auto_now_add=True,
        help_text="When our poller picked it up",
    )

    sender_name = models.CharField(max_length=200, blank=True)
    sender_email = models.EmailField()
    subject = models.CharField(max_length=500, blank=True)
    body_text = models.TextField(blank=True)

    # Matching results
    project = models.ForeignKey(
        Project,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="inbound_emails",
    )
    confidence = models.FloatField(
        default=0.0,
        help_text="Project-match confidence score (0–1)",
    )
    match_reason = models.CharField(
        max_length=300,
        blank=True,
        help_text="Human-readable explanation of how the project was matched",
    )

    # Parsed fields that will pre-fill the RFI form
    parsed_rfi_name = models.CharField(max_length=200, blank=True)
    parsed_question = models.TextField(blank=True)
    parsed_trade = models.CharField(max_length=10, blank=True)

    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.PENDING,
        db_index=True,
    )

    # Set when an RFI is created from this email (auto or manual)
    rfi = models.OneToOneField(
        Rfi,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="source_email",
    )

    rejection_reason = models.TextField(blank=True)
    error_message = models.TextField(blank=True)

    class Meta:
        verbose_name = "Inbound Email"
        verbose_name_plural = "Inbound Emails"
        ordering = ["-received_at"]
        indexes = [
            models.Index(fields=["status", "-received_at"]),
        ]

    def __str__(self):
        return f"[{self.get_status_display()}] {self.subject} — {self.sender_email}"


def email_attachment_path(instance, filename):
    return f"email_attachments/{instance.inbound_email_id}/{filename}"


class InboundEmailAttachment(models.Model):
    """
    A file attached to an inbound email.
    When an RFI is created from the email these are copied across
    as RfiAttachments.
    """

    inbound_email = models.ForeignKey(
        InboundEmail,
        on_delete=models.CASCADE,
        related_name="attachments",
    )
    file = models.FileField(upload_to=email_attachment_path)
    original_filename = models.CharField(max_length=255)
    content_type = models.CharField(max_length=120, blank=True)
    size = models.PositiveBigIntegerField(default=0)

    class Meta:
        ordering = ["original_filename"]

    def __str__(self):
        return f"{self.original_filename} ({self.inbound_email_id})"
