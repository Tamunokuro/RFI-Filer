from django.contrib import admin

# Register your models here.
from .models import Rfi

admin.site.site_header = "RFI Admin"
admin.site.site_title = "RFI Admin Portal"


@admin.register(Rfi)
class RfiAdmin(admin.ModelAdmin):
    list_display = (
        "project_number",
        "rfi_number",
        "rfi_name",
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
        "project_manager",
        "assigned_to",
        "received_date",
    )
    list_filter = ("project_number", "rfi_number", "project_manager", "assigned_to")
    ordering = ["-received_date"]
    prepopulated_fields = {"slug": ("project_number", "rfi_number", "rfi_name")}
