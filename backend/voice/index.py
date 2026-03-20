"""Kisrod Voice: голосовые комнаты и WebRTC сигнализация"""
import json
import os
import psycopg2

CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Session-Token',
}

def get_conn():
    return psycopg2.connect(os.environ['DATABASE_URL'])

def get_user(cur, token):
    cur.execute(
        "SELECT u.id, u.username, u.display_name, u.avatar_color FROM kisrod_sessions s JOIN kisrod_users u ON s.user_id = u.id WHERE s.token = %s",
        (token,)
    )
    return cur.fetchone()

def handler(event: dict, context) -> dict:
    if event.get('httpMethod') == 'OPTIONS':
        return {'statusCode': 200, 'headers': CORS, 'body': ''}

    method = event.get('httpMethod', 'GET')
    path = event.get('path', '/')
    headers = event.get('headers', {}) or {}
    token = headers.get('X-Session-Token') or headers.get('x-session-token', '')
    params = event.get('queryStringParameters') or {}

    action = params.get('action', '') or path.rstrip('/').split('/')[-1]

    if not token:
        return {'statusCode': 401, 'headers': CORS, 'body': json.dumps({'error': 'Не авторизован'})}

    try:
        conn = get_conn()
    except Exception as e:
        return {'statusCode': 500, 'headers': CORS, 'body': json.dumps({'error': str(e)})}

    cur = conn.cursor()

    try:
        user = get_user(cur, token)
        if not user:
            return {'statusCode': 401, 'headers': CORS, 'body': json.dumps({'error': 'Сессия истекла'})}

        user_id, username, display_name, avatar_color = user

        # GET rooms — список голосовых комнат с участниками
        if method == 'GET' and action == 'rooms':
            cur.execute("SELECT id, name FROM kisrod_voice_rooms ORDER BY id")
            rooms = cur.fetchall()
            result = []
            for room_id, room_name in rooms:
                cur.execute("""
                    SELECT u.id, u.display_name, u.avatar_color, u.username
                    FROM kisrod_voice_members vm
                    JOIN kisrod_users u ON vm.user_id = u.id
                    WHERE vm.room_id = %s
                """, (room_id,))
                members = [{'id': r[0], 'display_name': r[1], 'avatar_color': r[2], 'username': r[3]} for r in cur.fetchall()]
                result.append({'id': room_id, 'name': room_name, 'members': members})
            return {'statusCode': 200, 'headers': CORS, 'body': json.dumps({'rooms': result})}

        # POST join — войти в голосовую комнату
        if method == 'POST' and action == 'join':
            body = json.loads(event.get('body') or '{}')
            room_id = body.get('room_id')
            if not room_id:
                return {'statusCode': 400, 'headers': CORS, 'body': json.dumps({'error': 'room_id обязателен'})}

            # Убрать из всех других комнат
            cur.execute("SELECT id FROM kisrod_voice_members WHERE user_id = %s", (user_id,))
            existing = cur.fetchone()
            if existing:
                cur.execute("UPDATE kisrod_voice_members SET room_id = %s WHERE user_id = %s", (room_id, user_id))
            else:
                cur.execute("INSERT INTO kisrod_voice_members (room_id, user_id) VALUES (%s, %s)", (room_id, user_id))
            conn.commit()
            return {'statusCode': 200, 'headers': CORS, 'body': json.dumps({'ok': True, 'room_id': room_id})}

        # POST leave — покинуть голосовую комнату
        if method == 'POST' and action == 'leave':
            cur.execute("SELECT id FROM kisrod_voice_members WHERE user_id = %s", (user_id,))
            if cur.fetchone():
                cur.execute("UPDATE kisrod_voice_members SET room_id = NULL WHERE user_id = %s", (user_id,))
                conn.commit()
            return {'statusCode': 200, 'headers': CORS, 'body': json.dumps({'ok': True})}

        # GET my-room — в какой комнате я сейчас
        if method == 'GET' and action == 'my-room':
            cur.execute("SELECT room_id FROM kisrod_voice_members WHERE user_id = %s", (user_id,))
            row = cur.fetchone()
            return {'statusCode': 200, 'headers': CORS, 'body': json.dumps({'room_id': row[0] if row else None})}

        return {'statusCode': 200, 'headers': CORS, 'body': json.dumps({'service': 'kisrod-voice'})}

    except Exception as e:
        return {'statusCode': 500, 'headers': CORS, 'body': json.dumps({'error': str(e)})}
    finally:
        conn.close()
