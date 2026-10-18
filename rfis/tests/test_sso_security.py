"""
Security-focused tests for the Google / Microsoft SSO flow.

Covers the hardening added to rfis/sso_views.py:
  - OAuth `state` is validated on callback (login-CSRF guard)
  - Provider email must be verified before a login is issued (account-takeover guard)
  - Tokens are returned in the URL fragment, never the query string
  - PKCE challenge is sent on start and the verifier round-trips to token exchange
"""
from unittest.mock import patch, MagicMock
from urllib.parse import urlparse, parse_qs

from django.test import TestCase
from django.urls import reverse

from django.contrib.auth import get_user_model
from rfis.models import Member

User = get_user_model()


def _mock_token_and_userinfo(email="alice@example.com", name="Alice", verified=True):
    """Build side-effect responses for the token POST and userinfo GET."""
    token_resp = MagicMock()
    token_resp.json.return_value = {"access_token": "provider-access-token"}
    token_resp.raise_for_status.return_value = None

    info_resp = MagicMock()
    info_resp.json.return_value = {
        "email": email,
        "name": name,
        "email_verified": verified,
    }
    info_resp.raise_for_status.return_value = None
    return token_resp, info_resp


class GoogleStartTests(TestCase):
    def test_start_sets_state_and_pkce_and_redirects_to_google(self):
        with patch("rfis.sso_views.GOOGLE_CLIENT_ID", "client-123"):
            resp = self.client.get(reverse("sso-google-start"))

        self.assertEqual(resp.status_code, 302)
        self.assertIn("accounts.google.com", resp["Location"])

        qs = parse_qs(urlparse(resp["Location"]).query)
        self.assertIn("state", qs)
        # PKCE challenge is present and uses S256
        self.assertIn("code_challenge", qs)
        self.assertEqual(qs["code_challenge_method"], ["S256"])
        # One-time values are stashed in the session for the callback to check
        self.assertIn("sso_state", self.client.session)
        self.assertIn("sso_pkce_verifier", self.client.session)


class GoogleCallbackStateTests(TestCase):
    """The callback must reject any request whose state doesn't match."""

    def test_callback_without_state_is_rejected(self):
        # No prior /start/, so the session holds no state
        resp = self.client.get(reverse("sso-google-callback"), {"code": "abc"})
        self.assertEqual(resp.status_code, 302)
        self.assertIn("sso_error=state_mismatch", resp["Location"])

    def test_callback_with_wrong_state_is_rejected(self):
        session = self.client.session
        session["sso_state"] = "the-real-state"
        session["sso_pkce_verifier"] = "verifier"
        session.save()

        resp = self.client.get(
            reverse("sso-google-callback"),
            {"code": "abc", "state": "attacker-supplied-state"},
        )
        self.assertEqual(resp.status_code, 302)
        self.assertIn("sso_error=state_mismatch", resp["Location"])

    @patch("rfis.sso_views._requests")
    def test_callback_with_matching_state_proceeds(self, mock_requests):
        token_resp, info_resp = _mock_token_and_userinfo()
        mock_requests.post.return_value = token_resp
        mock_requests.get.return_value = info_resp

        session = self.client.session
        session["sso_state"] = "match-me"
        session["sso_pkce_verifier"] = "verifier-xyz"
        session.save()

        resp = self.client.get(
            reverse("sso-google-callback"),
            {"code": "abc", "state": "match-me"},
        )

        self.assertEqual(resp.status_code, 302)
        # Success path lands on the SSO callback page, not an error
        self.assertIn("/sso-callback", resp["Location"])
        self.assertNotIn("sso_error", resp["Location"])
        # A user was created
        self.assertTrue(User.objects.filter(email="alice@example.com").exists())

    @patch("rfis.sso_views._requests")
    def test_pkce_verifier_is_sent_to_token_exchange(self, mock_requests):
        token_resp, info_resp = _mock_token_and_userinfo()
        mock_requests.post.return_value = token_resp
        mock_requests.get.return_value = info_resp

        session = self.client.session
        session["sso_state"] = "match-me"
        session["sso_pkce_verifier"] = "verifier-xyz"
        session.save()

        self.client.get(
            reverse("sso-google-callback"),
            {"code": "abc", "state": "match-me"},
        )

        _, kwargs = mock_requests.post.call_args
        self.assertEqual(kwargs["data"]["code_verifier"], "verifier-xyz")


class GoogleCallbackEmailVerificationTests(TestCase):
    """An unverified provider email must not be able to claim an account."""

    @patch("rfis.sso_views._requests")
    def test_unverified_email_is_rejected(self, mock_requests):
        token_resp, info_resp = _mock_token_and_userinfo(verified=False)
        mock_requests.post.return_value = token_resp
        mock_requests.get.return_value = info_resp

        session = self.client.session
        session["sso_state"] = "match-me"
        session["sso_pkce_verifier"] = "v"
        session.save()

        resp = self.client.get(
            reverse("sso-google-callback"),
            {"code": "abc", "state": "match-me"},
        )

        self.assertIn("sso_error=email_unverified", resp["Location"])
        self.assertFalse(User.objects.filter(email="alice@example.com").exists())

    @patch("rfis.sso_views._requests")
    def test_unverified_email_cannot_hijack_existing_account(self, mock_requests):
        # A real account already exists with a usable password
        victim = User.objects.create_user(
            username="victim", email="victim@example.com", password="s3cret-pw"
        )
        Member.objects.create(user=victim, name="Victim", email="victim@example.com",
                              role=Member.Role.CLIENT)

        token_resp, info_resp = _mock_token_and_userinfo(
            email="victim@example.com", verified=False
        )
        mock_requests.post.return_value = token_resp
        mock_requests.get.return_value = info_resp

        session = self.client.session
        session["sso_state"] = "match-me"
        session["sso_pkce_verifier"] = "v"
        session.save()

        resp = self.client.get(
            reverse("sso-google-callback"),
            {"code": "abc", "state": "match-me"},
        )

        # No token issued — attacker is bounced with an error
        self.assertIn("sso_error=email_unverified", resp["Location"])


class SsoTokenDeliveryTests(TestCase):
    """Tokens must ride in the URL fragment, never the query string."""

    @patch("rfis.sso_views._requests")
    def test_tokens_returned_in_fragment_not_query(self, mock_requests):
        token_resp, info_resp = _mock_token_and_userinfo()
        mock_requests.post.return_value = token_resp
        mock_requests.get.return_value = info_resp

        session = self.client.session
        session["sso_state"] = "match-me"
        session["sso_pkce_verifier"] = "v"
        session.save()

        resp = self.client.get(
            reverse("sso-google-callback"),
            {"code": "abc", "state": "match-me"},
        )

        location = resp["Location"]
        parsed = urlparse(location)
        # Tokens live after the '#'
        self.assertIn("#access=", location)
        self.assertIn("refresh=", parsed.fragment)
        # ...and NOT in the query string
        self.assertNotIn("access=", parsed.query)
