import os
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'go-room.settings')
django.setup()
from channels.layers import get_channel_layer
from .models import ChatRoom, ChatMessage, GoBoard, Sockets
import json
from django.conf import settings
from accounts.models import CustomUser, PushSubscription
from pywebpush import webpush, WebPushException
from asgiref.sync import sync_to_async
from channels.generic.websocket import AsyncWebsocketConsumer
from channels.db import database_sync_to_async
from django.core.exceptions import ObjectDoesNotExist
from django.db import IntegrityError
from django.utils import timezone
from datetime import timedelta
import asyncio
import logging
import html
import time
from django.urls import reverse
from django.http import JsonResponse

""" この行をコメントアウトすれば、ロガーリストが見れます
for logger_name in logging.root.manager.loggerDict:
    print(logger_name)
exit()
#"""

logger = logging.getLogger(__name__)
logging.getLogger("daphne.ws_protocol").setLevel(logging.ERROR)

GLOBAL_LOBBY, created = ChatRoom.objects.get_or_create(name='__system_lobby')
GLOBAL_LOBBY_ID = GLOBAL_LOBBY.id
SOCKET_TIMEOUT = 300 # 秒
ROOM_TIMEOUT = 300 # 秒
WORKER_INTERVAL = 40  # 秒
_global_monitor_task = None #ワーカーのタスクを保持する変数

if created:
    logger.info("Global lobby created.")
else:
    logger.debug("Global lobby already existed.")

class SendMethodMixin():

    #全てのメッセージは最終的にこの関数からクライアントに送られる
    async def send_message_finally(self, event):

        logger.info(event['server_message_type'])

        #サーバーからクライアントに送るメッセージにsenderとsocket_idがない場合は、送信者を現在のユーザー、socket_idを現在のソケットに設定する
        if not event.get('sender'):
            event['sender'] = self.user.account_id
        if not event.get('socket_id'):
            event['socket_id'] = self.channel_name
        
        await self.send(text_data=json.dumps({
            **event
        }))

    #グループに送信
    async def send_message_to_group(self, server_message_type, **kwargs):
        logger.info(f"sending messege for group ->  {kwargs}")
        await self.channel_layer.group_send(
            self.room_group_name,
            {
                'type': 'send_message_finally',
                'server_message_type': server_message_type,
                'sender': self.user.account_id, #誰からのメッセージかを設定
                **kwargs
            }
        )

    #クライアントに返信(送信)
    async def send_message(self, server_message_type, **kwargs):
        await self.send_message_finally({
            'server_message_type': server_message_type,
            **kwargs
        })

    # 過去のメッセージを取得してクライアントに送信
    async def send_previous_messages(self, room_id, message_limit = 50, time = None):
        previous_messages = await get_previous_messages(room_id, message_limit, time)

        for message in previous_messages:
            logger.debug("Sending previous message: %s", message)
            await self.send_message(
                'chat',
                **message
            )
            
    async def new_accept(self):
        await AsyncWebsocketConsumer.accept(self)
        global _global_monitor_task
        socket_id = self.channel_name
        # 接続が確立したときにソケットを保存
        await database_sync_to_async(Sockets.objects.create)(
            socket_id=socket_id,
            user=self.scope["user"]
        )
        # 接続が確立したときにゴーストを削除するワーカーを起動
        if _global_monitor_task is None or _global_monitor_task.done():
            _global_monitor_task = asyncio.create_task(worker())
            logger.info("Started ghost monitor task.")

    async def force_close(self, event):
        await self.send_message('timeout')
        await self.close(code=4001, reason="Ghost timeout")

class LobbyConsumer(AsyncWebsocketConsumer, SendMethodMixin):

    async def connect(self):
        self.user = self.scope["user"]
        self.room_group_name = str(GLOBAL_LOBBY_ID)

        if self.user.is_authenticated:
            
            logger.info(f"{self.user.account_id}がロビーに接続しましたよ")

            result = await manage_user_in_chatroom(self,GLOBAL_LOBBY_ID,"add")

            user_list = [i.account_id for i in result]
                        
            await self.channel_layer.group_add(
                self.room_group_name,
                self.channel_name
            )
            await self.new_accept()
            await self.send_message('your_socket_id', socket_id = self.channel_name, is_server = True)


            await self.send_message_to_group(
                'join', 
                user_list = user_list #現在の入室者リスト
            )

            await self.send_previous_messages(GLOBAL_LOBBY_ID, 50, 10) #最大５０件、１０分以内のメッセージを取得

        else:
            self.close()

    async def disconnect(self, close_code):

        result = await manage_user_in_chatroom(self,GLOBAL_LOBBY_ID, "remove")
        user_list = [i.account_id for i in result]
        
        await self.send_message_to_group('leave',
            name     = self.user.account_id, #退室者名
            user_list= user_list  #現在の入室者リスト
        )

        await self.channel_layer.group_discard(
            self.room_group_name,
            self.channel_name
        )

    async def receive(self, text_data):

        text_data_json = json.loads(text_data)
        client_message_type = text_data_json['client_message_type']

        logger.info(f"lobby:{client_message_type}")

        await database_sync_to_async(Sockets.objects.filter(socket_id=self.channel_name).update)(timestamp=timezone.now())

        match client_message_type:

            case 'get_lobby_id':

                logger.info(f"{client_message_type} -> {GLOBAL_LOBBY_ID}")
                await self.send_message(client_message_type, result = GLOBAL_LOBBY_ID)
                
            case 'chat':

                message = text_data_json['content']
                sanitized_message = html.escape(message)
                await save_message(GLOBAL_LOBBY_ID, self.user, sanitized_message)
                text_data_json["name"] = self.user.account_id
                await self.send_message_to_group(client_message_type, **text_data_json)

            case 'make_room':

                room_name = text_data_json['room_name']
                @database_sync_to_async
                def make_room():
                    try:
                        new_chatroom = ChatRoom.objects.create(name = room_name)
                        new_chatroom.users.add(self.user)
                        chatroom = ChatRoom.objects.exclude(id = GLOBAL_LOBBY_ID)
                    except IntegrityError:
                        logger.info("部屋名がかぶってます")
                        return list()
                    return list(chatroom)
                room_list = { i.name : i.id for i in await make_room()}

                #新しい部屋が作られたことを通知するプッシュ通知を送る
                @database_sync_to_async
                def send_push_notifications():
                    users = CustomUser.objects.filter(notify_room_create=True).exclude(id=self.user.id)
                    for user in users:
                        subs = PushSubscription.objects.filter(user=user)
                        for sub in subs:
                            try:
                                webpush(
                                    subscription_info={
                                        "endpoint": sub.endpoint,
                                        "keys": {
                                            "p256dh": sub.p256dh,
                                            "auth": sub.auth,
                                        },
                                    },
                                    data=json.dumps({
                                        "title": "新しい部屋が作られました",
                                        "body": f"{room_name} が作成されました",
                                        "url": "/chat/lobby/"
                                    }),
                                    vapid_private_key=settings.VAPID_PRIVATE_KEY,
                                    vapid_claims={
                                        "sub": "mailto:sphosino@gmail.com"
                                    },
                                )
                            except WebPushException as e:
                                logger.error(f"Push failed: {e}")
                                status = getattr(e.response, "status_code", None)
                                if status in [404,410]:
                                    sub.delete()

                logger.debug("Room create notify flag: %s", text_data_json['notify'])
                if text_data_json['notify']:
                    await send_push_notifications()

                #新しい部屋が作られたことをロビーにいる全員に通知
                await self.send_message(client_message_type)
                await self.send_message_to_group(client_message_type, roomlist = room_list)

            
            case 'room-list-update':

                await self.room_list_update(client_message_type)

            case 'user-list-update':

                await user_list_update(self, GLOBAL_LOBBY_ID, client_message_type)

            case 'get-user-page':

                url = reverse("user_profile:user_top",
                        args = [text_data_json['userid']]
                    )
                await self.send_message(client_message_type,
                    url = url
                )

            case _:

                logger.info(f'unknown-message from client -> {client_message_type}')

    async def room_list_update(self, message_type):
        @database_sync_to_async
        def get_chat_room_all():
            try:
                chatroom = ChatRoom.objects.exclude(id = GLOBAL_LOBBY_ID)
                return list(chatroom)
            except ObjectDoesNotExist:
                logger.info(f"ChatRoom with id {GLOBAL_LOBBY_ID} does not exist")
                return []
        result = await get_chat_room_all()
        room_list = { i.name : i.id for i in result}
        await self.send_message(message_type, roomlist = room_list)
        

class RoomConsumer(AsyncWebsocketConsumer, SendMethodMixin):
    async def connect(self):

        self.user = self.scope["user"]
        self.room_id = self.scope['url_route']['kwargs']['room_id']
        self.room_group_name = self.room_id

        if self.user.is_authenticated:

            logger.info(f"{self.user}がROOM{self.room_id}に接続しました")

            result = await manage_user_in_chatroom(self, self.room_id,"add")
            user_list = [i.account_id for i in result]

            await self.channel_layer.group_add(
                self.room_group_name,
                self.channel_name
            )
            await self.new_accept()
            await self.send_message('your_socket_id', socket_id = self.channel_name, is_server = True)
            await self.send_message_to_group(
                'join',
                user_list = user_list #現在の入室者リスト
            )

            # 過去のメッセージを取得してクライアントに送信
            await self.send_previous_messages(self.room_id, 100)
            
            # roomに紐づく既存のGoBoardを新規参加ユーザーに送信
            await self.send_existing_boards()

        else:
            self.close()

    async def disconnect(self, close_code):
        if self.room_id:
            await database_sync_to_async(
                ChatRoom.objects.filter(id=self.room_id).update
            )(last_updated_at=timezone.now())

        result = await manage_user_in_chatroom(self, self.room_id,'remove')
        user_list = [i.account_id for i in result]
        await self.send_message_to_group('leave',
            name     = self.user.account_id, #退室者名
            user_list= user_list  #現在の入室者リスト
        )
        
        await self.channel_layer.group_discard(
            self.room_group_name,
            self.channel_name
        )

    async def receive(self, text_data):
        text_data_json = json.loads(text_data)

        client_message_type = text_data_json['client_message_type']

        logger.info(f"roomconsumer: {client_message_type}")

        room_id = self.scope['url_route']['kwargs']['room_id']

        await database_sync_to_async(Sockets.objects.filter(socket_id=self.channel_name).update)(timestamp=timezone.now())

        match client_message_type:

            case 'chat':

                message = text_data_json['content']
                sanitized_message = html.escape(message)
                await save_message(self.room_id, self.user, sanitized_message)
                text_data_json["name"] = self.user.account_id
                await self.send_message_to_group(client_message_type, **text_data_json)

            case 'user-list-update':
                await user_list_update(self, room_id, client_message_type)

            case 'get-user-page':
                url = reverse("user_profile:user_top",
                        args = [text_data_json['userid']]
                    )
                await self.send_message(client_message_type,
                    url = url
                )

            case 'make_go_board':

                y = text_data_json['y']
                x = text_data_json['x']

                @database_sync_to_async
                def make_go_board():
                    new_board = GoBoard.objects.create(y = y, x = x, room_id = self.room_id)
                    new_board.save()
                    return {
                        "id" : new_board.id,
                        "y" : y,
                        "x" : x,
                        "revision": new_board.revision,
                    }
                
                board = await make_go_board()

                await self.send_message_to_group(client_message_type, **board)
            
            case 'place_stone':

                y = text_data_json['y']
                x = text_data_json['x']
                turn = text_data_json['turn']
                id = text_data_json['id']
                revision = text_data_json.get('revision')

                @database_sync_to_async
                def get_go_board():
                    board = GoBoard.objects.get(id = id)
                    if revision is not None and board.revision != revision:
                        return False,[] # 古い盤面に対する操作なので弾く
                    if board.turn != turn:
                        return False,[] #同時に操作が来た可能性が高い
                    if board.place_stone(y, x, turn): #ここで盤面の変更とsave()が行われる。変更があればTrueが返ってくる
                        return True, board.serialize_for_client()
                    return False,[]
                
                result, board = await get_go_board()

                if result:
                    await self.send_message_to_group(client_message_type, **board)

            case 'update_board':

                id = text_data_json['id']
                board_data = text_data_json['board']
                turn = text_data_json.get('turn')
                revision = text_data_json.get('revision')

                @database_sync_to_async
                def update_go_board():
                    board = GoBoard.objects.get(id=id)
                    if revision is not None and board.revision != revision:
                        return False, board.serialize_for_client()
                    if board.update_board_state(board_data, turn):
                        return True, board.serialize_for_client()
                    return False, []

                result, board = await update_go_board()

                if result:
                    await self.send_message_to_group(client_message_type, **board)
                elif board:
                    await self.send_message(client_message_type, **board)

            case 'undo_board':

                id = text_data_json['id']
                revision = text_data_json.get('revision')

                @database_sync_to_async
                def undo_go_board():
                    board = GoBoard.objects.get(id=id)
                    if revision is not None and board.revision != revision:
                        return False, board.serialize_for_client()
                    if board.undo_board_state():
                        return True, board.serialize_for_client()
                    return False, []

                result, board = await undo_go_board()

                if result:
                    await self.send_message_to_group(client_message_type, **board)
                elif board:
                    await self.send_message(client_message_type, **board)

            case 'redo_board':

                id = text_data_json['id']
                revision = text_data_json.get('revision')

                @database_sync_to_async
                def redo_go_board():
                    board = GoBoard.objects.get(id=id)
                    if revision is not None and board.revision != revision:
                        return False, board.serialize_for_client()
                    if board.redo_board_state():
                        return True, board.serialize_for_client()
                    return False, []

                result, board = await redo_go_board()

                if result:
                    await self.send_message_to_group(client_message_type, **board)
                elif board:
                    await self.send_message(client_message_type, **board)
                    
            case 'p2pOffer' | 'p2pAnswer' | 'p2pIceCandidate':
                await self.p2psend_message(client_message_type, text_data_json)

    async def p2psend_message(self, message_type, text_data):
        target_socket = text_data.get('for')
        if target_socket:
            text_data['sender'] = self.user.account_id
            text_data['socket_id'] = self.channel_name
            text_data['server_message_type'] = message_type
            await self.channel_layer.send(target_socket, {
                'type': 'send_message_finally',
                **text_data
            })

    async def send_existing_boards(self):
        @database_sync_to_async
        def get_boards():
            # 再入室時も作成順で復元できるように順序を固定する
            boards = list(GoBoard.objects.filter(room=self.room_id).order_by('id'))
            logger.debug("Fetched boards for room %s: %s", self.room_id, len(boards))
            return boards

        boards = await get_boards()
        logger.debug("Sending existing boards for room %s: %s", self.room_id, len(boards))
        for board in boards:
            board_payload = board.serialize_for_client()
            board_payload["y"] = board.y
            board_payload["x"] = board.x
            await self.send_message('make_go_board',
                **board_payload,
            )
#---------------------------------------------------------------
async def manage_user_in_chatroom(self, room_id, action):

    @database_sync_to_async
    def modify_user_in_chatroom():
        try:
            chatroom = ChatRoom.objects.get(id = room_id)
            if action == 'add':
                self.room = chatroom
                chatroom.users.add(self.user)
                logger.info(f"User {self.user} added to chatroom {room_id}")
            elif action == 'remove':
                chatroom.users.remove(self.user)
                logger.info(f"User {self.user} removed from chatroom {room_id}")
            return list(chatroom.users.all())
        except ChatRoom.DoesNotExist:
            logger.error(f"ChatRoom with id {room_id} does not exist")
            return []
        except Exception as e:
            logger.error(f"An error occurred: {e}")
            return []
    
    return await modify_user_in_chatroom()


async def user_list_update(socket, room_id, message_type):
    logger.debug("user_list_update called for room %s", room_id)
    @database_sync_to_async
    def get_user_list():
        try:
            chatroom = ChatRoom.objects.get(id = room_id)
            return list(chatroom.users.all())
        except ObjectDoesNotExist:
            logger.info(f"ChatRoom with id {room_id} does not exist")
            return []
    user_list_ids = [[user.account_id, user.id] for user in await get_user_list()]
    logger.debug("user_list_update result for room %s: %s", room_id, user_list_ids)
    await socket.send_message(
        message_type,
        userlist = user_list_ids
    )

@database_sync_to_async
def save_message(room_id, user, content):
    ChatMessage.objects.create(room_id=room_id, user=user, content=content)

@database_sync_to_async
def get_previous_messages(room_id, message_limit=50, time=None):
    # select_related で画像とユーザーを一度に取ってくる
    qs = ChatMessage.objects.filter(room_id=room_id).select_related('user', 'image')
    if time:
        qs = qs.filter(timestamp__gte=timezone.now() - timedelta(minutes=time))
    
    messages = list(qs.order_by('-timestamp')[:message_limit][::-1])
    
    # データをシリアライズして返す（ループ内でのDBアクセスを排除）
    return [{
        "sender": m.user.account_id,
        "content": m.content,
        "timestamp": str(m.timestamp),
        "image_url": m.image.image.url if m.image else "",
        "thumbnail_url": m.image.thumbnail.url if m.image and m.image.thumbnail else ""
    } for m in messages]

@database_sync_to_async
def get_all_sockets():
    """ソケット一覧取得（同期関数）"""
    return list(Sockets.objects.all())

@database_sync_to_async
def delete_socket(socket_instance):
    """ソケット削除（同期関数）"""
    socket_instance.delete()


@database_sync_to_async
def count_user_sockets(socket_id):
    """ユーザーソケット数確認"""
    return Sockets.objects.filter(socket_id=socket_id).count()

async def worker():
    logger.info("Ghost worker started.")
    
    iteration = 0
    while True:
        iteration += 1
        logger.debug("Worker loop %s started.", iteration)
        
        try:
            # 1. ソケット取得
            sockets = await get_all_sockets()
            logger.debug("Worker loop %s socket count=%s interval=%s", iteration, len(sockets), WORKER_INTERVAL)
            
            if not sockets:
                break
            
            logger.debug("Worker loop %s checking sockets.", iteration)
            threshold = timezone.now() - timedelta(seconds=SOCKET_TIMEOUT)
            
            deleted_count = 0
            for s in sockets:
                try:
                    logger.debug("Checking socket %s timestamp=%s", s.socket_id, s.timestamp)
                    
                    if s.timestamp < threshold:
                        # 1. ソケットに直接切断命令
                        logger.info("Socket timeout detected: %s", s.socket_id)
                        channel_layer = get_channel_layer()
                        await channel_layer.send(s.socket_id, {
                            "type": "force_close"
                        })
                        logger.debug("Force close sent to socket %s", s.socket_id)
                        # 2. データベースからソケット削除
                        await delete_socket(s)
                        deleted_count += 1
                        logger.info("Socket deleted after timeout: %s", s.socket_id)
                        
                        # 残りソケット確認
                        remaining = await count_user_sockets(s.socket_id)
                        logger.debug("Remaining socket rows for %s: %s", s.socket_id, remaining)
                except Exception as e:
                    logger.error(f"Socket error: {e}", exc_info=True)
            
            logger.debug("Worker loop %s completed. deleted=%s", iteration, deleted_count)
            
        except Exception as e:
            logger.error(f"Worker loop error: {e}", exc_info=True)

        #####空部屋削除
        room_threshold = timezone.now() - timedelta(seconds=ROOM_TIMEOUT)
        empty_rooms = await database_sync_to_async(list)(
            ChatRoom.objects.filter(
                sockets__isnull=True,
                last_updated_at__lt=room_threshold
            )
        )
        for room in empty_rooms:
            if room.id == GLOBAL_LOBBY_ID:
                continue
            socket_count = await database_sync_to_async(room.sockets.count)()
            if socket_count == 0:
                await database_sync_to_async(room.delete)()
        #####空部屋削除完了

        await asyncio.sleep(WORKER_INTERVAL)
    
    logger.info("Ghost worker ended.")
