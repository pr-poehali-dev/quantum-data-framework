const AUTH_URL = 'https://functions.poehali.dev/1fc1a390-e2e3-42a6-821c-5f3dd2260451';
const MESSAGES_URL = 'https://functions.poehali.dev/0832b8a5-6964-4ea4-8a01-bae090f6c457';

function getToken() {
  return localStorage.getItem('kisrod_token') || '';
}

async function request(url: string, path: string, method = 'GET', body?: object) {
  try {
    const res = await fetch(url + path, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'X-Session-Token': getToken(),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    return res.json();
  } catch {
    return { error: 'Нет соединения с сервером. Попробуй ещё раз.' };
  }
}

export const api = {
  register: (data: { username: string; display_name: string; password: string }) =>
    request(AUTH_URL, '/register', 'POST', data),

  login: (data: { username: string; password: string }) =>
    request(AUTH_URL, '/login', 'POST', data),

  logout: () => request(AUTH_URL, '/logout', 'POST'),

  me: () => request(AUTH_URL, '/me'),

  updateProfile: (data: { display_name: string; bio: string }) =>
    request(AUTH_URL, '/profile', 'PUT', data),

  getChannels: () => request(MESSAGES_URL, '/channels'),

  getChats: () => request(MESSAGES_URL, '/chats'),

  getMessages: (chat_id: number) =>
    request(MESSAGES_URL, `/messages?chat_id=${chat_id}`),

  sendMessage: (chat_id: number, content: string) =>
    request(MESSAGES_URL, '/send', 'POST', { chat_id, content }),

  startChat: (username: string) =>
    request(MESSAGES_URL, '/start-chat', 'POST', { username }),

  searchUsers: (q: string) =>
    request(MESSAGES_URL, `/users?q=${encodeURIComponent(q)}`),
};