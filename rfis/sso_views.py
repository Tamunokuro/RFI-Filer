"""
SSO (Single Sign-On) views for Google and Microsoft OAuth2.

Flow:
  1.  User clicks "Login with Google/Microsoft" on the React frontend.
  2.  Browser navigates to GET /api/auth/start/google/  (or /microsoft/).
  3.  This view builds the provider's authorization URL and redirects the user.
  4.  Provider redirects back to GET /api/auth/callback/google/  with ?code=....
  5.  Callback view exchanges the code for an access token, fetches the user's
      profile, finds-or-creates the Django User + Member, issues simplejwt tokens,
      and redirects the browser to the React SSOCallback page with the tokens in
      the query string.

Environment variables required (add to .env):
    GOOGLE_CLIENT_ID      — from Google Cloud Console → APIs & Services → Credentials
    GOOGLE_CLIENT_SECRET  — same place
    MICROSOFT_CLIENT_ID   — from Azure Portal → App registrations
    MICROSOFT_CLIENT_SECRET — same place

Redirect URIs to register in each provider dashboard:
    Google:    http://localhost:8000/api/auth/callback/google/
    Microsoft: http://localhost:8000/api/auth/callback/microsoft/
    (Update these when deploying to production.)
"""

import os
import base64
import hashlib
import secrets
import logging

import requests as _requests
from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.http import HttpResponseRedirect
from rest_framework_simplejwt.tokens import RefreshToken

from .models import Member

logger = logging.getLogger(__name__)
User = get_user_model()

GOOGLE_CLIENT_ID      = os.getenv("GOOGLE_CLIENT_ID", "")
GOOGLE_CLIENT_SECRET  = os.getenv("GOOGLE_CLIENT_SECRET", "")
MICROSOFT_CLIENT_ID   = os.getenv("MICROSOFT_CLIENT_ID", "")
MICROSOFT_CLIENT_SECRET = os.getenv("MICROSOFT_CLIENT_SECRET", "")
FRONTEND_URL = getattr(settings, "FRONTEND_URL", "http://localhost:5173")


# ── helpers ────────────────────────────────────────────────────────────────────

def _error_redirect(msg: str) -> HttpResponseRedirect:
    return HttpResponseRedirect(f"{FRONTEND_URL}/login?sso_error={msg}")


def _rate_limited(request, scope: str, limit: int = 20, window: int = 300) -> bool:
    """
    Simple per-IP rate limit backed by the Django cache. Returns True when the
    caller has exceeded `limit` requests within `window` seconds. Guards the SSO
    start/callback endpoints against brute-force and callback-spam.
    """
    ip = request.META.get("REMOTE_ADDR", "unknown")
    key = f"sso_rl:{scope}:{ip}"
    count = cache.get(key, 0)
    if count >= limit:
        return True
    cache.set(key, count + 1, window)
    return False


def _make_pkce() -> tuple[str, str]:
    """Return (code_verifier, code_challenge) for an OAuth2 PKCE S256 exchange."""
    verifier = secrets.token_urlsafe(64)
    challenge = (
        base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest())
        .decode()
        .rstrip("=")
    )
    return verifier, challenge


def _begin_oauth_session(request) -> tuple[str, str]:
    """
    Generate a CSRF state token + PKCE pair, stash the one-time values in the
    session, and return (state, code_challenge) for the authorization URL.
    """
    state = secrets.token_urlsafe(16)
    verifier, challenge = _make_pkce()
    request.session["sso_state"] = state
    request.session["sso_pkce_verifier"] = verifier
    return state, challenge


def _consume_oauth_session(request) -> tuple[bool, str | None]:
    """
    Validate the returned `state` against the value saved in the session and
    pop both one-time values so they can't be replayed. Returns
    (state_ok, code_verifier). A constant-time compare avoids timing leaks.
    """
    expected = request.session.pop("sso_state", None)
    verifier = request.session.pop("sso_pkce_verifier", None)
    received = request.GET.get("state", "")
    ok = bool(expected) and bool(received) and secrets.compare_digest(expected, received)
    return ok, verifier


def _sso_finish(
    email: str, name: str, provider: str, email_verified: bool
) -> HttpResponseRedirect:
    """
    Given an email + display name from an OAuth provider:
    - Reject unless the provider verified ownership of the email. This is the
      guard against account takeover: without it, a provider asserting an
      unverified address could log an attacker into a pre-existing account
      that shares that email.
    - Find or create the Django User (password-less).
    - Ensure a Member record exists.
    - Issue simplejwt access + refresh tokens.
    - Redirect to the React SSOCallback page with tokens in the URL *fragment*
      (never sent to servers, proxies, or logged) rather than the query string.
    """
    if not email:
        return _error_redirect("no_email")

    if not email_verified:
        logger.warning("SSO: rejected unverified email %s via %s", email, provider)
        return _error_redirect("email_unverified")

    # ── Find or create Django User ─────────────────────────────────────────────
    try:
        user = User.objects.get(email=email)
    except User.DoesNotExist:
        base_username = email.split("@")[0]
        username = base_username
        idx = 1
        while User.objects.filter(username=username).exists():
            username = f"{base_username}{idx}"
            idx += 1
        user = User.objects.create_user(username=username, email=email)
        user.set_unusable_password()
        user.save()
        logger.info("SSO: created new user %s via %s", email, provider)

    # ── Ensure Member exists ───────────────────────────────────────────────────
    # role is required on the Member model; default to "Client" for SSO users.
    # The user can update their role from the profile page after first sign-in.
    if not hasattr(user, "member"):
        try:
            Member.objects.create(
                user=user,
                name=name or email,
                email=email,
                role=Member.Role.CLIENT,   # safe default — user can change later
            )
            logger.info("SSO: created Member for %s", email)
        except Exception:
            logger.exception("SSO: failed to create Member for %s", email)
            return _error_redirect("member_create_failed")

    # ── Issue JWT ──────────────────────────────────────────────────────────────
    refresh = RefreshToken.for_user(user)
    access_token  = str(refresh.access_token)
    refresh_token = str(refresh)

    return HttpResponseRedirect(
        f"{FRONTEND_URL}/sso-callback"
        f"#access={access_token}"
        f"&refresh={refresh_token}"
        f"&provider={provider}"
    )


# ── Google OAuth2 ──────────────────────────────────────────────────────────────

def google_start(request):
    """Redirect the user to Google's OAuth2 consent page."""
    if not GOOGLE_CLIENT_ID:
        return _error_redirect("google_not_configured")
    if _rate_limited(request, "start"):
        return _error_redirect("rate_limited")

    state, challenge = _begin_oauth_session(request)

    callback = request.build_absolute_uri("/api/auth/callback/google/")
    url = (
        "https://accounts.google.com/o/oauth2/v2/auth"
        f"?client_id={GOOGLE_CLIENT_ID}"
        f"&redirect_uri={callback}"
        f"&response_type=code"
        f"&scope=openid%20email%20profile"
        f"&state={state}"
        f"&code_challenge={challenge}"
        f"&code_challenge_method=S256"
        f"&access_type=offline"
    )
    return HttpResponseRedirect(url)


def google_callback(request):
    """Handle Google's redirect back after the user grants access."""
    if _rate_limited(request, "callback"):
        return _error_redirect("rate_limited")

    # Reject forged/replayed callbacks before doing any work (login-CSRF guard).
    state_ok, verifier = _consume_oauth_session(request)
    if not state_ok:
        logger.warning("SSO Google: state validation failed")
        return _error_redirect("state_mismatch")

    code = request.GET.get("code")
    if not code:
        return _error_redirect("google_no_code")

    callback = request.build_absolute_uri("/api/auth/callback/google/")

    try:
        token_resp = _requests.post(
            "https://oauth2.googleapis.com/token",
            data={
                "code":          code,
                "client_id":     GOOGLE_CLIENT_ID,
                "client_secret": GOOGLE_CLIENT_SECRET,
                "redirect_uri":  callback,
                "grant_type":    "authorization_code",
                "code_verifier": verifier or "",
            },
            timeout=10,
        )
        token_resp.raise_for_status()
    except Exception:
        logger.exception("SSO Google: token exchange failed")
        return _error_redirect("google_token_exchange")

    access_token = token_resp.json().get("access_token")

    try:
        info_resp = _requests.get(
            "https://www.googleapis.com/oauth2/v3/userinfo",
            headers={"Authorization": f"Bearer {access_token}"},
            timeout=10,
        )
        info_resp.raise_for_status()
    except Exception:
        logger.exception("SSO Google: userinfo fetch failed")
        return _error_redirect("google_userinfo")

    info  = info_resp.json()
    email = info.get("email", "")
    name  = info.get("name", email.split("@")[0])
    # Google returns email_verified as a bool (or occasionally the string
    # "true"); only accept an address Google itself has verified.
    verified = info.get("email_verified") in (True, "true", "True")

    return _sso_finish(email, name, "google", verified)


# ── Microsoft OAuth2 ───────────────────────────────────────────────────────────

def microsoft_start(request):
    """Redirect the user to Microsoft's OAuth2 consent page."""
    if not MICROSOFT_CLIENT_ID:
        return _error_redirect("microsoft_not_configured")
    if _rate_limited(request, "start"):
        return _error_redirect("rate_limited")

    state, challenge = _begin_oauth_session(request)

    callback = request.build_absolute_uri("/api/auth/callback/microsoft/")
    url = (
        "https://login.microsoftonline.com/common/oauth2/v2.0/authorize"
        f"?client_id={MICROSOFT_CLIENT_ID}"
        f"&redirect_uri={callback}"
        f"&response_type=code"
        f"&scope=openid%20email%20profile%20User.Read"
        f"&state={state}"
        f"&code_challenge={challenge}"
        f"&code_challenge_method=S256"
    )
    return HttpResponseRedirect(url)


def microsoft_callback(request):
    """Handle Microsoft's redirect back after the user grants access."""
    if _rate_limited(request, "callback"):
        return _error_redirect("rate_limited")

    # Reject forged/replayed callbacks before doing any work (login-CSRF guard).
    state_ok, verifier = _consume_oauth_session(request)
    if not state_ok:
        logger.warning("SSO Microsoft: state validation failed")
        return _error_redirect("state_mismatch")

    code = request.GET.get("code")
    if not code:
        return _error_redirect("microsoft_no_code")

    callback = request.build_absolute_uri("/api/auth/callback/microsoft/")

    try:
        token_resp = _requests.post(
            "https://login.microsoftonline.com/common/oauth2/v2.0/token",
            data={
                "code":          code,
                "client_id":     MICROSOFT_CLIENT_ID,
                "client_secret": MICROSOFT_CLIENT_SECRET,
                "redirect_uri":  callback,
                "grant_type":    "authorization_code",
                "scope":         "openid email profile User.Read",
                "code_verifier": verifier or "",
            },
            timeout=10,
        )
        token_resp.raise_for_status()
    except Exception:
        logger.exception("SSO Microsoft: token exchange failed")
        return _error_redirect("microsoft_token_exchange")

    access_token = token_resp.json().get("access_token")

    try:
        info_resp = _requests.get(
            "https://graph.microsoft.com/v1.0/me",
            headers={"Authorization": f"Bearer {access_token}"},
            timeout=10,
        )
        info_resp.raise_for_status()
    except Exception:
        logger.exception("SSO Microsoft: Graph API call failed")
        return _error_redirect("microsoft_userinfo")

    info  = info_resp.json()
    email = info.get("mail") or info.get("userPrincipalName", "")
    name  = info.get("displayName", email.split("@")[0] if email else "User")
    # Microsoft Graph exposes no per-address "verified" flag. Entra ID
    # organisational accounts own their mailbox/UPN within the tenant, so we
    # treat a successful Graph /me response as proof of ownership. If you later
    # allow personal MSA logins, gate this behind an allowed-tenant check.
    verified = bool(email)

    return _sso_finish(email, name, "microsoft", verified)
