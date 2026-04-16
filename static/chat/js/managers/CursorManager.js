/**
 * リモートカーソル管理クラス
 * 他のユーザーのマウスカーソル表示を管理
 */
export default class CursorManager {
    constructor(boardCanvas) {
        this.remoteCursors = {}; // ソケットIDごとにリモートカーソルを管理
        this.boardCanvas = boardCanvas;
    }

    /**
     * 文字列からハッシュ色を生成
     */
    static stringToColor(str) {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            hash = str.charCodeAt(i) + ((hash << 5) - hash);
        }
        const h = Math.abs(hash) % 360;
        return `hsla(${h}, 70%, 50%, 0.8)`;
    }

    /**
     * リモートカーソルを更新
     * @param {string} socketId - ソケットID
     * @param {number} percentageY - Y座標（パーセンテージ）
     * @param {number} percentageX - X座標（パーセンテージ）
     * @param {number} boardId - 碁盤ID
     * @param {BoardManager} boardManager - ボード管理インスタンス
     */
    updateCursor(socketId, percentageY, percentageX, boardId, boardManager) {
        let cursor = this.remoteCursors[socketId];

        // カーソルが存在しない場合は作成
        if (!cursor) {
            cursor = this._createCursor(socketId);
            this.remoteCursors[socketId] = cursor;
        }

        const goban = boardManager.getBoard(boardId);
        if (!goban) {
            console.warn(`碁盤ID ${boardId} が見つかりません`);
            return;
        }

        // キャンバスのオフセットを取得
        const canvasOffset = this._getCanvasOffset(goban);
        const actualX = percentageX * goban.sizex + goban.px + canvasOffset.x;
        const actualY = percentageY * goban.sizey + goban.py + canvasOffset.y;

        this._animateCursor(cursor, actualX, actualY);
    }

    /**
     * カーソルを作成
     * @private
     */
    _createCursor(socketId) {
        const cursor = document.createElement('div');
        cursor.id = `cursor-${socketId}`;
        cursor.className = 'remote-cursor';
        cursor.style.backgroundColor = CursorManager.stringToColor(socketId);
        this.boardCanvas.appendChild(cursor);
        console.log(`[${socketId}] のカーソルを作成しました`);
        return cursor;
    }

    /**
     * キャンバスのオフセットを取得
     * @private
     */
    _getCanvasOffset(goban) {
        if (!goban.canvas) {
            return { x: 0, y: 0 };
        }
        return {
            x: goban.canvas.offsetLeft,
            y: goban.canvas.offsetTop,
        };
    }

    /**
     * カーソルをアニメーション
     * @private
     */
    _animateCursor(cursor, actualX, actualY) {
        const offsetX = cursor.offsetWidth / 2;
        const offsetY = cursor.offsetHeight / 2;
        const transformValue = `translate(${actualX - offsetX}px, ${actualY - offsetY}px)`;

        if (cursor.style.visibility === 'hidden') {
            cursor.style.transition = 'none';
            cursor.style.transform = transformValue;
            cursor.style.visibility = 'visible';
            // リフロートリガー
            void cursor.offsetHeight;
            cursor.style.transition = '';
        } else {
            cursor.style.transform = transformValue;
        }
    }

    /**
     * カーソルを非表示にする
     */
    hideCursor(socketId) {
        const cursor = this.remoteCursors[socketId];
        if (cursor) {
            cursor.style.visibility = 'hidden';
        }
    }

    /**
     * カーソルを削除
     */
    removeCursor(socketId) {
        const cursor = this.remoteCursors[socketId];
        if (cursor) {
            cursor.remove();
            delete this.remoteCursors[socketId];
            console.log(`[${socketId}] のカーソルを削除しました`);
        }
    }

    /**
     * すべてのカーソルを削除
     */
    removeAllCursors() {
        Object.keys(this.remoteCursors).forEach((socketId) => {
            this.removeCursor(socketId);
        });
    }
}
