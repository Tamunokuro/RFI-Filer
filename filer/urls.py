from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.urls import path, include
from rfis.views import UserCreateView
from rest_framework_simplejwt.views import (
    TokenObtainPairView,
    TokenRefreshView,
)
from rfis import sso_views

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/user/register/", UserCreateView.as_view(), name="register"),
    path("api/token/", TokenObtainPairView.as_view(), name="obtain_token"),
    path("api/token/refresh/", TokenRefreshView.as_view(), name="refresh_token"),
    path("api-auth/", include("rest_framework.urls")),
    path("api/", include("rfis.urls")),
    path("api/email/", include("email_ingestion.urls")),

    # ── SSO (OAuth2) ───────────────────────────────────────────────────────────
    path("api/auth/start/google/",       sso_views.google_start,       name="sso-google-start"),
    path("api/auth/callback/google/",    sso_views.google_callback,    name="sso-google-callback"),
    path("api/auth/start/microsoft/",    sso_views.microsoft_start,    name="sso-microsoft-start"),
    path("api/auth/callback/microsoft/", sso_views.microsoft_callback, name="sso-microsoft-callback"),
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
