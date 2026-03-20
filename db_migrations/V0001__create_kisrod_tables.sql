
CREATE TABLE IF NOT EXISTS kisrod_users (
  id SERIAL PRIMARY KEY,
  username VARCHAR(50) UNIQUE NOT NULL,
  display_name VARCHAR(100) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  bio TEXT DEFAULT '',
  avatar_color VARCHAR(20) DEFAULT '#5865f2',
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS kisrod_chats (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100),
  is_group BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS kisrod_chat_members (
  id SERIAL PRIMARY KEY,
  chat_id INTEGER REFERENCES kisrod_chats(id),
  user_id INTEGER REFERENCES kisrod_users(id),
  joined_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS kisrod_messages (
  id SERIAL PRIMARY KEY,
  chat_id INTEGER REFERENCES kisrod_chats(id),
  user_id INTEGER REFERENCES kisrod_users(id),
  content TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS kisrod_sessions (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES kisrod_users(id),
  token VARCHAR(255) UNIQUE NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);
