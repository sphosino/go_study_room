from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('chat', '0012_chatroom_last_updated_at_sockets_room'),
    ]

    operations = [
        migrations.AddField(
            model_name='goboard',
            name='revision',
            field=models.IntegerField(default=0),
        ),
    ]
