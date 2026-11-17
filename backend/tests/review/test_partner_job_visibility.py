import asyncio
import pytest
import server
from test_api_integration import app,enroll,headers,quote_body  # noqa:F401

@pytest.mark.asyncio
async def test_real_jobs_and_invited_test_jobs_are_separate_and_atomic(app):
    client,db=app
    await enroll(client,'owner');bike=await enroll(client,'bike','partner');truck=await enroll(client,'truck','partner');other=await enroll(client,'other','partner')
    for token,user,vehicle in [('bike',bike,'two_wheeler'),('truck',truck,'mini_truck'),('other',other,'mini_truck')]:
        await db.users.update_one({'user_id':user['user_id']},{'$set':{'partner_status':'approved','partner_profile':{'vehicle_type':vehicle}}})
    real=(await client.post('/api/orders',headers=headers('owner'),json=quote_body())).json()
    test=(await client.post('/api/orders',headers=headers('owner'),json=quote_body())).json()
    await db.orders.update_one({'order_id':real['order_id']},{'$set':{'status':'paid','testing.allow_vehicle_mismatch':True}})
    await db.orders.update_one({'order_id':test['order_id']},{'$set':{'status':'paid','is_test':True,'testing':{'allowed_partner_id':bike['user_id'],'allow_vehicle_mismatch':True}}})
    assert (await client.get('/api/partner/jobs',headers=headers('bike'))).json()==[]
    live=(await client.get('/api/partner/jobs',headers=headers('truck'))).json()
    assert [o['order_id'] for o in live]==[real['order_id']]
    assert live[0]['customer_email'] is None and live[0]['customer_phone'] is None and live[0]['pickup_otp'] is None
    assert (await client.post('/api/orders/'+real['order_id']+'/accept',headers=headers('bike'))).status_code==400
    invited=(await client.get('/api/partner/jobs?scope=test',headers=headers('bike'))).json()
    assert [o['order_id'] for o in invited]==[test['order_id']]
    assert (await client.get('/api/partner/jobs?scope=test',headers=headers('other'))).json()==[]
    assert (await client.get('/api/orders/'+test['order_id'],headers=headers('other'))).status_code==404
    assert (await client.post('/api/orders/'+test['order_id']+'/accept',headers=headers('other'))).status_code==409
    assert (await client.get('/api/partner/jobs?scope=test',headers=headers('owner'))).status_code==403
    await db.orders.update_one({'order_id':test['order_id']},{'$set':{'testing.allow_vehicle_mismatch':False}})
    assert (await client.get('/api/partner/jobs?scope=test',headers=headers('bike'))).json()==[]
    assert (await client.post('/api/orders/'+test['order_id']+'/accept',headers=headers('bike'))).status_code==400
    await db.orders.update_one({'order_id':test['order_id']},{'$set':{'testing.allow_vehicle_mismatch':True}})
    results=await asyncio.gather(*[client.post('/api/orders/'+test['order_id']+'/accept',headers=headers('bike')) for _ in range(2)])
    assert sorted(r.status_code for r in results)==[200,409]
    assigned=(await client.get('/api/orders',headers=headers('bike'))).json()
    assert assigned[0]['status']=='assigned' and assigned[0]['is_test'] and assigned[0]['pickup_otp'] is None
    assert (await client.get('/api/partner/jobs?scope=test',headers=headers('bike'))).json()==[]
    assert (await client.post('/api/payments/create',headers=headers('owner'),json={'order_id':test['order_id'],'stage':'balance'})).status_code==409
    assert (await client.get('/api/partner/earnings',headers=headers('bike'))).json()['active_count']==0
    await db.orders.update_one({'order_id':test['order_id']},{'$set':{'status':'delivered','rating':None}})
    assert (await client.post('/api/orders/'+test['order_id']+'/rate',headers=headers('owner'),json={'stars':5,'comment':'Test only'})).status_code==200
    profile=await db.users.find_one({'user_id':bike['user_id']})
    assert profile.get('rating_count',0)==0 and profile.get('rating_sum',0)==0

@pytest.mark.asyncio
async def test_vehicle_filter_is_applied_before_the_newest_100_job_limit(app):
    client,db=app;bike=await enroll(client,'bike','partner')
    await db.users.update_one({'user_id':bike['user_id']},{'$set':{'partner_status':'approved','partner_profile':{'vehicle_type':'two_wheeler'}}})
    await db.orders.insert_many([{'order_id':f'large-{i}','status':'paid','partner_id':None,'created_at':'2026-11-17','quote':{'vehicle':{'key':'mini_truck'}}} for i in range(101)])
    await db.orders.insert_one({'order_id':'eligible-older','status':'paid','partner_id':None,'created_at':'2026-11-16','quote':{'vehicle':{'key':'two_wheeler'}}})
    jobs=(await client.get('/api/partner/jobs',headers=headers('bike'))).json()
    assert [o['order_id'] for o in jobs]==['eligible-older']
