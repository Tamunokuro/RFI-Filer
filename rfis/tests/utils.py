"""
Shared test utilities: in-memory temp-media root, User shortcut,
and the _make_user_member helper used by every test module.
"""
import tempfile

from django.contrib.auth import get_user_model

from rfis.models import Member

# Single temp directory shared across the test run.
# Each test class that uses MEDIA_ROOT should point @override_settings here.
TMP_MEDIA = tempfile.mkdtemp(prefix="rfi-test-media-")

User = get_user_model()


def _make_user_member(username, role, email_suffix="example.com"):
    """Create a Django User + linked Member in one call."""
    user = User.objects.create_user(username=username, password="pw-" + username)
    member = Member.objects.create(
        user=user,
        name=username.title(),
        email=f"{username}@{email_suffix}",
        role=role,
    )
    return user, member
