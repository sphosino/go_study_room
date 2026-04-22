from django.shortcuts import render, redirect, get_object_or_404
from django.contrib.auth import get_user_model
from django.contrib.auth.decorators import login_required
from django.http import HttpResponseForbidden
from .forms import ProfileEditForm,UserNotifyForm
from .models import Profile
from django.conf import settings
import logging

logger = logging.getLogger(__name__)

def topview(request, userid):
	
	user = get_user_model().objects.get(id = userid)
	profile, created = Profile.objects.get_or_create(user=user)
	data = {
		"user":user,
		"is_owner": user == request.user
	}
	return render(request, "user_profile_top.html" ,data)

def delview(request, userid):

	logger.warning("delview called for userid=%s by user=%s", userid, request.user)

	if request.method == 'POST':
		user = get_user_model().objects.get(id = userid)
		user.delete()
		return redirect("accounts:index")
	
	user = get_user_model().objects.get(id = userid)
	profile, created = Profile.objects.get_or_create(user=user)
	data = {
		"user":user,
		"is_owner": user == request.user
	}

	return render(request, "user_delete.html" ,data)

@login_required
def editview(request, userid):
	
	user = get_user_model().objects.get(id = userid)
	if request.user != user:
		return HttpResponseForbidden("このプロフィールは編集できません。")
	profile, created = Profile.objects.get_or_create(user=user)

	if request.method == 'POST':
		profile_form = ProfileEditForm(request.POST, request.FILES, instance = profile)
		user_form = UserNotifyForm(request.POST, instance=user)

		if profile_form.is_valid() and user_form.is_valid():
			profile_form.save()
			user_form.save()
			return redirect('user_profile:user_top', userid)
		data = {
			"user":user,
			"is_owner": True,
			"profile_form": profile_form,
			"user_form": user_form,
			"VAPID_PUBLIC_KEY": settings.VAPID_PUBLIC_KEY
		}
		return render(request, "user_profile_edit.html", data)
	else:

		profile_form = ProfileEditForm(instance = profile)
		user_form = UserNotifyForm(instance=user)
		data = {
			"user":user,
			"is_owner": user == request.user,
			"profile_form": profile_form,
			"user_form": user_form,
			"VAPID_PUBLIC_KEY": settings.VAPID_PUBLIC_KEY
		}

		return render(request, "user_profile_edit.html",data)