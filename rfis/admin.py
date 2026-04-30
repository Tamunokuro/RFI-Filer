from django.contrib import admin
from django.db.models import Count
from .models import Project, Rfi, Member, ProjectMembership, RfiComment, RfiAttachment, RfiReadState


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
        "project",
        "rfi_number",
        "rfi_name",
        "trade",
        "status",
        "author",
        "received_date",
        "due_date",
        "designers_list",
        "contract_administrators_list",
    )
    search_fields = (
        "rfi_number",
        "rfi_name",
        "trade",
        "author__username",
        "project__project_number",
        "project__project_name",
        "designers__name",
        "designers__user__username",
        "contract_administrators__name",
        "contract_administrators__user__username",
    )
    list_filter = ("status", "trade", "received_date", "due_date", "project")
    ordering = ["-received_date", "-id"]
    readonly_fields = ["slug", "responded_at", "closed_at"]
    autocomplete_fields = ["project", "author", "designers", "contract_administrators"]
    filter_horizontal = ["designers", "contract_administrators"]

    def designers_list(self, obj):
        names = obj.designers.values_list("name", flat=True)
        return ", ".join(names) if names else "—"
    designers_list.short_description = "Designers"

    def contract_administrators_list(self, obj):
        names = obj.contract_administrators.values_list("name", flat=True)
        return ", ".join(names) if names else "—"
    contract_administrators_list.short_description = "Contract Administrators"


@admin.register(RfiComment)
class RfiCommentAdmin(admin.ModelAdmin):
    list_display = ("rfi", "author", "is_official_response", "created_at", "body_preview")
    search_fields = ("rfi__rfi_number", "rfi__rfi_name", "author__name", "body")
    list_filter = ("is_official_response", "created_at")
    ordering = ["-created_at"]
    readonly_fields = ["created_at", "updated_at"]

    def body_preview(self, obj):
        return obj.body[:80] + ("…" if len(obj.body) > 80 else "")
    body_preview.short_description = "Message"


@admin.register(RfiAttachment)
class RfiAttachmentAdmin(admin.ModelAdmin):
    list_display = (
        "original_filename", "rfi", "uploaded_by",
        "content_type", "size_kb", "is_official_response", "uploaded_at",
    )
    search_fields = ("original_filename", "rfi__rfi_number", "uploaded_by__name")
    list_filter = ("is_official_response", "content_type", "uploaded_at")
    ordering = ["-uploaded_at"]
    readonly_fields = ["uploaded_at", "original_filename", "content_type", "size"]

    def size_kb(self, obj):
        return f"{round(obj.size / 1024, 1)} KB" if obj.size else "—"
    size_kb.short_description = "Size"


@admin.register(RfiReadState)
class RfiReadStateAdmin(admin.ModelAdmin):
    list_display = ("rfi", "member", "last_read_at")
    search_fields = ("rfi__rfi_number", "member__name")
    list_filter = ("last_read_at",)
    ordering = ["-last_read_at"]
    readonly_fields = ["last_read_at"]

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