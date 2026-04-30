"""
Split the generic `assigned_to` M2M on Rfi into two purpose-specific fields:

  designers              – Project Designers who are responsible for answering the RFI.
  contract_administrators – CAs who oversee timeline / cost compliance.

Existing data: every current assignee is moved to `designers` so nothing is lost.
"""

from django.db import migrations, models


def copy_assignees_to_designers(apps, schema_editor):
    """Preserve existing assigned_to data by copying into designers."""
    Rfi = apps.get_model("rfis", "Rfi")
    for rfi in Rfi.objects.prefetch_related("assigned_to").all():
        rfi.designers.set(rfi.assigned_to.all())


class Migration(migrations.Migration):

    dependencies = [
        ("rfis", "0006_rfiattachment_is_official_response"),
    ]

    operations = [
        # 1 – Add the two new M2M tables
        migrations.AddField(
            model_name="rfi",
            name="designers",
            field=models.ManyToManyField(
                blank=True,
                help_text="Project Designers responsible for answering this RFI.",
                related_name="designed_rfis",
                to="rfis.member",
            ),
        ),
        migrations.AddField(
            model_name="rfi",
            name="contract_administrators",
            field=models.ManyToManyField(
                blank=True,
                help_text="Contract Administrators overseeing this RFI.",
                related_name="administered_rfis",
                to="rfis.member",
            ),
        ),
        # 2 – Migrate existing assigned_to rows into designers
        migrations.RunPython(
            copy_assignees_to_designers,
            reverse_code=migrations.RunPython.noop,
        ),
        # 3 – Drop the old field
        migrations.RemoveField(
            model_name="rfi",
            name="assigned_to",
        ),
    ]
