"""
Tests for GET and PATCH /api/me/ — profile viewing and editing.
"""
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from rfis.models import Member

from .utils import _make_user_member


class MeProfileUpdateTests(APITestCase):
    """Tests for GET and PATCH /api/me/ — profile viewing and editing."""

    def setUp(self):
        self.user, self.member = _make_user_member(
            "profiler", Member.Role.PROJECT_DESIGNER
        )
        self.other_user, self.other_member = _make_user_member(
            "other_profiler", Member.Role.CONTRACTOR
        )
        self.url = reverse("rfis:me")

    # ------------------------------------------------------------------ GET --

    def test_get_me_returns_own_profile(self):
        self.client.force_authenticate(self.user)
        r = self.client.get(self.url)
        self.assertEqual(r.status_code, status.HTTP_200_OK)
        self.assertEqual(r.data["username"], "profiler")
        self.assertEqual(r.data["member"]["name"], "Profiler")
        self.assertEqual(r.data["member"]["email"], "profiler@example.com")
        self.assertEqual(r.data["member"]["role"], Member.Role.PROJECT_DESIGNER)

    def test_get_me_unauthenticated_returns_401(self):
        r = self.client.get(self.url)
        self.assertEqual(r.status_code, status.HTTP_401_UNAUTHORIZED)

    # --------------------------------------------------------------- PATCH ---

    def test_patch_updates_name(self):
        self.client.force_authenticate(self.user)
        r = self.client.patch(self.url, {"name": "Updated Name"}, format="json")
        self.assertEqual(r.status_code, status.HTTP_200_OK)
        self.assertEqual(r.data["member"]["name"], "Updated Name")
        self.member.refresh_from_db()
        self.assertEqual(self.member.name, "Updated Name")

    def test_patch_updates_email_and_syncs_user_email(self):
        self.client.force_authenticate(self.user)
        r = self.client.patch(self.url, {"email": "updated@example.com"}, format="json")
        self.assertEqual(r.status_code, status.HTTP_200_OK)
        self.assertEqual(r.data["member"]["email"], "updated@example.com")
        self.member.refresh_from_db()
        self.assertEqual(self.member.email, "updated@example.com")
        self.user.refresh_from_db()
        self.assertEqual(self.user.email, "updated@example.com")

    def test_patch_updates_both_name_and_email(self):
        self.client.force_authenticate(self.user)
        r = self.client.patch(
            self.url,
            {"name": "Full Update", "email": "both@example.com"},
            format="json",
        )
        self.assertEqual(r.status_code, status.HTTP_200_OK)
        self.assertEqual(r.data["member"]["name"], "Full Update")
        self.assertEqual(r.data["member"]["email"], "both@example.com")

    def test_patch_allows_resubmitting_own_email(self):
        """Saving with the current email must not trigger a uniqueness error."""
        self.client.force_authenticate(self.user)
        r = self.client.patch(
            self.url, {"email": "profiler@example.com"}, format="json"
        )
        self.assertEqual(r.status_code, status.HTTP_200_OK)

    def test_patch_rejects_duplicate_email(self):
        """Attempting to take another member's email must be rejected."""
        self.client.force_authenticate(self.user)
        r = self.client.patch(
            self.url,
            {"email": "other_profiler@example.com"},
            format="json",
        )
        self.assertEqual(r.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("email", r.data)
        self.member.refresh_from_db()
        self.assertEqual(self.member.email, "profiler@example.com")

    def test_patch_rejects_blank_name(self):
        self.client.force_authenticate(self.user)
        r = self.client.patch(self.url, {"name": "   "}, format="json")
        self.assertEqual(r.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("name", r.data)

    def test_patch_rejects_empty_name(self):
        self.client.force_authenticate(self.user)
        r = self.client.patch(self.url, {"name": ""}, format="json")
        self.assertEqual(r.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("name", r.data)

    def test_patch_unauthenticated_returns_401(self):
        r = self.client.patch(self.url, {"name": "Hacker"}, format="json")
        self.assertEqual(r.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_patch_ignores_read_only_fields(self):
        """Sending role or is_admin must be silently ignored — not applied."""
        self.client.force_authenticate(self.user)
        r = self.client.patch(
            self.url,
            {"role": Member.Role.PROJECT_MANAGER, "is_admin": True},
            format="json",
        )
        self.assertEqual(r.status_code, status.HTTP_200_OK)
        self.member.refresh_from_db()
        self.assertEqual(self.member.role, Member.Role.PROJECT_DESIGNER)
        self.assertFalse(self.member.is_admin)

    def test_patch_strips_whitespace_from_name(self):
        self.client.force_authenticate(self.user)
        r = self.client.patch(self.url, {"name": "  Trimmed  "}, format="json")
        self.assertEqual(r.status_code, status.HTTP_200_OK)
        self.member.refresh_from_db()
        self.assertEqual(self.member.name, "Trimmed")

    def test_patch_response_includes_full_member_payload(self):
        """Response shape must include all member fields the frontend depends on."""
        self.client.force_authenticate(self.user)
        r = self.client.patch(self.url, {"name": "Shape Check"}, format="json")
        self.assertEqual(r.status_code, status.HTTP_200_OK)
        member_data = r.data["member"]
        for field in ("id", "name", "email", "role", "company", "discipline", "phone", "is_admin"):
            self.assertIn(field, member_data, msg=f"Missing field: {field}")
