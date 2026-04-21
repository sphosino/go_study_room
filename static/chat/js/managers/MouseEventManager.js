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
        this.supportsPointerEvents = typeof window !== 'undefined' && 'PointerEvent' in window;
    }

    /**
     * マウスムーブイベントのハンドラ
     */
    onMouseMove = (event) => {
        this._handleMove(event);
    };

    /**
     * ポインタムーブイベントのハンドラ
     */
    onPointerMove = (event) => {
        if (!event.isPrimary) {
            return;
        }
        this._handleMove(event);
    };

    /**
     * タッチムーブイベントのハンドラ
     */
    onTouchMove = (event) => {
        if (event.cancelable) {
            event.preventDefault();
        }
        this._handleMove(event);
    };

    _handleMove(event) {
        const now = Date.now();
        if (now - this.lastSendTime <= this.sendInterval) {
            return; // 間引き
        }
        this.lastSendTime = now;

        const position = this._getEventPosition(event);
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
    }

    /**
     * マウスリーブイベントのハンドラ
     */
    onMouseLeave = () => {
        this.isInside = false;
        this._sendMouseLeave();
    };

    onPointerLeave = (event) => {
        if (!event.isPrimary) {
            return;
        }
        this.isInside = false;
        this._sendMouseLeave();
    };

    onTouchEndOrCancel = () => {
        this.isInside = false;
        this._sendMouseLeave();
    };

    /**
     * クリックイベントのハンドラを設定
     */
    setClickHandler(clickCallback) {
        if (this.supportsPointerEvents) {
            this.canvas.addEventListener('pointerup', (event) => {
                if (!event.isPrimary) {
                    return;
                }
                clickCallback(this.boardId);
            });
            return;
        }

        this.canvas.addEventListener('click', () => {
            clickCallback(this.boardId);
        });
        this.canvas.addEventListener('touchend', () => {
            clickCallback(this.boardId);
        }, { passive: true });
    }

    /**
     * イベントリスナーを登録
     */
    attachListeners() {
        if (this.supportsPointerEvents) {
            this.canvas.addEventListener('pointermove', this.onPointerMove);
            this.canvas.addEventListener('pointerleave', this.onPointerLeave);
            this.canvas.addEventListener('pointercancel', this.onPointerLeave);
            return;
        }

        this.canvas.addEventListener('mousemove', this.onMouseMove);
        this.canvas.addEventListener('mouseleave', this.onMouseLeave);
        this.canvas.addEventListener('touchmove', this.onTouchMove, { passive: false });
        this.canvas.addEventListener('touchend', this.onTouchEndOrCancel, { passive: true });
        this.canvas.addEventListener('touchcancel', this.onTouchEndOrCancel, { passive: true });
    }

    /**
     * マウス位置を取得（キャンバス座標系）
     * @private
     */
    _getEventPosition(event) {
        const point = this._extractClientPoint(event);
        if (!point) {
            this.goban.onMouse = false;
            return { x: -1, y: -1 };
        }

        const rect = this.canvas.getBoundingClientRect();
        const scaleX = this.canvas.width / rect.width;
        const scaleY = this.canvas.height / rect.height;
        const x = (point.clientX - rect.left) * scaleX;
        const y = (point.clientY - rect.top) * scaleY;

        this.goban.checkOnMouse(y, x);
        return { x, y };
    }

    _extractClientPoint(event) {
        if (typeof event.clientX === 'number' && typeof event.clientY === 'number') {
            return { clientX: event.clientX, clientY: event.clientY };
        }

        if (event.touches && event.touches.length > 0) {
            return {
                clientX: event.touches[0].clientX,
                clientY: event.touches[0].clientY,
            };
        }

        if (event.changedTouches && event.changedTouches.length > 0) {
            return {
                clientX: event.changedTouches[0].clientX,
                clientY: event.changedTouches[0].clientY,
            };
        }

        return null;
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
