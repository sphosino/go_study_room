# chat/routing.py
from django.urls import re_path
from . import consumers

websocket_urlpatterns = [
	re_path('ws/chat/lobby/', consumers.LobbyConsumer.as_asgi()),
	re_path(r'ws/chat/(?P<room_id>\d+)/$', consumers.RoomConsumer.as_asgi()),
]