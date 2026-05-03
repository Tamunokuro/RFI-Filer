# rfis/urls.py
from django.urls import path
from .views import (
    ProjectListCreate, ProjectDetail,
    RfiListCreate, RfiDetail,
    RfiPdfExport, RfiTransition,
    MemberListCreate, MemberDetail, MemberInvite,
    ProjectMembershipListCreate, ProjectMembershipDetail,
    ProjectMembers, ProjectMemberDetail, ProjectNextRfiNumber,
    ChatGPTCompletion,
    MeView,
    ForgotPasswordView,
    ResetPasswordView,
    CustomTokenObtainPairView,
    RfiCommentListCreate, RfiOfficialResponse, RfiMarkRead, RfiUnreadSummary,
    RfiNotifications, RfiMarkAllRead,
    RfiAttachmentListCreate, RfiAttachmentDetail,
    RfiRevisionList, OfficialResponseRevisionList,
    ContractChangeList, ContractChangeDetail,
    NotificationList, NotificationMarkRead,
)

app_name = "rfis"

urlpatterns = [
    # ----- Projects -----
    path("projects/", ProjectListCreate.as_view(), name="project-list"),
    path("projects/<int:pk>/", ProjectDetail.as_view(), name="project-detail"),
    path("projects/<int:pk>/members/", ProjectMembers.as_view(), name="project-members"),
    path("projects/<int:pk>/members/<int:member_id>/", ProjectMemberDetail.as_view(), name="project-member-detail"),
    path("projects/<int:pk>/next-rfi-number/", ProjectNextRfiNumber.as_view(), name="project-next-rfi-number"),

    # Optional nested RFIs under a project (handy for your UI if you want it)
    # You can simply call /api/rfis/?project=<id> instead, so this is optional.
    # path("projects/<int:pk>/rfis/", RfiListCreate.as_view(), name="project-rfi-list"),

    # ----- RFIs -----
    # GET /api/rfis/?project=<id>  (filter by project)
    path("rfis/", RfiListCreate.as_view(), name="rfi-list"),
    path("rfis/unread-summary/", RfiUnreadSummary.as_view(), name="rfi-unread-summary"),
    path("rfis/notifications/", RfiNotifications.as_view(), name="rfi-notifications"),
    path("rfis/mark-all-read/", RfiMarkAllRead.as_view(), name="rfi-mark-all-read"),
    path("rfis/<int:pk>/", RfiDetail.as_view(), name="rfi-detail"),
    path("rfis/<int:pk>/pdf/", RfiPdfExport.as_view(), name="rfi-pdf"),
    path("rfis/<int:pk>/transition/", RfiTransition.as_view(), name="rfi-transition"),
    path("rfis/<int:pk>/comments/", RfiCommentListCreate.as_view(), name="rfi-comments"),
    path("rfis/<int:pk>/official-response/", RfiOfficialResponse.as_view(), name="rfi-official-response"),
    path("rfis/<int:pk>/mark-read/", RfiMarkRead.as_view(), name="rfi-mark-read"),
    path("rfis/<int:pk>/attachments/", RfiAttachmentListCreate.as_view(), name="rfi-attachments"),
    path("rfis/<int:pk>/attachments/<int:attachment_id>/", RfiAttachmentDetail.as_view(), name="rfi-attachment-detail"),
    path("rfis/<int:pk>/revisions/", RfiRevisionList.as_view(), name="rfi-revisions"),
    path("rfis/<int:pk>/response-history/", OfficialResponseRevisionList.as_view(), name="rfi-response-history"),
    # rfis/urls.py
    path("rfis/<int:pk>/<slug:slug>/", RfiDetail.as_view(), name="rfi-detail-slug"),

    # ----- Contract Changes -----
    path("contract-changes/", ContractChangeList.as_view(), name="contract-change-list"),
    path("contract-changes/<int:pk>/", ContractChangeDetail.as_view(), name="contract-change-detail"),

    # ----- Members -----
    path("members/", MemberListCreate.as_view(), name="member-list"),
    path("members/invite/", MemberInvite.as_view(), name="member-invite"),
    path("members/<int:pk>/", MemberDetail.as_view(), name="member_detail"),

    # ----- Project Memberships (through table) -----
    path("memberships/", ProjectMembershipListCreate.as_view(), name="membership-list"),
    path("memberships/<int:pk>/", ProjectMembershipDetail.as_view(), name="membership-detail"),

    # ----- In-app Notifications -----
    path("notifications/", NotificationList.as_view(), name="notification-list"),
    path("notifications/mark-read/", NotificationMarkRead.as_view(), name="notification-mark-read"),

    # ----- AI -----
    path("ai/chat/", ChatGPTCompletion.as_view(), name="ai-chat"),

    # ----- Password Reset -----
    path("me/", MeView.as_view(), name="me"),
    path("auth/forgot-password/", ForgotPasswordView.as_view(), name="forgot-password"),
    path("auth/reset-password/", ResetPasswordView.as_view(), name="reset-password"),

    # ----- Custom Token Pair -----
    path("api/token/", CustomTokenObtainPairView.as_view(), name="token_obtain_pair"),
]
