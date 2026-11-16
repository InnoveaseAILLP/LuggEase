"""ASGI integration tests: real routing/validation/authorization + isolated Mongo substitute."""
import asyncio
import os
import uuid
from motor.motor_asyncio import AsyncIOMotorClient
from unittest.mock import AsyncMock
import httpx
import pytest
import pytest_asyncio
from fastapi import HTTPException
from mongomock_motor import AsyncMongoMockClient
import server

@pytest_asyncio.fixture
async def app(monkeypatch):
    mongo = AsyncIOMotorClient(os.environ['LUGGEASE_TEST_MONGO_URL']) if os.environ.get('LUGGEASE_TEST_MONGO_URL') else AsyncMongoMockClient()
    database_name = 'luggease_review_' + uuid.uuid4().hex
    db = mongo[database_name]
    monkeypatch.setattr(server,'db',db)
    monkeypatch.setattr(server,'ALLOW_LEGACY_AUTH',False)
    async def verify(token):
        if token == 'invalid': raise HTTPException(401,'Invalid identity')
        if token == 'unverified': raise HTTPException(403,'Verify your email')
        return {'uid':token, 'email':f'{token}@example.com', 'email_verified':True, 'name':'Test User'}
    monkeypatch.setattr(server,'verify_identity',verify)
    # Existing booking/payment scenarios simulate an already reviewed ownership agreement.
    # Dedicated workflow tests below restore the real agreement validator.
    async def verified_test_agreement(body,user):
        return {'agreement_id':'TEST-PREVERIFIED','quote':server.compute_quote(body)}
    monkeypatch.setattr(server,'validate_booking_agreement',verified_test_agreement)
    async def test_route(pickup,drop,stops,departure):
        return {'distance_km':10,'duration_seconds':1200,'static_duration_seconds':1000,'source':'google_routes','departure_at':departure.isoformat()}
    monkeypatch.setattr(server,'road_route',test_route)
    await server.ensure_indexes()
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=server.app),base_url='http://test') as client:
        yield client,db
    await mongo.drop_database(database_name)
    if os.environ.get("LUGGEASE_TEST_MONGO_URL"): mongo.close()

def headers(token): return {'Authorization':f'Bearer {token}'}
async def enroll(client, token, role='customer'):
    response = await client.post('/api/auth/firebase/session',headers=headers(token))
    assert response.status_code == 200, response.text
    if role:
        assert (await client.post('/api/auth/role',headers=headers(token),json={'role':role})).status_code == 200
    return response.json()

def quote_body():
    return {'pickup_address':'Koramangala Bengaluru','drop_address':'Whitefield Bengaluru',
            'pickup_state':'Karnataka','drop_state':'Karnataka','distance_km':10,
            'items':[{'key':'sofa','qty':1}],'service_type':'shift_only'}

@pytest.mark.asyncio
async def test_reject_unauthenticated_unverified_and_legacy(app):
    client,_ = app
    assert (await client.get('/api/auth/me')).status_code == 401
    for token,code in [('invalid',401),('unverified',403)]:
        assert (await client.post('/api/auth/firebase/session',headers=headers(token))).status_code == code
    assert (await client.post('/api/auth/login',json={'email':'a@example.com','password':'password'})).status_code == 410
    assert (await client.post('/api/auth/register',json={'name':'Test','email':'a@example.com','password':'password'})).status_code == 410

@pytest.mark.asyncio
async def test_profile_is_idempotent_and_role_cannot_escalate(app):
    client,db = app
    first = await enroll(client,'alice',None)
    second = (await client.post('/api/auth/firebase/session',headers=headers('alice'))).json()
    assert first['user_id'] == second['user_id']
    assert await db.users.count_documents({}) == 1
    assert (await client.post('/api/auth/role',headers=headers('alice'),json={'role':'admin'})).status_code == 422
    assert (await client.get('/api/admin/partners',headers=headers('alice'))).status_code == 403
    await client.post('/api/auth/role',headers=headers('alice'),json={'role':'customer'})
    assert (await client.post('/api/auth/role',headers=headers('alice'),json={'role':'partner'})).status_code == 400

@pytest.mark.asyncio
async def test_matching_email_does_not_link_legacy_admin(app):
    client,db = app
    await db.users.insert_one({'user_id':'legacy','email':'alice@example.com','role':'admin'})
    response=await client.post('/api/auth/firebase/session',headers=headers('alice'))
    assert response.status_code == 409
    existing=await db.users.find_one({'user_id':'legacy'})
    assert existing['role']=='admin' and 'firebase_uid' not in existing

@pytest.mark.asyncio
async def test_customer_booking_and_order_privacy(app):
    client,db=app
    await enroll(client,'alice'); await enroll(client,'bob')
    response=await client.post('/api/orders',headers=headers('alice'),json=quote_body())
    assert response.status_code==200,response.text
    order=response.json(); oid=order['order_id']
    assert order['status']=='pending_payment' and len(order['pickup_otp'])==4
    assert (await client.get(f'/api/orders/{oid}',headers=headers('bob'))).status_code==404
    assert (await client.get('/api/orders',headers=headers('bob'))).json()==[]
    cancelled=await client.post(f'/api/orders/{oid}/cancel',headers=headers('alice'))
    assert cancelled.json()['status']=='cancelled'
    assert (await client.post(f'/api/orders/{oid}/cancel',headers=headers('alice'))).status_code==400

@pytest.mark.asyncio
async def test_partner_approval_and_otp_hidden(app):
    client,db=app
    customer=await enroll(client,'alice');partner=await enroll(client,'driver','partner')
    order=(await client.post('/api/orders',headers=headers('alice'),json=quote_body())).json();oid=order['order_id']
    await db.orders.update_one({'order_id':oid},{'$set':{'status':'paid','pickup_signatures_completed_at':'2026-11-16T00:00:00Z'},'$unset':{'payment_plan':''}})
    assert (await client.post(f'/api/orders/{oid}/accept',headers=headers('driver'))).status_code==403
    await db.users.update_one({'user_id':partner['user_id']},{'$set':{'partner_status':'approved','partner_profile':{'vehicle_type':'mini_truck'}}})
    listing=await client.get(f'/api/orders/{oid}',headers=headers('driver'))
    assert listing.json()['pickup_otp'] is None and listing.json()['customer_email'] is None
    accepted=await client.post(f'/api/orders/{oid}/accept',headers=headers('driver'))
    assert accepted.status_code==200 and accepted.json()['pickup_otp'] is None
    bad=await client.post(f'/api/orders/{oid}/status',headers=headers('driver'),json={'status':'picked_up','otp':'wrong'})
    assert bad.status_code==400
    good=await client.post(f'/api/orders/{oid}/status',headers=headers('driver'),json={'status':'picked_up','otp':order['pickup_otp']})
    assert good.status_code==200 and good.json()['pickup_otp'] is None
    assert (await client.post(f'/api/orders/{oid}/status',headers=headers('driver'),json={'status':'delivered'})).status_code==400

@pytest.mark.asyncio
async def test_admin_bootstrap_never_promotes_existing_account(app,monkeypatch):
    _,db=app
    monkeypatch.setattr(server,'ALLOW_LEGACY_AUTH',True)
    monkeypatch.setattr(server,'ADMIN_EMAIL','existing@example.com')
    monkeypatch.setattr(server,'ADMIN_PASSWORD','new-password')
    await db.users.insert_one({'user_id':'existing','email':'existing@example.com','role':'customer','password_hash':'original'})
    await server.seed_admin()
    user=await db.users.find_one({'user_id':'existing'})
    assert user['role']=='customer' and user['password_hash']=='original'

@pytest.mark.asyncio
async def test_cancel_detects_concurrent_status_change(app,monkeypatch):
    client,db=app
    await enroll(client,'alice')
    order=(await client.post('/api/orders',headers=headers('alice'),json=quote_body())).json()
    real=server.get_order_for
    async def race(oid,user):
        snapshot=await real(oid,user)
        await db.orders.update_one({'order_id':oid},{'$set':{'status':'in_transit'}})
        return snapshot
    monkeypatch.setattr(server,'get_order_for',race)
    result=await client.post(f"/api/orders/{order['order_id']}/cancel",headers=headers('alice'))
    assert result.status_code==409
    assert (await db.orders.find_one({'order_id':order['order_id']}))['status']=='in_transit'

@pytest.mark.asyncio
async def test_concurrent_enrollment_creates_one_profile(app):
    client,db = app
    responses = await asyncio.gather(*[client.post('/api/auth/firebase/session',headers=headers('simultaneous')) for _ in range(5)])
    assert all(r.status_code == 200 for r in responses), [(r.status_code, r.text) for r in responses]
    assert len({r.json()['user_id'] for r in responses}) == 1
    assert await db.users.count_documents({'firebase_uid':'simultaneous'}) == 1

@pytest.mark.asyncio
async def test_legacy_demo_seeding_cannot_create_unusable_firebase_accounts(app):
    client,db = app
    user = await enroll(client,'administrator',None)
    await db.users.update_one({'user_id':user['user_id']},{'$set':{'role':'admin'}})
    response = await client.post('/api/admin/seed-test-users',headers=headers('administrator'))
    assert response.status_code == 410
    assert await db.users.count_documents({}) == 1

@pytest.mark.asyncio
async def test_same_uid_insert_between_profile_lookups_is_not_a_legacy_collision(monkeypatch):
    existing={'user_id':'one','firebase_uid':'verified-uid','email':'alice@example.com','role':'customer'}
    users=type('Users',(),{})()
    users.find_one=AsyncMock(side_effect=[None,existing])
    monkeypatch.setattr(server,'db',type('Database',(),{'users':users})())
    profile=await server.firebase_profile({'uid':'verified-uid','email':'alice@example.com'},create=True)
    assert profile==existing

@pytest.mark.asyncio
async def test_places_require_login_and_validate_input(app, monkeypatch):
    client, _ = app
    assert (await client.get('/api/places/autocomplete?input=Coimbatore&session_token=abcdefghijklmnop')).status_code == 401
    await enroll(client, 'alice')
    stub = AsyncMock(return_value={'suggestions': [{'place_id':'abc', 'title':'Coimbatore', 'subtitle':'Tamil Nadu'}]})
    monkeypatch.setattr(server.google_places, 'autocomplete', stub)
    assert (await client.get('/api/places/autocomplete?input=Co&session_token=abcdefghijklmnop', headers=headers('alice'))).status_code == 422
    result = await client.get('/api/places/autocomplete?input=Coimbatore&session_token=abcdefghijklmnop', headers=headers('alice'))
    assert result.status_code == 200 and result.json()['suggestions'][0]['place_id'] == 'abc'
    stub.assert_awaited_once_with('Coimbatore', 'abcdefghijklmnop')
    details = AsyncMock(return_value={'address':'Coimbatore, Tamil Nadu, India', 'state':'Tamil Nadu', 'place_id':'abc'})
    monkeypatch.setattr(server.google_places, 'details', details)
    result = await client.get('/api/places/details/abc?session_token=abcdefghijklmnop', headers=headers('alice'))
    assert result.status_code == 200 and result.json()['state'] == 'Tamil Nadu'
    assert (await client.get('/api/places/details/abc?session_token=bad', headers=headers('alice'))).status_code == 422

@pytest.mark.asyncio
async def test_sales_invoice_private_and_only_after_payment(app):
    from io import BytesIO
    from pypdf import PdfReader
    client, db = app
    await enroll(client, 'alice'); await enroll(client, 'bob'); await enroll(client, 'driver', 'partner')
    order = (await client.post('/api/orders', headers=headers('alice'), json=quote_body())).json()
    path = f"/api/orders/{order['order_id']}/invoice.pdf"
    assert (await client.get(path)).status_code == 401
    assert (await client.get(path, headers=headers('bob'))).status_code == 404
    assert (await client.get(path, headers=headers('alice'))).status_code == 409
    supplier = {**server.SUPPLIER, 'name':'Historical Supplier LLP'}
    await db.orders.update_one({'order_id': order['order_id']}, {'$set': {
        'invoice_no':'LE/TEST/001', 'invoice_date':'2026-11-15T00:00:00Z', 'status':'paid', 'invoice_supplier':supplier}})
    assert (await client.get(path, headers=headers('driver'))).status_code == 404
    result = await client.get(path, headers=headers('alice'))
    assert result.status_code == 200 and result.content.startswith(b'%PDF')
    assert result.headers['cache-control'] == 'private, no-store'
    assert 'LuggEase-Sales-Invoice-LE-TEST-001.pdf' in result.headers['content-disposition']
    document = PdfReader(BytesIO(result.content))
    content = '\n'.join(p.extract_text() for p in document.pages)
    assert 'Historical Supplier LLP' in content and 'SALES INVOICE' in content
    assert order['pickup_otp'] not in content

@pytest.mark.asyncio
async def test_payment_snapshots_invoice_supplier_once(app, monkeypatch):
    import hashlib
    import hmac
    from types import SimpleNamespace
    client, db = app
    owner = await enroll(client, 'alice')
    order = (await client.post('/api/orders', headers=headers('alice'), json=quote_body())).json()
    await db.orders.update_one({'order_id':order['order_id']}, {'$set':{'razorpay_order_id':'test_rzp','amount_paise':10000},'$unset':{'payment_plan':''}})
    monkeypatch.setenv('RAZORPAY_KEY_SECRET','isolated-test-secret')
    payment=SimpleNamespace(fetch=lambda _: {'order_id':'test_rzp','amount':10000,'currency':'INR','status':'captured','method':'test'})
    monkeypatch.setattr(server,'rzp_client',lambda: SimpleNamespace(payment=payment))
    signature=hmac.new(b'isolated-test-secret',b'test_rzp|test_payment',hashlib.sha256).hexdigest()
    paid=await server.mark_paid('test_rzp','test_payment',signature,owner['user_id'])
    assert paid['invoice_supplier']==server.SUPPLIER and paid['invoice_no']
    original=paid['invoice_supplier']['name']
    monkeypatch.setitem(server.SUPPLIER,'name','Future supplier name')
    repeated=await server.mark_paid('test_rzp','test_payment',signature,owner['user_id'])
    assert repeated['invoice_supplier']['name']==original and repeated['invoice_no']==paid['invoice_no']


def test_places_limit_bounds_upstream_cost(monkeypatch):
    monkeypatch.setattr(server,'_places_requests',{})
    monkeypatch.setattr(server.time,'monotonic',lambda: 100)
    for _ in range(60): server.limit_places({'user_id':'bounded'})
    with pytest.raises(HTTPException) as error: server.limit_places({'user_id':'bounded'})
    assert error.value.status_code==429
    monkeypatch.setattr(server.time,'monotonic',lambda: 161)
    server.limit_places({'user_id':'bounded'})
