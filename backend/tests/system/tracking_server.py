"""Loopback-only system-test service. No production identities, database or providers."""
import asyncio
import json
import os
from pathlib import Path
import runpy
import socket

if __name__ != '__main__' or os.environ.get('LUGGEASE_ALLOW_ISOLATED_SIT') != '1':
    raise RuntimeError('Run only through the isolated system integration test runner')
runpy.run_path(str(Path(__file__).resolve().parents[1] / 'conftest.py'))
os.environ['TRUST_API_GATEWAY']='false'
os.environ['RAZORPAY_KEY_ID']=''
os.environ['RAZORPAY_KEY_SECRET']=''
from fastapi import HTTPException, Request
from mongomock_motor import AsyncMongoMockClient
import uvicorn
import server
server.db=AsyncMongoMockClient()['luggease_isolated_socket_sit']
actors={'sit-partner':{'user_id':'SIT-PARTNER','role':'partner'},
        'sit-customer':{'user_id':'SIT-CUSTOMER','role':'customer'},
        'sit-outsider':{'user_id':'SIT-OUTSIDER','role':'customer'}}
async def identity(request:Request):
    token=request.headers.get('authorization','').removeprefix('Bearer ')
    if token not in actors: raise HTTPException(401,'Please sign in to continue.')
    return actors[token]
server.app.dependency_overrides[server.current_user]=identity
async def seed():
    for oid,status in [('SIT-LIVE','in_transit'),('SIT-NOT-STARTED','assigned')]:
        await server.db.orders.insert_one({'order_id':oid,'status':status,'customer_id':'SIT-CUSTOMER','partner_id':'SIT-PARTNER'})
asyncio.run(seed())
sock=socket.socket()
sock.bind(('127.0.0.1',0))
sock.listen(128)
print(json.dumps({'port':sock.getsockname()[1]}),flush=True)
uvicorn.Server(uvicorn.Config(server.app,log_level='error',lifespan='off')).run(sockets=[sock])
