#!/bin/bash
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive
if ! command -v docker >/dev/null; then
 apt-get update -qq
 apt-get install -y -qq docker.io python3
fi
systemctl enable --now docker
install -d -m 700 /etc/luggease-mongo
python3 - <<'PY'
import json, urllib.request, base64, os
req=urllib.request.Request('http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token',headers={'Metadata-Flavor':'Google'})
token=json.load(urllib.request.urlopen(req))['access_token']
req=urllib.request.Request('https://secretmanager.googleapis.com/v1/projects/luggease-innovease/secrets/luggease-mongo-bootstrap/versions/latest:access',headers={'Authorization':'Bearer '+token})
data=json.loads(base64.b64decode(json.load(urllib.request.urlopen(req))['payload']['data']))
for name, value in data.items():
 p='/etc/luggease-mongo/'+name
 with open(p,'w') as f: f.write(value)
 os.chmod(p,0o600)
# Mongo image runs as uid 999; only this user and root may read server keys.
os.chown('/etc/luggease-mongo/server.pem',999,999)
os.chmod('/etc/luggease-mongo/init.js',0o644)
os.chmod('/etc/luggease-mongo/ca.crt',0o644)
PY
# First launch creates the scoped application user on localhost before publishing the TLS listener.
if docker container inspect luggease-mongo >/dev/null 2>&1 && [ "$(docker inspect --format='{{index .Config.Labels "luggease.config"}}' luggease-mongo)" != "2" ]; then
 docker stop luggease-mongo
 docker rm luggease-mongo
fi
if ! docker container inspect luggease-mongo >/dev/null 2>&1; then
 docker run -d --name luggease-mongo --label luggease.config=2 --restart unless-stopped \
  -p 10.24.0.10:27017:27017 -v luggease-mongo-data:/data/db \
  -v /etc/luggease-mongo/ca.crt:/etc/mongo/ca.crt:ro \
  -v /etc/luggease-mongo/server.pem:/etc/mongo/server.pem:ro \
  -v /etc/luggease-mongo/init.js:/docker-entrypoint-initdb.d/init.js:ro \
  --env-file /etc/luggease-mongo/root.env mongo:8.0 \
  --auth --tlsMode requireTLS --tlsCertificateKeyFile /etc/mongo/server.pem \
  --tlsCAFile /etc/mongo/ca.crt --tlsAllowConnectionsWithoutCertificates --wiredTigerCacheSizeGB 0.5
fi
sleep 8
docker inspect --format='MongoDB state={{.State.Status}} exit={{.State.ExitCode}}' luggease-mongo
docker logs --tail 18 luggease-mongo
