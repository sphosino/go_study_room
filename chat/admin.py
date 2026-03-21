from django.contrib import admin
from . import models
# Register your models here.
class ChatRoomAdmin(admin.ModelAdmin):
    list_display = ('name', 'display_users')  # 表示したいフィールドを指定
    filter_horizontal = ('users',)  # ユーザーの選択を横並びにする

    def display_users(self, obj):
        return ", ".join([user.account_id for user in obj.users.all()])
    display_users.short_description = 'Users'  # 表示名を変更

admin.site.register(models.ChatRoom, ChatRoomAdmin)
admin.site.register(models.ChatMessage)
admin.site.register(models.GoBoard)
admin.site.register(models.ChatImage)
admin.site.register(models.Sockets)