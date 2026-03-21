from django.db import models
from accounts.models import CustomUser
from django.core.files.storage import default_storage
from PIL import Image
import os
from io import BytesIO
from django.core.files.base import ContentFile
# Create your models here.


class ChatRoom(models.Model):
    name = models.CharField(max_length=30, unique=True)
    created_at = models.DateTimeField(auto_now_add=True)
    last_updated_at = models.DateTimeField(auto_now=True)
    users = models.ManyToManyField(CustomUser, blank=True)

    def __str__(self):
        return f"部屋->{self.name}"
    
class Sockets(models.Model):
    user = models.ForeignKey(CustomUser, on_delete=models.CASCADE)
    socket_id = models.CharField(max_length=255, unique=True)
    timestamp = models.DateTimeField(auto_now=True)
    room = models.ForeignKey(ChatRoom, on_delete=models.CASCADE, related_name='sockets', blank=True, null=True)

THUMBNAILSIZEX = 200
THUMBNAILSIZEY = 200
class ChatImage(models.Model):
    image = models.ImageField(upload_to='chat_images/')
    thumbnail = models.ImageField(upload_to='chat_thumbnails/', blank=True, null=True)
    uploaded_at = models.DateTimeField(auto_now_add=True)

    def save(self, *args, **kwargs):
        super().save(*args, **kwargs)
        if self.image and not self.thumbnail:
            self.generate_thumbnail()

    def generate_thumbnail(self):
        img = Image.open(self.image)
        width, height = img.size
        print("保存された画像の大きさ＝", width, height)

        thumb_name, thumb_extension = os.path.splitext(os.path.basename(self.image.name))
        thumb_extension = thumb_extension.lower()

        FORMAT_MAP = {
            '.jpg': 'JPEG',
            '.jpeg': 'JPEG',
            '.png': 'PNG',
            '.gif': 'GIF',
            '.webp': 'WEBP',
        }
        pil_format = FORMAT_MAP.get(thumb_extension, img.format or 'JPEG')

        # JPEGはRGBAを保存できないので変換
        if pil_format == 'JPEG' and img.mode in ('RGBA', 'P'):
            img = img.convert('RGB')

        # サイズに関わらず常にサムネイルを生成する
        img.thumbnail((THUMBNAILSIZEX, THUMBNAILSIZEY))

        thumb_io = BytesIO()
        img.save(thumb_io, format=pil_format)

        thumb_filename = thumb_name + '_thumb' + thumb_extension
        thumb_path = os.path.join('chat_thumbnails', thumb_filename)
        thumb_file = default_storage.save(thumb_path, ContentFile(thumb_io.getvalue()))
        self.thumbnail = thumb_file
        self.save(update_fields=['thumbnail'])  # thumbnailフィールドのみ更新

class ChatMessage(models.Model):
    content = models.TextField(blank = True)
    image = models.ForeignKey(ChatImage, on_delete = models.SET_NULL, blank=True, null= True)
    timestamp = models.DateTimeField(auto_now_add = True)
    room = models.ForeignKey(ChatRoom, on_delete = models.CASCADE, related_name='chats')
    user = models.ForeignKey(CustomUser, on_delete = models.SET_NULL, blank=True, null=True)

    def __str__(self):
        return f"{self.user} -> {self.content[:50]}"

    def delete(self, *args, **kwargs):
        storage = self.image.storage if self.image else None
        name = self.image.name if self.image else None

        if storage and name:
            try:
                storage.delete(name)
            except Exception:
                pass
        super().delete(*args, **kwargs)
        
EMPTY = 0
BLACK = 1
WHITE = 2
class GoBoard(models.Model):
    y = models.IntegerField()  # 行の数
    x = models.IntegerField()  # 列の数
    turn = models.IntegerField(default=BLACK)  # 現在のターン
    koY = models.IntegerField(default=-1)  # コウのY座標
    koX = models.IntegerField(default=-1)  # コウのX座標
    koTurn = models.IntegerField(default=-1)  # コウのターン
    black_capture_count = models.IntegerField(default = 0)
    white_capture_count = models.IntegerField(default = 0)

    # ボードの状態をJSONとして保存するためのフィールド
    board = models.JSONField(default=list)  # Django 3.1以上で使用可能

    #ChatRoomに紐づける
    room = models.ForeignKey(ChatRoom, on_delete = models.CASCADE)

    #x,y,roomが初期化時必須項目

    directions_y = [0,-1,0,1]
    directions_x = [1,0,-1,0]

    def initialize_board(self):
        self.board = [[EMPTY for _ in range(self.x)] for _ in range(self.y)]

    def save(self, *args, ** kwargs):
        if not self.board:
            self.initialize_board()
        super().save(*args, **kwargs)

    @staticmethod
    def get_opponent_turn(turn):
        if turn == BLACK:
            return  WHITE
        if turn == WHITE:
            return BLACK
        raise ValueError("黒番か白番かでヨロ")

    def switch_turn(self, turn = None):
        t = turn if turn else self.turn
        self.turn = GoBoard.get_opponent_turn(t)

    def is_in_bound(self, y, x):
        return 0 <= y < self.y and 0 <= x < self.x

    def check_kakomare(self, y, x, turn):
        stacky = [y]
        stackx = [x]
        visited = [[False for _ in range(self.x)] for _ in range(self.y)]
        captured_stones = []

        while len(stackx) >= 1:
            ny = stacky.pop()
            nx = stackx.pop()
            visited[ny][nx] = True
            captured_stones.append([ny, nx])
            
            for i in range(4):

                nexty = ny + GoBoard.directions_y[i]
                nextx = nx + GoBoard.directions_x[i]

                if self.is_in_bound(nexty, nextx) and visited[nexty][nextx] == False:
                    if self.board[nexty][nextx] == EMPTY:
                        return []
                    if self.board[nexty][nextx] == turn:
                        stacky.append(nexty)
                        stackx.append(nextx)

        return captured_stones
    
    def check_kakomi(self, y, x, turn):

        if self.board[y][x] != EMPTY:
            return []
        
        self.board[y][x] = turn #置いたときのチェックをするので一時的に置き換えるよ

        captured_stones = []

        #四方向独立して調べてるので、結果の座標リストには被りがあり得ることに注意！
        for i in range(4):

            nexty = y + GoBoard.directions_y[i]
            nextx = x + GoBoard.directions_x[i]

            if self.is_in_bound(nexty, nextx) and self.board[nexty][nextx] == GoBoard.get_opponent_turn(turn):
                captured_stones.extend(
                    self.check_kakomare(
                        nexty, nextx, GoBoard.get_opponent_turn(turn)
                    )
                )
                
            
            print(captured_stones)

        self.board[y][x] = EMPTY #忘れずに戻すよ

        return captured_stones
    
    def can_move(self, y, x, turn):

        if not self.is_in_bound(y, x):
            #範囲外
            return False,[]
        
        if self.board[y][x] != EMPTY:
            #すでに石があるぞ
            return False, []
        
        if self.koY == y and self.koX == x and self.koTurn == turn:
            #そこは"コウ"だから打てない
            return False, []
        
        captured_stones = self.check_kakomi(y, x, turn)
        if captured_stones:
            #石がとれるので打てるよ。
            return True, captured_stones 
        
        if self.check_kakomare(y, x, turn):
            #囲まれてるんで打てないよ
            return False, [] 
        
        #囲まれてないので打てるよ
        return True, []

    def update_to_ko_state(self, captured_stones, turn):

        #コウ状態を更新
        #一個とったとき、取った場所に相手が打ったら１個とれるならコウ
        
        self.koTurn = self.koY = self.koX = -1

        if len(captured_stones) == 1:
            print(captured_stones)
            if len(self.check_kakomi(captured_stones[0][0],captured_stones[0][1], GoBoard.get_opponent_turn(turn))) == 1:
                self.koY = captured_stones[0][0]
                self.koX = captured_stones[0][1]
                self.koTurn = GoBoard.get_opponent_turn(turn)

    def place_stone(self, y, x, turn = None):

        t = turn if turn else self.turn

        success, captured_stones = self.can_move(y, x, t)
        
        if success:
            self.board[y][x] = t
            for get_y, get_x in captured_stones:
                if self.board[get_y][get_x] != EMPTY: #被りがあり得るので石があった時だけカウントするよ
                    self.board[get_y][get_x] = EMPTY
                    if t == BLACK:
                        self.black_capture_count += 1
                    elif t == WHITE:
                        self.white_capture_count += 1
                        
            self.update_to_ko_state(captured_stones, t)
            self.switch_turn(t)
            self.save()
            
        #ボードに変更があったかを返す
        return success
    
