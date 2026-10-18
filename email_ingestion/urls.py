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
POST   /api/email/configs/<pk>/poll/
"""

from django.urls import path

from .views import (
    ApplyEmailFoldersView,
    ApproveEmailView,
    BulkDeleteInboundEmailView,
    EmailConfigDetailView,
    EmailConfigListCreateView,
    EmailFolderDetailView,
    EmailFolderListCreateView,
    InboundEmailDetailView,
    InboundEmailListView,
    PollEmailConfigView,
    RejectEmailView,
    RetryEmailView,
    TestEmailConfigView,
)

urlpatterns = [
    # --- Inbound email queue ---
    path("inbound/", InboundEmailListView.as_view(), name="email-inbound-list"),
    path("inbound/bulk-delete/", BulkDeleteInboundEmailView.as_view(), name="email-inbound-bulk-delete"),
    path("inbound/<int:pk>/", InboundEmailDetailView.as_view(), name="email-inbound-detail"),
    path("inbound/<int:pk>/approve/", ApproveEmailView.as_view(), name="email-inbound-approve"),
    path("inbound/<int:pk>/reject/", RejectEmailView.as_view(), name="email-inbound-reject"),
    path("inbound/<int:pk>/retry/", RetryEmailView.as_view(), name="email-inbound-retry"),

    # --- Email config management ---
    path("configs/", EmailConfigListCreateView.as_view(), name="email-config-list"),
    path("configs/<int:pk>/", EmailConfigDetailView.as_view(), name="email-config-detail"),
    path("configs/<int:pk>/test/", TestEmailConfigView.as_view(), name="email-config-test"),
    path("configs/<int:pk>/poll/", PollEmailConfigView.as_view(), name="email-config-poll"),

    # --- Email folder management ---
    path("folders/", EmailFolderListCreateView.as_view(), name="email-folder-list"),
    path("folders/<int:pk>/", EmailFolderDetailView.as_view(), name="email-folder-detail"),
    path("folders/apply/", ApplyEmailFoldersView.as_view(), name="email-folder-apply"),
]
