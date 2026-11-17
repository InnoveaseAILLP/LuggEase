from datetime import timedelta
import pytest
import server
from test_api_integration import app,enroll,headers,quote_body  # noqa:F401

@pytest.mark.asyncio
async def test_test_revision_reason_and_simulated_balance_without_money_or_auto_departure(app,monkeypatch):
    client,db=app;await enroll(client,'owner');driver=await enroll(client,'driver','partner');await enroll(client,'other','partner')
    o=(await client.post('/api/orders',headers=headers('owner'),json=quote_body())).json();oid=o['order_id'];path='/api/orders/'+oid
    p=o['payment_plan'];stamp=server.iso(server.now_utc())
    await db.orders.update_one({'order_id':oid},{'$set':{'is_test':True,'status':'picked_up','partner_id':driver['user_id'],'testing':{'allowed_partner_id':driver['user_id'],'actual_received_paise':0},'pickup_signatures_completed_at':stamp,'payment_plan.advance_paid_paise':p['advance_paise'],'payment_plan.paid_paise':p['advance_paise']}})
    eta={'expected_delivery_at':server.iso(server.now_utc()+timedelta(hours=2)),'reason':'Test'}
    assert (await client.post(path+'/delivery-estimate',headers=headers('driver'),json=eta)).status_code==200
    short=await client.post(path+'/delivery-estimate',headers=headers('driver'),json={**eta,'reason':'T'})
    assert short.status_code==422 and 'at least 4 characters' in short.json()['detail']
    past=await client.post(path+'/delivery-estimate',headers=headers('driver'),json={**eta,'expected_delivery_at':server.iso(server.now_utc()-timedelta(minutes=1))})
    assert past.status_code==422 and 'future' in past.json()['detail']
    assert (await client.post(path+'/status',headers=headers('driver'),json={'status':'in_transit'})).status_code==409
    body={'confirm_no_money_received':True}
    assert (await client.post(path+'/simulate-pickup-balance',headers=headers('owner'),json=body)).status_code==403
    assert (await client.post(path+'/simulate-pickup-balance',headers=headers('other'),json=body)).status_code==404
    assert (await client.post(path+'/simulate-pickup-balance',headers=headers('driver'),json={'confirm_no_money_received':False})).status_code==422
    await db.orders.update_one({'order_id':oid},{'$unset':{'pickup_signatures_completed_at':''}})
    assert (await client.post(path+'/simulate-pickup-balance',headers=headers('driver'),json=body)).status_code==409
    await db.orders.update_one({'order_id':oid},{'$set':{'pickup_signatures_completed_at':stamp,'is_test':False}})
    real=await client.post(path+'/delivery-estimate',headers=headers('driver'),json=eta)
    assert real.status_code==422 and 'at least 10 characters' in real.json()['detail']
    assert (await client.post(path+'/simulate-pickup-balance',headers=headers('driver'),json=body)).status_code==403
    await db.orders.update_one({'order_id':oid},{'$set':{'is_test':True}})
    def no_provider():raise AssertionError('No payment provider may be called')
    monkeypatch.setattr(server,'rzp_client',no_provider)
    recorded=await client.post(path+'/simulate-pickup-balance',headers=headers('driver'),json=body)
    assert recorded.status_code==200,recorded.text
    result=recorded.json();assert result['status']=='picked_up' and result['payment_plan']['paid_paise']==p['total_paise']
    assert result['testing']['actual_received_paise']==0 and not result.get('payments') and not result.get('payment')
    repeat=await client.post(path+'/simulate-pickup-balance',headers=headers('driver'),json=body)
    assert repeat.status_code==200 and repeat.json()['testing']['balance_simulated_at']==result['testing']['balance_simulated_at']
    assert (await client.post(path+'/status',headers=headers('driver'),json={'status':'in_transit'})).status_code==200
