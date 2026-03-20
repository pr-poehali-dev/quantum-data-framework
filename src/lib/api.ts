const AUTH_URL = 'https://functions.poehali.dev/1fc1a390-e2e3-42a6-821c-5f3dd2260451';
const MESSAGES_URL = 'https://functions.poehali.dev/0832b8a5-6964-4ea4-8a01-bae090f6c457';
const VOICE_URL = 'https://functions.poehali.dev/add7e178-dfab-42e1-85ed-2977aff24f2b';

function getToken() {
  return localStorage.getItem('kisrod_token') || '';
}

async function request(baseUrl: string, action: string, method = 'GET', body?: object, extraParams?: string) {
  const url = `${baseUrl}?action=${action}${extraParams ? '&' + extraParams : ''}`;
  try {
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json', 'X-Session-Token': getToken() },
      body: method !== 'GET' && body ? JSON.stringify(body) : undefined,
    });
    return res.json();
  } catch {
    return { error: 'Нет соединения с сервером.' };
  }
}

export const api = {
  register: (data: { username: string; display_name: string; password: string }) =>
    request(AUTH_URL, 'register', 'POST', data),
  login: (data: { username: string; password: string }) =>
    request(AUTH_URL, 'login', 'POST', data),
  logout: () => request(AUTH_URL, 'logout', 'POST'),
  me: () => request(AUTH_URL, 'me', 'GET'),
  updateProfile: (data: object) => request(AUTH_URL, 'profile', 'PUT', data),
  getRoles: () => request(AUTH_URL, 'roles', 'GET'),

  getChannels: () => request(MESSAGES_URL, 'channels', 'GET'),
  getChats: () => request(MESSAGES_URL, 'chats', 'GET'),
  getMessages: (chat_id: number) => request(MESSAGES_URL, 'messages', 'GET', undefined, `chat_id=${chat_id}`),
  sendMessage: (chat_id: number, content: string) => request(MESSAGES_URL, 'send', 'POST', { chat_id, content }),
  startChat: (username: string) => request(MESSAGES_URL, 'start-chat', 'POST', { username }),
  searchUsers: (q: string) => request(MESSAGES_URL, 'users', 'GET', undefined, `q=${encodeURIComponent(q)}`),

  getVoiceRooms: () => request(VOICE_URL, 'rooms', 'GET'),
  joinVoice: (room_id: number) => request(VOICE_URL, 'join', 'POST', { room_id }),
  leaveVoice: () => request(VOICE_URL, 'leave', 'POST'),
};
