"""
API tests for EmailFolder CRUD endpoints.

GET    /api/email/folders/       list (any authenticated user)
POST   /api/email/folders/       create (admin only)
GET    /api/email/folders/{id}/  retrieve (admin only)
PATCH  /api/email/folders/{id}/  update  (admin only)
DELETE /api/email/folders/{id}/  delete  (admin only)
"""
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from email_ingestion.models import EmailFolder

from .utils import make_admin, make_config, make_folder, make_inbound, make_user


class EmailFolderListTests(APITestCase):
    """GET /api/email/folders/ — any authenticated user."""

    def setUp(self):
        self.admin_user, _ = make_admin("fld_list_admin")
        self.plain_user, _ = make_user("fld_list_plain")
        self.url = reverse("email-folder-list")
        make_folder("Asana", ["asana.com"])
        make_folder("Jira", ["jira.atlassian.net"])

    def test_admin_sees_all_folders(self):
        self.client.force_authenticate(self.admin_user)
        resp = self.client.get(self.url)
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(len(resp.data), 2)

    def test_plain_user_can_list(self):
        self.client.force_authenticate(self.plain_user)
        resp = self.client.get(self.url)
        self.assertEqual(resp.status_code, status.HTTP_200_OK)

    def test_unauthenticated_cannot_list(self):
        resp = self.client.get(self.url)
        self.assertEqual(resp.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_response_includes_email_count(self):
        self.client.force_authenticate(self.admin_user)
        resp = self.client.get(self.url)
        for folder in resp.data:
            self.assertIn("email_count", folder)

    def test_email_count_reflects_filed_emails(self):
        """email_count on a folder should equal the number of InboundEmails filed there."""
        folder = EmailFolder.objects.get(name="Asana")
        config = make_config()
        make_inbound(config, folder=folder)
        make_inbound(config, folder=folder, message_id="<extra@test>")

        self.client.force_authenticate(self.admin_user)
        resp = self.client.get(self.url)
        asana = next(f for f in resp.data if f["name"] == "Asana")
        self.assertEqual(asana["email_count"], 2)


class EmailFolderCreateTests(APITestCase):
    """POST /api/email/folders/ — admin only."""

    def setUp(self):
        self.admin_user, _ = make_admin("fld_create_admin")
        self.plain_user, _ = make_user("fld_create_plain")
        self.url = reverse("email-folder-list")
        self.payload = {
            "name":        "GitHub Notifications",
            "description": "Auto-filed PRs and issues",
            "keywords":    ["github.com", "github"],
            "color":       "green",
        }

    def test_admin_can_create(self):
        self.client.force_authenticate(self.admin_user)
        resp = self.client.post(self.url, self.payload, format="json")
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        self.assertTrue(EmailFolder.objects.filter(name="GitHub Notifications").exists())

    def test_keywords_stored_correctly(self):
        self.client.force_authenticate(self.admin_user)
        resp = self.client.post(self.url, self.payload, format="json")
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        folder = EmailFolder.objects.get(name="GitHub Notifications")
        self.assertIn("github.com", folder.keywords)
        self.assertIn("github", folder.keywords)

    def test_non_admin_cannot_create(self):
        self.client.force_authenticate(self.plain_user)
        resp = self.client.post(self.url, self.payload, format="json")
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)

    def test_duplicate_name_returns_400(self):
        make_folder("Unique Name")
        self.client.force_authenticate(self.admin_user)
        resp = self.client.post(self.url, {"name": "Unique Name", "keywords": []}, format="json")
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

    def test_empty_keywords_allowed(self):
        self.client.force_authenticate(self.admin_user)
        resp = self.client.post(self.url, {"name": "No Keywords", "keywords": []}, format="json")
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)


class EmailFolderUpdateTests(APITestCase):
    """PATCH /api/email/folders/{id}/ — admin only."""

    def setUp(self):
        self.admin_user, _ = make_admin("fld_upd_admin")
        self.plain_user, _ = make_user("fld_upd_plain")
        self.folder = make_folder("Original", ["asana.com"], "indigo")
        self.url = reverse("email-folder-detail", args=[self.folder.pk])

    def test_admin_can_rename(self):
        self.client.force_authenticate(self.admin_user)
        resp = self.client.patch(self.url, {"name": "Renamed Folder"}, format="json")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.folder.refresh_from_db()
        self.assertEqual(self.folder.name, "Renamed Folder")

    def test_admin_can_update_keywords(self):
        self.client.force_authenticate(self.admin_user)
        resp = self.client.patch(self.url, {"keywords": ["asana.com", "app.asana.com"]}, format="json")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.folder.refresh_from_db()
        self.assertIn("app.asana.com", self.folder.keywords)

    def test_admin_can_update_color(self):
        self.client.force_authenticate(self.admin_user)
        resp = self.client.patch(self.url, {"color": "purple"}, format="json")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.folder.refresh_from_db()
        self.assertEqual(self.folder.color, "purple")

    def test_non_admin_cannot_update(self):
        self.client.force_authenticate(self.plain_user)
        resp = self.client.patch(self.url, {"name": "Hacked"}, format="json")
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)


class EmailFolderDeleteTests(APITestCase):
    """DELETE /api/email/folders/{id}/ — admin only."""

    def setUp(self):
        self.admin_user, _ = make_admin("fld_del_admin")
        self.plain_user, _ = make_user("fld_del_plain")
        self.folder = make_folder("To Delete")
        self.url = reverse("email-folder-detail", args=[self.folder.pk])

    def test_admin_can_delete(self):
        self.client.force_authenticate(self.admin_user)
        resp = self.client.delete(self.url)
        self.assertEqual(resp.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(EmailFolder.objects.filter(pk=self.folder.pk).exists())

    def test_non_admin_cannot_delete(self):
        self.client.force_authenticate(self.plain_user)
        resp = self.client.delete(self.url)
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)

    def test_deleting_folder_does_not_delete_emails(self):
        """Emails filed in the folder are kept; their folder FK becomes NULL."""
        config = make_config()
        email = make_inbound(config, folder=self.folder)
        self.client.force_authenticate(self.admin_user)
        self.client.delete(self.url)
        email.refresh_from_db()
        self.assertIsNone(email.folder)
