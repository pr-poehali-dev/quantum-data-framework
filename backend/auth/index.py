"""Аутентификация Kisrod: регистрация, вход, профиль, выход"""
import json
import os
import hashlib
import secrets
import psycopg2

CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Session-Token',
}

def err(msg, code=400):
    return {'statusCode': code, 'headers': CORS, 'body': json.dumps({'error': msg})}

def ok(data):
    return {'statusCode': 200, 'headers': CORS, 'body': json.dumps(data)}

def get_conn():
    return psycopg2.connect(os.environ['DATABASE_URL'])

def hash_password(password: str) -> str:
    return hashlib.sha256(password.encode()).hexdigest()

def handler(event: dict, context) -> dict:
    if event.get('httpMethod') == 'OPTIONS':
        return {'statusCode': 200, 'headers': CORS, 'body': ''}

    method = event.get('httpMethod', 'GET')
    path = event.get('path', '/')
    headers = event.get('headers', {}) or {}
    token = headers.get('X-Session-Token') or headers.get('x-session-token', '')

    try:
        conn = get_conn()
    except Exception as e:
        return err(f'Ошибка подключения к БД: {str(e)}', 500)

    cur = conn.cursor()

    try:
        # POST /register
        if method == 'POST' and path.endswith('/register'):
            body = json.loads(event.get('body') or '{}')
            username = body.get('username', '').strip().lower()
            display_name = body.get('display_name', '').strip()
            password = body.get('password', '')

            if not username or not display_name or not password:
                return err('Все поля обязательны')
            if len(password) < 4:
                return err('Пароль минимум 4 символа')

            cur.execute("SELECT id FROM kisrod_users WHERE username = %s", (username,))
            if cur.fetchone():
                return err('Такой ник уже занят', 409)

            pw_hash = hash_password(password)
            colors = ['#5865f2', '#3ba55c', '#faa61a', '#ed4245', '#eb459e', '#57f287']
            color = colors[abs(hash(username)) % len(colors)]

            cur.execute(
                "INSERT INTO kisrod_users (username, display_name, password_hash, avatar_color) VALUES (%s, %s, %s, %s) RETURNING id",
                (username, display_name, pw_hash, color)
            )
            user_id = cur.fetchone()[0]
            token_val = secrets.token_hex(32)
            cur.execute("INSERT INTO kisrod_sessions (user_id, token) VALUES (%s, %s)", (user_id, token_val))
            conn.commit()
            return ok({'token': token_val, 'user': {'id': user_id, 'username': username, 'display_name': display_name, 'bio': '', 'avatar_color': color}})

        # POST /login
        if method == 'POST' and path.endswith('/login'):
            body = json.loads(event.get('body') or '{}')
            username = body.get('username', '').strip().lower()
            password = body.get('password', '')
            pw_hash = hash_password(password)

            cur.execute(
                "SELECT id, username, display_name, bio, avatar_color FROM kisrod_users WHERE username = %s AND password_hash = %s",
                (username, pw_hash)
            )
            row = cur.fetchone()
            if not row:
                return err('Неверный ник или пароль', 401)

            user_id, uname, dname, bio, color = row
            token_val = secrets.token_hex(32)
            cur.execute("INSERT INTO kisrod_sessions (user_id, token) VALUES (%s, %s)", (user_id, token_val))
            conn.commit()
            return ok({'token': token_val, 'user': {'id': user_id, 'username': uname, 'display_name': dname, 'bio': bio or '', 'avatar_color': color}})

        # GET /me
        if method == 'GET' and path.endswith('/me'):
            if not token:
                return err('Не авторизован', 401)
            cur.execute(
                "SELECT u.id, u.username, u.display_name, u.bio, u.avatar_color FROM kisrod_sessions s JOIN kisrod_users u ON s.user_id = u.id WHERE s.token = %s",
                (token,)
            )
            row = cur.fetchone()
            if not row:
                return err('Сессия истекла', 401)
            uid, uname, dname, bio, color = row
            return ok({'id': uid, 'username': uname, 'display_name': dname, 'bio': bio or '', 'avatar_color': color})

        # PUT /profile
        if method == 'PUT' and path.endswith('/profile'):
            if not token:
                return err('Не авторизован', 401)
            cur.execute("SELECT user_id FROM kisrod_sessions WHERE token = %s", (token,))
            row = cur.fetchone()
            if not row:
                return err('Сессия истекла', 401)
            user_id = row[0]
            body = json.loads(event.get('body') or '{}')
            display_name = body.get('display_name', '').strip()
            bio = body.get('bio', '').strip()
            if display_name:
                cur.execute("UPDATE kisrod_users SET display_name = %s, bio = %s WHERE id = %s", (display_name, bio, user_id))
                conn.commit()
            cur.execute("SELECT id, username, display_name, bio, avatar_color FROM kisrod_users WHERE id = %s", (user_id,))
            row = cur.fetchone()
            uid, uname, dname, bio2, color = row
            return ok({'id': uid, 'username': uname, 'display_name': dname, 'bio': bio2 or '', 'avatar_color': color})

        # POST /logout
        if method == 'POST' and path.endswith('/logout'):
            if token:
                cur.execute("UPDATE kisrod_sessions SET user_id = user_id WHERE token = %s", (token,))
                conn.commit()
            return ok({'ok': True})

        return err('Not found', 404)

    except Exception as e:
        return err(f'Ошибка сервера: {str(e)}', 500)
    finally:
        conn.close()
