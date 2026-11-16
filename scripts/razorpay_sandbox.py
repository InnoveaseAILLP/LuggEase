"""Local-only sandbox checkout using real Test API and isolated, in-memory shipment data.
Run from repository root: .venv/bin/python scripts/razorpay_sandbox.py
Never deploy this harness. No production server or database is imported.
"""
import asyncio
import json
import os
import sys
import uuid
from datetime import datetime, timezone
from pathlib import Path
from types import SimpleNamespace

import razorpay
import uvicorn
from dotenv import dotenv_values
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import HTMLResponse
from mongomock_motor import AsyncMongoMockClient
from pymongo.errors import DuplicateKeyError

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'backend'))
from instalments import payment_plan, create_instalment, confirm_instalment  # noqa: E402

credentials = dotenv_values(ROOT / 'backend/.env.razorpay-test')
if not (credentials.get('RAZORPAY_KEY_ID', '').startswith('rzp_test_') and credentials.get('RAZORPAY_KEY_SECRET')):
    raise SystemExit('A Test Mode key and matching secret are required.')
for key in ('RAZORPAY_KEY_ID', 'RAZORPAY_KEY_SECRET'):
    os.environ[key] = credentials[key]
provider = razorpay.Client(auth=(credentials['RAZORPAY_KEY_ID'], credentials['RAZORPAY_KEY_SECRET']))
db = AsyncMongoMockClient()['luggease_sandbox_' + uuid.uuid4().hex]
user = {'user_id': 'sandbox-customer', 'name': 'LuggEase Sandbox Customer', 'email': 'sandbox@example.com'}
order_id = 'QA-' + uuid.uuid4().hex[:12]

def iso(dt): return dt.isoformat()
def now(): return datetime.now(timezone.utc)
async def invoice_no(): return 'SAMPLE-TEST-' + order_id
ctx = SimpleNamespace(db=db, rzp_client=lambda: provider, os=os, DuplicateKeyError=DuplicateKeyError,
                      iso=iso, now_utc=now, next_invoice_no=invoice_no,
                      SUPPLIER={'name': 'LuggEase TEST ONLY'}, public_base=lambda request: str(request.base_url).rstrip('/'))
app = FastAPI(title='LuggEase isolated Razorpay Test Mode')

@app.on_event('startup')
async def seed():
    await db.payment_sessions.create_index('session_key', unique=True)
    await db.orders.insert_one({'order_id': order_id, 'customer_id': user['user_id'], 'status': 'pending_payment',
        'payment_plan': payment_plan(47), 'quote': {'grand_total': 47}, 'payments': [], 'timeline': []})

@app.middleware('http')
async def local_only(request, call_next):
    if request.headers.get('host') != '127.0.0.1:8766' or (request.method == 'POST' and request.headers.get('origin') != 'http://127.0.0.1:8766'):
        from starlette.responses import JSONResponse
        return JSONResponse({'detail': 'Local same-origin sandbox only'}, status_code=403)
    response = await call_next(request)
    response.headers['Cache-Control'] = 'no-store'
    return response

@app.get('/', response_class=HTMLResponse)
async def page():
    return '''<!doctype html><html><head><meta charset="utf-8"><title>LuggEase payment sandbox</title>
<script src="https://checkout.razorpay.com/v1/checkout.js"></script>
<style>body{font:18px system-ui;max-width:780px;margin:50px auto;background:#fff8f0;color:#402814}button{padding:16px;margin:8px;background:#cc5800;color:white;border:0;border-radius:8px}pre{white-space:pre-wrap}</style></head>
<body><h1>LuggEase — Test Mode only</h1><p>Synthetic shipment. No real money, customer signatures or production records.</p>
<p>Sample invoice ₹47: booking advance ₹23.50; pickup balance ₹23.50.</p>
<button onclick="pay('advance')">Test 50% booking advance</button>
<button onclick="loaded()">Simulate loaded goods and signature prerequisite</button>
<button onclick="pay('balance')">Test 50% pickup balance</button><pre id="result">Ready for sandbox checkout.</pre>
<script>
async function post(path,body){let r=await fetch(path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});let j=await r.json();if(!r.ok)throw Error(j.detail);return j;}
function show(x){document.getElementById('result').textContent=JSON.stringify(x,null,2);}
async function loaded(){try{show(await post('/loaded',{}));}catch(e){show(e.message)}}
async function pay(stage){try{let p=await post('/create',{stage});let r=new Razorpay({key:p.key_id,order_id:p.razorpay_order_id,amount:p.amount,currency:'INR',name:'LuggEase TEST',description:stage+' — simulated payment',prefill:{name:'Sandbox Customer',email:'sandbox@example.com',contact:'9999999999'},handler:async response=>{try{show(await post('/verify',response))}catch(e){show(e.message)}},theme:{color:'#cc5800'}});r.on('payment.failed',e=>show(e.error.description));r.open();}catch(e){show(e.message)}}
</script></body></html>'''

@app.post('/create')
async def create(request: Request):
    body = await request.json()
    order = await db.orders.find_one({'order_id': order_id}, {'_id': 0})
    return await create_instalment(ctx, order, user, request, body.get('stage'))

@app.post('/loaded')
async def loaded():
    order = await db.orders.find_one({'order_id': order_id})
    if not order['payment_plan']['advance_paid_paise']:
        raise HTTPException(409, 'Complete the test advance first.')
    await db.orders.update_one({'order_id': order_id}, {'$set': {'status': 'assigned', 'partner_id': 'synthetic-partner', 'pickup_signatures_completed_at': iso(now())}})
    return {'sandbox_only': True, 'prerequisite': 'Synthetic loaded/signature checkpoint; not an actual customer signature'}

@app.post('/verify')
async def verify(request: Request):
    receipt = await request.json()
    session = await db.payment_sessions.find_one({'razorpay_order_id': receipt.get('razorpay_order_id')}, {'_id': 0})
    if not session: raise HTTPException(404, 'Unknown sandbox payment')
    result = await confirm_instalment(ctx, session, receipt['razorpay_payment_id'], receipt['razorpay_signature'], user['user_id'])
    repeated = await confirm_instalment(ctx, session, receipt['razorpay_payment_id'], receipt['razorpay_signature'], user['user_id'])
    assert result['payment_plan'] == repeated['payment_plan'] and len(result['payments']) == len(repeated['payments'])
    report = {'environment': 'Razorpay Test Mode + isolated in-memory database', 'real_money': False,
        'production_data_used': False, 'tested_at': iso(now()), 'order_id': order_id,
        'payment_plan': result['payment_plan'], 'payments': result['payments'], 'duplicate_receipt_idempotent': True,
        'pickup_prerequisite': 'Synthetic checkpoint, not a real signature', 'status': result['status']}
    (ROOT / 'test_reports/razorpay-sandbox.json').write_text(json.dumps(report, indent=2))
    return report

if __name__ == '__main__':
    uvicorn.run(app, host='127.0.0.1', port=8766, access_log=False)
