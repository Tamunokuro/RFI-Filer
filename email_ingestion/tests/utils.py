"""
Shared test utilities for email_ingestion tests.
"""
from datetime import datetime, timezone

from django.contrib.auth import get_user_model

from rfis.models import Member, Project
from email_ingestion.models import EmailConfig, EmailFolder, InboundEmail

User = get_user_model()


def make_admin(username="admin"):
    """Create a superuser with a linked admin Member."""
    user = User.objects.create_user(username=username, password="pw")
    user.is_staff = True
    user.save()
    member = Member.objects.create(
        user=user,
        name=username.title(),
        email=f"{username}@example.com",
        role=Member.Role.PROJECT_MANAGER,
        is_admin=True,
    )
    return user, member


def make_user(username="user"):
    """Create a regular authenticated user with a non-admin Member."""
    user = User.objects.create_user(username=username, password="pw")
    member = Member.objects.create(
        user=user,
        name=username.title(),
        email=f"{username}@example.com",
        role=Member.Role.CONTRACTOR,
        is_admin=False,
    )
    return user, member


def make_project(number="P-001", name="Test Project"):
    pm_user = User.objects.create_user(username=f"pm_{number}", password="pw")
    pm = Member.objects.create(
        user=pm_user,
        name="PM",
        email=f"pm_{number}@example.com",
        role=Member.Role.PROJECT_MANAGER,
    )
    return Project.objects.create(
        project_number=number,
        project_name=name,
        project_manager=pm,
    )


def make_config(label="Test Inbox", username="test@example.com", **kwargs):
    kwargs.setdefault("is_active", True)
    kwargs.setdefault("auto_create_threshold", 0.85)
    return EmailConfig.objects.create(
        label=label,
        provider=EmailConfig.Provider.GMAIL,
        imap_host="imap.gmail.com",
        imap_port=993,
        username=username,
        password="secret",
        mailbox="INBOX",
        **kwargs,
    )


def make_folder(name="Asana", keywords=None, color="indigo"):
    return EmailFolder.objects.create(
        name=name,
        keywords=keywords or ["asana.com"],
        color=color,
    )


def make_inbound(config, project=None, **kwargs):
    defaults = dict(
        message_id=f"<msg-{InboundEmail.objects.count()}@test>",
        received_at=datetime(2025, 1, 15, 10, 0, tzinfo=timezone.utc),
        sender_name="Contractor",
        sender_email="contractor@example.com",
        subject="RFI – P-001 – Duct clash clarification",
        body_text="Please clarify the duct specification.",
        confidence=0.9,
        match_reason="exact",
        status=InboundEmail.Status.PENDING,
        email_type=InboundEmail.EmailType.RFI,
    )
    defaults.update(kwargs)
    return InboundEmail.objects.create(
        email_config=config,
        project=project,
        **defaults,
    )
