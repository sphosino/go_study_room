from django.db import models
from django.contrib.auth.models import AbstractBaseUser,BaseUserManager,PermissionsMixin


class CustomUserManager(BaseUserManager):
    def _create_user(self, account_id, password, **extra_fields):
        user = self.model(account_id=account_id, **extra_fields)
        user.set_password(password)
        user.save(using=self._db)

        return user

    def create_user(self, account_id, password=None, **extra_fields):
        extra_fields.setdefault('is_active', True)
        extra_fields.setdefault('is_staff', False)
        extra_fields.setdefault('is_superuser', False)
        return self._create_user(
            account_id=account_id,
            password=password,
            **extra_fields,
        )

    def create_superuser(self, account_id, password, **extra_fields):
        extra_fields['is_active'] = True
        extra_fields['is_staff'] = True
        extra_fields['is_superuser'] = True
        return self._create_user(
            account_id=account_id,
            password=password,
            **extra_fields,
        )
    
class CustomUser(AbstractBaseUser, PermissionsMixin):
    account_id = models.CharField(
		unique = True,
		max_length=255
    )
    email = models.EmailField(unique=True, null=True, blank=True)
    is_active = models.BooleanField(default = True)
    is_staff = models.BooleanField(default = False)
    is_superuser = models.BooleanField(default = False)

    notify_room_create = models.BooleanField(default = False,verbose_name="誰かが部屋作成したら通知を受け取る")

    objects = CustomUserManager()

    USERNAME_FIELD = 'account_id'
    def __str__(self):
        return self.account_id

class PushSubscription(models.Model):
    user = models.ForeignKey(
        CustomUser,
        on_delete=models.CASCADE,
        related_name="subscriptions"
    )
    endpoint = models.TextField(unique=True)
    p256dh = models.TextField()
    auth = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)