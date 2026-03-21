//lobby.js
import { initializeWebSocket, processMessageQueue, saveInitializedSocket, setReconnect} from "./websocket.js";
import { chatLog, roomListUpdate, roomList, roomNameInput, roomNotify, makeRoomModal , makeRoomSubmit} from "./elements.js";

initializeWebSocket("chat/lobby").then( async (socket) =>{
	saveInitializedSocket(socket); 
	const[chat_js,userlist_js] = await Promise.all([
		import("./chat.js"),
		import("./userlist.js")
	])
	//インポート完了
	console.log("import_complated")

	const chat_add = chat_js.chat_add
	const user_list_update_socket = userlist_js.user_list_update_socket
	socket.registerFunction('join',(data)=>{
        console.log('joined -> ', data.name)
        chat_add(chatLog, data.name + ' さんが入室しました',"div")
        user_list_update_socket(socket);
    })
	socket.registerFunction('get_lobby_id', (data)=>{
		window.roomid = data.result
		console.log(`ロビーのroomidを取得しました -> ${window.roomid}`)
	})
	socket.registerFunction('your_account_id', (data)=>{
		window.userId = data.account_id
	})
	socket.registerFunction('make_room',(data) =>{roomListUpdate.onclick()})
	socket.registerFunction('room-list-update',(data)=>{
		console.log(data);
		while(roomList.firstChild){
			roomList.removeChild(roomList.firstChild);
		}
		for(let[key,value] of Object.entries(data.roomlist)){
			let new_element = document.createElement('a');
			new_element.href = window.location.origin + '/chat/' + value
			new_element.textContent = "" + value + ":" + key;
			roomList.appendChild(new_element);
			roomList.appendChild(document.createElement('br'));
		}
	})
	roomListUpdate.onclick = ()=>{room_list_update_socket(socket)}
	makeRoomSubmit.onclick = function(e) {
		makeRoomModal.showModal();
	};
	socket.registerFunction('timeout', (data) => {
		setReconnect(false); // タイムアウトの場合は再接続しない
		chat_add(chatLog, "長時間操作がなかったため、接続を終了しました。再接続するにはページを更新してください。", "div");
		if (makeRoomModal.open) {
			makeRoomModal.close();
		}
	});
	makeRoomModal.addEventListener('close', () => {
		switch(makeRoomModal.returnValue){
			case 'make-room-submit':
				socket.send(JSON.stringify({
					'client_message_type': 'make_room',
					'room_name': roomNameInput.value,
					'notify':roomNotify.checked
				}));
			break;
			case 'make-room-cancel':
				console.log('make-room-cancel');
			break;
		}
	});

	function room_list_update_socket(websocket){
		if (websocket){
			websocket.send(JSON.stringify({
				'client_message_type': 'room-list-update'
			}));
		}
	}
	socket.send(JSON.stringify({
		'client_message_type': 'get_lobby_id'
	}))
	room_list_update_socket(socket);
	processMessageQueue();
})

