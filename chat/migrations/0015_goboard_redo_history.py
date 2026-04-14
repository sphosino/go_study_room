from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('chat', '0014_goboard_history'),
    ]

    operations = [
        migrations.AddField(
            model_name='goboard',
            name='redo_history',
            field=models.JSONField(default=list),
        ),
    ]
