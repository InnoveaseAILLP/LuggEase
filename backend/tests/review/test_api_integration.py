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
    await db.orders.update_one({'order_id':oid},{'$set':{'status':'paid'}})
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
