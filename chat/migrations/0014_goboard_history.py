from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('chat', '0013_goboard_revision'),
    ]

    operations = [
        migrations.AddField(
            model_name='goboard',
            name='history',
            field=models.JSONField(default=list),
        ),
    ]
