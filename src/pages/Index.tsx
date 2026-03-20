import { useState, useEffect, useRef, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import Icon from '@/components/ui/icon';
import { api } from '@/lib/api';

// ─── Types ────────────────────────────────────────────────────────────────────
interface User {
  id: number; username: string; display_name: string;
  bio: string; avatar_color: string; pronouns: string; banner_color: string;
}
interface Chat {
  id: number; name: string; is_group: boolean;
  last_message: string | null; last_sender: string | null;
  last_time: string | null; avatar_color: string;
}
interface Channel { id: number; name: string; last_message: string | null; member_count: number; }
interface Message {
  id: number; content: string; created_at: string;
  user_id: number; display_name: string; avatar_color: string; username: string; is_mine: boolean;
}
interface VoiceRoom { id: number; name: string; members: { id: number; display_name: string; avatar_color: string; username: string }[]; }

type Screen = 'login' | 'register' | 'chat';
type SidebarTab = 'channels' | 'dms';
type ModalType = 'none' | 'search' | 'profile' | 'settings' | 'voice';

const AVATAR_COLORS = ['#5865f2','#3ba55c','#faa61a','#ed4245','#eb459e','#57f287','#00b0f4','#ff7262'];

function getInitial(name: string) { return name?.charAt(0).toUpperCase() || '?'; }
function formatTime(iso: string | null) {
  if (!iso) return '';
  return new Date(iso).toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' });
}

// ─── Avatar ───────────────────────────────────────────────────────────────────
function Avatar({ name, color, size = 'md' }: { name: string; color: string; size?: 'sm' | 'md' | 'lg' | 'xl' }) {
  const sz = { sm: 'w-7 h-7 text-xs', md: 'w-9 h-9 text-sm', lg: 'w-12 h-12 text-lg', xl: 'w-16 h-16 text-2xl' }[size];
  return (
    <div className={`${sz} rounded-full flex items-center justify-center text-white font-bold flex-shrink-0`} style={{ backgroundColor: color }}>
      {getInitial(name)}
    </div>
  );
}

// ─── RoleBadge ────────────────────────────────────────────────────────────────
function RoleBadge({ role }: { role: string }) {
  const map: Record<string, { label: string; color: string }> = {
    owner: { label: 'Владелец', color: '#faa61a' },
    moderator: { label: 'Модератор', color: '#3ba55c' },
    member: { label: 'Участник', color: '#72767d' },
  };
  const r = map[role] || map.member;
  return (
    <span className="text-xs px-1.5 py-0.5 rounded font-semibold" style={{ color: r.color, backgroundColor: r.color + '22' }}>
      {r.label}
    </span>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function Index() {
  const [screen, setScreen] = useState<Screen>('login');
  const [user, setUser] = useState<User | null>(null);
  const [chats, setChats] = useState<Chat[]>([]);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [voiceRooms, setVoiceRooms] = useState<VoiceRoom[]>([]);
  const [activeChat, setActiveChat] = useState<Chat | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [msgInput, setMsgInput] = useState('');
  const [sidebarTab, setSidebarTab] = useState<SidebarTab>('channels');
  const [modal, setModal] = useState<ModalType>('none');
  const [mobileChatOpen, setMobileChatOpen] = useState(false);
  const [myVoiceRoom, setMyVoiceRoom] = useState<number | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isDeafened, setIsDeafened] = useState(false);

  // Search
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<User[]>([]);

  // Profile edit
  const [editName, setEditName] = useState('');
  const [editBio, setEditBio] = useState('');
  const [editPronouns, setEditPronouns] = useState('');
  const [editAvatarColor, setEditAvatarColor] = useState('');
  const [editBannerColor, setEditBannerColor] = useState('');

  // Auth forms
  const [loginForm, setLoginForm] = useState({ username: '', password: '' });
  const [registerForm, setRegisterForm] = useState({ username: '', display_name: '', password: '' });
  const [authError, setAuthError] = useState('');
  const [authLoading, setAuthLoading] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const voicePollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Init ──
  useEffect(() => {
    const token = localStorage.getItem('kisrod_token');
    if (token) {
      api.me().then((data) => {
        if (data.id) { setUser(data); setScreen('chat'); loadAll(); }
      });
    }
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Poll messages
  useEffect(() => {
    if (activeChat) {
      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = setInterval(() => {
        api.getMessages(activeChat.id).then((d) => { if (d.messages) setMessages(d.messages); });
      }, 3000);
    }
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [activeChat]);

  // Poll voice rooms
  useEffect(() => {
    if (screen === 'chat') {
      voicePollRef.current = setInterval(() => {
        api.getVoiceRooms().then((d) => { if (d.rooms) setVoiceRooms(d.rooms); });
      }, 5000);
    }
    return () => { if (voicePollRef.current) clearInterval(voicePollRef.current); };
  }, [screen]);

  const loadAll = useCallback(async () => {
    const [ch, dm, vr] = await Promise.all([api.getChannels(), api.getChats(), api.getVoiceRooms()]);
    if (ch.channels) setChannels(ch.channels);
    if (dm.chats) setChats(dm.chats);
    if (vr.rooms) setVoiceRooms(vr.rooms);
  }, []);

  async function openChat(chat: Chat) {
    setActiveChat(chat);
    setMobileChatOpen(true);
    const d = await api.getMessages(chat.id);
    if (d.messages) setMessages(d.messages);
  }

  // ── Auth ──
  async function handleLogin(e: React.FormEvent) {
    e.preventDefault(); setAuthError(''); setAuthLoading(true);
    const d = await api.login(loginForm);
    setAuthLoading(false);
    if (d.error) { setAuthError(d.error); return; }
    localStorage.setItem('kisrod_token', d.token);
    setUser(d.user); setScreen('chat'); loadAll();
  }

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault(); setAuthError(''); setAuthLoading(true);
    const d = await api.register(registerForm);
    setAuthLoading(false);
    if (d.error) { setAuthError(d.error); return; }
    localStorage.setItem('kisrod_token', d.token);
    setUser(d.user); setScreen('chat'); loadAll();
  }

  async function handleLogout() {
    await api.logout(); localStorage.removeItem('kisrod_token');
    setUser(null); setChats([]); setChannels([]); setActiveChat(null); setMessages([]); setScreen('login');
  }

  // ── Messages ──
  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (!msgInput.trim() || !activeChat) return;
    const content = msgInput.trim(); setMsgInput('');
    const d = await api.sendMessage(activeChat.id, content);
    if (d.id) { setMessages((prev) => [...prev, d]); api.getChats().then(r => { if (r.chats) setChats(r.chats); }); }
  }

  // ── Search ──
  async function handleSearch(q: string) {
    setSearchQuery(q);
    if (!q) { setSearchResults([]); return; }
    const d = await api.searchUsers(q);
    if (d.users) setSearchResults(d.users);
  }

  async function handleStartChat(username: string) {
    const d = await api.startChat(username);
    if (d.chat_id) {
      setModal('none'); setSearchQuery(''); setSearchResults([]);
      await loadAll();
      openChat({ id: d.chat_id, name: d.name, is_group: false, last_message: null, last_sender: null, last_time: null, avatar_color: '#5865f2' });
    }
  }

  // ── Profile ──
  function openProfile() {
    if (!user) return;
    setEditName(user.display_name); setEditBio(user.bio);
    setEditPronouns(user.pronouns); setEditAvatarColor(user.avatar_color);
    setEditBannerColor(user.banner_color); setModal('settings');
  }

  async function handleSaveProfile(e: React.FormEvent) {
    e.preventDefault();
    const d = await api.updateProfile({ display_name: editName, bio: editBio, pronouns: editPronouns, avatar_color: editAvatarColor, banner_color: editBannerColor });
    if (d.id) { setUser(d); setModal('none'); }
  }

  // ── Voice ──
  async function handleJoinVoice(room_id: number) {
    if (myVoiceRoom === room_id) {
      await api.leaveVoice(); setMyVoiceRoom(null);
    } else {
      await api.joinVoice(room_id); setMyVoiceRoom(room_id);
    }
    const d = await api.getVoiceRooms();
    if (d.rooms) setVoiceRooms(d.rooms);
  }

  // ─────────────────────────────────── LOGIN ───────────────────────────────────
  if (screen === 'login') return (
    <div className="min-h-screen bg-[#36393f] flex items-center justify-center p-4">
      <div className="w-full max-w-sm bg-[#2f3136] rounded-xl p-8 shadow-2xl">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 bg-[#5865f2] rounded-full flex items-center justify-center">
            <Icon name="MessageCircle" size={20} className="text-white" />
          </div>
          <div><h1 className="text-white text-xl font-bold">Kisrod</h1><p className="text-[#b9bbbe] text-xs">Войди в аккаунт</p></div>
        </div>
        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="text-[#b9bbbe] text-xs font-semibold uppercase mb-1 block">Никнейм</label>
            <Input className="bg-[#40444b] border-none text-white placeholder-[#72767d]" placeholder="твой_ник" value={loginForm.username} onChange={(e) => setLoginForm({ ...loginForm, username: e.target.value })} />
          </div>
          <div>
            <label className="text-[#b9bbbe] text-xs font-semibold uppercase mb-1 block">Пароль</label>
            <Input type="password" className="bg-[#40444b] border-none text-white placeholder-[#72767d]" placeholder="••••••••" value={loginForm.password} onChange={(e) => setLoginForm({ ...loginForm, password: e.target.value })} />
          </div>
          {authError && <p className="text-[#ed4245] text-sm">{authError}</p>}
          <Button type="submit" disabled={authLoading} className="w-full bg-[#5865f2] hover:bg-[#4752c4] text-white font-medium">
            {authLoading ? 'Входим...' : 'Войти'}
          </Button>
        </form>
        <p className="mt-4 text-[#72767d] text-sm">Нет аккаунта? <button onClick={() => { setScreen('register'); setAuthError(''); }} className="text-[#00aff4] hover:underline">Зарегистрироваться</button></p>
      </div>
    </div>
  );

  // ────────────────────────────────── REGISTER ─────────────────────────────────
  if (screen === 'register') return (
    <div className="min-h-screen bg-[#36393f] flex items-center justify-center p-4">
      <div className="w-full max-w-sm bg-[#2f3136] rounded-xl p-8 shadow-2xl">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 bg-[#5865f2] rounded-full flex items-center justify-center">
            <Icon name="MessageCircle" size={20} className="text-white" />
          </div>
          <div><h1 className="text-white text-xl font-bold">Kisrod</h1><p className="text-[#b9bbbe] text-xs">Создай аккаунт</p></div>
        </div>
        <form onSubmit={handleRegister} className="space-y-4">
          <div>
            <label className="text-[#b9bbbe] text-xs font-semibold uppercase mb-1 block">Никнейм</label>
            <Input className="bg-[#40444b] border-none text-white placeholder-[#72767d]" placeholder="твой_ник" value={registerForm.username} onChange={(e) => setRegisterForm({ ...registerForm, username: e.target.value })} />
            <p className="text-[#72767d] text-xs mt-1">Только буквы, цифры, _</p>
          </div>
          <div>
            <label className="text-[#b9bbbe] text-xs font-semibold uppercase mb-1 block">Отображаемое имя</label>
            <Input className="bg-[#40444b] border-none text-white placeholder-[#72767d]" placeholder="Как тебя зовут?" value={registerForm.display_name} onChange={(e) => setRegisterForm({ ...registerForm, display_name: e.target.value })} />
          </div>
          <div>
            <label className="text-[#b9bbbe] text-xs font-semibold uppercase mb-1 block">Пароль</label>
            <Input type="password" className="bg-[#40444b] border-none text-white placeholder-[#72767d]" placeholder="Минимум 4 символа" value={registerForm.password} onChange={(e) => setRegisterForm({ ...registerForm, password: e.target.value })} />
          </div>
          {authError && <p className="text-[#ed4245] text-sm">{authError}</p>}
          <Button type="submit" disabled={authLoading} className="w-full bg-[#5865f2] hover:bg-[#4752c4] text-white font-medium">
            {authLoading ? 'Создаём...' : 'Создать аккаунт'}
          </Button>
        </form>
        <p className="mt-4 text-[#72767d] text-sm">Уже есть аккаунт? <button onClick={() => { setScreen('login'); setAuthError(''); }} className="text-[#00aff4] hover:underline">Войти</button></p>
      </div>
    </div>
  );

  // ──────────────────────────────────── CHAT ───────────────────────────────────
  return (
    <div className="h-screen bg-[#36393f] flex overflow-hidden">

      {/* ── Servers sidebar ── */}
      <div className="hidden sm:flex w-[72px] bg-[#202225] flex-col items-center py-3 gap-2 flex-shrink-0">
        <div className="w-12 h-12 bg-[#5865f2] rounded-2xl hover:rounded-xl transition-all duration-200 flex items-center justify-center cursor-pointer" onClick={() => setSidebarTab('channels')}>
          <Icon name="MessageCircle" size={22} className="text-white" />
        </div>
        <div className="w-8 h-[2px] bg-[#36393f] rounded-full" />
        {user && (
          <div onClick={openProfile} className="w-12 h-12 rounded-3xl hover:rounded-xl transition-all duration-200 flex items-center justify-center cursor-pointer text-white text-lg font-bold relative group" style={{ backgroundColor: user.avatar_color }}>
            {getInitial(user.display_name)}
            <div className="absolute -bottom-0.5 -right-0.5 w-4 h-4 bg-[#3ba55c] border-2 border-[#202225] rounded-full" />
          </div>
        )}
      </div>

      {/* ── Channels/DMs sidebar ── */}
      <div className={`${mobileChatOpen ? 'hidden' : 'flex'} sm:flex w-full sm:w-60 bg-[#2f3136] flex-col flex-shrink-0`}>
        {/* Header */}
        <div className="p-3 border-b border-[#202225] shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-white font-bold text-sm">Kisrod</span>
            {sidebarTab === 'dms' && (
              <button onClick={() => setModal('search')} className="w-6 h-6 rounded flex items-center justify-center text-[#b9bbbe] hover:text-white hover:bg-[#40444b]">
                <Icon name="Plus" size={14} />
              </button>
            )}
          </div>
          <div className="flex gap-1 bg-[#202225] rounded-lg p-0.5">
            <button onClick={() => setSidebarTab('channels')} className={`flex-1 flex items-center justify-center gap-1 py-1 rounded text-xs font-semibold transition-colors ${sidebarTab === 'channels' ? 'bg-[#5865f2] text-white' : 'text-[#8e9297] hover:text-white'}`}>
              <Icon name="Hash" size={12} />Каналы
            </button>
            <button onClick={() => setSidebarTab('dms')} className={`flex-1 flex items-center justify-center gap-1 py-1 rounded text-xs font-semibold transition-colors ${sidebarTab === 'dms' ? 'bg-[#5865f2] text-white' : 'text-[#8e9297] hover:text-white'}`}>
              <Icon name="MessageCircle" size={12} />Личные
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-2">
          {/* ── CHANNELS TAB ── */}
          {sidebarTab === 'channels' && (
            <div className="space-y-4">
              {/* Text channels */}
              <div>
                <div className="flex items-center gap-1 px-2 py-1 text-[#8e9297] text-xs font-semibold uppercase tracking-wide mb-1">
                  <Icon name="ChevronDown" size={11} />
                  <span>Текстовые каналы</span>
                </div>
                {channels.map((ch) => (
                  <div
                    key={ch.id}
                    onClick={() => openChat({ id: ch.id, name: ch.name, is_group: true, last_message: ch.last_message, last_sender: null, last_time: null, avatar_color: '#5865f2' })}
                    className={`flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer group transition-colors ${activeChat?.id === ch.id ? 'bg-[#393c43] text-white' : 'text-[#8e9297] hover:bg-[#35383e] hover:text-[#dcddde]'}`}
                  >
                    <Icon name="Hash" size={16} className="flex-shrink-0" />
                    <span className="text-sm flex-1 truncate">{ch.name}</span>
                    <span className="text-[#72767d] text-xs opacity-0 group-hover:opacity-100">{ch.member_count}</span>
                  </div>
                ))}
              </div>

              {/* Voice channels */}
              <div>
                <div className="flex items-center gap-1 px-2 py-1 text-[#8e9297] text-xs font-semibold uppercase tracking-wide mb-1">
                  <Icon name="ChevronDown" size={11} />
                  <span>Голосовые каналы</span>
                </div>
                {voiceRooms.map((room) => {
                  const isJoined = myVoiceRoom === room.id;
                  return (
                    <div key={room.id} className="mb-1">
                      <div
                        onClick={() => handleJoinVoice(room.id)}
                        className={`flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer group transition-colors ${isJoined ? 'bg-[#393c43] text-[#3ba55c]' : 'text-[#8e9297] hover:bg-[#35383e] hover:text-[#dcddde]'}`}
                      >
                        <Icon name="Volume2" size={16} className="flex-shrink-0" />
                        <span className="text-sm flex-1 truncate">{room.name}</span>
                        {isJoined && <div className="w-2 h-2 bg-[#3ba55c] rounded-full animate-pulse" />}
                      </div>
                      {/* Members in voice */}
                      {room.members.length > 0 && (
                        <div className="ml-6 space-y-0.5">
                          {room.members.map((m) => (
                            <div key={m.id} className="flex items-center gap-2 px-2 py-0.5 rounded text-[#8e9297] hover:text-[#dcddde]">
                              <div className="w-5 h-5 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0" style={{ backgroundColor: m.avatar_color }}>
                                {getInitial(m.display_name)}
                              </div>
                              <span className="text-xs truncate">{m.display_name}</span>
                              <Icon name="Mic" size={10} className="ml-auto text-[#3ba55c]" />
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── DMs TAB ── */}
          {sidebarTab === 'dms' && (
            <div>
              <div className="px-2 py-1 text-[#8e9297] text-xs font-semibold uppercase tracking-wide mb-1">Личные сообщения</div>
              {chats.length === 0 && (
                <div className="text-center text-[#72767d] text-sm mt-6 px-2">
                  <Icon name="MessageCircle" size={28} className="mx-auto mb-2 opacity-40" />
                  <p className="text-xs">Нажми + чтобы написать кому-нибудь</p>
                </div>
              )}
              {chats.map((chat) => (
                <div key={chat.id} onClick={() => openChat(chat)} className={`flex items-center gap-2 px-2 py-2 rounded cursor-pointer transition-colors ${activeChat?.id === chat.id ? 'bg-[#393c43]' : 'hover:bg-[#35383e]'}`}>
                  <Avatar name={chat.name} color={chat.avatar_color} size="sm" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-white truncate">{chat.name}</div>
                    {chat.last_message && <div className="text-xs text-[#72767d] truncate">{chat.last_message}</div>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── User panel ── */}
        {user && (
          <div className="p-2 bg-[#292b2f] flex items-center gap-2">
            <div className="relative cursor-pointer" onClick={openProfile}>
              <Avatar name={user.display_name} color={user.avatar_color} size="sm" />
              <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-[#3ba55c] border-2 border-[#292b2f] rounded-full" />
            </div>
            <div className="flex-1 min-w-0 cursor-pointer" onClick={openProfile}>
              <div className="text-white text-sm font-medium truncate">{user.display_name}</div>
              <div className="text-[#b9bbbe] text-xs truncate">#{user.username}</div>
            </div>
            <div className="flex gap-0.5">
              <button onClick={() => setIsMuted(!isMuted)} className={`w-7 h-7 rounded flex items-center justify-center hover:bg-[#40444b] transition-colors ${isMuted ? 'text-[#ed4245]' : 'text-[#b9bbbe]'}`}>
                <Icon name={isMuted ? 'MicOff' : 'Mic'} size={14} />
              </button>
              <button onClick={() => setIsDeafened(!isDeafened)} className={`w-7 h-7 rounded flex items-center justify-center hover:bg-[#40444b] transition-colors ${isDeafened ? 'text-[#ed4245]' : 'text-[#b9bbbe]'}`}>
                <Icon name={isDeafened ? 'HeadphoneOff' : 'Headphones'} size={14} />
              </button>
              <button onClick={openProfile} className="w-7 h-7 rounded flex items-center justify-center text-[#b9bbbe] hover:bg-[#40444b]">
                <Icon name="Settings" size={14} />
              </button>
            </div>
          </div>
        )}

        {/* ── Voice active bar ── */}
        {myVoiceRoom !== null && (
          <div className="px-3 py-2 bg-[#36393f] border-t border-[#202225] flex items-center gap-2">
            <div className="w-2 h-2 bg-[#3ba55c] rounded-full animate-pulse" />
            <span className="text-[#3ba55c] text-xs font-semibold flex-1">
              {voiceRooms.find(r => r.id === myVoiceRoom)?.name || 'Голосовой канал'}
            </span>
            <button onClick={() => handleJoinVoice(myVoiceRoom)} className="text-[#ed4245] hover:text-white text-xs">
              <Icon name="PhoneOff" size={14} />
            </button>
          </div>
        )}
      </div>

      {/* ── Chat area ── */}
      <div className={`${mobileChatOpen ? 'flex' : 'hidden'} sm:flex flex-1 flex-col min-w-0`}>
        {activeChat ? (
          <>
            {/* Chat header */}
            <div className="h-12 bg-[#36393f] border-b border-[#202225] flex items-center px-4 gap-3 flex-shrink-0 shadow-sm">
              <button className="sm:hidden text-[#8e9297] mr-1" onClick={() => setMobileChatOpen(false)}>
                <Icon name="ArrowLeft" size={20} />
              </button>
              {activeChat.is_group
                ? <Icon name="Hash" size={20} className="text-[#8e9297] flex-shrink-0" />
                : <Avatar name={activeChat.name} color={activeChat.avatar_color} size="sm" />
              }
              <span className="text-white font-semibold">{activeChat.name}</span>
              {activeChat.is_group && <span className="text-[#8e9297] text-sm hidden sm:block">· публичный канал</span>}
              <div className="ml-auto flex items-center gap-3">
                <Icon name="Bell" size={18} className="text-[#b9bbbe] cursor-pointer hover:text-white" />
                <Icon name="Users" size={18} className="text-[#b9bbbe] cursor-pointer hover:text-white" />
                <Icon name="Search" size={18} className="text-[#b9bbbe] cursor-pointer hover:text-white" />
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-1">
              {messages.length === 0 && (
                <div className="text-center text-[#72767d] mt-20">
                  <div className="w-16 h-16 rounded-full mx-auto mb-4 flex items-center justify-center" style={{ backgroundColor: activeChat.is_group ? '#5865f2' : activeChat.avatar_color }}>
                    {activeChat.is_group ? <Icon name="Hash" size={28} className="text-white" /> : <span className="text-white text-2xl font-bold">{getInitial(activeChat.name)}</span>}
                  </div>
                  <p className="text-white text-lg font-bold mb-1">{activeChat.is_group ? `#${activeChat.name}` : activeChat.name}</p>
                  <p className="text-sm">Напиши первое сообщение!</p>
                </div>
              )}
              {messages.map((msg, i) => {
                const prev = messages[i - 1];
                const grouped = prev && prev.user_id === msg.user_id && (new Date(msg.created_at).getTime() - new Date(prev.created_at).getTime()) < 300000;
                return (
                  <div key={msg.id} className={`flex gap-3 group hover:bg-[#32353b] px-2 py-0.5 rounded ${!grouped ? 'mt-4' : ''} ${msg.is_mine ? '' : ''}`}>
                    {!grouped
                      ? <Avatar name={msg.display_name} color={msg.avatar_color} size="sm" />
                      : <div className="w-7 flex-shrink-0 flex items-center justify-center"><span className="text-[#72767d] text-xs opacity-0 group-hover:opacity-100">{formatTime(msg.created_at)}</span></div>
                    }
                    <div className="flex-1 min-w-0">
                      {!grouped && (
                        <div className="flex items-baseline gap-2 mb-0.5">
                          <span className="text-white font-medium text-sm">{msg.display_name}</span>
                          {msg.is_mine && <RoleBadge role="member" />}
                          <span className="text-[#72767d] text-xs">{formatTime(msg.created_at)}</span>
                        </div>
                      )}
                      <p className="text-[#dcddde] text-sm leading-relaxed break-words">{msg.content}</p>
                    </div>
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <div className="p-4 flex-shrink-0">
              <form onSubmit={handleSend} className="flex gap-2 bg-[#40444b] rounded-lg px-4 py-2 items-center">
                <button type="button" className="text-[#b9bbbe] hover:text-white flex-shrink-0">
                  <Icon name="Plus" size={18} />
                </button>
                <input
                  className="flex-1 bg-transparent text-white text-sm placeholder-[#72767d] outline-none"
                  placeholder={`Написать в ${activeChat.is_group ? '#' : ''}${activeChat.name}...`}
                  value={msgInput}
                  onChange={(e) => setMsgInput(e.target.value)}
                />
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button type="button" className="text-[#b9bbbe] hover:text-white"><Icon name="Smile" size={18} /></button>
                  <button type="submit" className="text-[#b9bbbe] hover:text-white"><Icon name="Send" size={18} /></button>
                </div>
              </form>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center flex-col text-[#72767d]">
            <Icon name="MessageCircle" size={64} className="mb-4 opacity-20" />
            <h3 className="text-white text-xl font-semibold mb-2">Добро пожаловать в Kisrod!</h3>
            <p className="text-sm mb-4">Выбери канал или напиши кому-нибудь</p>
            <Button onClick={() => setModal('search')} className="bg-[#5865f2] hover:bg-[#4752c4] text-white">
              <Icon name="Plus" size={16} className="mr-2" />Написать кому-нибудь
            </Button>
          </div>
        )}
      </div>

      {/* ════════════════ MODAL: SEARCH ════════════════ */}
      {modal === 'search' && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-[#2f3136] rounded-xl w-full max-w-sm p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-white font-bold text-lg">Найти пользователя</h3>
              <button onClick={() => { setModal('none'); setSearchQuery(''); setSearchResults([]); }} className="text-[#b9bbbe] hover:text-white"><Icon name="X" size={20} /></button>
            </div>
            <Input className="bg-[#40444b] border-none text-white placeholder-[#72767d] mb-3" placeholder="Введи ник или имя..." value={searchQuery} onChange={(e) => handleSearch(e.target.value)} autoFocus />
            <div className="space-y-1 max-h-60 overflow-y-auto">
              {searchResults.map((u) => (
                <div key={u.id} onClick={() => handleStartChat(u.username)} className="flex items-center gap-3 p-2 rounded cursor-pointer hover:bg-[#393c43]">
                  <Avatar name={u.display_name} color={u.avatar_color} size="sm" />
                  <div>
                    <div className="text-white text-sm font-medium">{u.display_name}</div>
                    <div className="text-[#72767d] text-xs">#{u.username}</div>
                  </div>
                </div>
              ))}
              {searchQuery && !searchResults.length && <p className="text-[#72767d] text-sm text-center py-4">Никого не нашли</p>}
            </div>
          </div>
        </div>
      )}

      {/* ════════════════ MODAL: SETTINGS ════════════════ */}
      {modal === 'settings' && user && (
        <div className="fixed inset-0 bg-black/70 flex z-50 overflow-hidden">
          {/* Left nav */}
          <div className="w-56 bg-[#2f3136] p-4 flex-shrink-0">
            <p className="text-[#8e9297] text-xs font-semibold uppercase tracking-wide mb-2">Настройки аккаунта</p>
            <div className="space-y-0.5">
              {['Мой аккаунт', 'Профиль', 'Безопасность'].map((item) => (
                <div key={item} className="px-3 py-1.5 rounded text-[#dcddde] text-sm hover:bg-[#393c43] cursor-pointer first:bg-[#393c43]">
                  {item}
                </div>
              ))}
            </div>
            <div className="mt-4 pt-4 border-t border-[#202225]">
              <button onClick={handleLogout} className="flex items-center gap-2 px-3 py-1.5 rounded text-[#ed4245] text-sm hover:bg-[#ed4245]/10 w-full">
                <Icon name="LogOut" size={14} />Выйти
              </button>
            </div>
          </div>

          {/* Content */}
          <div className="flex-1 bg-[#36393f] overflow-y-auto">
            <div className="max-w-xl mx-auto p-8">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-white text-xl font-bold">Настройки профиля</h2>
                <button onClick={() => setModal('none')} className="text-[#b9bbbe] hover:text-white p-1">
                  <Icon name="X" size={20} />
                </button>
              </div>

              {/* Profile card preview */}
              <div className="bg-[#2f3136] rounded-xl overflow-hidden mb-6">
                {/* Banner */}
                <div className="h-24 relative" style={{ backgroundColor: editBannerColor }}>
                  <div className="absolute -bottom-5 left-4">
                    <div className="w-20 h-20 rounded-full border-4 border-[#2f3136] flex items-center justify-center text-white text-3xl font-bold" style={{ backgroundColor: editAvatarColor }}>
                      {getInitial(editName || user.display_name)}
                    </div>
                  </div>
                </div>
                <div className="pt-8 px-4 pb-4">
                  <div className="text-white font-bold text-lg">{editName || user.display_name}</div>
                  <div className="text-[#b9bbbe] text-sm">#{user.username} {editPronouns && <span className="text-[#72767d]">· {editPronouns}</span>}</div>
                  {editBio && <div className="text-[#dcddde] text-sm mt-2">{editBio}</div>}
                </div>
              </div>

              <form onSubmit={handleSaveProfile} className="space-y-5">
                <div>
                  <label className="text-[#b9bbbe] text-xs font-semibold uppercase mb-2 block">Отображаемое имя</label>
                  <Input className="bg-[#40444b] border-none text-white" value={editName} onChange={(e) => setEditName(e.target.value)} />
                </div>
                <div>
                  <label className="text-[#b9bbbe] text-xs font-semibold uppercase mb-2 block">Местоимения</label>
                  <Input className="bg-[#40444b] border-none text-white placeholder-[#72767d]" placeholder="он/его, она/её, они/их..." value={editPronouns} onChange={(e) => setEditPronouns(e.target.value)} />
                </div>
                <div>
                  <label className="text-[#b9bbbe] text-xs font-semibold uppercase mb-2 block">О себе</label>
                  <Textarea className="bg-[#40444b] border-none text-white resize-none placeholder-[#72767d]" rows={3} placeholder="Расскажи о себе..." value={editBio} onChange={(e) => setEditBio(e.target.value)} />
                  <p className="text-[#72767d] text-xs mt-1">{editBio.length}/190 символов</p>
                </div>

                <div>
                  <label className="text-[#b9bbbe] text-xs font-semibold uppercase mb-2 block">Цвет аватара</label>
                  <div className="flex gap-2 flex-wrap">
                    {AVATAR_COLORS.map((c) => (
                      <button key={c} type="button" onClick={() => setEditAvatarColor(c)} className={`w-8 h-8 rounded-full transition-transform hover:scale-110 ${editAvatarColor === c ? 'ring-2 ring-white ring-offset-2 ring-offset-[#36393f] scale-110' : ''}`} style={{ backgroundColor: c }} />
                    ))}
                  </div>
                </div>

                <div>
                  <label className="text-[#b9bbbe] text-xs font-semibold uppercase mb-2 block">Цвет баннера</label>
                  <div className="flex gap-2 flex-wrap">
                    {AVATAR_COLORS.map((c) => (
                      <button key={c} type="button" onClick={() => setEditBannerColor(c)} className={`w-8 h-8 rounded-lg transition-transform hover:scale-110 ${editBannerColor === c ? 'ring-2 ring-white ring-offset-2 ring-offset-[#36393f] scale-110' : ''}`} style={{ backgroundColor: c }} />
                    ))}
                  </div>
                </div>

                <div className="pt-2 border-t border-[#202225] flex gap-3">
                  <Button type="submit" className="bg-[#5865f2] hover:bg-[#4752c4] text-white px-6">Сохранить</Button>
                  <Button type="button" variant="ghost" onClick={() => setModal('none')} className="text-[#b9bbbe] hover:text-white">Отмена</Button>
                </div>
              </form>

              {/* Roles section */}
              <div className="mt-8 pt-6 border-t border-[#202225]">
                <h3 className="text-white font-semibold mb-3">Роли в Kisrod</h3>
                <div className="space-y-2">
                  {[{role: 'owner', desc: 'Полный доступ, управление каналами'}, {role: 'moderator', desc: 'Модерация сообщений и участников'}, {role: 'member', desc: 'Стандартный участник'}].map((r) => (
                    <div key={r.role} className="flex items-center gap-3 p-3 bg-[#2f3136] rounded-lg">
                      <RoleBadge role={r.role} />
                      <span className="text-[#b9bbbe] text-sm">{r.desc}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
