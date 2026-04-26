from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("rfis", "0004_rfiattachment"),
    ]

    operations = [
        migrations.RenameField(
            model_name="rfi",
            old_name="remarks",
            new_name="question",
        ),
        migrations.AddField(
            model_name="rfi",
            name="proposed_solution",
            field=models.TextField(blank=True),
        ),
    ]
