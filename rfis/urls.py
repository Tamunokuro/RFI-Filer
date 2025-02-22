from django.urls import path

from . import views

app_name = "rfis"

urlpatterns = [
    path("rfis/", views.RfiListView.as_view(), name="rfi_list"),
    path("rfis-create/", views.RfiCreateView.as_view(), name="rfi_create"),
    path("rfis/<slug:slug>/", views.RfiDetailView.as_view(), name="rfi_detail"),
    path(
        "rfis/<str:rfi_number>/<slug:slug>/",
        views.RfiUpdateView.as_view(),
        name="rfi_update",
    ),
    path("projects/", views.ProjectListView.as_view(), name="project_list"),
    path("projects-create/", views.ProjectCreateView.as_view(), name="project_create"),
]
