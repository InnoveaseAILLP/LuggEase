"""Render the gateway's Firebase identity and private Cloud Run backend explicitly."""
import argparse
import re
from pathlib import Path
from string import Template
from urllib.parse import urlsplit

def render_gateway(project_id, backend_url):
    if not re.fullmatch(r'[a-z][a-z0-9-]{4,28}[a-z0-9]',project_id):
        raise ValueError('Use a valid Google Cloud project ID.')
    url=urlsplit(backend_url)
    if (url.scheme!='https' or not url.hostname or not url.hostname.endswith('.run.app')
        or url.username or url.password or url.port or url.query or url.fragment or url.path not in ('','/')
        or not re.fullmatch(r'[a-z0-9.-]+',url.hostname)):
        raise ValueError('Use the private Cloud Run HTTPS service URL without credentials, port, query or path.')
    template=Path(__file__).with_name('api-gateway.template.yaml').read_text()
    return Template(template).substitute(FIREBASE_PROJECT_ID=project_id,CLOUD_RUN_URL=backend_url.rstrip('/'))

if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--project-id',required=True);parser.add_argument('--backend-url',required=True)
    parser.add_argument('--output',type=Path,default=Path(__file__).with_name('api-gateway.yaml'))
    args=parser.parse_args()
    args.output.write_text(render_gateway(args.project_id,args.backend_url))
