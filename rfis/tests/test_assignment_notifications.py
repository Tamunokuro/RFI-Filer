"""
Tests for RFI assignment notifications and due-date reminder notifications.

Covers:
  - Notification + email sent when designers are set on a new RFI
  - Notification + email sent when a new designer is added to an existing RFI
  - No notification when designer was already assigned (update, no change)
  - Author assigning themselves does NOT get a notification
  - send_due_date_reminders management command behaviour
  - Due-date reminder deduplication (no double-notify on same day)
"""
from datetime import date, timedelta

from django.core import mail
from django.test import TestCase
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from rfis.models import Member, Notification, Project, Rfi
from rfis.management.commands.send_due_date_reminders import Command as DueDateCommand

from .utils import _make_user_member


# ── Fixtures ──────────────────────────────────────────────────────────────────

def _make_project(pm_member, number="AN-001"):
    return Project.objects.create(
        project_number=number,
        project_name=f"Assignment Test {number}",
        project_manager=pm_member,
    )


def _make_rfi(project, author_user, rfi_number="001"):
    today = date.today()
    return Rfi.objects.create(
        project=project,
        author=author_user,
        rfi_name="Test RFI",
        rfi_number=rfi_number,
        received_date=today,
        due_date=today + timedelta(days=7),
        status="open",
    )


# ── Assignment notification tests ─────────────────────────────────────────────

class RfiAssignmentNotificationTests(APITestCase):
    """
    POST /api/rfis/  and  PATCH /api/rfis/<pk>/
    should fire rfi_assigned notifications for newly added designers / CAs.
    """

    def setUp(self):
        self.pm_user, self.pm_member = _make_user_member("an_pm", Member.Role.PROJECT_MANAGER)
        self.designer_user, self.designer_member = _make_user_member(
            "an_designer", Member.Role.PROJECT_DESIGNER
        )
        self.designer_member.email = "designer@an.test"
        self.designer_member.save(update_fields=["email"])

        self.ca_user, self.ca_member = _make_user_member(
            "an_ca", Member.Role.CONTRACT_ADMIN
        )
        self.ca_member.email = "ca@an.test"
        self.ca_member.save(update_fields=["email"])

        self.project = _make_project(self.pm_member)
        # Add all members to the project so the serializer validates OK
        from rfis.models import ProjectMembership
        ProjectMembership.objects.create(
            project=self.project, member=self.pm_member, role=self.pm_member.role
        )
        ProjectMembership.objects.create(
            project=self.project, member=self.designer_member, role=self.designer_member.role
        )
        ProjectMembership.objects.create(
            project=self.project, member=self.ca_member, role=self.ca_member.role
        )

    def _create_rfi_payload(self, designers=None, cas=None):
        today = date.today()
        return {
            "project": self.project.pk,
            "trade": "M",
            "rfi_name": "Notify Test RFI",
            "rfi_number": "N-001",
            "received_date": str(today),
            "due_date": str(today + timedelta(days=7)),
            "designers": designers or [],
            "contract_administrators": cas or [],
        }

    # ── Create ────────────────────────────────────────────────────────────────

    def test_creating_rfi_notifies_assigned_designer(self):
        self.client.force_authenticate(self.pm_user)
        r = self.client.post(
            reverse("rfis:rfi-list"),
            self._create_rfi_payload(designers=[self.designer_member.pk]),
            format="json",
        )
        self.assertEqual(r.status_code, 201, r.data)

        notif = Notification.objects.filter(
            recipient=self.designer_member,
            verb=Notification.Verb.RFI_ASSIGNED,
        ).first()
        self.assertIsNotNone(notif)
        self.assertEqual(notif.extra["rfi_number"], "N-001")

    def test_creating_rfi_sends_email_to_designer(self):
        self.client.force_authenticate(self.pm_user)
        self.client.post(
            reverse("rfis:rfi-list"),
            self._create_rfi_payload(designers=[self.designer_member.pk]),
            format="json",
        )
        self.assertEqual(len(mail.outbox), 1)
        self.assertIn(self.designer_member.email, mail.outbox[0].to)
        self.assertIn("N-001", mail.outbox[0].subject)

    def test_creating_rfi_notifies_both_designer_and_ca(self):
        self.client.force_authenticate(self.pm_user)
        self.client.post(
            reverse("rfis:rfi-list"),
            self._create_rfi_payload(
                designers=[self.designer_member.pk],
                cas=[self.ca_member.pk],
            ),
            format="json",
        )
        self.assertEqual(
            Notification.objects.filter(verb=Notification.Verb.RFI_ASSIGNED).count(), 2
        )
        self.assertEqual(len(mail.outbox), 2)

    def test_creator_does_not_get_notified_when_assigning_themselves(self):
        """If the PM assigns themselves as a designer, they should NOT be notified."""
        # Add PM as a project designer too (so validation passes)
        from rfis.models import ProjectMembership
        self.pm_member.role = Member.Role.PROJECT_DESIGNER
        self.pm_member.save(update_fields=["role"])

        self.client.force_authenticate(self.pm_user)
        self.client.post(
            reverse("rfis:rfi-list"),
            self._create_rfi_payload(designers=[self.pm_member.pk]),
            format="json",
        )
        self.assertEqual(
            Notification.objects.filter(
                recipient=self.pm_member, verb=Notification.Verb.RFI_ASSIGNED
            ).count(),
            0,
        )

    # ── Update ────────────────────────────────────────────────────────────────

    def test_updating_rfi_notifies_newly_added_designer(self):
        rfi = _make_rfi(self.project, self.pm_user, rfi_number="N-002")
        # Start with no designers, then add one via PATCH
        self.client.force_authenticate(self.pm_user)
        r = self.client.patch(
            reverse("rfis:rfi-detail", args=[rfi.pk]),
            {"designers": [self.designer_member.pk]},
            format="json",
        )
        self.assertEqual(r.status_code, 200, r.data)
        self.assertEqual(
            Notification.objects.filter(
                recipient=self.designer_member, verb=Notification.Verb.RFI_ASSIGNED
            ).count(),
            1,
        )

    def test_updating_rfi_does_not_re_notify_existing_designer(self):
        rfi = _make_rfi(self.project, self.pm_user, rfi_number="N-003")
        rfi.designers.set([self.designer_member])  # already assigned

        self.client.force_authenticate(self.pm_user)
        # PATCH with the same designer — should not fire a new notification
        self.client.patch(
            reverse("rfis:rfi-detail", args=[rfi.pk]),
            {"designers": [self.designer_member.pk]},
            format="json",
        )
        self.assertEqual(
            Notification.objects.filter(
                recipient=self.designer_member, verb=Notification.Verb.RFI_ASSIGNED
            ).count(),
            0,
        )

    def test_updating_rfi_only_notifies_new_ca(self):
        """Add a second CA to an RFI that already has one — only the new one is notified."""
        second_ca_user, second_ca = _make_user_member("an_ca2", Member.Role.CONTRACT_ADMIN)
        from rfis.models import ProjectMembership
        ProjectMembership.objects.create(
            project=self.project, member=second_ca, role=second_ca.role
        )

        rfi = _make_rfi(self.project, self.pm_user, rfi_number="N-004")
        rfi.contract_administrators.set([self.ca_member])

        self.client.force_authenticate(self.pm_user)
        self.client.patch(
            reverse("rfis:rfi-detail", args=[rfi.pk]),
            {"contract_administrators": [self.ca_member.pk, second_ca.pk]},
            format="json",
        )
        # Only the new CA should get a notification
        self.assertEqual(
            Notification.objects.filter(verb=Notification.Verb.RFI_ASSIGNED).count(), 1
        )
        notif = Notification.objects.get(verb=Notification.Verb.RFI_ASSIGNED)
        self.assertEqual(notif.recipient, second_ca)


# ── Due-date reminder tests ────────────────────────────────────────────────────

class DueDateReminderTests(TestCase):
    """
    Tests for the send_due_date_reminders management command and
    the notify_rfi_due_soon helper.
    """

    def setUp(self):
        self.pm_user, self.pm_member = _make_user_member("ddr_pm", Member.Role.PROJECT_MANAGER)
        self.designer_user, self.designer_member = _make_user_member(
            "ddr_designer", Member.Role.PROJECT_DESIGNER
        )
        self.designer_member.email = "ddr_designer@test.com"
        self.designer_member.save(update_fields=["email"])

        self.project = _make_project(self.pm_member, number="DDR-001")

    def _rfi_due_in(self, days, rfi_number="D-001", status="open"):
        today = date.today()
        rfi = Rfi.objects.create(
            project=self.project,
            author=self.pm_user,
            rfi_name="Due Soon RFI",
            rfi_number=rfi_number,
            received_date=today,
            due_date=today + timedelta(days=days),
            status=status,
        )
        rfi.designers.set([self.designer_member])
        return rfi

    def _run_command(self, days=3, dry_run=False):
        cmd = DueDateCommand()
        from io import StringIO
        cmd.stdout = StringIO()
        cmd.stderr = StringIO()
        cmd.style = cmd.style  # keep Django's styling
        cmd.handle(days=days, dry_run=dry_run)
        return cmd.stdout.getvalue()

    def test_command_creates_notification_for_rfi_due_in_3_days(self):
        self._rfi_due_in(3)
        self._run_command(days=3)
        self.assertEqual(
            Notification.objects.filter(
                recipient=self.designer_member,
                verb=Notification.Verb.RFI_DUE_SOON,
            ).count(),
            1,
        )

    def test_command_sends_email_for_due_rfi(self):
        self._rfi_due_in(3)
        self._run_command(days=3)
        self.assertEqual(len(mail.outbox), 1)
        self.assertIn(self.designer_member.email, mail.outbox[0].to)
        self.assertIn("3", mail.outbox[0].subject)

    def test_command_does_not_notify_for_rfi_due_in_5_days(self):
        self._rfi_due_in(5)
        self._run_command(days=3)
        self.assertEqual(Notification.objects.filter(verb=Notification.Verb.RFI_DUE_SOON).count(), 0)
        self.assertEqual(len(mail.outbox), 0)

    def test_command_does_not_notify_for_closed_rfi(self):
        self._rfi_due_in(3, rfi_number="D-002", status="closed")
        self._run_command(days=3)
        self.assertEqual(Notification.objects.filter(verb=Notification.Verb.RFI_DUE_SOON).count(), 0)

    def test_command_deduplicates_same_day(self):
        """Running the command twice on the same day should not double-notify."""
        self._rfi_due_in(3)
        self._run_command(days=3)
        self._run_command(days=3)
        self.assertEqual(
            Notification.objects.filter(
                recipient=self.designer_member,
                verb=Notification.Verb.RFI_DUE_SOON,
            ).count(),
            1,
        )
        self.assertEqual(len(mail.outbox), 1)

    def test_dry_run_does_not_create_notification(self):
        self._rfi_due_in(3)
        output = self._run_command(days=3, dry_run=True)
        self.assertIn("DRY RUN", output)
        self.assertEqual(Notification.objects.filter(verb=Notification.Verb.RFI_DUE_SOON).count(), 0)
        self.assertEqual(len(mail.outbox), 0)

    def test_notification_payload_has_rfi_fields(self):
        rfi = self._rfi_due_in(3, rfi_number="D-003")
        self._run_command(days=3)
        notif = Notification.objects.get(
            recipient=self.designer_member, verb=Notification.Verb.RFI_DUE_SOON
        )
        self.assertEqual(notif.extra["rfi_id"], rfi.id)
        self.assertEqual(notif.extra["rfi_number"], "D-003")
        self.assertEqual(notif.extra["days_remaining"], 3)

    def test_custom_days_argument(self):
        """--days 1 should find RFIs due tomorrow, not in 3 days."""
        self._rfi_due_in(1, rfi_number="D-004")
        self._run_command(days=1)
        self.assertEqual(
            Notification.objects.filter(verb=Notification.Verb.RFI_DUE_SOON).count(), 1
        )
