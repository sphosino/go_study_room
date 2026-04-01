export default class GoBoard{
    static DIRECTIONS_Y = [0, -1, 0, 1];
    static DIRECTIONS_X = [1, 0, -1, 0];
    static EMPTY = 0;
    static BLACK = 1;
    static WHITE = 2;

    constructor(ctx, id, sizex, sizey, y, x, py = 0, px = 0) {
        this.ctx = ctx;
        this.id = id;
        this.py = py; // キャンバス上の表示位置Y
        this.px = px; // キャンバス上の表示位置X
        this.changeBoardSize(sizex, sizey, y, x);
        this.turn = GoBoard.BLACK;
        this.onMouse = false;
        this.board = Array.from({ length: this.y }, () => Array(this.x).fill(GoBoard.EMPTY));
        this.koTurn = -1;
        this.koY = -1;
        this.koX = -1;
		this.my = -1;
		this.mx = -1;
        this.blackCaptureCount = 0
        this.whiteCaptureCount = 0
    }

    changeBoardSize(sizey = this.sizey, sizex = this.sizex, y = this.y, x = this.x) {
        this.sizey = sizey;
        this.sizex = sizex;
        this.y = y;
        this.x = x;
        this.masy = this.sizey / this.y;
        this.masx = this.sizex / this.x;
    }

    checkOnMouse(mouseY, mouseX) {
        this.my = Math.floor((mouseY - this.py) / this.masy);
        this.mx = Math.floor((mouseX - this.px) / this.masx);
        this.onMouse = (this.my >= 0 && this.mx >= 0 && this.my < this.y && this.mx < this.x);
    }
    getMousePosition_percentage(mousey, mousex) {
        if (!this.onMouse) return [0, 0];
        const y = (mousey - this.py) / this.sizey;
        const x = (mousex - this.px) / this.sizex;
        return [x,y];
    }

    isInBounds(y, x) {
        return y >= 0 && x >= 0 && y < this.y && x < this.x;
    }

    checkKakomare(y, x, turn) {
        const stacky = [y];
        const stackx = [x];
        const visited = Array.from({ length: this.y }, () => Array(this.x).fill(false));
        const result = [];

        while (stackx.length > 0) {
            const ny = stacky.pop();
            const nx = stackx.pop();
			visited[ny][nx] = true;
            result.push([ny, nx]);

            // 4方向に探索
            for (let i = 0; i < 4; i++) {
                const nexty = ny + GoBoard.DIRECTIONS_Y[i];
                const nextx = nx + GoBoard.DIRECTIONS_X[i];

                if (this.isInBounds(nexty, nextx) && !visited[nexty][nextx]) {
                    if (this.board[nexty][nextx] === GoBoard.EMPTY) {
                        return []; // 空のマスがあれば囲まれていない
                    }
                    if (this.board[nexty][nextx] === turn) {
                        stacky.push(nexty);
                        stackx.push(nextx);
                    }
                }
            }
        }
        return result;
    }

    checkKakomi(y, x, turn) {
        if (this.board[y][x] != GoBoard.EMPTY) return [];

        this.board[y][x] = turn; // 一時的に自分(turn)の石を置いておく

        const captures = [];

        // 自分が石を置くことで四方向の相手を囲むことができるか確認
        for (let i = 0; i < 4; i++) {
            const nexty = y + GoBoard.DIRECTIONS_Y[i];
            const nextx = x + GoBoard.DIRECTIONS_X[i];
            if (this.isInBounds(nexty, nextx) && this.board[nexty][nextx] == this.getOpponentTurn(turn)) {
                captures.push(
                    ...this.checkKakomare(
                        nexty, nextx, this.getOpponentTurn(turn)
                    )
                );
            }
        }

        this.board[y][x] = GoBoard.EMPTY; // 最初に仮に置いた地点をクリア
        return captures;
    }


    canMove(y, x, turn) {
        if (y === this.koY && x === this.koX && turn === this.turn) {
            return [false, []]; // コウ禁止点
        }
        if (this.board[y][x] !== GoBoard.EMPTY) {
            return [false, []]; // すでに石がある
        }
        const captures = this.checkKakomi(y, x, turn);
        if (captures.length >= 1) {
            return [true, captures]; // 着手可能（相手の石が取れる）
        }
        if (this.checkKakomare(y, x, turn).length >= 1){
            return [false, []]; // 自分が囲まれている
        }
        return [true, []]; //着手可能
    }


    addStone(change = true, turn = this.turn) {
        const [canMove, captures] = this.canMove(this.my, this.mx, turn);
        if (canMove) {
            this.board[this.my][this.mx] = turn;
            let capturedCount = 0;
            for (const [y, x] of captures) {
                if (this.board[y][x] !== GoBoard.EMPTY) {
                    this.board[y][x] = GoBoard.EMPTY;
                    capturedCount++;
                }
            }

            if(this.turn === GoBoard.BLACK){
                this.blackCaptureCount += capturedCount
            }else{
                this.whiteCaptureCount += capturedCount
            }

			//着手後コウ地点の更新を開始
            this.koTurn = this.koX = this.koY = -1

            // １個取った時、次に今取った場所に打ち返すと１個とれるなら、そこはコウ
			if (capturedCount === 1) {
                const koCapture = this.checkKakomi(captures[0][0], captures[0][1], this.getOpponentTurn(turn));
                if (koCapture.length === 1) {
                    this.koY = captures[0][1];
                    this.koX = captures[0][0];
                    this.koTurn = this.getOpponentTurn(turn)
                }
            }
			
            if (change) this.switchTurn(turn);
        }
    }

    switchTurn(turn = this.turn) {
        this.turn = this.getOpponentTurn(turn);
    }

    getOpponentTurn(turn = this.turn) {
        return (turn === GoBoard.BLACK) ? GoBoard.WHITE : GoBoard.BLACK;
    }

    draw() {
        // 碁盤全体
        this.ctx.fillStyle = "#FFA500";
        this.ctx.fillRect(
            this.px,
            this.py,
            this.x * this.masx,
            this.y * this.masy,
        );

        // 碁盤の線
        this.ctx.strokeStyle = "#000000";
        this.ctx.lineWidth = 2;

        for (let i = 0; i < this.x; i++) {
            this.drawLine(
                this.px + this.masx / 2 + i * this.masx,
                this.py + this.masy / 2,
                this.px + this.masx / 2 + i * this.masx,
                this.py + this.masy / 2 + (this.y - 1) * this.masy
            );
        }
        for (let i = 0; i < this.y; i++) {
            this.drawLine(
                this.px + this.masx / 2,
                this.py + this.masy / 2 + i * this.masy,
                this.px + this.masx / 2 + (this.x - 1) * this.masx,
                this.py + this.masy / 2 + i * this.masy
            );
        }

        // 碁石
        const colors = ["", "rgb(0,0,0)", "rgb(240,240,240)"];

        for (let j = 0; j < this.y; j++) {
            for (let i = 0; i < this.x; i++) {
                if (this.board[j][i] !== GoBoard.EMPTY) {
                    this.ctx.fillStyle = colors[this.board[j][i]];
                    this.drawEllipse(
                        this.px + i * this.masx + this.masx / 2,
                        this.py + j * this.masy + this.masy / 2,
                        this.masx / 2,
						this.masy / 2
                    );
                }
            }
        }

        // コウ地点
        if (this.koTurn !== -1) {
            this.ctx.fillStyle = "#FF0000A0";
            this.drawEllipse(
                this.px + this.koX * this.masx + this.masx / 2,
                this.py + this.koY * this.masy + this.masy / 2,
                this.masx / 5,
				this.masy / 5
            );
        }

        // オーバーマウス地点
        if (this.onMouse && this.board[this.my][this.mx] === GoBoard.EMPTY) {
            const hoverColors = ["", "rgba(0,0,0,0.3)", "rgba(240,240,240,0.3)"];
            this.ctx.fillStyle = hoverColors[this.turn];
            this.drawEllipse(
                this.px + this.mx * this.masx + this.masx / 2,
                this.py + this.my * this.masy + this.masy / 2,
                this.masx / 2,
				this.masy / 2
            );
        }
    }

    drawLine(x1, y1, x2, y2) {
        this.ctx.beginPath();
        this.ctx.moveTo(x1, y1);
        this.ctx.lineTo(x2, y2);
        this.ctx.stroke();
    }

	drawEllipse(x, y, radiusX, radiusY) {
		this.ctx.beginPath();
		this.ctx.ellipse(x, y, radiusX, radiusY, 0, 0, 2*Math.PI)
		this.ctx.fill();
	}
}