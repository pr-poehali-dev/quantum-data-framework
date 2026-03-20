import { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import Icon from '@/components/ui/icon';
import { api } from '@/lib/api';

interface User {
  id: number;
  username: string;
  display_name: string;
  bio: string;
  avatar_color: string;
}

interface Chat {
  id: number;
  name: string;
  is_group: boolean;
  last_message: string | null;
  last_sender: string | null;
  last_time: string | null;
  avatar_color: string;
}

interface Message {
  id: number;
  content: string;
  created_at: string;
  user_id: number;
  display_name: string;
  avatar_color: string;
  username: string;
  is_mine: boolean;
}

type Screen = 'login' | 'register' | 'chat';

function getInitial(name: string) {
  return name?.charAt(0).toUpperCase() || '?';
}

function formatTime(iso: string | null) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' });
}

export default function Index() {
  const [screen, setScreen] = useState<Screen>('login');
  const [user, setUser] = useState<User | null>(null);
  const [chats, setChats] = useState<Chat[]>([]);
  const [activeChat, setActiveChat] = useState<Chat | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [msgInput, setMsgInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<User[]>([]);
  const [showSearch, setShowSearch] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [profileName, setProfileName] = useState('');
  const [profileBio, setProfileBio] = useState('');
  const [loginForm, setLoginForm] = useState({ username: '', password: '' });
  const [registerForm, setRegisterForm] = useState({ username: '', display_name: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [mobileChatOpen, setMobileChatOpen] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const token = localStorage.getItem('kisrod_token');
    if (token) {
      api.me().then((data) => {
        if (data.id) {
          setUser(data);
          setScreen('chat');
          loadChats();
        }
      });
    }
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (activeChat) {
      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = setInterval(() => {
        api.getMessages(activeChat.id).then((data) => {
          if (data.messages) setMessages(data.messages);
        });
      }, 3000);
    }
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [activeChat]);

  async function loadChats() {
    const data = await api.getChats();
    if (data.chats) setChats(data.chats);
  }

  async function openChat(chat: Chat) {
    setActiveChat(chat);
    setMobileChatOpen(true);
    const data = await api.getMessages(chat.id);
    if (data.messages) setMessages(data.messages);
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    const data = await api.login(loginForm);
    setLoading(false);
    if (data.error) { setError(data.error); return; }
    localStorage.setItem('kisrod_token', data.token);
    setUser(data.user);
    setScreen('chat');
    loadChats();
  }

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    const data = await api.register(registerForm);
    setLoading(false);
    if (data.error) { setError(data.error); return; }
    localStorage.setItem('kisrod_token', data.token);
    setUser(data.user);
    setScreen('chat');
    loadChats();
  }

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (!msgInput.trim() || !activeChat) return;
    const content = msgInput.trim();
    setMsgInput('');
    const data = await api.sendMessage(activeChat.id, content);
    if (data.id) {
      setMessages((prev) => [...prev, data]);
      loadChats();
    }
  }

  async function handleSearch(q: string) {
    setSearchQuery(q);
    if (q.length < 1) { setSearchResults([]); return; }
    const data = await api.searchUsers(q);
    if (data.users) setSearchResults(data.users);
  }

  async function handleStartChat(username: string) {
    const data = await api.startChat(username);
    if (data.chat_id) {
      setShowSearch(false);
      setSearchQuery('');
      setSearchResults([]);
      await loadChats();
      const chat: Chat = { id: data.chat_id, name: data.name, is_group: false, last_message: null, last_sender: null, last_time: null, avatar_color: '#5865f2' };
      openChat(chat);
    }
  }

  async function handleSaveProfile(e: React.FormEvent) {
    e.preventDefault();
    const data = await api.updateProfile({ display_name: profileName, bio: profileBio });
    if (data.id) {
      setUser(data);
      setShowProfile(false);
    }
  }

  async function handleLogout() {
    await api.logout();
    localStorage.removeItem('kisrod_token');
    setUser(null);
    setChats([]);
    setActiveChat(null);
    setMessages([]);
    setScreen('login');
  }

  if (screen === 'login') {
    return (
      <div className="min-h-screen bg-[#36393f] flex items-center justify-center p-4">
        <div className="w-full max-w-sm bg-[#2f3136] rounded-xl p-8 shadow-2xl">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 bg-[#5865f2] rounded-full flex items-center justify-center">
              <Icon name="MessageCircle" size={20} className="text-white" />
            </div>
            <div>
              <h1 className="text-white text-xl font-bold">Kisrod</h1>
              <p className="text-[#b9bbbe] text-xs">Войди в свой аккаунт</p>
            </div>
          </div>
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="text-[#b9bbbe] text-xs font-semibold uppercase mb-1 block">Никнейм</label>
              <Input
                className="bg-[#40444b] border-none text-white placeholder-[#72767d]"
                placeholder="твой_ник"
                value={loginForm.username}
                onChange={(e) => setLoginForm({ ...loginForm, username: e.target.value })}
              />
            </div>
            <div>
              <label className="text-[#b9bbbe] text-xs font-semibold uppercase mb-1 block">Пароль</label>
              <Input
                type="password"
                className="bg-[#40444b] border-none text-white placeholder-[#72767d]"
                placeholder="••••••••"
                value={loginForm.password}
                onChange={(e) => setLoginForm({ ...loginForm, password: e.target.value })}
              />
            </div>
            {error && <p className="text-[#ed4245] text-sm">{error}</p>}
            <Button type="submit" disabled={loading} className="w-full bg-[#5865f2] hover:bg-[#4752c4] text-white font-medium">
              {loading ? 'Входим...' : 'Войти'}
            </Button>
          </form>
          <p className="mt-4 text-[#72767d] text-sm">
            Нет аккаунта?{' '}
            <button onClick={() => { setScreen('register'); setError(''); }} className="text-[#00aff4] hover:underline">
              Зарегистрироваться
            </button>
          </p>
        </div>
      </div>
    );
  }

  if (screen === 'register') {
    return (
      <div className="min-h-screen bg-[#36393f] flex items-center justify-center p-4">
        <div className="w-full max-w-sm bg-[#2f3136] rounded-xl p-8 shadow-2xl">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 bg-[#5865f2] rounded-full flex items-center justify-center">
              <Icon name="MessageCircle" size={20} className="text-white" />
            </div>
            <div>
              <h1 className="text-white text-xl font-bold">Kisrod</h1>
              <p className="text-[#b9bbbe] text-xs">Создай аккаунт</p>
            </div>
          </div>
          <form onSubmit={handleRegister} className="space-y-4">
            <div>
              <label className="text-[#b9bbbe] text-xs font-semibold uppercase mb-1 block">Никнейм</label>
              <Input
                className="bg-[#40444b] border-none text-white placeholder-[#72767d]"
                placeholder="твой_ник"
                value={registerForm.username}
                onChange={(e) => setRegisterForm({ ...registerForm, username: e.target.value })}
              />
              <p className="text-[#72767d] text-xs mt-1">Только буквы, цифры, _</p>
            </div>
            <div>
              <label className="text-[#b9bbbe] text-xs font-semibold uppercase mb-1 block">Имя</label>
              <Input
                className="bg-[#40444b] border-none text-white placeholder-[#72767d]"
                placeholder="Как тебя зовут?"
                value={registerForm.display_name}
                onChange={(e) => setRegisterForm({ ...registerForm, display_name: e.target.value })}
              />
            </div>
            <div>
              <label className="text-[#b9bbbe] text-xs font-semibold uppercase mb-1 block">Пароль</label>
              <Input
                type="password"
                className="bg-[#40444b] border-none text-white placeholder-[#72767d]"
                placeholder="Минимум 4 символа"
                value={registerForm.password}
                onChange={(e) => setRegisterForm({ ...registerForm, password: e.target.value })}
              />
            </div>
            {error && <p className="text-[#ed4245] text-sm">{error}</p>}
            <Button type="submit" disabled={loading} className="w-full bg-[#5865f2] hover:bg-[#4752c4] text-white font-medium">
              {loading ? 'Создаём...' : 'Создать аккаунт'}
            </Button>
          </form>
          <p className="mt-4 text-[#72767d] text-sm">
            Уже есть аккаунт?{' '}
            <button onClick={() => { setScreen('login'); setError(''); }} className="text-[#00aff4] hover:underline">
              Войти
            </button>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen bg-[#36393f] flex overflow-hidden">
      {/* Боковая панель серверов */}
      <div className="hidden sm:flex w-[72px] bg-[#202225] flex-col items-center py-3 gap-2 flex-shrink-0">
        <div className="w-12 h-12 bg-[#5865f2] rounded-2xl flex items-center justify-center cursor-pointer">
          <Icon name="MessageCircle" size={22} className="text-white" />
        </div>
        <div className="w-8 h-[2px] bg-[#36393f] rounded-full" />
        {user && (
          <div
            onClick={() => { setShowProfile(true); setProfileName(user.display_name); setProfileBio(user.bio); }}
            className="w-12 h-12 rounded-3xl hover:rounded-xl transition-all duration-200 flex items-center justify-center cursor-pointer text-white text-lg font-bold"
            style={{ backgroundColor: user.avatar_color }}
          >
            {getInitial(user.display_name)}
          </div>
        )}
      </div>

      {/* Список чатов */}
      <div className={`${mobileChatOpen ? 'hidden' : 'flex'} sm:flex w-full sm:w-60 bg-[#2f3136] flex-col flex-shrink-0`}>
        <div className="p-4 border-b border-[#202225]">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-white font-bold text-base">Kisrod</h2>
            <button
              onClick={() => setShowSearch(true)}
              className="w-7 h-7 rounded flex items-center justify-center text-[#b9bbbe] hover:text-white hover:bg-[#40444b]"
            >
              <Icon name="Plus" size={16} />
            </button>
          </div>
          <p className="text-[#8e9297] text-xs uppercase font-semibold tracking-wide">Личные сообщения</p>
        </div>

        <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
          {chats.length === 0 && (
            <div className="text-center text-[#72767d] text-sm mt-8 px-4">
              <Icon name="MessageCircle" size={32} className="mx-auto mb-2 opacity-40" />
              <p>Нет чатов</p>
              <p className="text-xs mt-1">Нажми + чтобы написать кому-нибудь</p>
            </div>
          )}
          {chats.map((chat) => (
            <div
              key={chat.id}
              onClick={() => openChat(chat)}
              className={`flex items-center gap-3 px-2 py-2 rounded cursor-pointer transition-colors ${activeChat?.id === chat.id ? 'bg-[#393c43] text-white' : 'text-[#8e9297] hover:bg-[#35383e] hover:text-[#dcddde]'}`}
            >
              <div
                className="w-9 h-9 rounded-full flex items-center justify-center text-white text-sm font-bold flex-shrink-0"
                style={{ backgroundColor: chat.avatar_color }}
              >
                {getInitial(chat.name)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-white truncate">{chat.name}</div>
                {chat.last_message && (
                  <div className="text-xs text-[#72767d] truncate">
                    {chat.last_sender}: {chat.last_message}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        {user && (
          <div className="p-2 bg-[#292b2f] flex items-center gap-2">
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-bold cursor-pointer"
              style={{ backgroundColor: user.avatar_color }}
              onClick={() => { setShowProfile(true); setProfileName(user.display_name); setProfileBio(user.bio); }}
            >
              {getInitial(user.display_name)}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-white text-sm font-medium truncate">{user.display_name}</div>
              <div className="text-[#b9bbbe] text-xs truncate">#{user.username}</div>
            </div>
            <button onClick={handleLogout} className="text-[#b9bbbe] hover:text-white p-1">
              <Icon name="LogOut" size={16} />
            </button>
          </div>
        )}
      </div>

      {/* Область чата */}
      <div className={`${mobileChatOpen ? 'flex' : 'hidden'} sm:flex flex-1 flex-col min-w-0`}>
        {activeChat ? (
          <>
            <div className="h-12 bg-[#36393f] border-b border-[#202225] flex items-center px-4 gap-3 flex-shrink-0">
              <button
                className="sm:hidden text-[#8e9297] mr-1"
                onClick={() => setMobileChatOpen(false)}
              >
                <Icon name="ArrowLeft" size={20} />
              </button>
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-bold flex-shrink-0"
                style={{ backgroundColor: activeChat.avatar_color }}
              >
                {getInitial(activeChat.name)}
              </div>
              <span className="text-white font-semibold">{activeChat.name}</span>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {messages.length === 0 && (
                <div className="text-center text-[#72767d] mt-16">
                  <Icon name="MessageCircle" size={40} className="mx-auto mb-3 opacity-30" />
                  <p className="text-sm">Напиши первое сообщение!</p>
                </div>
              )}
              {messages.map((msg) => (
                <div key={msg.id} className={`flex gap-3 ${msg.is_mine ? 'flex-row-reverse' : ''}`}>
                  <div
                    className="w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-bold flex-shrink-0 self-end"
                    style={{ backgroundColor: msg.avatar_color }}
                  >
                    {getInitial(msg.display_name)}
                  </div>
                  <div className={`max-w-xs lg:max-w-md flex flex-col ${msg.is_mine ? 'items-end' : 'items-start'}`}>
                    {!msg.is_mine && (
                      <span className="text-[#b9bbbe] text-xs mb-1">{msg.display_name}</span>
                    )}
                    <div
                      className={`px-3 py-2 rounded-2xl text-sm ${
                        msg.is_mine
                          ? 'bg-[#5865f2] text-white rounded-br-sm'
                          : 'bg-[#40444b] text-[#dcddde] rounded-bl-sm'
                      }`}
                    >
                      {msg.content}
                    </div>
                    <span className="text-[#72767d] text-xs mt-1">{formatTime(msg.created_at)}</span>
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>

            <div className="p-4 flex-shrink-0">
              <form onSubmit={handleSend} className="flex gap-2">
                <input
                  className="flex-1 bg-[#40444b] text-white rounded-lg px-4 py-2.5 text-sm placeholder-[#72767d] outline-none focus:ring-1 focus:ring-[#5865f2]"
                  placeholder={`Написать ${activeChat.name}...`}
                  value={msgInput}
                  onChange={(e) => setMsgInput(e.target.value)}
                />
                <Button type="submit" className="bg-[#5865f2] hover:bg-[#4752c4] px-4">
                  <Icon name="Send" size={16} />
                </Button>
              </form>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center flex-col text-[#72767d]">
            <Icon name="MessageCircle" size={64} className="mb-4 opacity-20" />
            <h3 className="text-white text-xl font-semibold mb-2">Добро пожаловать в Kisrod!</h3>
            <p className="text-sm mb-4">Выбери чат или начни новый разговор</p>
            <Button
              onClick={() => setShowSearch(true)}
              className="bg-[#5865f2] hover:bg-[#4752c4] text-white"
            >
              <Icon name="Plus" size={16} className="mr-2" />
              Написать кому-нибудь
            </Button>
          </div>
        )}
      </div>

      {/* Модалка поиска */}
      {showSearch && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-[#2f3136] rounded-xl w-full max-w-sm p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-white font-bold text-lg">Найти пользователя</h3>
              <button onClick={() => { setShowSearch(false); setSearchQuery(''); setSearchResults([]); }} className="text-[#b9bbbe] hover:text-white">
                <Icon name="X" size={20} />
              </button>
            </div>
            <Input
              className="bg-[#40444b] border-none text-white placeholder-[#72767d] mb-3"
              placeholder="Введи ник или имя..."
              value={searchQuery}
              onChange={(e) => handleSearch(e.target.value)}
              autoFocus
            />
            <div className="space-y-1 max-h-60 overflow-y-auto">
              {searchResults.map((u) => (
                <div
                  key={u.id}
                  onClick={() => handleStartChat(u.username)}
                  className="flex items-center gap-3 p-2 rounded cursor-pointer hover:bg-[#393c43]"
                >
                  <div
                    className="w-9 h-9 rounded-full flex items-center justify-center text-white text-sm font-bold"
                    style={{ backgroundColor: u.avatar_color }}
                  >
                    {getInitial(u.display_name)}
                  </div>
                  <div>
                    <div className="text-white text-sm font-medium">{u.display_name}</div>
                    <div className="text-[#72767d] text-xs">#{u.username}</div>
                  </div>
                </div>
              ))}
              {searchQuery && searchResults.length === 0 && (
                <p className="text-[#72767d] text-sm text-center py-4">Никого не нашли</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Модалка профиля */}
      {showProfile && user && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-[#2f3136] rounded-xl w-full max-w-sm p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-white font-bold text-lg">Мой профиль</h3>
              <button onClick={() => setShowProfile(false)} className="text-[#b9bbbe] hover:text-white">
                <Icon name="X" size={20} />
              </button>
            </div>
            <div className="flex items-center gap-4 mb-6">
              <div
                className="w-16 h-16 rounded-full flex items-center justify-center text-white text-2xl font-bold"
                style={{ backgroundColor: user.avatar_color }}
              >
                {getInitial(user.display_name)}
              </div>
              <div>
                <div className="text-white font-bold text-lg">{user.display_name}</div>
                <div className="text-[#72767d] text-sm">#{user.username}</div>
                {user.bio && <div className="text-[#b9bbbe] text-sm mt-1">{user.bio}</div>}
              </div>
            </div>
            <form onSubmit={handleSaveProfile} className="space-y-3">
              <div>
                <label className="text-[#b9bbbe] text-xs font-semibold uppercase mb-1 block">Имя</label>
                <Input
                  className="bg-[#40444b] border-none text-white"
                  value={profileName}
                  onChange={(e) => setProfileName(e.target.value)}
                />
              </div>
              <div>
                <label className="text-[#b9bbbe] text-xs font-semibold uppercase mb-1 block">О себе</label>
                <Textarea
                  className="bg-[#40444b] border-none text-white resize-none"
                  rows={2}
                  placeholder="Расскажи о себе..."
                  value={profileBio}
                  onChange={(e) => setProfileBio(e.target.value)}
                />
              </div>
              <div className="flex gap-2">
                <Button type="submit" className="flex-1 bg-[#5865f2] hover:bg-[#4752c4] text-white">
                  Сохранить
                </Button>
                <Button type="button" variant="ghost" onClick={handleLogout} className="text-[#ed4245] hover:bg-[#ed4245]/10">
                  <Icon name="LogOut" size={16} className="mr-1" />
                  Выйти
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
