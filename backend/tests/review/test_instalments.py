"""All payment entities here are local fakes; no Razorpay account or live funds are used."""
import hashlib
import hmac
from types import SimpleNamespace
import pytest
import server
from instalments import payment_plan
from test_api_integration import app,enroll,headers,quote_body  # noqa:F401


def test_payment_split_integer_paise_and_rounding():
    even=payment_plan(1000)
    assert even['advance_paise']==50000 and even['balance_paise']==50000
    odd=payment_plan(1.01)
    assert odd['advance_paise']==51 and odd['balance_paise']==50
    assert odd['advance_paise']+odd['balance_paise']==odd['total_paise']


async def booking(client):
    owner=await enroll(client,'alice');await enroll(client,'bob');driver=await enroll(client,'driver','partner')
    order=(await client.post('/api/orders',headers=headers('alice'),json=quote_body())).json()
    return order,owner,driver


def provider(monkeypatch):
    monkeypatch.setenv('RAZORPAY_KEY_ID','isolated-test-key')
    monkeypatch.setenv('RAZORPAY_KEY_SECRET','isolated-test-secret')
    orders={};payments={};calls=[]
    def create(body):
        rid='rzp_'+str(len(orders)+1);result={**body,'id':rid};orders[rid]=result;calls.append(body);return result
    def fetch(pid): return payments[pid]
    sdk=SimpleNamespace(order=SimpleNamespace(create=create,payments=lambda rid:{'items':[p for p in payments.values() if p['order_id']==rid]}),payment=SimpleNamespace(fetch=fetch,capture=lambda *args:None))
    monkeypatch.setattr(server,'rzp_client',lambda:sdk)
    return orders,payments,calls


def receipt(payment,payments,pid='pay_test',**overrides):
    payments[pid]={'id':pid,'order_id':payment['razorpay_order_id'],'amount':payment['amount'],'currency':'INR','status':'captured','method':'test',**overrides}
    signature=hmac.new(b'isolated-test-secret',f"{payment['razorpay_order_id']}|{pid}".encode(),hashlib.sha256).hexdigest()
    return {'razorpay_order_id':payment['razorpay_order_id'],'razorpay_payment_id':pid,'razorpay_signature':signature}


@pytest.mark.asyncio
async def test_collection_disabled_without_merchant_credentials(app,monkeypatch):
    client,db=app;o,_,_=await booking(client)
    monkeypatch.delenv('RAZORPAY_KEY_ID',raising=False);monkeypatch.delenv('RAZORPAY_KEY_SECRET',raising=False)
    r=await client.post('/api/payments/create',headers=headers('alice'),json={'order_id':o['order_id'],'stage':'advance'})
    assert r.status_code==503
    assert not (await client.get('/api/catalog',headers=headers('alice'))).json()['payment_configuration']['enabled']
    assert await db.payment_sessions.count_documents({})==0


@pytest.mark.asyncio
async def test_advance_and_pickup_balance_exact_once_and_invoice_unchanged(app,monkeypatch):
    client,db=app;o,_,driver=await booking(client);_,payments,calls=provider(monkeypatch);oid=o['order_id'];body={'order_id':oid,'stage':'advance'}
    first=await client.post('/api/payments/create',headers=headers('alice'),json=body)
    assert first.status_code==200,first.text
    a=first.json();plan=o['payment_plan']
    assert a['amount']==plan['advance_paise'] and a['stage']=='advance'
    repeated=(await client.post('/api/payments/create',headers=headers('alice'),json=body)).json()
    assert repeated['razorpay_order_id']==a['razorpay_order_id'] and len(calls)==1
    assert (await client.post('/api/payments/create',headers=headers('bob'),json=body)).status_code==404
    signed=receipt(a,payments,'pay_advance')
    assert (await client.post('/api/payments/verify',headers=headers('bob'),json=signed)).status_code==404
    paid=await client.post('/api/payments/verify',headers=headers('alice'),json=signed)
    assert paid.status_code==200,paid.text
    after=paid.json();invoice=after['invoice_no'];supplier=after['invoice_supplier']
    assert after['status']=='paid' and after['payment_plan']['paid_paise']==plan['advance_paise']
    assert len(after['payments'])==1
    duplicate=(await client.post('/api/payments/verify',headers=headers('alice'),json=signed)).json()
    assert duplicate['payment_plan']['paid_paise']==plan['advance_paise'] and len(duplicate['payments'])==1
    assert (await client.post('/api/payments/verify',headers=headers('alice'),json={**signed,'razorpay_signature':'invalid'})).status_code==400
    balance_body={'order_id':oid,'stage':'balance'}
    assert (await client.post('/api/payments/create',headers=headers('alice'),json=balance_body)).status_code==409
    await db.orders.update_one({'order_id':oid},{'$set':{'status':'assigned','partner_id':driver['user_id']}})
    assert (await client.post('/api/payments/create',headers=headers('alice'),json=balance_body)).status_code==409
    await db.orders.update_one({'order_id':oid},{'$set':{'pickup_signatures_completed_at':server.iso(server.now_utc())}})
    assert (await client.post(f'/api/orders/{oid}/status',headers=headers('driver'),json={'status':'picked_up','otp':o['pickup_otp']})).status_code==200
    assert (await client.post(f'/api/orders/{oid}/status',headers=headers('driver'),json={'status':'in_transit'})).status_code==409
    balance=(await client.post('/api/payments/create',headers=headers('alice'),json=balance_body)).json()
    assert balance['amount']==plan['balance_paise'] and balance['razorpay_order_id']!=a['razorpay_order_id']
    finished=await client.post('/api/payments/verify',headers=headers('alice'),json=receipt(balance,payments,'pay_balance'))
    assert finished.status_code==200,finished.text
    final=finished.json()
    assert final['status']=='picked_up' and final['payment_plan']['paid_paise']==plan['total_paise']
    assert final['invoice_no']==invoice and final['invoice_supplier']==supplier and final['quote']==o['quote']
    assert len(final['payments'])==2
    assert (await client.post(f'/api/orders/{oid}/status',headers=headers('driver'),json={'status':'in_transit'})).status_code==200
    assert (await client.post('/api/payments/create',headers=headers('alice'),json=balance_body)).status_code==409


@pytest.mark.asyncio
@pytest.mark.parametrize('wrong', [{'amount':1},{'currency':'USD'},{'status':'failed'},{'order_id':'someone_else'}])
async def test_provider_receipt_must_match_stage_and_amount(app,monkeypatch,wrong):
    client,db=app;o,_,_=await booking(client);_,payments,_=provider(monkeypatch)
    a=(await client.post('/api/payments/create',headers=headers('alice'),json={'order_id':o['order_id'],'stage':'advance'})).json()
    r=await client.post('/api/payments/verify',headers=headers('alice'),json=receipt(a,payments,**wrong))
    assert r.status_code==400
    assert (await db.orders.find_one({'order_id':o['order_id']}))['payment_plan']['paid_paise']==0


@pytest.mark.asyncio
async def test_stale_client_cannot_pay_an_unexpected_stage(app,monkeypatch):
    client,_=app;o,_,_=await booking(client);provider(monkeypatch)
    assert (await client.post('/api/payments/create',headers=headers('alice'),json={'order_id':o['order_id'],'stage':'balance'})).status_code==409
    assert (await client.post('/api/payments/create',headers=headers('alice'),json={'order_id':o['order_id']})).status_code==409


@pytest.mark.asyncio
async def test_refund_uses_only_received_advance(app,monkeypatch):
    client,db=app;o,_,_=await booking(client);_,payments,_=provider(monkeypatch);oid=o['order_id']
    a=(await client.post('/api/payments/create',headers=headers('alice'),json={'order_id':oid,'stage':'advance'})).json()
    await client.post('/api/payments/verify',headers=headers('alice'),json=receipt(a,payments))
    r=await client.post(f'/api/orders/{oid}/cancel',headers=headers('alice'))
    assert r.status_code==200 and r.json()['refund_amount']==a['amount']/100
    assert r.json()['refund_amount']<o['quote']['grand_total']


@pytest.mark.asyncio
async def test_late_capture_after_cancellation_is_reconciliation_not_order_revival(app,monkeypatch):
    client,db=app;o,_,_=await booking(client);_,payments,_=provider(monkeypatch);oid=o['order_id']
    a=(await client.post('/api/payments/create',headers=headers('alice'),json={'order_id':oid,'stage':'advance'})).json()
    await client.post(f'/api/orders/{oid}/cancel',headers=headers('alice'))
    result=await client.post('/api/payments/verify',headers=headers('alice'),json=receipt(a,payments))
    assert result.status_code==409
    current=await db.orders.find_one({'order_id':oid})
    assert current['status']=='cancelled' and current['payment_plan']['paid_paise']==0
    session=await db.payment_sessions.find_one({'razorpay_order_id':a['razorpay_order_id']})
    assert session['status']=='captured_requires_refund_review'


@pytest.mark.asyncio
async def test_authenticated_reconciliation_recovers_provider_confirmed_payment(app,monkeypatch):
    client,db=app;o,_,_=await booking(client);_,payments,_=provider(monkeypatch);oid=o['order_id']
    a=(await client.post('/api/payments/create',headers=headers('alice'),json={'order_id':oid,'stage':'advance'})).json()
    receipt(a,payments)
    assert (await client.post('/api/payments/reconcile',headers=headers('bob'),json={'order_id':oid})).status_code==404
    r=await client.post('/api/payments/reconcile',headers=headers('alice'),json={'order_id':oid})
    assert r.status_code==200 and r.json()['payment_plan']['paid_paise']==a['amount']
    again=await client.post('/api/payments/reconcile',headers=headers('alice'),json={'order_id':oid})
    assert again.json()['payment_plan']['paid_paise']==a['amount'] and len(again.json()['payments'])==1


def test_sandbox_keys_cannot_enable_production_collection(monkeypatch):
    monkeypatch.setenv('RAZORPAY_KEY_ID','rzp_test_synthetic')
    monkeypatch.setenv('RAZORPAY_KEY_SECRET','synthetic-secret')
    monkeypatch.setattr(server,'APP_ENV','production')
    assert not server.payment_configuration()['enabled']
    with pytest.raises(server.HTTPException) as error: server.rzp_client()
    assert error.value.status_code==503
    monkeypatch.setattr(server,'APP_ENV','qa')
    assert server.payment_configuration()['enabled'] and server.payment_configuration()['mode']=='test'
