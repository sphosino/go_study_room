from django.urls import path
from . import views

app_name = "accounts"

urlpatterns = [
	path("", views.IndexView.as_view(), name = "index"),
	path("guide/", views.GuideView.as_view(), name="guide"),
	path('signup/', views.SignupView.as_view(), name = "signup"),
	path('login/', views.CustomLoginView.as_view(), name = "login"),
	path('logout/', views.CustomLogoutView.as_view(), name = 'logout'),
	path('api/save-subscription/', views.save_subscription, name='save_subscription'),
]