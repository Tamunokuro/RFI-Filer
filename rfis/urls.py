from django.urls import path

from . import views

app_name = "rfis"

urlpatterns = [
    path("rfis/", views.RfiListView.as_view(), name="rfi_list"),
    path("rfis-create/", views.RfiCreateView.as_view(), name="rfi_create"),
]
