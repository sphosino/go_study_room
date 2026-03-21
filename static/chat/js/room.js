//room.js
import { initializeWebSocket, processMessageQueue, saveInitializedSocket,setReconnect} from "./websocket.js";
import { chatLog, makeBoardModal, makeBoard, inputBoardX, inputBoardY,boardCanvas, remoteAudio, toggle_muteAudioButton} from "./elements.js";
import GoBoard from "./goban/goban.js";



let goban; //碁盤用の変数
let iceCandidateQueue = []
let localStream
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

    const peerConnections = {}; // アカウントIDごとにRTCPeerConnectionを保持するオブジェクト
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
    socket.registerFunction('your_account_id',(data)=>{
        window.account_id = data.account_id
    });
    socket.registerFunction('join',async(data)=>{
        console.log('joined -> ', data.name)
        chat_add(chatLog, data.name + ' さんが入室しました',"div")
        user_list_update_socket(socket);
        if (data.name === window.account_id) return;
        await createOffer(data.name)
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

        canvas.addEventListener('mousemove',(event)=>{
            const rect = canvas.getBoundingClientRect();
            goban.checkOnMouse(
                event.clientY - rect.top, // Canvas内のY座標
                event.clientX - rect.left // Canvas内のX座標
            );
            Object.entries(peerConnections).forEach((key)=>{
                console.log("A", key[0])
                const dataChannel = key[1]["dataChannel__"]
                if(dataChannel){
                    console.log("B")
                    if(dataChannel.readyState === 'open'){
                        dataChannel.send(JSON.stringify({
                            "x": event.clientY - rect.top,
                            "y": event.clientY - rect.left
                        }))
                        console.log("QQQQQQQQQQ")
                    }
                }
            })
        })
        canvas.addEventListener('click', () =>{
            if(goban.canMove(goban.my,goban.mx,goban.turn)[0]){
                socket.send(JSON.stringify({
                    'client_message_type':'place_stone',
                    'x' : goban.mx,
                    'y' : goban.my,
                    'turn' : goban.turn,
                    'id': goban.id
                }))
            }else{
                console.log("そこには置けません")
            }
        })
    });
    socket.registerFunction('place_stone',(data)=>{
        goban_sync(data)
    })

    socket.registerFunction('p2pOffer', async (data)=>{
        console.log('オファーハンドラを呼びます')
        await handleOffer(data.sender, data.offer);
    })
    socket.registerFunction('p2pAnswer', async (data)=>{
        console.log('アンサーハンドラを呼びます')
        await handleAnswer(data.sender, data.answer);
    })
    socket.registerFunction('p2pIceCandidate', (data)=>{
        console.log('ICE候補ハンドラを呼びます')
        handleIceCandidate(data.sender, data.candidate)
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
                Object.entries(peerConnections).forEach( async (key)=>{
                    await createOfferWithDataChannel(key[0])
                })
            break;
            case 'make-board-cancel':
                console.log('make-board-cancel');
            break;
        }
    });
    makeBoard.onclick = ()=>{
        makeBoardModal.showModal();
    };
    
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
    function createNewRTCPeerConnection(accountId){
        const peerConnection = new RTCPeerConnection(configuration);
        peerConnections[accountId] = peerConnection;

        peerConnection.ontrack = event =>{
            console.log('ontrack')
            remoteAudio.srcObject = event.streams[0];
        }
        peerConnection.onconnectionstatechange = event => {
            console.log('Current connection state:', peerConnection.connectionState)
        };
        // ICE接続状態の変化をより寛容に処理
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
                    'for': accountId
                }));
            }else{
                console.log("ICE候補の収集が完了しました。");
            }
        };
        peerConnection.ondatachannel = event =>{
            console.log("C")
              // ここでデータチャネルを受け取る
            const dataChannel = event.channel;
            peerConnection["dataChannel__"] = dataChannel

              // データチャネルのイベントを設定
            dataChannel.onopen = () => {
                console.log('Data channel is open');
            };

            dataChannel.onmessage = (event) => {
                console.log('Received message:', event.data);
            };

            dataChannel.onclose = () => {
                console.log('Data channel is closed');
            };
        };
        return peerConnection
    }
    async function createOffer(accountId) {
        console.log('called createOffer')
    
        await getAudioStream();
    
        const peerConnection = createNewRTCPeerConnection(accountId);

        setStream(peerConnection)
        const offer = await peerConnection.createOffer()
        await peerConnection.setLocalDescription(offer);
                
        console.log('sending offer ->', accountId)
        socket.send(JSON.stringify({
            'client_message_type': 'p2pOffer',
            'offer': peerConnection.localDescription,
            'for': accountId //オファーを出す相手
        }));
    }
    async function handleAnswer(accountId, answer) {
        console.log('アンサーハンドラが呼ばれました')
    
        const peerConnection = peerConnections[accountId]
        if(!peerConnection){
            console.log('予期しないアンサー', accountId)
            return;
        }
        console.log('Setting remote description...');

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
    async function handleOffer(accountId, offer) {
        console.log('オファーハンドラが呼ばれました sender', accountId)
        //オファーが来たらすぐにピアコネクションを登録して、次に来るICEこうほに対して準備
        const peerConnection = createNewRTCPeerConnection(accountId);
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

        console.log('sendding answer -> ', accountId)
        socket.send(JSON.stringify({
            'client_message_type': 'p2pAnswer',
            'answer': peerConnection.localDescription,
            'for': accountId, //answerを返す相手
        }));

    }
    function handleIceCandidate(accountId, candidate) {
        console.log('ICE候補ハンドラが呼ばれました')
        const peerConnection = peerConnections[accountId];
    
        if (peerConnection.signalingState === 'stable'){
            peerConnection.addIceCandidate(new RTCIceCandidate(candidate))
                .then(() => {
                    console.log(`ICE candidate added for account ${accountId}`);
                })
                .catch(error => {
                    console.error("Error adding ICE candidate:", error);
                });
        }else{
            iceCandidateQueue.push([accountId,candidate])
        }
    }
    async function createOfferWithDataChannel(accountId) {
        console.log("データチャンネルを作るよ")
        if (!peerConnections[accountId]) {
            await getAudioStream();
            setStream(createNewRTCPeerConnection(accountId))
        }
        const peerConnection = peerConnections[accountId]
        // 1. データチャネルを作成
        const dataChannel = peerConnection.createDataChannel("myDataChannel");
        dataChannel.onmessage = (event) =>{
            console.log(event.data)
        }
        peerConnection["dataChannel__"] = dataChannel
        // 2. オファーを生成
        const offer = await peerConnection.createOffer();
      
        // 3. ローカルのSDPにオファーを設定
        await peerConnection.setLocalDescription(offer);
      
        // 4. オファーを相手に送信
        sendOfferToRemote(accountId,peerConnection);  
    }
    function sendOfferToRemote(accountId,peerConnection){
        console.log('@@@sending offer ->', accountId)
        socket.send(JSON.stringify({
            'client_message_type': 'p2pOffer',
            'offer': peerConnection.localDescription,
            'for': accountId //オファーを出す相手
        }));
    }
    processMessageQueue();
})

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