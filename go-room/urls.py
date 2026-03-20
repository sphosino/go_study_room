from django.contrib import admin
from django.urls import path,include
from django.conf import settings
from django.conf.urls.static import static

from accounts.views import service_worker, manifest
from django.views.generic.base import RedirectView 

urlpatterns = [
    path('admin/', admin.site.urls         ),
	path(''      , include("accounts.urls")),
	path('chat/'  , include("chat.urls")    ),
    path('user_profile/', include("user_profile.urls")),
    path('sw.js', service_worker, name='sw'),
    path('manifest.json', manifest, name='manifest'),
    path('accounts/', include("accounts.urls")),
    path('favicon.ico', RedirectView.as_view(url=settings.STATIC_URL + 'favicon.ico'))
]
# 開発環境でメディアファイルを提供する設定
if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
    urlpatterns += static(settings.STATIC_URL, document_root=settings.STATIC_ROOT)