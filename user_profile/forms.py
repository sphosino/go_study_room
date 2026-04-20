from django import forms
from .models import Profile
from accounts.models import CustomUser
from django.contrib.auth.forms import PasswordChangeForm

class ProfileEditForm(forms.ModelForm):
	class Meta:
		model = Profile
		fields = [
			'bio',
			'avatar'
		]

class UserNotifyForm(forms.ModelForm):
    class Meta:
        model = CustomUser
        fields = ['email', 'notify_room_create']

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.fields['email'].label = "メールアドレス"
        self.fields['email'].help_text = "Googleログイン連携に使います（任意）"

    def clean_email(self):
        email = (self.cleaned_data.get('email') or '').strip().lower()
        return email or None

class AccountDeleteForm(forms.Form):
    password = forms.CharField(widget=forms.PasswordInput, label="パスワード確認")

    def __init__(self, user, *args, **kwargs):
        self.user = user
        super().__init__(*args, **kwargs)

    def clean_password(self):
        password = self.cleaned_data.get("password")
        if not self.user.check_password(password):
            raise forms.ValidationError("パスワードが正しくありません。")
        return password