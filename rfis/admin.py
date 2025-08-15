from django.contrib import admin
from django.db.models import Count
from .models import Project, Rfi, Member, ProjectMembership


class ProjectMembershipInline(admin.TabularInline):
    model = ProjectMembership
    extra = 1
    autocomplete_fields = ["member"]
    fields = ["member", "role", "discipline", "is_project_admin", "joined_at"]
    readonly_fields = ["joined_at"]

@admin.register(Project)
class ProjectAdmin(admin.ModelAdmin):
    list_display = ("project_number", "project_name", "project_manager", "rfi_count")
    search_fields = (
        "project_number",
        "project_name",
        "project_manager__name",
        "project_manager__user__username",
    )
    list_filter = ("project_manager",)
    autocomplete_fields = ["project_manager"]
    readonly_fields = ["slug"]
    inlines = [ProjectMembershipInline]

    def get_queryset(self, request):
        qs = super().get_queryset(request)
        # annotate RFI count for the changelist
        return qs.annotate(_rfi_count=Count("rfis"))

    def rfi_count(self, obj):
        return getattr(obj, "_rfi_count", 0)
    rfi_count.short_description = "RFIs"

@admin.register(Rfi)
class RfiAdmin(admin.ModelAdmin):
    list_display = (
        "project",                  # shows "PN - Project Name" via Project.__str__
        "rfi_number",
        "rfi_name",
        "trade",
        "author",
        "received_date",
        "due_date",
        "assigned_to_list",
    )
    search_fields = (
        "rfi_number",
        "rfi_name",
        "trade",
        "author__username",
        "project__project_number",
        "project__project_name",
        "assigned_to__name",
        "assigned_to__user__username",
    )
    list_filter = ("trade", "received_date", "due_date", "project")
    ordering = ["-received_date", "-id"]
    readonly_fields = ["slug"]
    autocomplete_fields = ["project", "author", "assigned_to"]

    def assigned_to_list(self, obj):
        return ", ".join(obj.assigned_to.values_list("name", flat=True))
    assigned_to_list.short_description = "Assigned To"

@admin.register(Member)
class MemberAdmin(admin.ModelAdmin):
    list_display = ("user", "name", "role", "discipline", "company", "date_joined")
    search_fields = (
        "user__username",
        "name",
        "company",
        "role",
        "discipline",
        "email",
    )
    list_filter = ("role", "discipline", "company", "date_joined")
    ordering = ["user__username"]
    # No slug on Member; remove prepopulated_fields

    # Optional: if you truly want to restrict non-superusers to only their own Member row
    # def get_queryset(self, request):
    #     qs = super().get_queryset(request)
    #     if request.user.is_superuser:
    #         return qs
    #     return qs.filter(user=request.user)