import os
import pathlib
import subprocess
import sys
import tempfile
import unittest

SCRIPT = pathlib.Path(__file__).parents[1] / 'scripts' / 'write_config.py'

class PublicConfigTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        pathlib.Path(self.temp.name, 'frontend').mkdir()
        self.env = {key:value for key,value in os.environ.items() if not key.startswith('GATHER_')}
    def run_script(self):
        return subprocess.run([sys.executable,str(SCRIPT)],cwd=self.temp.name,env=self.env,text=True,capture_output=True)
    def test_rejects_missing_configuration(self):
        self.assertNotEqual(self.run_script().returncode,0)
        self.assertFalse(pathlib.Path(self.temp.name,'frontend','config.js').exists())
    def test_rejects_non_https_or_credentials(self):
        self.env.update(GATHER_API_URL='http://example.com',GATHER_AUTH_DOMAIN='https://login.example',GATHER_CLIENT_ID='client')
        self.assertNotEqual(self.run_script().returncode,0)
        self.env['GATHER_API_URL']='https://user:pass@example.com'
        self.assertNotEqual(self.run_script().returncode,0)
    def test_writes_public_configuration(self):
        self.env.update(GATHER_API_URL='https://api.example/',GATHER_AUTH_DOMAIN='https://login.example/',GATHER_CLIENT_ID='client')
        self.assertEqual(self.run_script().returncode,0)
        result=pathlib.Path(self.temp.name,'frontend','config.js').read_text()
        self.assertIn('"apiUrl": "https://api.example"',result)
        self.assertIn('"cognitoClientId": "client"',result)

if __name__ == '__main__': unittest.main()
