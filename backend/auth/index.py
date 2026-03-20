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

    conn = get_conn()
    cur = conn.cursor()

    # POST /register
    if method == 'POST' and path.endswith('/register'):
        body = json.loads(event.get('body') or '{}')
        username = body.get('username', '').strip().lower()
        display_name = body.get('display_name', '').strip()
        password = body.get('password', '')

        if not username or not display_name or not password:
            conn.close()
            return {'statusCode': 400, 'headers': CORS, 'body': json.dumps({'error': 'Все поля обязательны'})}

        if len(password) < 4:
            conn.close()
            return {'statusCode': 400, 'headers': CORS, 'body': json.dumps({'error': 'Пароль минимум 4 символа'})}

        cur.execute("SELECT id FROM kisrod_users WHERE username = %s", (username,))
        if cur.fetchone():
            conn.close()
            return {'statusCode': 409, 'headers': CORS, 'body': json.dumps({'error': 'Такой ник уже занят'})}

        pw_hash = hash_password(password)
        colors = ['#5865f2', '#3ba55c', '#faa61a', '#ed4245', '#eb459e', '#57f287']
        color = colors[hash(username) % len(colors)]

        cur.execute(
            "INSERT INTO kisrod_users (username, display_name, password_hash, avatar_color) VALUES (%s, %s, %s, %s) RETURNING id",
            (username, display_name, pw_hash, color)
        )
        user_id = cur.fetchone()[0]

        token_val = secrets.token_hex(32)
        cur.execute("INSERT INTO kisrod_sessions (user_id, token) VALUES (%s, %s)", (user_id, token_val))
        conn.commit()
        conn.close()

        return {
            'statusCode': 200,
            'headers': CORS,
            'body': json.dumps({
                'token': token_val,
                'user': {'id': user_id, 'username': username, 'display_name': display_name, 'bio': '', 'avatar_color': color}
            })
        }

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
            conn.close()
            return {'statusCode': 401, 'headers': CORS, 'body': json.dumps({'error': 'Неверный ник или пароль'})}

        user_id, uname, dname, bio, color = row
        token_val = secrets.token_hex(32)
        cur.execute("INSERT INTO kisrod_sessions (user_id, token) VALUES (%s, %s)", (user_id, token_val))
        conn.commit()
        conn.close()

        return {
            'statusCode': 200,
            'headers': CORS,
            'body': json.dumps({
                'token': token_val,
                'user': {'id': user_id, 'username': uname, 'display_name': dname, 'bio': bio or '', 'avatar_color': color}
            })
        }

    # GET /me — получить текущего пользователя
    if method == 'GET' and path.endswith('/me'):
        if not token:
            conn.close()
            return {'statusCode': 401, 'headers': CORS, 'body': json.dumps({'error': 'Не авторизован'})}

        cur.execute(
            "SELECT u.id, u.username, u.display_name, u.bio, u.avatar_color FROM kisrod_sessions s JOIN kisrod_users u ON s.user_id = u.id WHERE s.token = %s",
            (token,)
        )
        row = cur.fetchone()
        conn.close()
        if not row:
            return {'statusCode': 401, 'headers': CORS, 'body': json.dumps({'error': 'Сессия истекла'})}

        user_id, uname, dname, bio, color = row
        return {
            'statusCode': 200,
            'headers': CORS,
            'body': json.dumps({'id': user_id, 'username': uname, 'display_name': dname, 'bio': bio or '', 'avatar_color': color})
        }

    # PUT /profile — обновить профиль
    if method == 'PUT' and path.endswith('/profile'):
        if not token:
            conn.close()
            return {'statusCode': 401, 'headers': CORS, 'body': json.dumps({'error': 'Не авторизован'})}

        cur.execute("SELECT user_id FROM kisrod_sessions WHERE token = %s", (token,))
        row = cur.fetchone()
        if not row:
            conn.close()
            return {'statusCode': 401, 'headers': CORS, 'body': json.dumps({'error': 'Сессия истекла'})}

        user_id = row[0]
        body = json.loads(event.get('body') or '{}')
        display_name = body.get('display_name', '').strip()
        bio = body.get('bio', '').strip()

        if display_name:
            cur.execute("UPDATE kisrod_users SET display_name = %s, bio = %s WHERE id = %s", (display_name, bio, user_id))
            conn.commit()

        cur.execute("SELECT id, username, display_name, bio, avatar_color FROM kisrod_users WHERE id = %s", (user_id,))
        row = cur.fetchone()
        conn.close()
        uid, uname, dname, bio2, color = row
        return {
            'statusCode': 200,
            'headers': CORS,
            'body': json.dumps({'id': uid, 'username': uname, 'display_name': dname, 'bio': bio2 or '', 'avatar_color': color})
        }

    # POST /logout
    if method == 'POST' and path.endswith('/logout'):
        if token:
            cur.execute("DELETE FROM kisrod_sessions WHERE token = %s", (token,))
            conn.commit()
        conn.close()
        return {'statusCode': 200, 'headers': CORS, 'body': json.dumps({'ok': True})}

    conn.close()
    return {'statusCode': 404, 'headers': CORS, 'body': json.dumps({'error': 'Not found'})}
