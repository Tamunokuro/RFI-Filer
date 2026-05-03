"""
Tests for the in-app notification system.

Covers:
  - Notification record created when a member is added to a project
  - Email sent to the new member (django.test.mail.outbox)
  - GET /api/notifications/ returns unread notifications for the caller
  - POST /api/notifications/mark-read/ marks all as read
  - GET /api/memberships/?member=<id> filter returns correct records
"""
from django.core import mail
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from rfis.models import Member, Project, ProjectMembership, Notification

from .utils import _make_user_member


class NotificationCreationTests(APITestCase):
    """Notification + email are triggered when a member is added to a project."""

    def setUp(self):
        self.pm_user, self.pm_member = _make_user_member(
            "notif_pm", Member.Role.PROJECT_MANAGER
        )
        self.pm_member.is_admin = True
        self.pm_member.save(update_fields=["is_admin"])

        self.designer_user, self.designer_member = _make_user_member(
            "notif_designer", Member.Role.PROJECT_DESIGNER
        )
        self.designer_member.email = "designer@example.com"
        self.designer_member.save(update_fields=["email"])

        self.project = Project.objects.create(
            project_number="N-001",
            project_name="Notification Test Project",
            project_manager=self.pm_member,
        )

    def test_notification_created_when_member_added(self):
        self.client.force_authenticate(self.pm_user)
        url = reverse("rfis:project-members", args=[self.project.pk])
        r = self.client.post(url, {
            "member_id": self.designer_member.id,
            "role": self.designer_member.role,
        })
        self.assertEqual(r.status_code, 201, r.data)

        notif = Notification.objects.filter(
            recipient=self.designer_member,
            verb=Notification.Verb.PROJECT_ADDED,
        ).first()
        self.assertIsNotNone(notif, "Expected a Notification record to be created")
        self.assertFalse(notif.read)
        self.assertEqual(notif.project, self.project)
        self.assertEqual(notif.extra.get("project_number"), self.project.project_number)
        self.assertEqual(notif.extra.get("project_name"), self.project.project_name)
        self.assertEqual(notif.extra.get("role"), self.designer_member.role)

    def test_email_sent_when_member_added(self):
        self.client.force_authenticate(self.pm_user)
        url = reverse("rfis:project-members", args=[self.project.pk])
        self.client.post(url, {
            "member_id": self.designer_member.id,
            "role": self.designer_member.role,
        })

        self.assertEqual(len(mail.outbox), 1)
        sent = mail.outbox[0]
        self.assertIn(self.designer_member.email, sent.to)
        self.assertIn(self.project.project_name, sent.subject)
        self.assertIn(self.project.project_number, sent.body)

    def test_no_notification_when_member_already_on_project(self):
        """Adding a duplicate member returns 400 and creates no notification."""
        ProjectMembership.objects.create(
            project=self.project,
            member=self.designer_member,
            role=self.designer_member.role,
        )
        self.client.force_authenticate(self.pm_user)
        url = reverse("rfis:project-members", args=[self.project.pk])
        r = self.client.post(url, {"member_id": self.designer_member.id})
        self.assertEqual(r.status_code, 400)
        self.assertEqual(
            Notification.objects.filter(recipient=self.designer_member).count(), 0
        )


class NotificationEndpointTests(APITestCase):
    """GET /api/notifications/ and POST /api/notifications/mark-read/"""

    def setUp(self):
        self.pm_user, self.pm_member = _make_user_member(
            "nep_pm", Member.Role.PROJECT_MANAGER
        )
        self.designer_user, self.designer_member = _make_user_member(
            "nep_designer", Member.Role.PROJECT_DESIGNER
        )
        self.project = Project.objects.create(
            project_number="N-002",
            project_name="Endpoint Test Project",
            project_manager=self.pm_member,
        )
        # Seed two notifications for designer
        Notification.objects.create(
            recipient=self.designer_member,
            verb=Notification.Verb.PROJECT_ADDED,
            actor_name=self.pm_member.name,
            project=self.project,
            extra={
                "project_number": self.project.project_number,
                "project_name":   self.project.project_name,
                "role":           "Project Designer",
            },
        )
        Notification.objects.create(
            recipient=self.designer_member,
            verb=Notification.Verb.PROJECT_ADDED,
            actor_name=self.pm_member.name,
            project=self.project,
            extra={
                "project_number": "N-003",
                "project_name":   "Another Project",
                "role":           "Sub Consultant",
            },
        )

    def test_get_notifications_returns_unread_for_caller(self):
        self.client.force_authenticate(self.designer_user)
        r = self.client.get(reverse("rfis:notification-list"))
        self.assertEqual(r.status_code, 200)
        self.assertEqual(len(r.data), 2)
        ids = {n["id"] for n in r.data}
        self.assertEqual(
            ids,
            set(Notification.objects.filter(recipient=self.designer_member).values_list("id", flat=True)),
        )

    def test_get_notifications_excludes_read(self):
        Notification.objects.filter(recipient=self.designer_member).update(read=True)
        self.client.force_authenticate(self.designer_user)
        r = self.client.get(reverse("rfis:notification-list"))
        self.assertEqual(r.status_code, 200)
        self.assertEqual(len(r.data), 0)

    def test_get_notifications_excludes_other_users(self):
        """A PM checking notifications should not see the designer's records."""
        self.client.force_authenticate(self.pm_user)
        r = self.client.get(reverse("rfis:notification-list"))
        self.assertEqual(r.status_code, 200)
        self.assertEqual(len(r.data), 0)

    def test_notification_payload_fields(self):
        self.client.force_authenticate(self.designer_user)
        r = self.client.get(reverse("rfis:notification-list"))
        self.assertEqual(r.status_code, 200)
        notif = r.data[0]
        for field in ("id", "verb", "actor_name", "project_id", "project_number",
                      "project_name", "role", "created_at", "read"):
            self.assertIn(field, notif, f"Missing field: {field}")

    def test_mark_all_read(self):
        self.client.force_authenticate(self.designer_user)
        r = self.client.post(reverse("rfis:notification-mark-read"))
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.data["marked"], 2)
        self.assertEqual(
            Notification.objects.filter(recipient=self.designer_member, read=False).count(), 0
        )

    def test_mark_read_only_affects_caller(self):
        """Mark-read for designer should not affect PM's notifications."""
        # Give PM a notification too
        Notification.objects.create(
            recipient=self.pm_member,
            verb=Notification.Verb.PROJECT_ADDED,
            actor_name="someone",
            project=self.project,
            extra={},
        )
        self.client.force_authenticate(self.designer_user)
        self.client.post(reverse("rfis:notification-mark-read"))

        # PM's notification should still be unread
        self.assertEqual(
            Notification.objects.filter(recipient=self.pm_member, read=False).count(), 1
        )

    def test_unauthenticated_cannot_access_notifications(self):
        r = self.client.get(reverse("rfis:notification-list"))
        self.assertEqual(r.status_code, 401)


class MembershipFilterTests(APITestCase):
    """GET /api/memberships/?member=<id> returns only that member's memberships."""

    def setUp(self):
        self.pm_user, self.pm_member = _make_user_member(
            "mft_pm", Member.Role.PROJECT_MANAGER
        )
        self.designer_user, self.designer_member = _make_user_member(
            "mft_designer", Member.Role.PROJECT_DESIGNER
        )
        self.other_user, self.other_member = _make_user_member(
            "mft_other", Member.Role.CONTRACTOR
        )

        self.project1 = Project.objects.create(
            project_number="MF-001", project_name="Filter Project 1",
            project_manager=self.pm_member,
        )
        self.project2 = Project.objects.create(
            project_number="MF-002", project_name="Filter Project 2",
            project_manager=self.pm_member,
        )

        ProjectMembership.objects.create(
            project=self.project1,
            member=self.designer_member,
            role=self.designer_member.role,
        )
        ProjectMembership.objects.create(
            project=self.project2,
            member=self.designer_member,
            role=self.designer_member.role,
        )
        ProjectMembership.objects.create(
            project=self.project1,
            member=self.other_member,
            role=self.other_member.role,
        )

    def test_filter_by_member_returns_correct_records(self):
        self.client.force_authenticate(self.pm_user)
        r = self.client.get(
            reverse("rfis:membership-list"),
            {"member": self.designer_member.id},
        )
        self.assertEqual(r.status_code, 200)
        self.assertEqual(len(r.data), 2)
        member_ids = {item["member"]["id"] for item in r.data}
        self.assertEqual(member_ids, {self.designer_member.id})

    def test_filter_by_other_member_returns_their_records(self):
        self.client.force_authenticate(self.pm_user)
        r = self.client.get(
            reverse("rfis:membership-list"),
            {"member": self.other_member.id},
        )
        self.assertEqual(r.status_code, 200)
        self.assertEqual(len(r.data), 1)
        self.assertEqual(r.data[0]["member"]["id"], self.other_member.id)

    def test_no_filter_returns_all_memberships(self):
        self.client.force_authenticate(self.pm_user)
        r = self.client.get(reverse("rfis:membership-list"))
        self.assertEqual(r.status_code, 200)
        # All three memberships should be present
        self.assertEqual(len(r.data), 3)

    def test_membership_response_includes_project_number_and_name(self):
        """Verify the serializer now exposes project_number and project_name."""
        self.client.force_authenticate(self.pm_user)
        r = self.client.get(
            reverse("rfis:membership-list"),
            {"member": self.designer_member.id},
        )
        self.assertEqual(r.status_code, 200)
        item = r.data[0]
        self.assertIn("project_number", item)
        self.assertIn("project_name", item)
        self.assertIn(item["project_number"], ["MF-001", "MF-002"])
