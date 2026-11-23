"""Write public frontend settings supplied as environment variables. No AWS secrets belong here."""
import json
import os
import pathlib
import sys
from urllib.parse import urlparse

required = ('GATHER_API_URL', 'GATHER_AUTH_DOMAIN', 'GATHER_CLIENT_ID')
missing = [name for name in required if not os.environ.get(name)]
if missing:
    sys.exit('Missing configuration: ' + ', '.join(missing))
for name in required[:2]:
    parsed = urlparse(os.environ[name])
    if parsed.scheme != 'https' or not parsed.netloc or parsed.username or parsed.password:
        sys.exit(name + ' must be an HTTPS URL without credentials')
config = {'apiUrl': os.environ['GATHER_API_URL'].rstrip('/'),
          'cognitoDomain': os.environ['GATHER_AUTH_DOMAIN'].rstrip('/'),
          'cognitoClientId': os.environ['GATHER_CLIENT_ID']}
pathlib.Path('frontend/config.js').write_text('window.GATHER_CONFIG = ' + json.dumps(config) + ';\n')
print('Wrote frontend/config.js with public service endpoints.')
