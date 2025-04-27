from django.contrib import admin

# Register your models here.
from .models import Rfi, Project

admin.site.site_header = "RFI Admin"
admin.site.site_title = "RFI Admin Portal"

@admin.register(Project)
class ProjectAdmin(admin.ModelAdmin):
    list_display = (
        "project_number",
        "project_name",
        "project_manager",
        "electrical_designers",
        "mechanical_designers",
        "contract_administrator",
        "contractors",
        "owners",
        "subconsultants",
    )
    search_fields = (
        "project_number",
        "project_name",
        "project_manager",
        "owners",
        "subconsultants",
    )
    list_filter = ("project_number", "project_manager", "owners", "subconsultants")
    prepopulated_fields = {"slug": ("project_number", "project_name")}


@admin.register(Rfi)
class RfiAdmin(admin.ModelAdmin):
    list_display = (
        "project_number",
        "rfi_number",
        "rfi_name",
        "trade",
        "project_manager",
        "assigned_to",
        "received_date",
        "due_date",
        "remarks",
    )
    search_fields = (
        "project_number",
        "rfi_number",
        "rfi_name",
        "trade",
        "project_manager",
        "assigned_to",
        "received_date",
    )
    list_filter = ("project_number", "rfi_number", "project_manager", "assigned_to")
    ordering = ["-received_date"]
    prepopulated_fields = {"slug": ("project_number", "rfi_number", "rfi_name")}
