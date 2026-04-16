/**
 * マウスイベント管理クラス
 * 碁盤上のマウスムーブとマウスリーブを処理
 */
export default class MouseEventManager {
    /**
     * @param {HTMLCanvasElement} canvas - キャンバス要素
     * @param {GoBoard} goban - 碁盤インスタンス
     * @param {Object} peerConnections - P2P接続オブジェクト
     * @param {number} boardId - 碁盤ID
     */
    constructor(canvas, goban, peerConnections, boardId) {
        this.canvas = canvas;
        this.goban = goban;
        this.peerConnections = peerConnections;
        this.boardId = boardId;
        this.lastSendTime = 0;
        this.sendInterval = 30; // ミリ秒
        this.isInside = false;
    }

    /**
     * マウスムーブイベントのハンドラ
     */
    onMouseMove = (event) => {
        const now = Date.now();
        if (now - this.lastSendTime <= this.sendInterval) {
            return; // 間引き
        }
        this.lastSendTime = now;

        const position = this._getMousePosition(event);
        // getMousePosition_percentage(mousey, mousex) の順序に合わせる
        const mpos = this.goban.getMousePosition_percentage(position.y, position.x);

        if (!mpos) {
            if (this.isInside) {
                this.isInside = false;
                this._sendMouseLeave();
            }
            return;
        }

        this.isInside = true;
        this._broadcastMousePosition(mpos[0], mpos[1]);
    };

    /**
     * マウスリーブイベントのハンドラ
     */
    onMouseLeave = () => {
        this.isInside = false;
        this._sendMouseLeave();
    };

    /**
     * クリックイベントのハンドラを設定
     */
    setClickHandler(clickCallback) {
        this.canvas.addEventListener('click', () => {
            clickCallback(this.boardId);
        });
    }

    /**
     * イベントリスナーを登録
     */
    attachListeners() {
        this.canvas.addEventListener('mousemove', this.onMouseMove);
        this.canvas.addEventListener('mouseleave', this.onMouseLeave);
    }

    /**
     * マウス位置を取得（キャンバス座標系）
     * @private
     */
    _getMousePosition(event) {
        const rect = this.canvas.getBoundingClientRect();
        const scaleX = this.canvas.width / rect.width;
        const scaleY = this.canvas.height / rect.height;
        const x = (event.clientX - rect.left) * scaleX;
        const y = (event.clientY - rect.top) * scaleY;

        this.goban.checkOnMouse(y, x);
        return { x, y };
    }

    /**
     * マウス位置をブロードキャスト
     * @private
     */
    _broadcastMousePosition(percentageX, percentageY) {
        Object.entries(this.peerConnections).forEach(([socketId, peerConnection]) => {
            const dataChannel = peerConnection.dataChannel__;
            if (dataChannel && dataChannel.readyState === 'open') {
                dataChannel.send(
                    JSON.stringify({
                        message_type: 'mousemove',
                        x: percentageX,
                        y: percentageY,
                        boardId: this.boardId,
                    })
                );
            }
        });
    }

    /**
     * マウスリーブをブロードキャスト
     * @private
     */
    _sendMouseLeave() {
        Object.entries(this.peerConnections).forEach(([socketId, peerConnection]) => {
            const dataChannel = peerConnection.dataChannel__;
            if (dataChannel && dataChannel.readyState === 'open') {
                dataChannel.send(
                    JSON.stringify({
                        message_type: 'mouseleave',
                        boardId: this.boardId,
                    })
                );
            }
        });
    }
}
