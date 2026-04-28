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
        OPEN = "open", "Open"
        CLOSED = "closed", "Closed"

    project = models.ForeignKey(Project, on_delete=models.CASCADE, related_name="rfis")
    author = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="rfis")
    trade = models.CharField(max_length=10, default="M")
    rfi_name = models.CharField(max_length=200)
    rfi_number = models.CharField(max_length=50)
    assigned_to = models.ManyToManyField(Member, related_name="assigned_rfis", blank=True)
    received_date = models.DateField()
    due_date = models.DateField()
    question = models.TextField(blank=True)
    proposed_solution = models.TextField(blank=True)
    slug = models.SlugField(max_length=140, unique=True, blank=True)

    status = models.CharField(max_length=10, choices=Status.choices, default=Status.OPEN)
    official_response = models.TextField(blank=True)
    responded_by = models.ForeignKey(
        Member, on_delete=models.SET_NULL, null=True, blank=True, related_name="responded_rfis"
    )
    responded_at = models.DateTimeField(null=True, blank=True)
    closed_at = models.DateTimeField(null=True, blank=True)

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