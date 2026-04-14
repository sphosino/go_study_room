//chat関連
export const chatInput = document.querySelector('#chat-message-input');
export const eButton = document.querySelector('#emoji-button');
export const imageInput = document.querySelector('#image-input');
export const chatform = document.querySelector('#chat-form');
export const chatSubmit = document.querySelector('#chat-message-submit');
export const chatLog = document.querySelector('#chat-log');

//ユーザーリスト関連（ロビー、ルーム共通)
export const userListContainer = document.querySelector('#user-list')
export const userListUpdate = document.querySelector('#user-list-update')

//ロビー関連
export const roomListUpdate = document.querySelector('#room-list-update')
export const roomList = document.querySelector('#room-list')
export const makeRoomModal = document.querySelector('#make-room-modal')
export const makeRoomSubmit = document.querySelector('#make-room-submit')
export const roomNameInput = document.querySelector('#room_name_input')
export const roomNotify = document.querySelector('#notify_on_create')

//ルーム関連
export const boardCanvas = document.querySelector("#board")
export const makeBoardModal = document.querySelector('#make-board-modal')
export const makeBoard = document.querySelector('#makeboard')
export const inputBoardX = document.querySelector('#input-boardx')
export const inputBoardY = document.querySelector('#input-boardy')
export const boardModeAlternatingButton = document.querySelector('#board-mode-alternating')
export const boardModeSetupBlackButton = document.querySelector('#board-mode-setup-black')
export const boardModeSetupWhiteButton = document.querySelector('#board-mode-setup-white')
export const boardUndoButton = document.querySelector('#board-undo')
export const boardModeLabel = document.querySelector('#board-mode-label')
export const toggle_muteAudioButton = document.querySelector('#myvoice-toggle')
export const remoteAudio = document.getElementById('remoteAudio');

//CSRFトークンの取得
export const csrftoken = document.querySelector('meta[name="csrf-token"]').getAttribute('content');

export function clearChatInput() {
    chatInput.value = '';
	imageInput.value = ''; 
}

export function focusChatInput() {
    chatInput.focus();
}
