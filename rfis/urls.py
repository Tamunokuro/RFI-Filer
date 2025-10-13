# rfis/urls.py
from django.urls import path
from .views import (
    ProjectListCreate, ProjectDetail,
    RfiListCreate, RfiDetail,
    MemberListCreate, MemberDetail,
    ProjectMembershipListCreate, ProjectMembershipDetail,   # add this import
    ProjectMembers,
    ChatGPTCompletion,
)

app_name = "rfis"

urlpatterns = [
    # ----- Projects -----
    path("projects/", ProjectListCreate.as_view(), name="project-list"),
    path("projects/<int:pk>/", ProjectDetail.as_view(), name="project-detail"),
    path("projects/<int:pk>/members/", ProjectMembers.as_view(), name="project-members"),

    # Optional nested RFIs under a project (handy for your UI if you want it)
    # You can simply call /api/rfis/?project=<id> instead, so this is optional.
    # path("projects/<int:pk>/rfis/", RfiListCreate.as_view(), name="project-rfi-list"),

    # ----- RFIs -----
    # GET /api/rfis/?project=<id>  (filter by project)
    path("rfis/", RfiListCreate.as_view(), name="rfi-list"),
    path("rfis/<int:pk>/", RfiDetail.as_view(), name="rfi-detail"),
    # rfis/urls.py
    path("rfis/<int:pk>/<slug:slug>/", RfiDetail.as_view(), name="rfi-detail-slug"),

    # ----- Members -----
    path("members/", MemberListCreate.as_view(), name="member-list"),
    path("members/<int:pk>/", MemberDetail.as_view(), name="member-detail"),

    # ----- Project Memberships (through table) -----
    path("memberships/", ProjectMembershipListCreate.as_view(), name="membership-list"),
    path("memberships/<int:pk>/", ProjectMembershipDetail.as_view(), name="membership-detail"),

    # ----- AI -----
    path("ai/chat/", ChatGPTCompletion.as_view(), name="ai-chat"),
]
