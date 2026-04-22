//websocket.js
import logging_server_message from "./util/logging.js";
let websocket = null;
let autoReconnect = true;
const messageQueue = []

export async function initializeWebSocket(url){

    return new Promise((resolve, reject) =>{

        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        websocket = new WebSocket(
            protocol + '//' + window.location.host + "/ws/" + url + (url.endsWith("/") ? "" : "/")
        );

        websocket.onerror = (error) => {
            console.error('WebSocket error:', error);
            reject(); // エラー時はPromiseを拒否
        };
        
        websocket.onopen = () => {
            window.APP_DEBUG && console.log('WebSocket connection opened');
            resolve(websocket); // WebSocketの初期化が完了したらresolveを呼ぶ
        };
        websocket.onclose = (e) => {
            if (autoReconnect === false) {
                window.APP_DEBUG && console.warn('Not attempting to reconnect.');
                return
            }
            window.APP_DEBUG && console.log('WebSocket connection closed. Attempting to reconnect...');
            setTimeout(() => initializeWebSocket(url), 1000); // URLを保持しつつ1秒後に再接続
        };

        websocket.functions = {};

        //関数登録にはこれをつかってね。
        websocket.registerFunction = function(name, func) {
            if (websocket.functions[name]) {
                console.warn(`Function ${name} is already registered and will be overwritten.`);
            }
            websocket.functions[name] = func;
        };

        websocket.onmessage = (event) => {

            const message = JSON.parse(event.data);
            logging_server_message(message)

            if (websocket.functions[message.server_message_type]) {
                websocket.functions[message.server_message_type](message);
            } else {
                console.info(`No function found for ${message.server_message_type}`);
                messageQueue.push(message)
            }
        };
    })
}

// メッセージキューを処理する関数
export function processMessageQueue(){
    while (messageQueue.length > 0) {
        const message = messageQueue.shift(); // キューからメッセージを取得
        const handler = websocket.functions[message.server_message_type];
        if (handler) {
            handler(message); // 登録されている関数があれば呼び出す
        } else {
            console.error(`No function found for ${message.server_message_type}.`);
        }
    }
}

export function saveInitializedSocket(socket){
    websocket = socket
}

export function getSocket(){
    if(!websocket){
        console.error("ソケットが初期化されていないのに取得しようとしました、これは想定していません")
    }
    return websocket
}

export function setReconnect(enabled) {
    autoReconnect = enabled;
}