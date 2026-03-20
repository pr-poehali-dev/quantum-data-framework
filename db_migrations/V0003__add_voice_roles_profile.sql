
ALTER TABLE kisrod_users ADD COLUMN IF NOT EXISTS pronouns VARCHAR(50) DEFAULT '';
ALTER TABLE kisrod_users ADD COLUMN IF NOT EXISTS banner_color VARCHAR(20) DEFAULT '#5865f2';

CREATE TABLE IF NOT EXISTS kisrod_roles (
  id SERIAL PRIMARY KEY,
  name VARCHAR(50) NOT NULL,
  color VARCHAR(20) DEFAULT '#99aab5',
  permissions TEXT DEFAULT 'member'
);

INSERT INTO kisrod_roles (name, color, permissions) VALUES ('Владелец', '#faa61a', 'owner');
INSERT INTO kisrod_roles (name, color, permissions) VALUES ('Модератор', '#3ba55c', 'moderator');
INSERT INTO kisrod_roles (name, color, permissions) VALUES ('Участник', '#99aab5', 'member');

ALTER TABLE kisrod_chat_members ADD COLUMN IF NOT EXISTS role_id INTEGER REFERENCES kisrod_roles(id) DEFAULT 3;

CREATE TABLE IF NOT EXISTS kisrod_voice_rooms (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

INSERT INTO kisrod_voice_rooms (name) VALUES ('Общая');
INSERT INTO kisrod_voice_rooms (name) VALUES ('Флудилка');
INSERT INTO kisrod_voice_rooms (name) VALUES ('Тихий уголок');

CREATE TABLE IF NOT EXISTS kisrod_voice_members (
  id SERIAL PRIMARY KEY,
  room_id INTEGER REFERENCES kisrod_voice_rooms(id),
  user_id INTEGER REFERENCES kisrod_users(id),
  joined_at TIMESTAMP DEFAULT NOW()
);
