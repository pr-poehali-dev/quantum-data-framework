"""Сообщения Kisrod: отправка, получение, чаты. v3"""
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

def get_user_by_token(cur, token):
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

    # action из query или последнего сегмента пути
    action = params.get('action', '')
    if not action:
        action = path.rstrip('/').split('/')[-1]

    if not token:
        return {'statusCode': 401, 'headers': CORS, 'body': json.dumps({'error': 'Не авторизован'})}

    try:
        conn = get_conn()
    except Exception as e:
        return {'statusCode': 500, 'headers': CORS, 'body': json.dumps({'error': str(e)})}

    cur = conn.cursor()

    try:
        user = get_user_by_token(cur, token)
        if not user:
            return {'statusCode': 401, 'headers': CORS, 'body': json.dumps({'error': 'Сессия истекла'})}

        user_id, username, display_name, avatar_color = user

        # GET channels
        if method == 'GET' and action == 'channels':
            cur.execute("SELECT id FROM kisrod_chats WHERE is_group = TRUE")
            all_channels = cur.fetchall()
            for (cid,) in all_channels:
                cur.execute("SELECT id FROM kisrod_chat_members WHERE chat_id = %s AND user_id = %s", (cid, user_id))
                if not cur.fetchone():
                    cur.execute("INSERT INTO kisrod_chat_members (chat_id, user_id) VALUES (%s, %s)", (cid, user_id))
            conn.commit()
            cur.execute("""
                SELECT c.id, c.name,
                       (SELECT m.content FROM kisrod_messages m WHERE m.chat_id = c.id ORDER BY m.created_at DESC LIMIT 1) as last_msg,
                       (SELECT COUNT(*) FROM kisrod_chat_members WHERE chat_id = c.id) as member_count
                FROM kisrod_chats c WHERE c.is_group = TRUE ORDER BY c.id ASC
            """)
            rows = cur.fetchall()
            channels = [{'id': r[0], 'name': r[1], 'last_message': r[2], 'member_count': int(r[3])} for r in rows]
            return {'statusCode': 200, 'headers': CORS, 'body': json.dumps({'channels': channels})}

        # GET chats
        if method == 'GET' and action == 'chats':
            cur.execute("""
                SELECT c.id, c.name, c.is_group,
                       (SELECT m.content FROM kisrod_messages m WHERE m.chat_id = c.id ORDER BY m.created_at DESC LIMIT 1),
                       (SELECT u.display_name FROM kisrod_messages m JOIN kisrod_users u ON m.user_id = u.id WHERE m.chat_id = c.id ORDER BY m.created_at DESC LIMIT 1),
                       (SELECT m.created_at FROM kisrod_messages m WHERE m.chat_id = c.id ORDER BY m.created_at DESC LIMIT 1)
                FROM kisrod_chats c
                JOIN kisrod_chat_members cm ON cm.chat_id = c.id
                WHERE cm.user_id = %s AND c.is_group = FALSE
                ORDER BY 6 DESC NULLS LAST
            """, (user_id,))
            rows = cur.fetchall()
            chats = []
            for row in rows:
                cid, cname, is_group, last_msg, last_sender, last_time = row
                cur.execute("""
                    SELECT u.display_name, u.avatar_color FROM kisrod_chat_members cm
                    JOIN kisrod_users u ON cm.user_id = u.id
                    WHERE cm.chat_id = %s AND cm.user_id != %s LIMIT 1
                """, (cid, user_id))
                other = cur.fetchone()
                chats.append({
                    'id': cid,
                    'name': other[0] if other else cname,
                    'is_group': False,
                    'last_message': last_msg,
                    'last_sender': last_sender,
                    'last_time': str(last_time) if last_time else None,
                    'avatar_color': other[1] if other else avatar_color,
                })
            return {'statusCode': 200, 'headers': CORS, 'body': json.dumps({'chats': chats})}

        # GET messages
        if method == 'GET' and action == 'messages':
            chat_id = params.get('chat_id')
            if not chat_id:
                return {'statusCode': 400, 'headers': CORS, 'body': json.dumps({'error': 'chat_id обязателен'})}
            cur.execute("SELECT id FROM kisrod_chat_members WHERE chat_id = %s AND user_id = %s", (chat_id, user_id))
            if not cur.fetchone():
                return {'statusCode': 403, 'headers': CORS, 'body': json.dumps({'error': 'Нет доступа'})}
            cur.execute("""
                SELECT m.id, m.content, m.created_at, u.id, u.display_name, u.avatar_color, u.username
                FROM kisrod_messages m JOIN kisrod_users u ON m.user_id = u.id
                WHERE m.chat_id = %s ORDER BY m.created_at ASC LIMIT 100
            """, (chat_id,))
            rows = cur.fetchall()
            messages = [{'id': r[0], 'content': r[1], 'created_at': str(r[2]), 'user_id': r[3], 'display_name': r[4], 'avatar_color': r[5], 'username': r[6], 'is_mine': r[3] == user_id} for r in rows]
            return {'statusCode': 200, 'headers': CORS, 'body': json.dumps({'messages': messages})}

        # POST send
        if method == 'POST' and action == 'send':
            body = json.loads(event.get('body') or '{}')
            chat_id = body.get('chat_id')
            content = body.get('content', '').strip()
            if not chat_id or not content:
                return {'statusCode': 400, 'headers': CORS, 'body': json.dumps({'error': 'chat_id и content обязательны'})}
            cur.execute("SELECT id FROM kisrod_chat_members WHERE chat_id = %s AND user_id = %s", (chat_id, user_id))
            if not cur.fetchone():
                return {'statusCode': 403, 'headers': CORS, 'body': json.dumps({'error': 'Нет доступа'})}
            cur.execute("INSERT INTO kisrod_messages (chat_id, user_id, content) VALUES (%s, %s, %s) RETURNING id, created_at", (chat_id, user_id, content))
            msg_id, created_at = cur.fetchone()
            conn.commit()
            return {'statusCode': 200, 'headers': CORS, 'body': json.dumps({'id': msg_id, 'content': content, 'created_at': str(created_at), 'user_id': user_id, 'display_name': display_name, 'avatar_color': avatar_color, 'username': username, 'is_mine': True})}

        # POST start-chat
        if method == 'POST' and action in ('start-chat', 'start_chat'):
            body = json.loads(event.get('body') or '{}')
            target_username = body.get('username', '').strip().lower()
            if not target_username:
                return {'statusCode': 400, 'headers': CORS, 'body': json.dumps({'error': 'username обязателен'})}
            cur.execute("SELECT id, display_name FROM kisrod_users WHERE username = %s", (target_username,))
            target = cur.fetchone()
            if not target:
                return {'statusCode': 404, 'headers': CORS, 'body': json.dumps({'error': 'Пользователь не найден'})}
            target_id, target_name = target
            if target_id == user_id:
                return {'statusCode': 400, 'headers': CORS, 'body': json.dumps({'error': 'Нельзя написать себе'})}
            cur.execute("""
                SELECT c.id FROM kisrod_chats c
                JOIN kisrod_chat_members cm1 ON cm1.chat_id = c.id AND cm1.user_id = %s
                JOIN kisrod_chat_members cm2 ON cm2.chat_id = c.id AND cm2.user_id = %s
                WHERE c.is_group = FALSE LIMIT 1
            """, (user_id, target_id))
            existing = cur.fetchone()
            if existing:
                return {'statusCode': 200, 'headers': CORS, 'body': json.dumps({'chat_id': existing[0], 'name': target_name})}
            cur.execute("INSERT INTO kisrod_chats (is_group) VALUES (FALSE) RETURNING id")
            chat_id = cur.fetchone()[0]
            cur.execute("INSERT INTO kisrod_chat_members (chat_id, user_id) VALUES (%s, %s)", (chat_id, user_id))
            cur.execute("INSERT INTO kisrod_chat_members (chat_id, user_id) VALUES (%s, %s)", (chat_id, target_id))
            conn.commit()
            return {'statusCode': 200, 'headers': CORS, 'body': json.dumps({'chat_id': chat_id, 'name': target_name})}

        # GET users
        if method == 'GET' and action == 'users':
            q = params.get('q', '').strip()
            if not q:
                return {'statusCode': 200, 'headers': CORS, 'body': json.dumps({'users': []})}
            cur.execute("SELECT id, username, display_name, avatar_color FROM kisrod_users WHERE (username ILIKE %s OR display_name ILIKE %s) AND id != %s LIMIT 10", (f'%{q}%', f'%{q}%', user_id))
            rows = cur.fetchall()
            users = [{'id': r[0], 'username': r[1], 'display_name': r[2], 'avatar_color': r[3]} for r in rows]
            return {'statusCode': 200, 'headers': CORS, 'body': json.dumps({'users': users})}

        return {'statusCode': 200, 'headers': CORS, 'body': json.dumps({'service': 'kisrod-messages', 'action': action})}

    except Exception as e:
        return {'statusCode': 500, 'headers': CORS, 'body': json.dumps({'error': f'Ошибка: {str(e)}'})}
    finally:
        conn.close()
