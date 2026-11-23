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

class Condition:
    def __init__(self, field, operator, value): self.conditions = [(field, operator, value)]
    def __and__(self, other):
        combined = Condition('', '', '')
        combined.conditions = self.conditions + other.conditions
        return combined
    def matches(self, item):
        return all(item.get(field) == value if operator == 'eq' else item.get(field, '').startswith(value)
                   for field, operator, value in self.conditions)

class FakeKey:
    def __init__(self, name): self.name = name
    def eq(self, value): return Condition(self.name, 'eq', value)
    def begins_with(self, value): return Condition(self.name, 'begins_with', value)

class FakeTable:
    def __init__(self): self.items = {}
    def put_item(self, Item): self.items[(Item['pk'], Item['sk'])] = dict(Item)
    def get_item(self, Key, **kwargs):
        item = self.items.get((Key['pk'], Key['sk']))
        return {'Item': dict(item)} if item else {}
    def query(self, KeyConditionExpression, Limit, **kwargs):
        return {'Items': [dict(v) for _, v in sorted(self.items.items()) if KeyConditionExpression.matches(v)][:Limit]}
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

def call(method, path, body=None, user='alice', token_use='access'):
    event = {'requestContext': {'http': {'method': method}}, 'rawPath': path}
    if user is not None:
        event['requestContext']['authorizer'] = {'jwt': {'claims': {'sub': user, 'token_use': token_use}}}
    if body is not None: event['body'] = json.dumps(body)
    result = app.handler(event, None)
    return result['statusCode'], json.loads(result['body'])

class ApiTests(unittest.TestCase):
    def setUp(self): fake_table.items.clear()
    def event(self, user='alice'):
        return call('POST','/events',{'title':'Community day','date':'2027-06-19','location':'London','category':'Social'},user)[1]
    def test_event_and_task_lifecycle(self):
        event=self.event(); event_id=event['id']
        self.assertEqual(event['category'],'Social')
        self.assertEqual(call('GET','/events')[1]['events'][0]['title'], 'Community day')
        status, task=call('POST',f'/events/{event_id}/tasks',{'title':'Book the room','dueDate':'2027-06-01'})
        self.assertEqual(status,201)
        self.assertEqual(task['dueDate'],'2027-06-01')
        task_path=f"/events/{event_id}/tasks/{task['id']}"
        self.assertEqual(call('PATCH',task_path,{'done':True})[1]['done'],True)
        self.assertEqual(call('GET',f'/events/{event_id}/tasks')[1]['tasks'][0]['done'],True)
        self.assertNotIn('pk',call('GET','/events')[1]['events'][0])
    def test_no_or_wrong_token_rejected(self):
        self.assertEqual(call('GET','/events',user=None)[0],401)
        self.assertEqual(call('GET','/events',user='alice',token_use='id')[0],401)
    def test_other_users_cannot_read_or_modify(self):
        event=self.event('alice'); event_id=event['id']
        _, task=call('POST',f'/events/{event_id}/tasks',{'title':'Private'},user='alice')
        path=f"/events/{event_id}/tasks/{task['id']}"
        self.assertEqual(call('GET','/events',user='bob')[1]['events'],[])
        self.assertEqual(call('GET',f'/events/{event_id}/tasks',user='bob')[0],404)
        self.assertEqual(call('POST',f'/events/{event_id}/tasks',{'title':'Inject'},user='bob')[0],404)
        self.assertEqual(call('PATCH',path,{'done':True},user='bob')[0],404)
        self.assertFalse(call('GET',f'/events/{event_id}/tasks',user='alice')[1]['tasks'][0]['done'])
    def test_user_id_in_body_is_ignored(self):
        call('POST','/events',{'title':'Test','date':'2027-06-01','userId':'bob'},user='alice')
        self.assertEqual(len(call('GET','/events',user='alice')[1]['events']),1)
        self.assertEqual(call('GET','/events',user='bob')[1]['events'],[])
    def test_legacy_public_events_not_returned_or_deleted(self):
        fake_table.put_item(Item={'pk':'EVENTS','sk':'EVENT#'+('a'*32),'title':'old demo'})
        self.assertEqual(call('GET','/events')[1]['events'],[])
        self.assertEqual(fake_table.items[('EVENTS','EVENT#'+('a'*32))]['title'],'old demo')
    def test_validation_and_not_found(self):
        self.assertEqual(call('POST','/events',{'title':'','date':'2027-06-19'})[0],400)
        self.assertEqual(call('POST','/events',{'title':'Meetup','date':'2027-02-30'})[0],400)
        self.assertEqual(call('GET',f"/events/{'a'*32}/tasks")[0],404)
        event=self.event(); event_id=event['id']
        self.assertEqual(call('POST',f'/events/{event_id}/tasks',{'title':'bad','dueDate':'2027-02-30'})[0],400)
        path=f"/events/{event_id}/tasks/{'b'*32}"
        self.assertEqual(call('PATCH',path,{'done':True})[0],404)
        self.assertEqual(call('PATCH',path,{'done':'true'})[0],400)
    def test_bad_json(self):
        event={'requestContext':{'http':{'method':'POST'},'authorizer':{'jwt':{'claims':{'sub':'alice','token_use':'access'}}}},'rawPath':'/events','body':'{'}
        self.assertEqual(app.handler(event,None)['statusCode'],400)

if __name__ == '__main__': unittest.main()
