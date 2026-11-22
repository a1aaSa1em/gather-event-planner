"""Gather's small API. Deployed as an API Gateway HTTP API Lambda integration."""
import json
import os
import re
import uuid
from datetime import date, datetime, timezone

import boto3
from boto3.dynamodb.conditions import Key
from botocore.exceptions import ClientError

TABLE = boto3.resource('dynamodb').Table(os.environ['TABLE_NAME'])
ID = re.compile(r'^[0-9a-f]{32}$')


def response(status, data):
    return {'statusCode': status, 'headers': {'content-type': 'application/json', 'cache-control': 'no-store'}, 'body': json.dumps(data)}


def text_field(data, name, limit, required=True):
    value = data.get(name, '')
    if not isinstance(value, str) or len(value.strip()) > limit or (required and not value.strip()):
        raise ValueError(f'{name} must be text of 1–{limit} characters' if required else f'{name} must be at most {limit} characters')
    return value.strip()


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


def event_exists(event_id):
    return 'Item' in TABLE.get_item(Key={'pk': 'EVENTS', 'sk': 'EVENT#' + event_id}, ConsistentRead=True)


def public_item(item):
    return {key: value for key, value in item.items() if key not in ('pk', 'sk')}


def handler(event, context):
    method = event.get('requestContext', {}).get('http', {}).get('method', '')
    path = event.get('rawPath', '').strip('/').split('/')
    try:
        if path == ['events'] and method == 'GET':
            items = TABLE.query(KeyConditionExpression=Key('pk').eq('EVENTS'), ScanIndexForward=False, Limit=50, ConsistentRead=True).get('Items', [])
            return response(200, {'events': [public_item(x) for x in items]})
        if path == ['events'] and method == 'POST':
            data = read_body(event)
            title = text_field(data, 'title', 80)
            when = text_field(data, 'date', 10)
            try:
                if len(when) != 10 or date.fromisoformat(when).isoformat() != when: raise ValueError()
            except ValueError:
                raise ValueError('date must be a valid YYYY-MM-DD date')
            event_id = uuid.uuid4().hex
            item = {'pk': 'EVENTS', 'sk': 'EVENT#' + event_id, 'id': event_id, 'title': title, 'date': when,
                    'location': text_field(data, 'location', 100, False), 'createdAt': datetime.now(timezone.utc).isoformat()}
            TABLE.put_item(Item=item)
            return response(201, public_item(item))
        if len(path) in (3, 4) and path[0] == 'events' and ID.fullmatch(path[1]) and path[2] == 'tasks':
            event_id = path[1]
            if not event_exists(event_id): return response(404, {'error': 'Event not found'})
            if len(path) == 3 and method == 'GET':
                items = TABLE.query(KeyConditionExpression=Key('pk').eq('EVENT#' + event_id), Limit=100, ConsistentRead=True).get('Items', [])
                return response(200, {'tasks': [public_item(x) for x in items]})
            if len(path) == 3 and method == 'POST':
                data = read_body(event)
                task_id = uuid.uuid4().hex
                item = {'pk': 'EVENT#' + event_id, 'sk': 'TASK#' + task_id, 'id': task_id,
                        'title': text_field(data, 'title', 120), 'done': False}
                TABLE.put_item(Item=item)
                return response(201, public_item(item))
            if len(path) == 4 and method == 'PATCH' and ID.fullmatch(path[3]):
                done = read_body(event).get('done')
                if not isinstance(done, bool): raise ValueError('done must be true or false')
                try:
                    result = TABLE.update_item(Key={'pk': 'EVENT#' + event_id, 'sk': 'TASK#' + path[3]},
                        UpdateExpression='SET #done = :done', ConditionExpression='attribute_exists(pk)',
                        ExpressionAttributeNames={'#done': 'done'}, ExpressionAttributeValues={':done': done}, ReturnValues='ALL_NEW')
                except ClientError as exc:
                    if exc.response['Error']['Code'] == 'ConditionalCheckFailedException': return response(404, {'error': 'Task not found'})
                    raise
                return response(200, public_item(result['Attributes']))
        return response(404, {'error': 'Route not found'})
    except ValueError as exc:
        return response(400, {'error': str(exc)})
    except ClientError:
        return response(500, {'error': 'Storage error'})
