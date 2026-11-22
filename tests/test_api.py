import importlib.util
import json
import os
import pathlib
import sys
import types
import unittest
from unittest.mock import patch

class FakeClientError(Exception):
    def __init__(self, code): self.response = {'Error': {'Code': code}}

class FakeKey:
    def __init__(self, name): self.name = name
    def eq(self, value): return (self.name, value)

class FakeTable:
    def __init__(self): self.items = {}
    def put_item(self, Item): self.items[(Item['pk'], Item['sk'])] = dict(Item)
    def get_item(self, Key, **kwargs):
        item = self.items.get((Key['pk'], Key['sk']))
        return {'Item': dict(item)} if item else {}
    def query(self, KeyConditionExpression, Limit, **kwargs):
        _, pk = KeyConditionExpression
        return {'Items': [dict(v) for (p, _), v in sorted(self.items.items()) if p == pk][:Limit]}
    def update_item(self, Key, ExpressionAttributeValues, **kwargs):
        item = self.items.get((Key['pk'], Key['sk']))
        if not item: raise FakeClientError('ConditionalCheckFailedException')
        item['done'] = ExpressionAttributeValues[':done']
        return {'Attributes': dict(item)}

fake_table = FakeTable()
boto = types.ModuleType('boto3')
boto.resource = lambda service: types.SimpleNamespace(Table=lambda name: fake_table)
conditions = types.ModuleType('boto3.dynamodb.conditions'); conditions.Key = FakeKey
dynamo = types.ModuleType('boto3.dynamodb'); dynamo.conditions = conditions
errors = types.ModuleType('botocore.exceptions'); errors.ClientError = FakeClientError
botocore = types.ModuleType('botocore'); botocore.exceptions = errors
modules = {'boto3': boto, 'boto3.dynamodb': dynamo, 'boto3.dynamodb.conditions': conditions, 'botocore': botocore, 'botocore.exceptions': errors}
with patch.dict(sys.modules, modules), patch.dict(os.environ, {'TABLE_NAME': 'test'}):
    spec = importlib.util.spec_from_file_location('gather_api', pathlib.Path(__file__).parents[1] / 'backend' / 'app.py')
    app = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(app)

def call(method, path, body=None):
    event = {'requestContext': {'http': {'method': method}}, 'rawPath': path}
    if body is not None: event['body'] = json.dumps(body)
    result = app.handler(event, None)
    return result['statusCode'], json.loads(result['body'])

class ApiTests(unittest.TestCase):
    def setUp(self): fake_table.items.clear()
    def test_event_and_task_lifecycle(self):
        status, event = call('POST','/events',{'title':'Community day','date':'2027-06-19','location':'London'})
        self.assertEqual(status,201)
        event_id=event['id']
        self.assertEqual(call('GET','/events')[1]['events'][0]['title'], 'Community day')
        status, task=call('POST',f'/events/{event_id}/tasks',{'title':'Book the room'})
        self.assertEqual(status,201)
        task_path=f"/events/{event_id}/tasks/{task['id']}"
        self.assertEqual(call('PATCH',task_path,{'done':True})[1]['done'],True)
        self.assertEqual(call('GET',f'/events/{event_id}/tasks')[1]['tasks'][0]['done'],True)
        self.assertNotIn('pk',call('GET','/events')[1]['events'][0])
    def test_validation_and_not_found(self):
        self.assertEqual(call('POST','/events',{'title':'','date':'2027-06-19'})[0],400)
        self.assertEqual(call('POST','/events',{'title':'Meetup','date':'2027-02-30'})[0],400)
        self.assertEqual(call('GET',f"/events/{'a'*32}/tasks")[0],404)
        _, event=call('POST','/events',{'title':'Meetup','date':'2027-02-01'})
        path=f"/events/{event['id']}/tasks/{'b'*32}"
        self.assertEqual(call('PATCH',path,{'done':True})[0],404)
        self.assertEqual(call('PATCH',path,{'done':'true'})[0],400)
    def test_bad_json(self):
        result=app.handler({'requestContext':{'http':{'method':'POST'}},'rawPath':'/events','body':'{'},None)
        self.assertEqual(result['statusCode'],400)

if __name__ == '__main__': unittest.main()
