"""Generate public config from AWS outputs and publish the frontend after a successful SAM update."""
import argparse
import json
import os
import subprocess
import sys


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--stack-name', default='gather-event-planner')
    parser.add_argument('--region', default='eu-north-1')
    args = parser.parse_args()
    command = ['aws', 'cloudformation', 'describe-stacks', '--stack-name', args.stack_name,
               '--region', args.region, '--output', 'json', '--no-cli-pager']
    stack = json.loads(subprocess.check_output(command, text=True))['Stacks'][0]
    if stack['StackStatus'] not in ('CREATE_COMPLETE', 'UPDATE_COMPLETE'):
        sys.exit('Stack is not ready: ' + stack['StackStatus'])
    outputs = {item['OutputKey']: item['OutputValue'] for item in stack.get('Outputs', [])}
    required = ('ApiUrl', 'CognitoDomain', 'CognitoClientId', 'SiteBucketName', 'DistributionId', 'WebsiteUrl')
    missing = [key for key in required if not outputs.get(key)]
    if missing:
        sys.exit('Stack outputs are missing: ' + ', '.join(missing))
    env = os.environ.copy()
    env.update({'GATHER_API_URL': outputs['ApiUrl'], 'GATHER_AUTH_DOMAIN': outputs['CognitoDomain'],
                'GATHER_CLIENT_ID': outputs['CognitoClientId']})
    subprocess.run([sys.executable, 'scripts/write_config.py'], env=env, check=True)
    subprocess.run(['aws', 's3', 'sync', 'frontend/', 's3://' + outputs['SiteBucketName'] + '/',
                    '--region', args.region, '--no-cli-pager'], check=True)
    subprocess.run(['aws', 'cloudfront', 'create-invalidation', '--distribution-id', outputs['DistributionId'],
                    '--paths', '/*', '--no-cli-pager'], check=True)
    print('Frontend uploaded. Wait for cache invalidation, then visit:', outputs['WebsiteUrl'])

if __name__ == '__main__':
    main()
