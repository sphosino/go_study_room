//room.js
import { initializeWebSocket, processMessageQueue, saveInitializedSocket,setReconnect} from "./websocket.js";
import { chatLog, makeBoardModal, makeBoard, inputBoardX, inputBoardY,boardCanvas, remoteAudio, toggle_muteAudioButton, boardModeAlternatingButton, boardModeSetupBlackButton, boardModeSetupWhiteButton, boardModeRemoveStoneButton, boardModeRemoveGroupButton, boardUndoButton, boardModeLabel } from "./elements.js";
import GoBoard from "./goban/goban.js";



let goban; //碁盤用の変数
let boardMode = 'alternating';
const remoteCursors = {}; // ソケットIDごとにリモートカーソルを管理するオブジェクト
let iceCandidateQueue = []
let localStream
const boardModeLabels = {
    alternating: '交互着手',
    setup_black: '置き石 黒',
    setup_white: '置き石 白',
    remove_stone: '1個削除',
    remove_group: '連削除',
};
const boardModeButtons = {
    alternating: boardModeAlternatingButton,
    setup_black: boardModeSetupBlackButton,
    setup_white: boardModeSetupWhiteButton,
    remove_stone: boardModeRemoveStoneButton,
    remove_group: boardModeRemoveGroupButton,
};
toggle_muteAudioButton.addEventListener('click',() => {
    toggle_muteAudio(localStream);
})
function goban_sync(goban_data){
    console.log(goban_data)
    goban.board = goban_data.board
    goban.turn = goban_data.turn
    goban.koY = goban_data.koY
    goban.koX = goban_data.koX
    goban.koTurn = goban_data.koTurn
    goban.blackCaptureCount = goban_data.black_capture
    goban.whiteCaptureCount = goban_data.white_capture

    goban.revision = goban_data.revision ?? 0
}

function snapshotGobanState() {
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

function restoreGobanState(state) {
    goban.board = state.board;
    goban.turn = state.turn;
    goban.koY = state.koY;
    goban.koX = state.koX;
    goban.koTurn = state.koTurn;
    goban.blackCaptureCount = state.blackCaptureCount;
    goban.whiteCaptureCount = state.whiteCaptureCount;
}

function setBoardMode(mode) {
    boardMode = mode;

    if (boardModeLabel) {
        boardModeLabel.textContent = `現在のモード: ${boardModeLabels[mode] ?? mode}`;
    }

    for (const [buttonMode, button] of Object.entries(boardModeButtons)) {
        button?.classList.toggle('is-active', mode === buttonMode);
    }

    if (!goban) {
        return;
    }

    if (mode === 'setup_black') {
        goban.turn = GoBoard.BLACK;
    } else if (mode === 'setup_white') {
        goban.turn = GoBoard.WHITE;
    }
}

function sendBoardUpdate(socket, board, turn) {
    socket.send(JSON.stringify({
        'client_message_type':'update_board',
        'board': board,
        'turn' : turn,
        'id': goban.id,
        'revision': goban.revision,
    }));
}

function getCurrentIntersection() {
    if (!goban || !goban.onMouse) {
        return null;
    }
    if (!goban.isInBounds(goban.my, goban.mx)) {
        return null;
    }
    return { y: goban.my, x: goban.mx };
}

function cloneBoard() {
    return structuredClone(goban.board);
}

function handleAlternatingBoardClick(socket) {
    if (!getCurrentIntersection()) {
        return;
    }

    if (goban.canMove(goban.my, goban.mx, goban.turn)[0]) {
        const previousState = snapshotGobanState();
        goban.addStone(true, goban.turn);

        sendBoardUpdate(socket, goban.board, goban.turn);

        restoreGobanState(previousState);
    } else {
        console.log("そこには置けません")
    }
}

function handleSetupBoardClick(socket, stoneColor) {
    const point = getCurrentIntersection();
    if (!point) {
        return;
    }
    if (goban.board[point.y][point.x] !== GoBoard.EMPTY) {
        console.log("そこにはすでに石があります");
        return;
    }

    const nextBoard = cloneBoard();
    nextBoard[point.y][point.x] = stoneColor;
    sendBoardUpdate(socket, nextBoard, stoneColor);
}

function handleRemoveStoneClick(socket) {
    const point = getCurrentIntersection();
    if (!point) {
        return;
    }
    if (goban.board[point.y][point.x] === GoBoard.EMPTY) {
        console.log("そこには石がありません");
        return;
    }

    const nextBoard = cloneBoard();
    nextBoard[point.y][point.x] = GoBoard.EMPTY;
    sendBoardUpdate(socket, nextBoard, goban.turn);
}

function handleRemoveGroupClick(socket) {
    const point = getCurrentIntersection();
    if (!point) {
        return;
    }
    if (goban.board[point.y][point.x] === GoBoard.EMPTY) {
        console.log("そこには石がありません");
        return;
    }

    const nextBoard = cloneBoard();
    const connectedStones = goban.collectConnectedStones(point.y, point.x);
    for (const [y, x] of connectedStones) {
        nextBoard[y][x] = GoBoard.EMPTY;
    }
    sendBoardUpdate(socket, nextBoard, goban.turn);
}

const boardModeHandlers = {
    alternating: handleAlternatingBoardClick,
    setup_black: (socket) => handleSetupBoardClick(socket, GoBoard.BLACK),
    setup_white: (socket) => handleSetupBoardClick(socket, GoBoard.WHITE),
    remove_stone: handleRemoveStoneClick,
    remove_group: handleRemoveGroupClick,
};

function handleBoardClick(socket) {
    const handler = boardModeHandlers[boardMode];
    if (!handler) {
        console.log(`未対応の碁盤モードです: ${boardMode}`);
        return;
    }
    handler(socket);
}

function requestUndoBoard(socket) {
    if (!goban) {
        return;
    }

    socket.send(JSON.stringify({
        'client_message_type': 'undo_board',
        'id': goban.id,
        'revision': goban.revision,
    }));
}

initializeWebSocket("chat/" + window.roomid).then( async (socket) =>{
	saveInitializedSocket(socket); 
	const[chat_js,userlist_js] = await Promise.all([
		import("./chat.js"),
		import("./userlist.js")
	])
	//インポート完了
	console.log("import_complated")

	const chat_add = chat_js.chat_add
	const user_list_update_socket = userlist_js.user_list_update_socket

    setBoardMode(boardMode);

    const peerConnections = {}; // ソケットIDごとにRTCPeerConnectionを保持するオブジェクト
    const configuration = {
        iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { 
                urls: 'turn:openrelay.metered.ca:80',
                username: 'openrelayproject',
                credential: 'openrelayproject'
            },
            { 
                urls: 'turn:openrelay.metered.ca:443',
                username: 'openrelayproject',
                credential: 'openrelayproject'
            }
        ],
        iceTransportPolicy: 'all',
        iceCandidatePoolSize: 10,
        // ICE再接続の設定
        iceCheckMinInterval: 500,  // ICEチェックの最小間隔
        // 接続タイムアウトを長めに設定
        iceCheckingTimeout: 15000  // ICEチェックのタイムアウト
    };
    socket.registerFunction('your_socket_id',(data)=>{
        console.log(`自分のsocket_idを取得しました -> ${data.socket_id}`)
        window.socket_id = data.socket_id
    });
    socket.registerFunction('join',async(data)=>{
        console.log('joined -> ', data.sender)
        chat_add(chatLog, data.sender + ' さんが入室しました',"div")
        user_list_update_socket(socket);
        if (data.socket_id === window.socket_id) return;
        await createOffer(data.socket_id)
    })
    socket.registerFunction('make_go_board',(data)=>{
        console.log(`作るよ碁盤、このサイズ→:${data.y} ${data.x}`)
        const canvas = document.createElement('canvas')
        canvas.width = 640
        canvas.height = 480
        boardCanvas.appendChild(canvas)

        goban = new GoBoard(canvas.getContext("2d"),data.id,400,400,data.y,data.x,0,0);
        console.log(data);
        if (data.board){
            goban_sync(data);
        }
        let lastSendTime = 0;
        const interval = 30; // 30ミリ秒（1秒間に33回）に制限
        let is_inside = false;
        canvas.addEventListener('mousemove',(event)=>{
            const now = Date.now();
            if (now - lastSendTime <= interval) {
                return; // 間引き
            }
            lastSendTime = now;
            const rect = canvas.getBoundingClientRect();
            const x = event.clientX - rect.left;
            const y = event.clientY - rect.top;
            goban.checkOnMouse(y,x);
            const mpos = goban.getMousePosition_percentage(y,x);
            if (!mpos){
                if(is_inside){
                    is_inside = false;
                    mouseleaveHandler();
                }
                return;
            }
            const px = mpos[0];
            const py = mpos[1];
            is_inside = true;
            Object.entries(peerConnections).forEach(([socket_id, peerConnection])=>{
                console.log("mousemove - 接続中のID:", socket_id);
                const dataChannel = peerConnection.dataChannel__
                if(dataChannel){
                    if(dataChannel.readyState === 'open'){
                        dataChannel.send(JSON.stringify({
                            "message_type": "mousemove",
                            "x": px,
                            "y": py
                        }))
                    }
                }
            })
        })
        canvas.addEventListener('mouseleave', mouseleaveHandler)
        function mouseleaveHandler(){
            Object.entries(peerConnections).forEach(([socket_id, peerConnection])=>{
                console.log("mouseleave - 接続中のID:", socket_id);
                const dataChannel = peerConnection.dataChannel__
                if(dataChannel){
                    if(dataChannel.readyState === 'open'){
                        dataChannel.send(JSON.stringify({
                            "message_type": "mouseleave",
                        }))
                    }
                }
            })
        }
        canvas.addEventListener('click', () =>{
            handleBoardClick(socket);
        })
    });
    socket.registerFunction('place_stone',(data)=>{
        goban_sync(data)
    })
    socket.registerFunction('update_board',(data)=>{
        goban_sync(data)
    })
    socket.registerFunction('undo_board',(data)=>{
        goban_sync(data)
    })

    socket.registerFunction('p2pOffer', async (data)=>{
        console.log('オファーハンドラを呼びます')
        await handleOffer(data.socket_id, data.offer);
    })
    socket.registerFunction('p2pAnswer', async (data)=>{
        console.log('アンサーハンドラを呼びます')
        await handleAnswer(data.socket_id, data.answer);
    })
    socket.registerFunction('p2pIceCandidate', (data)=>{
        console.log('ICE候補ハンドラを呼びます')
        handleIceCandidate(data.socket_id, data.candidate)
    })
    socket.registerFunction('timeout', (data) => {
        setReconnect(false); // タイムアウトの場合は再接続しない
        chat_add(chatLog, "長時間操作がなかったため、接続を終了しました。再接続するにはページを更新してください。", "div");
    });
    makeBoardModal.addEventListener('close', () => {
        switch(makeBoardModal.returnValue){
            case 'make-board-submit':
                socket.send(JSON.stringify({
                    'client_message_type': "make_go_board",
                    'x': parseInt(inputBoardX.value),
                    'y': parseInt(inputBoardY.value)
                }));
            break;
            case 'make-board-cancel':
                console.log('make-board-cancel');
            break;
        }
    });
    makeBoard.onclick = ()=>{
        makeBoardModal.showModal();
    };

    for (const [mode, button] of Object.entries(boardModeButtons)) {
        button?.addEventListener('click', () => {
            setBoardMode(mode);
        });
    }
    boardUndoButton?.addEventListener('click', () => {
        requestUndoBoard(socket);
    });
    
    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        console.log("このブラウザはgetUserMediaをサポートしています");
    } else {
        console.error("このブラウザではgetUserMediaがサポートされていません");
    }
    
    // 音声ストリームを取得する非同期関数
    async function getAudioStream() {
        if (localStream){
            //すでに取得済み
            return;
        }
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            localStream = stream;
            console.log('音声ストリーム取得成功');
        } catch (error) {
            console.log('音声ストリーム取得失敗', error);
            throw error;  // エラーが発生した場合、例外を投げる
        }
    }
    //ピアにストリームを設定する関数。offerやanswerを作成する前に適用する必要があります。
    function setStream(peerConnection){
        localStream.getTracks().forEach(track => {
            peerConnection.addTrack(track, localStream);
        });
    }
    function createNewRTCPeerConnection(socketId){
        const peerConnection = new RTCPeerConnection(configuration);
        peerConnections[socketId] = peerConnection;

        peerConnection.ontrack = event =>{
            console.log('ontrack')
            remoteAudio.srcObject = event.streams[0];
        }
        peerConnection.onconnectionstatechange = event => {
            console.log('Current connection state:', peerConnection.connectionState)
            // 切断されたら、カーソルを削除
            if (peerConnection.connectionState === 'disconnected' || 
                peerConnection.connectionState === 'closed') {
                
                const cursor = remoteCursors[socketId];
                if (cursor) {
                    cursor.remove();
                    delete remoteCursors[socketId]; // 管理配列からも削除
                    console.log(`[${socketId}] のカーソルを削除しました`);
                }
            }
        };

        peerConnection.oniceconnectionstatechange = () => {
            const state = peerConnection.iceConnectionState;
            if (state === 'disconnected') {
                // succeeded状態のペアがある場合は切断を無視
                peerConnection.getStats().then(stats => {
                    let hasSucceededPair = false;
                    stats.forEach(report => {
                    if (report.type === 'candidate-pair' && 
                        report.state === 'succeeded') {
                        hasSucceededPair = true;
                    }
                    });
                    
                    if (hasSucceededPair) {
                    console.log('アクティブなICEペアが存在 - 切断を無視');
                    }
                });
            }
        };
        //ICE候補がすべて収集されたか
        peerConnection.onicegatheringstatechange = () => {
            console.log('ICE gathering state:', peerConnection.iceGatheringState);
        };
        // ICE候補のハンドリング
        peerConnection.onicecandidate = event => {
            if (event.candidate) {
                console.log('新しいICE候補:', event.candidate);
                socket.send(JSON.stringify({
                    'client_message_type': 'p2pIceCandidate',
                    'candidate': event.candidate,
                    'for': socketId
                }));
            }else{
                console.log("ICE候補の収集が完了しました。");
            }
        };

        return peerConnection
    }
    ////////////////////////////////////////オファー側////////////////////
    ////////////////////////////////////////
    async function createOffer(socketId) {
        console.log('called createOffer')
    
        await getAudioStream(); //音声通信できるか確認のため、先にストリームを取得しておく

        //ピア作成！
        const peerConnection = createNewRTCPeerConnection(socketId);
        //データチャンネルも作るよ
        const dataChannel = peerConnection.createDataChannel("mouseMove");
        peerConnection.dataChannel__ = dataChannel;
        setupDataChannel(dataChannel, socketId);

        //音声通信の準備。
        //ストリームをピアにセットしてからオファーを作成する必要があります
        setStream(peerConnection)
        //オファー作成
        const offer = await peerConnection.createOffer()
        //通信ルール確定
        await peerConnection.setLocalDescription(offer);
        
        //オファーを相手に送る
        console.log('sending offer ->', socketId)
        socket.send(JSON.stringify({
            'client_message_type': 'p2pOffer',
            'offer': peerConnection.localDescription,
            'for': socketId //オファーを出す相手
        }));
    }
    //オファーに対する返答を処理します！
    async function handleAnswer(socketId, answer) {
        console.log('アンサーハンドラが呼ばれました')
    
        const peerConnection = peerConnections[socketId]
        if(!peerConnection){
            //createofferしていない相手からのアンサーは受け取れないので、エラー
            console.log('予期しないアンサー', socketId)
            return;
        }
        console.log('Setting remote description...');

        //相手がオファーに対して、通信ルールを確定させたSDPを送ってきた。それをリモートSDPとしてセットする
        try {
            await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
            console.log('Setting remote description...completed');
        } catch (error) {
            console.error('Error setting remote description:', error);
        }
        
        while(iceCandidateQueue.length > 0){
            console.log('キュー内のice候補処理中-handleAnswer')
            const queue_candidate = iceCandidateQueue.shift()
            handleIceCandidate(queue_candidate[0],queue_candidate[1])
        }
    }
    ////////////////////////////////////
    ///////アンサー側////////////////////
    ////////////////////////////////////
    async function handleOffer(socketId, offer) {
        console.log('オファーハンドラが呼ばれました sender', socketId)
        //オファーが来たらすぐにピアコネクションを登録して、次に来るICEこうほに対して準備
        const peerConnection = createNewRTCPeerConnection(socketId);
        peerConnection.ondatachannel = event =>{
            console.log("データチャンネル開通（アンサー側）")
            peerConnection.dataChannel__ = event.channel;
            setupDataChannel(event.channel,socketId);
        };
        // 受信したオファーをリモートSDPとしてセット
        console.log("before setRemoteDescription")
        await peerConnection.setRemoteDescription(new RTCSessionDescription(offer))
        console.log("setRemoteDescription complated")
        while(iceCandidateQueue.length >= 1){
            console.log('キュー内のice候補処理中-handelOffer')
            const queue_candidate = iceCandidateQueue.shift()
            handleIceCandidate(queue_candidate[0],queue_candidate[1])
        }
        //ストリームを取得
        await getAudioStream();
        setStream(peerConnection)
        const answer = await peerConnection.createAnswer()
        await peerConnection.setLocalDescription(answer)

        console.log('sendding answer -> ', socketId)
        socket.send(JSON.stringify({
            'client_message_type': 'p2pAnswer',
            'answer': peerConnection.localDescription,
            'for': socketId, //answerを返す相手
        }));

    }
    function handleIceCandidate(socketId, candidate) {
        console.log('ICE候補ハンドラが呼ばれました')
        const peerConnection = peerConnections[socketId];
    
        if (peerConnection.signalingState === 'stable'){
            peerConnection.addIceCandidate(new RTCIceCandidate(candidate))
                .then(() => {
                    console.log(`ICE candidate added for socket ${socketId}`);
                })
                .catch(error => {
                    console.error("Error adding ICE candidate:", error);
                });
        }else{
            iceCandidateQueue.push([socketId,candidate])
        }
    }

    processMessageQueue();
})


function setupDataChannel(channel, socketId){
    channel.onopen = () => {console.log("Data channel opened with socket:", socketId)};
    channel.onmessage = (event) => {
        try {
            const data = JSON.parse(event.data);
            switch(data.message_type){
                case 'mousemove':
                    // 相手のマウス位置を動かす共通処理
                    updateRemoteCursor(socketId, data.y, data.x);
                break;
                case 'mouseleave':
                    // 相手がマウスを碁盤から離れたときにカーソルを隠す
                    hideRemoteCursor(socketId);
                break;
                default:
                    console.log("不明なメッセージタイプ:", data.message_type);
            }
        } catch (e) {
            console.error("メッセージ解析エラー", e);
        }
    };
    channel.onclose = () => {console.log("Data channel closed with socket:", socketId)};
}
function stringToColor(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    // HSL(色相, 彩度, 輝度)
    const h = Math.abs(hash) % 360;
    return `hsla(${h}, 70%, 50%, 0.8)`;
}
function updateRemoteCursor(socketId, percentageY, percentageX) {
    let cursor = remoteCursors[socketId];

    // まだその相手のカーソルがなければ作成
    if (!cursor) {
        cursor = document.createElement('div');
        cursor.id = `cursor-${socketId}`;
        cursor.className = 'remote-cursor';
        cursor.style.backgroundColor = stringToColor(socketId);
        boardCanvas.appendChild(cursor);
        remoteCursors[socketId] = cursor;
        console.log(`[${socketId}] のカーソルを作成しました`);
    }
    // ★重要：届いた「割合（%）」を、自分の碁盤サイズ（px）に逆算
    // 碁盤のインスタンス（goban）から、現在のサイズと位置を取得
    const actualX = percentageX * goban.sizex + goban.px;
    const actualY = percentageY * goban.sizey + goban.py;
    const offsetX = cursor.offsetWidth / 2;
    const offsetY = cursor.offsetHeight / 2;
    const transformValue = `translate(${actualX - offsetX}px, ${actualY - offsetY}px)`;
    
    if(cursor.style.visibility === "hidden"){
        cursor.style.transition = "none";
        cursor.style.transform = transformValue;
        cursor.style.visibility = "visible";

        // ブラウザに「今の状態」を強制的に認識させる（リフローのトリガー）
        // これをしないと、transition: none と後の設定が同時に処理されてアニメーションが消えません
        void cursor.offsetHeight; 

        // 次のフレームで通常のトランジションに戻す
        cursor.style.transition = "";
    }else{
        cursor.style.transform = transformValue;
    }
}
function removeRemoteCursor(socketId) {
    const cursor = remoteCursors[socketId]; 
    if (cursor) {
        cursor.remove();
        delete remoteCursors[socketId];
    }
}
function hideRemoteCursor(socketId) {
    const cursor = remoteCursors[socketId];
    if (cursor) {
        cursor.style.visibility = "hidden";
    }
}

function toggle_muteAudio(stream) {
    const audioTrack = stream.getAudioTracks()[0]
    audioTrack.enabled = !audioTrack.enabled
    const value = audioTrack.enabled ? "音声が再開されました" : "音声がミュートされました"
    console.log(value)
    toggle_muteAudioButton.textContent = value
}

function mainloop(){
    if(goban){
        goban.draw();
    }
    requestAnimationFrame(mainloop)
}

mainloop();
