/**
 * ボード管理クラス
 * 碁盤のライフサイクルと状態管理を統括
 */
export default class BoardManager {
    constructor() {
        this.boards = new Map(); // 碁盤IDごとに碁盤を管理するMap
        this.currentBoardId = null; // 現在操作対象の碁盤ID
    }

    /**
     * 新しい碁盤を追加
     */
    addBoard(boardId, goban) {
        this.boards.set(boardId, goban);
        this.currentBoardId = boardId;
        return goban;
    }

    /**
     * 碁盤を取得
     */
    getBoard(boardId) {
        if (!this.boards.has(boardId)) {
            console.warn(`碁盤ID ${boardId} が見つかりません`);
            return null;
        }
        return this.boards.get(boardId);
    }

    /**
     * 現在のボードを取得
     */
    getCurrentBoard() {
        return this.boards.get(this.currentBoardId);
    }

    /**
     * ボードのデータで同期
     */
    syncBoard(boardId, boardData) {
        const goban = this.getBoard(boardId);
        if (!goban) return;

        goban.board = boardData.board;
        goban.turn = boardData.turn;
        goban.koY = boardData.koY;
        goban.koX = boardData.koX;
        goban.koTurn = boardData.koTurn;
        goban.blackCaptureCount = boardData.black_capture;
        goban.whiteCaptureCount = boardData.white_capture;
        goban.revision = boardData.revision ?? 0;
    }

    /**
     * ボードの状態をスナップショット
     */
    snapshotBoardState(boardId) {
        const goban = this.getBoard(boardId);
        if (!goban) return null;

        return {
            board: structuredClone(goban.board),
            turn: goban.turn,
            koY: goban.koY,
            koX: goban.koX,
            koTurn: goban.koTurn,
            blackCaptureCount: goban.blackCaptureCount,
            whiteCaptureCount: goban.whiteCaptureCount,
        };
    }

    /**
     * ボードの状態を復元
     */
    restoreBoardState(boardId, state) {
        const goban = this.getBoard(boardId);
        if (!goban || !state) return;

        goban.board = state.board;
        goban.turn = state.turn;
        goban.koY = state.koY;
        goban.koX = state.koX;
        goban.koTurn = state.koTurn;
        goban.blackCaptureCount = state.blackCaptureCount;
        goban.whiteCaptureCount = state.whiteCaptureCount;
    }

    /**
     * マウスが乗っている交点を取得
     */
    getCurrentIntersection(boardId) {
        const goban = this.getBoard(boardId);
        if (!goban || !goban.onMouse) {
            return null;
        }
        if (!goban.isInBounds(goban.my, goban.mx)) {
            return null;
        }
        return { y: goban.my, x: goban.mx };
    }

    /**
     * ボードの盤面をクローン
     */
    cloneBoard(boardId) {
        const goban = this.getBoard(boardId);
        if (!goban) return null;
        return structuredClone(goban.board);
    }

    /**
     * すべてのボードを描画
     */
    drawAll() {
        this.boards.forEach((goban) => {
            goban.draw();
        });
    }
}
