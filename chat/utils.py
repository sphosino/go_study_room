#utils.py
from channels.layers import get_channel_layer
from .forms import ChatMessageForm
from .models import ChatRoom
from .models import ChatImage
import os
from django.conf import settings
from channels.db import database_sync_to_async
import logging

logger = logging.getLogger(__name__)

async def handle_chat_message(request, roomid):

    #フォームを取得 POST と　FILES を取得すれば、全部受け取れてる。
    form = ChatMessageForm(request.POST, request.FILES)
    #これでformは　forms.pyで宣言している ChatMessageForm型になってる
    #forms.pyのなかでmodelにchatMessageを指定しているから
    #仮に今form.save()すると、受け取った内容そのまんまで、chatMessageクラスのオブジェクトが生成されることになる
    # （同時にデータベースに保存される
    
    if form.is_valid():
        @database_sync_to_async
        def save_message():
            chat_message = form.save(commit=False) # chat_messageを編集していくよ
            if request.FILES.get('image'):
                chat_image = ChatImage(image=request.FILES['image'])#画像は別クラス管理なのでここで作成
                chat_image.save()
                chat_message.image = chat_image #chat_messageのフィールドに生成した画像オブジェクトをセット。
            chatroom = ChatRoom.objects.get(id=roomid)
            chat_message.room = chatroom
            chat_message.user = request.user

            #編集完了
            chat_message.save()

            #結果を返す
            t_url = chat_image.thumbnail.url if chat_image.thumbnail else ""
            i_url = chat_image.image.url if chat_image.image else ""
            return (
                    chat_message.content,
                    t_url,
                    i_url
                )

        content, thumbnail_url, image_url = await save_message()

        channel_layer = get_channel_layer()
        group_name = str(roomid)
        logger.debug("Chat image payload prepared. thumbnail=%s image=%s", thumbnail_url, image_url)

        # チャットメッセージをグループに送信
        await channel_layer.group_send(group_name,{
            'type': 'send_message_finally',
            'server_message_type' : 'chat',
            'sender': request.user.account_id,
            'content' : content,
            'thumbnail_url': thumbnail_url,
            'image_url': image_url
        })
        
        return {'success': True}
    return {'success': False, 'errors': form.errors}


def cleanup_unused_files():
    # データベースに関連付けられている画像とサムネイルのパスを取得
    db_image_paths = ChatImage.objects.values_list('image', flat=True)
    db_thumbnail_paths = ChatImage.objects.values_list('thumbnail', flat=True)

    # ファイルシステム上の画像とサムネイルのパスを取得
    image_dir = os.path.join(settings.MEDIA_ROOT, 'chat_images/') 
    all_image_files = [os.path.join(image_dir, f) for f in os.listdir(image_dir)]

    # 1. 関連付けられていない画像ファイルを削除
    for file_path in all_image_files:
        if file_path not in db_image_paths and os.path.isfile(file_path):
            try:
                os.remove(file_path)
                logger.info("Deleted unused image file: %s", file_path)
            except Exception as e:
                logger.warning("Failed to delete image file %s: %s", file_path, e)

    # 2. サムネイルも同様に
    thumbnail_dir = os.path.join(settings.MEDIA_ROOT, 'chat_thumbnails/')
    all_thumbnail_files = [os.path.join(thumbnail_dir, f) for f in os.listdir(thumbnail_dir)]

    for file_path in all_thumbnail_files:
        if file_path not in db_thumbnail_paths and os.path.isfile(file_path):
            try:
                os.remove(file_path)
                logger.info("Deleted unused thumbnail file: %s", file_path)
            except Exception as e:
                logger.warning("Failed to delete thumbnail file %s: %s", file_path, e)