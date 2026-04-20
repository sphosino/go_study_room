from allauth.socialaccount.adapter import DefaultSocialAccountAdapter
from django.utils.text import slugify

from .models import CustomUser


class CustomSocialAccountAdapter(DefaultSocialAccountAdapter):
    def pre_social_login(self, request, sociallogin):
        if sociallogin.is_existing:
            return

        email = sociallogin.account.extra_data.get("email")
        if not email:
            return

        try:
            user = CustomUser.objects.get(email__iexact=email)
        except CustomUser.DoesNotExist:
            return

        sociallogin.connect(request, user)

    def populate_user(self, request, sociallogin, data):
        user = super().populate_user(request, sociallogin, data)

        email = (data.get("email") or "").strip().lower()
        if email:
            user.email = email

        if not getattr(user, "account_id", None):
            base_name = (
                data.get("given_name")
                or data.get("name")
                or (email.split("@")[0] if email else "")
                or "user"
            )
            user.account_id = self._build_unique_account_id(base_name)

        return user

    def _build_unique_account_id(self, raw_value):
        base = slugify(raw_value).replace("-", "_")
        if not base:
            base = "user"

        candidate = base[:255]
        suffix = 1
        while CustomUser.objects.filter(account_id=candidate).exists():
            suffix_text = f"_{suffix}"
            candidate = f"{base[:255 - len(suffix_text)]}{suffix_text}"
            suffix += 1

        return candidate
