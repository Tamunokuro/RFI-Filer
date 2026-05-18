from django.conf import settings
from django.db import models
from django.urls import reverse
from django.utils.text import slugify


class Member(models.Model):
    """Profile for a Django user."""
    user = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="member")
    is_admin = models.BooleanField(default=False)
    name = models.CharField(max_length=100)
    email = models.EmailField(max_length=254, unique=True)
    company = models.CharField(max_length=100, blank=True)

    class Discipline(models.TextChoices):
        ELECTRICAL = "Electrical", "Electrical"
        MECHANICAL = "Mechanical", "Mechanical"
        CIVIL = "Civil", "Civil"
        STRUCTURAL = "Structural", "Structural"
        ARCHITECTURAL = "Architectural", "Architectural"

    discipline = models.CharField(max_length=50, choices=Discipline.choices, blank=True)

    class Role(models.TextChoices):
        PROJECT_DESIGNER = "Project Designer", "Project Designer"
        SUB_CONSULTANT = "Sub Consultant", "Sub Consultant"
        CLIENT = "Client", "Client"
        CONTRACTOR = "Contractor", "Contractor"
        CONTRACT_ADMIN = "Contract Administrator", "Contract Administrator"
        PROJECT_MANAGER = "Project Manager", "Project Manager"

    role = models.CharField(max_length=50, choices=Role.choices)
    phone = models.CharField(max_length=20, blank=True)
    date_joined = models.DateTimeField(auto_now_add=True)
    email_notifications = models.BooleanField(
        default=True,
        help_text="Receive email notifications for RFI activity.",
    )

    def __str__(self):
        return f"{self.user.username} - {self.role} - {self.email} - {self.company}"

    def get_absolute_url(self):
        return reverse("member_detail", args=[self.pk])

    class Meta:
        ordering = ["user__username"]
        verbose_name = "Member"
        verbose_name_plural = "Members"


class Project(models.Model):
    project_number = models.CharField(max_length=100, unique=True, db_index=True)
    project_name = models.CharField(max_length=200)
    project_manager = models.ForeignKey(
        Member, on_delete=models.SET_NULL, null=True, blank=True, related_name="managed_projects"
    )
    members = models.ManyToManyField(Member, through="ProjectMembership", related_name="projects", blank=True)
    slug = models.SlugField(max_length=120, unique=True, blank=True)
    sla_days = models.PositiveSmallIntegerField(
        default=14,
        help_text="Default response time in calendar days. New RFIs auto-fill due date as Received + sla_days.",
    )

    def __str__(self):
        return f"{self.project_number} - {self.project_name}"

    def save(self, *args, **kwargs):
        if not self.slug:
            self.slug = slugify(f"{self.project_number}-{self.project_name}")[:120]
        super().save(*args, **kwargs)

    class Meta:
        ordering = ["-project_number"]
        verbose_name = "Project"
        verbose_name_plural = "Projects"


class ProjectMembership(models.Model):
    project = models.ForeignKey(Project, on_delete=models.CASCADE)
    member = models.ForeignKey(Member, on_delete=models.CASCADE)
    role = models.CharField(max_length=50, choices=Member.Role.choices)
    discipline = models.CharField(max_length=50, choices=Member.Discipline.choices, blank=True)
    is_project_admin = models.BooleanField(default=False)
    joined_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ("project", "member")


class Rfi(models.Model):
    class Status(models.TextChoices):
        OPEN         = "open",         "Open"
        SUBMITTED    = "submitted",    "Submitted"
        UNDER_REVIEW = "under_review", "Under Review"
        RESPONDED    = "responded",    "Responded"
        RETURNED     = "returned",     "Returned to Submitter"
        CLOSED       = "closed",       "Closed"

    class Priority(models.TextChoices):
        LOW      = "low",      "Low"
        MEDIUM   = "medium",   "Medium"
        HIGH     = "high",     "High"
        CRITICAL = "critical", "Critical"

    project = models.ForeignKey(Project, on_delete=models.CASCADE, related_name="rfis")
    author = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="rfis")
    trade = models.CharField(max_length=10, default="M")
    rfi_name = models.CharField(max_length=200)
    rfi_number = models.CharField(max_length=50)
    designers = models.ManyToManyField(
        Member, related_name="designed_rfis", blank=True,
        help_text="Project Designers responsible for answering this RFI."
    )
    contract_administrators = models.ManyToManyField(
        Member, related_name="administered_rfis", blank=True,
        help_text="Contract Administrators overseeing this RFI."
    )
    received_date = models.DateField()
    due_date = models.DateField()
    question = models.TextField(blank=True)
    proposed_solution = models.TextField(blank=True)

    # ── Drawing reference ─────────────────────────────────────────────────────
    drawing_number   = models.CharField(max_length=50,  blank=True,
        help_text="Sheet/drawing number referenced by this RFI, e.g. A-101, E-104.")
    drawing_revision = models.CharField(max_length=20,  blank=True,
        help_text="Drawing revision at the time of the RFI, e.g. Rev B, IFC.")
    drawing_title    = models.CharField(max_length=200, blank=True,
        help_text="Short description of the drawing, e.g. Ground Floor Plan.")

    # ── Specification reference ───────────────────────────────────────────────
    spec_section       = models.CharField(max_length=20,  blank=True,
        help_text="CSI MasterFormat section number, e.g. 03 30 00.")
    spec_section_title = models.CharField(max_length=200, blank=True,
        help_text="Section title, e.g. Cast-in-Place Concrete.")

    slug = models.SlugField(max_length=140, unique=True, blank=True)

    priority = models.CharField(
        max_length=10,
        choices=Priority.choices,
        default=Priority.MEDIUM,
        help_text="Urgency level for this RFI: Low, Medium, High, or Critical.",
    )
    # ── Revision lineage ─────────────────────────────────────────────────────
    # When an RFI is created as a revision of a previously closed one (e.g.
    # RFI-003 → RFI-003.1), parent_rfi stores the FK to the original.
    parent_rfi = models.ForeignKey(
        "self", null=True, blank=True, on_delete=models.SET_NULL,
        related_name="child_rfis",
        help_text="Closed RFI that this revision supersedes.",
    )

    status = models.CharField(max_length=15, choices=Status.choices, default=Status.OPEN)
    official_response = models.TextField(blank=True)
    responded_by = models.ForeignKey(
        Member, on_delete=models.SET_NULL, null=True, blank=True, related_name="responded_rfis"
    )
    responded_at = models.DateTimeField(null=True, blank=True)
    closed_at = models.DateTimeField(null=True, blank=True)

    # ── Return-to-submitter ───────────────────────────────────────────────────
    return_note = models.TextField(
        blank=True,
        help_text="Reason provided when the RFI is returned to the submitter.",
    )

    # ── Overdue escalation ────────────────────────────────────────────────────
    escalated = models.BooleanField(
        default=False,
        help_text="Set when the overdue-escalation management command runs; "
                  "prevents duplicate escalations.",
    )

    def __str__(self):
        return f"{self.project.project_number} - {self.rfi_number} - {self.rfi_name}"

    def get_absolute_url(self):
        return reverse("rfi_detail", args=[self.slug])

    def save(self, *args, **kwargs):
        if not self.slug:
            base = slugify(f"{self.project.project_number}-{self.rfi_number}-{self.rfi_name}")
            self.slug = base[:140]
        super().save(*args, **kwargs)

    class Meta:
        verbose_name = "RFI"
        verbose_name_plural = "RFIs"
        ordering = ["-received_date", "-id"]
        constraints = [
            models.UniqueConstraint(fields=["project", "rfi_number"], name="uniq_rfi_per_project"),
            models.CheckConstraint(
                check=models.Q(due_date__gte=models.F("received_date")),
                name="due_not_before_received",
            ),
        ]


def rfi_attachment_path(instance, filename):
    return f"rfi_attachments/{instance.rfi_id}/{filename}"


class RfiAttachment(models.Model):
    rfi = models.ForeignKey(Rfi, on_delete=models.CASCADE, related_name="attachments")
    uploaded_by = models.ForeignKey(
        Member, on_delete=models.SET_NULL, null=True, related_name="rfi_attachments"
    )
    file = models.FileField(upload_to=rfi_attachment_path)
    original_filename = models.CharField(max_length=255)
    content_type = models.CharField(max_length=120, blank=True)
    size = models.PositiveBigIntegerField(default=0)
    uploaded_at = models.DateTimeField(auto_now_add=True)
    is_official_response = models.BooleanField(default=False)
    # Links this attachment to a specific official response revision (null = general attachment).
    response_revision = models.ForeignKey(
        "OfficialResponseRevision",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="attachments",
    )

    class Meta:
        ordering = ["-uploaded_at", "-id"]
        indexes = [models.Index(fields=["rfi", "uploaded_at"])]

    def __str__(self):
        return f"{self.original_filename} (RFI {self.rfi_id})"


class RfiComment(models.Model):
    rfi = models.ForeignKey(Rfi, on_delete=models.CASCADE, related_name="comments")
    author = models.ForeignKey(Member, on_delete=models.SET_NULL, null=True, related_name="rfi_comments")
    body = models.TextField()
    is_official_response = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["created_at", "id"]
        indexes = [models.Index(fields=["rfi", "created_at"])]

    def __str__(self):
        author_name = self.author.name if self.author else "[deleted]"
        return f"Comment by {author_name} on RFI {self.rfi_id}"


class RfiCommentAttachment(models.Model):
    """File or media attached to a single discussion comment."""
    comment          = models.ForeignKey(RfiComment, on_delete=models.CASCADE, related_name="attachments")
    file             = models.FileField(upload_to="comment_attachments/%Y/%m/")
    original_filename = models.CharField(max_length=255)
    content_type     = models.CharField(max_length=100, blank=True)
    size             = models.PositiveIntegerField(default=0)   # bytes
    uploaded_at      = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.original_filename} on comment {self.comment_id}"


class RfiWatcher(models.Model):
    """
    Members who are CC'd on an RFI and want to be notified of all activity
    (comments, status changes, official responses) without being a designer
    or contract administrator.
    """
    rfi    = models.ForeignKey(Rfi,    on_delete=models.CASCADE, related_name="watchers")
    member = models.ForeignKey(Member, on_delete=models.CASCADE, related_name="watched_rfis")
    added_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ("rfi", "member")
        ordering = ["added_at"]

    def __str__(self):
        return f"{self.member.name} watching RFI {self.rfi_id}"


class AuditLog(models.Model):
    """
    Immutable record of every significant action taken on an RFI.

    ``actor``  — the Member who performed the action (null if account deleted).
    ``action`` — a short machine-readable verb, e.g. "status_changed",
                 "comment_added", "returned_to_submitter", etc.
    ``detail`` — free JSON for extra context (before/after values, notes, …).
    """
    rfi    = models.ForeignKey(Rfi,    on_delete=models.CASCADE,  related_name="audit_logs")
    actor  = models.ForeignKey(
        Member, on_delete=models.SET_NULL, null=True, blank=True,
        related_name="audit_logs",
    )
    action    = models.CharField(max_length=60, db_index=True)
    detail    = models.JSONField(default=dict, blank=True)
    timestamp = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-timestamp"]
        verbose_name = "Audit Log Entry"
        verbose_name_plural = "Audit Log"

    def __str__(self):
        actor = self.actor.name if self.actor else "System"
        return f"[{self.action}] {actor} on RFI {self.rfi_id} at {self.timestamp:%Y-%m-%d %H:%M}"


class RfiReadState(models.Model):
    """Tracks when a member last viewed an RFI's discussion.

    Unread count for a member on an RFI = comments with created_at > last_read_at.
    """
    rfi = models.ForeignKey(Rfi, on_delete=models.CASCADE, related_name="read_states")
    member = models.ForeignKey(Member, on_delete=models.CASCADE, related_name="rfi_read_states")
    last_read_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = ("rfi", "member")
        indexes = [models.Index(fields=["member", "rfi"])]


class RfiRevision(models.Model):
    """
    Records a single revision of an RFI's content fields.

    Created whenever an RFI is edited while it is ``under_review``.
    The ``changes`` JSON maps field names to ``{"before": …, "after": …}`` pairs,
    giving designers a clear picture of exactly what the requester changed.
    """
    rfi = models.ForeignKey(Rfi, on_delete=models.CASCADE, related_name="revisions")
    revised_by = models.ForeignKey(
        Member,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="rfi_revisions",
    )
    revised_at = models.DateTimeField(auto_now_add=True)
    revision_number = models.PositiveIntegerField()
    # {field_name: {"before": <value>, "after": <value>}}
    # List fields (designers, contract_administrators) store arrays of names.
    changes = models.JSONField()
    rfi_status_at_revision = models.CharField(max_length=15)

    class Meta:
        ordering = ["-revision_number"]
        verbose_name = "RFI Revision"
        verbose_name_plural = "RFI Revisions"

    def __str__(self):
        return f"Revision #{self.revision_number} of RFI {self.rfi_id}"


class OfficialResponseRevision(models.Model):
    """
    Stores every official response or revised response for an RFI.

    ``response_number`` starts at 1 (initial response) and increments with each
    revision submitted by a designer.  ``Rfi.official_response`` always mirrors
    the latest revision's body.  Attachments are linked via the FK on
    ``RfiAttachment.response_revision``.
    """
    rfi = models.ForeignKey(Rfi, on_delete=models.CASCADE, related_name="response_revisions")
    body = models.TextField()
    responded_by = models.ForeignKey(
        Member,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="official_response_revisions",
    )
    responded_at = models.DateTimeField(auto_now_add=True)
    response_number = models.PositiveIntegerField()  # 1 = original, 2+ = revisions

    class Meta:
        ordering = ["-response_number"]
        verbose_name = "Official Response Revision"
        verbose_name_plural = "Official Response Revisions"

    def __str__(self):
        return f"Response #{self.response_number} for RFI {self.rfi_id}"


class ContractChange(models.Model):
    """
    Tracks formal contract changes flagged during the RFI workflow.

    When a designer (or other responder) submits an official response, they
    can indicate that a formal instruction will follow — e.g. a Project
    Change Notice (PCN), Site Instruction (SI), Change Directive (CD), or
    Change Order (CO).  Each flag creates a ``ContractChange`` record in
    the ``pending`` state.  The RFI cannot be closed while any of its
    contract changes are still pending.

    Once the formal document has been issued, an authorised user updates
    the record with the reference number and supporting details, moving it
    to the ``issued`` state.  Cancelled changes are kept in the audit trail
    but do not block RFI closure.
    """

    class ChangeType(models.TextChoices):
        PCN   = "PCN",   "Project Change Notice"
        SI    = "SI",    "Site Instruction"
        CD    = "CD",    "Change Directive"
        CO    = "CO",    "Change Order"
        OTHER = "Other", "Other"

    class Status(models.TextChoices):
        PENDING   = "pending",   "Pending"
        ISSUED    = "issued",    "Issued"
        CANCELLED = "cancelled", "Cancelled"

    project = models.ForeignKey(
        Project, on_delete=models.CASCADE, related_name="contract_changes"
    )
    rfi = models.ForeignKey(
        Rfi, on_delete=models.CASCADE, null=True, blank=True,
        related_name="contract_changes",
    )
    response_revision = models.ForeignKey(
        OfficialResponseRevision,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="contract_changes",
    )
    anticipated_type = models.CharField(
        max_length=10, choices=ChangeType.choices,
        help_text="The type of formal change document the responder expects to issue.",
    )
    issued_type = models.CharField(
        max_length=10, choices=ChangeType.choices, blank=True,
        help_text="The actual type of formal document issued (may differ from anticipated).",
    )
    reference_number = models.CharField(
        max_length=50, blank=True,
        help_text="Reference of the issued document, e.g. PCN-007 or SI-012.",
    )
    description = models.TextField(
        help_text="Why a formal instruction is required and what is being changed."
    )
    notes = models.TextField(
        blank=True,
        help_text="Free-form notes added when the change is issued or cancelled."
    )
    status = models.CharField(
        max_length=15, choices=Status.choices, default=Status.PENDING,
    )
    created_by = models.ForeignKey(
        Member, on_delete=models.SET_NULL, null=True, blank=True,
        related_name="created_contract_changes",
    )
    issued_by = models.ForeignKey(
        Member, on_delete=models.SET_NULL, null=True, blank=True,
        related_name="issued_contract_changes",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    issued_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at", "-id"]
        verbose_name = "Contract Change"
        verbose_name_plural = "Contract Changes"
        indexes = [
            models.Index(fields=["project", "status"]),
            models.Index(fields=["rfi", "status"]),
        ]

    def __str__(self):
        ref = self.reference_number or self.anticipated_type
        return f"{ref} ({self.status}) — Project {self.project_id}"


# ── In-app Notifications ───────────────────────────────────────────────────────

class Notification(models.Model):
    """
    Lightweight in-app notification record.

    Currently used for:
      - project_added  : a member was added to a project team
      - project_removed: a member was removed from a project team (future)

    The bell widget polls for unread counts and fetches the full list on open.
    """

    class Verb(models.TextChoices):
        PROJECT_ADDED     = "project_added",     "Added to project"
        PROJECT_REMOVED   = "project_removed",   "Removed from project"
        RFI_ASSIGNED      = "rfi_assigned",      "Assigned to RFI"
        RFI_DUE_SOON      = "rfi_due_soon",      "RFI due soon"
        MENTIONED         = "mentioned",         "Mentioned in comment"
        RFI_RETURNED      = "rfi_returned",      "RFI returned to submitter"
        OFFICIAL_RESPONSE = "official_response", "Official response submitted"
        RFI_STATUS_CHANGE = "rfi_status_change", "RFI status changed"
        WATCHER_ACTIVITY  = "watcher_activity",  "RFI activity (watching)"
        RFI_OVERDUE       = "rfi_overdue",       "RFI overdue"
        RFI_COMMENT       = "rfi_comment",       "New comment on RFI"

    recipient  = models.ForeignKey(
        Member, on_delete=models.CASCADE, related_name="notifications",
    )
    verb       = models.CharField(max_length=50, choices=Verb.choices)
    actor_name = models.CharField(max_length=255, blank=True)   # name of the person who triggered it
    project    = models.ForeignKey(
        "Project", on_delete=models.CASCADE, null=True, blank=True,
        related_name="notifications",
    )
    # Extra human-readable context stored at creation time so deleting the
    # project/membership still allows the notification to render correctly.
    extra      = models.JSONField(default=dict, blank=True)
    read       = models.BooleanField(default=False, db_index=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        indexes  = [
            models.Index(fields=["recipient", "read"]),
        ]

    def __str__(self):
        return f"[{self.verb}] → {self.recipient_id} ({'' if self.read else 'un'}read)"