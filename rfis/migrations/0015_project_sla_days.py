from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("rfis", "0014_rfi_priority"),
    ]

    operations = [
        migrations.AddField(
            model_name="project",
            name="sla_days",
            field=models.PositiveSmallIntegerField(
                default=14,
                help_text="Default response time in calendar days. New RFIs auto-fill due date as Received + sla_days.",
            ),
        ),
    ]
