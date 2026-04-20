from django.contrib.auth.forms import UserCreationForm, AuthenticationForm
from .models import CustomUser


class SignUpForm(UserCreationForm):
	class Meta:
		model = CustomUser
		fields = (
			'account_id',
			'email',
		)

	def __init__(self, *args,**kwargs):
		super().__init__(*args,**kwargs)
		self.fields['password1'].help_text = "あなたの他の個人情報と似ているパスワードにはできません。\nパスワードは最低 8 文字以上必要です。\nよく使われるパスワードにはできません。\n数字だけのパスワードにはできません。"
		self.fields['account_id'].help_text = "ログインにも使う"
		self.fields['account_id'].label = "ユーザー名"
		self.fields['email'].help_text = "Googleログイン連携に使います（任意）"
		self.fields['email'].label = "メールアドレス"
		self.fields.pop('usable_password', None)

class LoginForm(AuthenticationForm):
	def __init__(self, request=None, *args, **kwargs):
		super().__init__(request, *args, **kwargs)
		self.fields['username'].label = "ユーザー名"