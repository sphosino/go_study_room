//userlist.js
import {getSocket} from "./websocket.js"
import { userListContainer as userlist_container, userListUpdate, chatLog} from "./elements.js";

const socket = await getSocket();
socket.registerFunction('user-list-update', (data)=>{user_list_update(data);})
socket.registerFunction('get-user-page',(data)=>{window.open(data.url);})
socket.registerFunction('leave', (data)=>{
	chatLog.innerHTML += (data.name + ' さんが退室しました<br>');
	user_list_update_socket(socket);
})
userListUpdate.onclick = ()=>{user_list_update_socket(socket)}
userlist_container.addEventListener('click',(event)=>{
	if (event.target.classList.contains('link-userlist')){
		event.preventDefault();
		socket.send(JSON.stringify({
			'client_message_type': 'get-user-page',
			'userid': event.target.dataset.userId
		}))
	}
})



export function user_list_update_socket(websocket){
	websocket.send(JSON.stringify({
		'client_message_type': 'user-list-update'
		})
	)
}
export function user_list_update(data_from_server){
	
	while(userlist_container.firstChild){
		userlist_container.removeChild(userlist_container.firstChild);
	}
	data_from_server.userlist.forEach((data)=>{
		const new_element = document.createElement('a');
		new_element.href = "#";

		new_element.classList.add("link-userlist");
		new_element.textContent = data[0];
		new_element.dataset.userId = data[1]
		userlist_container.appendChild(new_element);
	})
}


