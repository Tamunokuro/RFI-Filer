from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("rfis", "0013_rfi_drawing_spec_reference"),
    ]

    operations = [
        migrations.AddField(
            model_name="rfi",
            name="priority",
            field=models.CharField(
                choices=[
                    ("low", "Low"),
                    ("medium", "Medium"),
                    ("high", "High"),
                    ("critical", "Critical"),
                ],
                default="medium",
                help_text="Urgency level for this RFI: Low, Medium, High, or Critical.",
                max_length=10,
            ),
        ),
    ]
