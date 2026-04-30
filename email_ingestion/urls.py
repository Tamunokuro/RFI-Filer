"""
email_ingestion URL configuration.

All routes are mounted under /api/email/ in filer/urls.py.

Inbound email review queue
--------------------------
GET    /api/email/inbound/
GET    /api/email/inbound/<pk>/
POST   /api/email/inbound/<pk>/approve/
POST   /api/email/inbound/<pk>/reject/
POST   /api/email/inbound/<pk>/retry/

Email config management
-----------------------
GET    /api/email/configs/
POST   /api/email/configs/
GET    /api/email/configs/<pk>/
PATCH  /api/email/configs/<pk>/
DELETE /api/email/configs/<pk>/
POST   /api/email/configs/<pk>/test/
"""

from django.urls import path

from .views import (
    ApproveEmailView,
    EmailConfigDetailView,
    EmailConfigListCreateView,
    InboundEmailDetailView,
    InboundEmailListView,
    RejectEmailView,
    RetryEmailView,
    TestEmailConfigView,
)

urlpatterns = [
    # --- Inbound email queue ---
    path("inbound/", InboundEmailListView.as_view(), name="email-inbound-list"),
    path("inbound/<int:pk>/", InboundEmailDetailView.as_view(), name="email-inbound-detail"),
    path("inbound/<int:pk>/approve/", ApproveEmailView.as_view(), name="email-inbound-approve"),
    path("inbound/<int:pk>/reject/", RejectEmailView.as_view(), name="email-inbound-reject"),
    path("inbound/<int:pk>/retry/", RetryEmailView.as_view(), name="email-inbound-retry"),

    # --- Email config management ---
    path("configs/", EmailConfigListCreateView.as_view(), name="email-config-list"),
    path("configs/<int:pk>/", EmailConfigDetailView.as_view(), name="email-config-detail"),
    path("configs/<int:pk>/test/", TestEmailConfigView.as_view(), name="email-config-test"),
]
