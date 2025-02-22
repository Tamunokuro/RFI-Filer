from django.db import models
from django.urls import reverse
from django.utils.text import slugify


# Create your models here.
class Project(models.Model):
    """Model definition for Project."""

    project_number = models.CharField(max_length=100)
    project_name = models.CharField(max_length=100)
    project_manager = models.CharField(max_length=100)
    electrical_designers = models.CharField(max_length=100, blank=True)
    mechanical_designers = models.CharField(max_length=100, blank=True)
    contract_administrator = models.CharField(max_length=100)
    contractors = models.EmailField(max_length=100)
    owners = models.CharField(max_length=100)
    subconsultants = models.EmailField(max_length=100, blank=True)
    rfis = models.ManyToManyField("Rfi", related_name="projects", blank=True)
    slug = models.SlugField(max_length=100, unique=True)

    def __str__(self):
        """Unicode representation of Project."""
        return self.project_number + " - " + self.project_name

    class Meta:
        """Meta definition for Project."""

        verbose_name = "Project"
        verbose_name_plural = "Projects"
        ordering = ["-project_number"]


class Rfi(models.Model):
    """Model definition for Rfi."""

    project = models.ForeignKey(
        Project, on_delete=models.CASCADE, related_name="project_rfis"
    )
    project_number = models.CharField(max_length=100)
    project_name = models.CharField(max_length=100)
    trade = models.CharField(max_length=3, default="M")
    rfi_name = models.CharField(max_length=100)
    rfi_number = models.CharField(max_length=100)
    project_manager = models.CharField(max_length=100)
    assigned_to = models.CharField(max_length=100)
    received_date = models.DateField()
    due_date = models.DateField()
    remarks = models.TextField()
    slug = models.SlugField(max_length=100, unique=True)

    def __str__(self):
        """Unicode representation of Rfi."""
        return self.project_number + " - " + self.rfi_number + " - " + self.rfi_name

    class Meta:
        """Meta definition for Rfi."""

        verbose_name = "RFI"
        verbose_name_plural = "RFIs"
        ordering = ["-rfi_number"]

    def get_absolute_url(self):
        return reverse("rfi_detail", args=[self.slug])

    def save(self, *args, **kwargs):
        """Save the slug field."""
        self.slug = slugify(
            self.project_number + " - " + self.rfi_number + " - " + self.rfi_name
        )
        super(Rfi, self).save(*args, **kwargs)
