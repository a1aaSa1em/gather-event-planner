"""Gather API: API Gateway validates access tokens; all data is scoped to the token subject."""
import json
import logging
import os
import re
import uuid
from datetime import date, datetime, timezone

import boto3
from boto3.dynamodb.conditions import Key
from botocore.exceptions import ClientError

TABLE = boto3.resource('dynamodb').Table(os.environ['TABLE_NAME'])
ID = re.compile(r'^[0-9a-f]{32}$')
LOG = logging.getLogger(__name__)
LOG.setLevel(logging.INFO)


def response(status, data):
    return {'statusCode': status, 'headers': {'content-type': 'application/json', 'cache-control': 'no-store'}, 'body': json.dumps(data)}


def text_field(data, name, limit, required=True, default=''):
    value = data.get(name, default)
    if not isinstance(value, str) or len(value.strip()) > limit or (required and not value.strip()):
        raise ValueError(f'{name} must be text of 1–{limit} characters' if required else f'{name} must be at most {limit} characters')
    return value.strip()


def date_field(data, name, required=True):
    value = text_field(data, name, 10, required)
    if not value and not required:
        return ''
    try:
        if len(value) != 10 or date.fromisoformat(value).isoformat() != value:
            raise ValueError()
    except ValueError:
        raise ValueError(f'{name} must be a valid YYYY-MM-DD date')
    return value


def read_body(event):
    body = event.get('body') or '{}'
    if len(body) > 4096:
        raise ValueError('Request is too large')
    try:
        data = json.loads(body)
    except (ValueError, TypeError):
        raise ValueError('Invalid JSON')
    if not isinstance(data, dict):
        raise ValueError('Expected a JSON object')
    return data


def owner_key(event):
    # Never trust a user ID supplied in the URL or request body. API Gateway provides these claims.
    claims = event.get('requestContext', {}).get('authorizer', {}).get('jwt', {}).get('claims', {})
    subject = claims.get('sub')
    if not isinstance(subject, str) or not subject or len(subject) > 128 or claims.get('token_use') != 'access':
        return None
    return 'USER#' + subject


def event_exists(owner, event_id):
    return 'Item' in TABLE.get_item(Key={'pk': owner, 'sk': 'EVENT#' + event_id}, ConsistentRead=True)


def public_item(item):
    return {key: value for key, value in item.items() if key not in ('pk', 'sk')}


def handler(event, context):
    method = event.get('requestContext', {}).get('http', {}).get('method', '')
    path = event.get('rawPath', '').strip('/').split('/')
    owner = owner_key(event)
    if owner is None:
        return response(401, {'error': 'Sign in required'})
    try:
        if path == ['events'] and method == 'GET':
            items = TABLE.query(KeyConditionExpression=Key('pk').eq(owner) & Key('sk').begins_with('EVENT#'), Limit=50, ConsistentRead=True).get('Items', [])
            return response(200, {'events': [public_item(x) for x in items]})
        if path == ['events'] and method == 'POST':
            data = read_body(event)
            title = text_field(data, 'title', 80)
            when = date_field(data, 'date')
            category = text_field(data, 'category', 30, False, 'General') or 'General'
            event_id = uuid.uuid4().hex
            item = {'pk': owner, 'sk': 'EVENT#' + event_id, 'id': event_id, 'title': title, 'date': when,
                    'category': category, 'location': text_field(data, 'location', 100, False), 'createdAt': datetime.now(timezone.utc).isoformat()}
            TABLE.put_item(Item=item)
            return response(201, public_item(item))
        if len(path) in (3, 4) and path[0] == 'events' and ID.fullmatch(path[1]) and path[2] == 'tasks':
            event_id = path[1]
            if not event_exists(owner, event_id):
                return response(404, {'error': 'Event not found'})
            if len(path) == 3 and method == 'GET':
                items = TABLE.query(KeyConditionExpression=Key('pk').eq(owner) & Key('sk').begins_with('TASK#' + event_id + '#'), Limit=100, ConsistentRead=True).get('Items', [])
                return response(200, {'tasks': [public_item(x) for x in items]})
            if len(path) == 3 and method == 'POST':
                data = read_body(event)
                task_id = uuid.uuid4().hex
                item = {'pk': owner, 'sk': 'TASK#' + event_id + '#' + task_id, 'id': task_id,
                        'title': text_field(data, 'title', 120), 'dueDate': date_field(data, 'dueDate', False), 'done': False}
                TABLE.put_item(Item=item)
                return response(201, public_item(item))
            if len(path) == 4 and method == 'PATCH' and ID.fullmatch(path[3]):
                done = read_body(event).get('done')
                if not isinstance(done, bool):
                    raise ValueError('done must be true or false')
                try:
                    result = TABLE.update_item(Key={'pk': owner, 'sk': 'TASK#' + event_id + '#' + path[3]},
                        UpdateExpression='SET #done = :done', ConditionExpression='attribute_exists(pk)',
                        ExpressionAttributeNames={'#done': 'done'}, ExpressionAttributeValues={':done': done}, ReturnValues='ALL_NEW')
                except ClientError as exc:
                    if exc.response['Error']['Code'] == 'ConditionalCheckFailedException':
                        return response(404, {'error': 'Task not found'})
                    raise
                return response(200, public_item(result['Attributes']))
        return response(404, {'error': 'Route not found'})
    except ValueError as exc:
        return response(400, {'error': str(exc)})
    except ClientError:
        LOG.exception('DynamoDB operation failed')
        return response(500, {'error': 'Storage error'})
