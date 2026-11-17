"""Single owner-approved test invitation; does not assign/accept the order or change real vehicle eligibility."""
import asyncio,json,os
from datetime import datetime,timezone
import pymongo

async def main():
    db=pymongo.MongoClient(os.environ['MONGO_URL'],serverSelectionTimeoutMS=20000)[os.environ['DB_NAME']]
    email='vsaraswathi@innovease-ai.in';oid='LE261116A46516'
    user=db.users.find_one({'email':email})
    if not user or user.get('role')!='partner' or user.get('partner_status')!='approved':raise RuntimeError('Expected approved partner account not found.')
    if (user.get('partner_profile') or {}).get('vehicle_type')!='two_wheeler':raise RuntimeError('Vehicle profile changed. Review before continuing.')
    order=db.orders.find_one({'order_id':oid})
    if not order or not order.get('is_test') or order.get('status')!='paid' or order.get('partner_id') or order.get('testing',{}).get('actual_received_paise')!=0:raise RuntimeError('Expected unassigned simulated order not found.')
    existing=order.get('testing',{}).get('allowed_partner_id')
    if existing and existing!=user['user_id']:raise RuntimeError('A different test partner is already invited.')
    now=datetime.now(timezone.utc).isoformat()
    result=db.orders.update_one({'_id':order['_id'],'is_test':True,'status':'paid','partner_id':None,'testing.actual_received_paise':0,'$or':[{'testing.allowed_partner_id':{'$exists':False}},{'testing.allowed_partner_id':user['user_id']}]},
        {'$set':{'testing.allowed_partner_id':user['user_id'],'testing.allow_vehicle_mismatch':True,'testing.invited_at':now,'testing.invitation_authority':'Owner explicitly approved this one test order for this partner; real vehicle profile unchanged','updated_at':now}})
    if result.matched_count!=1:raise RuntimeError('Order changed; invitation was not applied.')
    import server
    test_jobs=await server.open_jobs(scope='test',user=user)
    live_jobs=await server.open_jobs(scope='live',user=user)
    offer=next((o for o in test_jobs if o['order_id']==oid),None)
    assert offer and offer['is_test'] and offer['status']=='paid'
    assert offer['customer_email'] is None and offer['customer_phone'] is None and offer['pickup_otp'] is None
    assert not any(o['order_id']==oid for o in live_jobs)
    assert (db.users.find_one({'_id':user['_id']}).get('partner_profile') or {}).get('vehicle_type')=='two_wheeler'
    print(json.dumps({'order_id':oid,'invited_partner':email,'status':'paid','test_offer_verified':True,'real_vehicle_unchanged':'two_wheeler','real_job_exposure':False,'order_accepted':False,'money_received_paise':0}))

if __name__=='__main__':asyncio.run(main())
