"""Аутентификация Kisrod: регистрация, вход, профиль, роли. v4"""
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

def hash_password(p):
    return hashlib.sha256(p.encode()).hexdigest()

def get_user_by_token(cur, token):
    cur.execute(
        "SELECT u.id, u.username, u.display_name, u.bio, u.avatar_color, u.pronouns, u.banner_color FROM kisrod_sessions s JOIN kisrod_users u ON s.user_id = u.id WHERE s.token = %s",
        (token,)
    )
    row = cur.fetchone()
    if not row:
        return None
    return {'id': row[0], 'username': row[1], 'display_name': row[2], 'bio': row[3] or '', 'avatar_color': row[4], 'pronouns': row[5] or '', 'banner_color': row[6] or '#5865f2'}

def handler(event: dict, context) -> dict:
    if event.get('httpMethod') == 'OPTIONS':
        return {'statusCode': 200, 'headers': CORS, 'body': ''}

    method = event.get('httpMethod', 'GET')
    path = event.get('path', '/')
    headers = event.get('headers', {}) or {}
    token = headers.get('X-Session-Token') or headers.get('x-session-token', '')
    params = event.get('queryStringParameters') or {}

    action = params.get('action', '') or path.rstrip('/').split('/')[-1]

    try:
        conn = get_conn()
    except Exception as e:
        return err(f'DB error: {str(e)}', 500)

    cur = conn.cursor()

    try:
        if method == 'POST' and action == 'register':
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
            banner = colors[(abs(hash(username)) + 2) % len(colors)]

            cur.execute(
                "INSERT INTO kisrod_users (username, display_name, password_hash, avatar_color, banner_color) VALUES (%s, %s, %s, %s, %s) RETURNING id",
                (username, display_name, pw_hash, color, banner)
            )
            user_id = cur.fetchone()[0]
            token_val = secrets.token_hex(32)
            cur.execute("INSERT INTO kisrod_sessions (user_id, token) VALUES (%s, %s)", (user_id, token_val))
            conn.commit()
            return ok({'token': token_val, 'user': {'id': user_id, 'username': username, 'display_name': display_name, 'bio': '', 'avatar_color': color, 'pronouns': '', 'banner_color': banner}})

        if method == 'POST' and action == 'login':
            body = json.loads(event.get('body') or '{}')
            username = body.get('username', '').strip().lower()
            password = body.get('password', '')
            pw_hash = hash_password(password)

            cur.execute(
                "SELECT id, username, display_name, bio, avatar_color, pronouns, banner_color FROM kisrod_users WHERE username = %s AND password_hash = %s",
                (username, pw_hash)
            )
            row = cur.fetchone()
            if not row:
                return err('Неверный ник или пароль', 401)

            user_id, uname, dname, bio, color, pronouns, banner = row
            token_val = secrets.token_hex(32)
            cur.execute("INSERT INTO kisrod_sessions (user_id, token) VALUES (%s, %s)", (user_id, token_val))
            conn.commit()
            return ok({'token': token_val, 'user': {'id': user_id, 'username': uname, 'display_name': dname, 'bio': bio or '', 'avatar_color': color, 'pronouns': pronouns or '', 'banner_color': banner or '#5865f2'}})

        if method == 'GET' and action == 'me':
            if not token:
                return err('Не авторизован', 401)
            u = get_user_by_token(cur, token)
            if not u:
                return err('Сессия истекла', 401)
            return ok(u)

        if method == 'PUT' and action == 'profile':
            if not token:
                return err('Не авторизован', 401)
            u = get_user_by_token(cur, token)
            if not u:
                return err('Сессия истекла', 401)
            user_id = u['id']
            body = json.loads(event.get('body') or '{}')
            display_name = (body.get('display_name') or u['display_name']).strip()
            bio = (body.get('bio') or '').strip()
            pronouns = (body.get('pronouns') or '').strip()
            avatar_color = body.get('avatar_color') or u['avatar_color']
            banner_color = body.get('banner_color') or u['banner_color']

            cur.execute(
                "UPDATE kisrod_users SET display_name=%s, bio=%s, pronouns=%s, avatar_color=%s, banner_color=%s WHERE id=%s",
                (display_name, bio, pronouns, avatar_color, banner_color, user_id)
            )
            conn.commit()
            cur.execute("SELECT id, username, display_name, bio, avatar_color, pronouns, banner_color FROM kisrod_users WHERE id=%s", (user_id,))
            row = cur.fetchone()
            return ok({'id': row[0], 'username': row[1], 'display_name': row[2], 'bio': row[3] or '', 'avatar_color': row[4], 'pronouns': row[5] or '', 'banner_color': row[6] or '#5865f2'})

        if method == 'GET' and action == 'roles':
            cur.execute("SELECT id, name, color, permissions FROM kisrod_roles ORDER BY id")
            rows = cur.fetchall()
            return ok({'roles': [{'id': r[0], 'name': r[1], 'color': r[2], 'permissions': r[3]} for r in rows]})

        if method == 'POST' and action == 'logout':
            return ok({'ok': True})

        return ok({'service': 'kisrod-auth', 'action': action})

    except Exception as e:
        return err(f'Ошибка: {str(e)}', 500)
    finally:
        conn.close()
