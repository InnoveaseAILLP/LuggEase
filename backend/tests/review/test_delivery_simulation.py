"""Complete delivery simulation: isolated identities/DB, synthetic GPS/signatures, fake payment provider."""
import asyncio
import json
from datetime import timedelta
from io import BytesIO
from pathlib import Path
import pytest
from pypdf import PdfReader
import server
from test_api_integration import app,enroll,headers,quote_body  # noqa: F401
from test_instalments import provider,receipt
from test_logistics_workflow import signature

@pytest.mark.asyncio
@pytest.mark.parametrize("assignment",["partner","admin"])
async def test_complete_customer_partner_delivery_simulation(app,monkeypatch,assignment):
    client,db=app
    await enroll(client,'simulation-customer');driver=await enroll(client,'simulation-partner','partner');await enroll(client,'outsider')
    admin=await enroll(client,'simulation-admin',None)
    await db.users.update_one({'user_id':admin['user_id']},{'$set':{'role':'admin'}})
    for token in ['simulation-customer','simulation-partner','outsider']:
        assert (await client.get('/api/admin/partners',headers=headers(token))).status_code==403
    profile={'full_name':'Synthetic Simulation Partner','phone':'9000000001','city':'Coimbatore',
        'vehicle_type':'mini_truck','vehicle_number':'TEST-ONLY','license_number':'TEST-LICENSE',
        'id_proof':'TEST-ONLY','upi_id':'simulation@example'}
    assert (await client.post('/api/partner/profile',headers=headers('simulation-partner'),json=profile)).status_code==200
    pending=(await client.get('/api/admin/partners?status=pending',headers=headers('simulation-admin'))).json()
    assert any(p['user_id']==driver['user_id'] for p in pending)
    clock=[server.now_utc()];monkeypatch.setattr(server,'now_utc',lambda:clock[0])
    monkeypatch.setattr(server,'validate_booking_agreement',server.real_validate_booking_agreement)
    body={**quote_body(),'pickup_address':'Coimbatore Railway Station, Tamil Nadu','drop_address':'Coimbatore International Airport, Tamil Nadu','pickup_state':'Tamil Nadu','drop_state':'Tamil Nadu'}
    a=(await client.post('/api/agreements/prepare',headers=headers('simulation-customer'),json=body)).json()
    assert (await client.post('/api/agreements/'+a['agreement_id']+'/accept',headers=headers('simulation-customer'),json={'ownership_confirmed':True,'agreement_sha256':a['document_sha256']})).status_code==200
    o=(await client.post('/api/orders',headers=headers('simulation-customer'),json={**body,'agreement_id':a['agreement_id']})).json();oid=o['order_id'];path=f'/api/orders/{oid}'
    _,payments,_=provider(monkeypatch)
    async def pay(stage,pid):
        r=await client.post('/api/payments/create',headers=headers('simulation-customer'),json={'order_id':oid,'stage':stage});assert r.status_code==200,r.text
        result=await client.post('/api/payments/verify',headers=headers('simulation-customer'),json=receipt(r.json(),payments,pid));assert result.status_code==200,result.text
        return result.json()
    o=await pay('advance','pay_simulation_advance');assert o['status']=='paid'
    assert (await client.get('/api/partner/jobs',headers=headers('simulation-partner'))).json()==[]
    assert (await client.post('/api/admin/partners/'+driver['user_id']+'/decision',headers=headers('simulation-admin'),json={'decision':'approved'})).status_code==200
    jobs=(await client.get('/api/partner/jobs',headers=headers('simulation-partner'))).json();assert any(j['order_id']==oid for j in jobs)
    accepted=await client.post(path+'/accept',headers=headers('simulation-partner')) if assignment=='partner' else await client.post('/api/admin/orders/'+oid+'/assign',headers=headers('simulation-admin'),json={'partner_id':driver['user_id']})
    assert accepted.status_code==200 and accepted.json()['status']=='assigned'
    assert (await client.post(path+'/accept',headers=headers('simulation-partner'))).status_code==409
    if assignment=='partner': assert accepted.json()['pickup_otp'] is None
    assert (await client.post(path+'/rate',headers=headers('simulation-customer'),json={'stars':5})).status_code==400
    assert (await client.get(path+'/tracking',headers=headers('simulation-customer'))).status_code==409
    pickup={'invoice_signature':signature(),'agreement_signature':signature(),'pickup_otp':o['pickup_otp'],'customer_name':'Synthetic Simulation Customer','goods_loaded_and_checked':True,'customer_present':True}
    assert (await client.post(path+'/pickup-signatures',headers=headers('simulation-partner'),json=pickup)).status_code==200
    o=await pay('balance','pay_simulation_balance')
    assert o['payment_plan']['paid_paise']==o['payment_plan']['total_paise']
    async def status(value,otp=None):return await client.post(path+'/status',headers=headers('simulation-partner'),json={'status':value,'otp':otp})
    assert (await status('picked_up',o['pickup_otp'])).status_code==200
    assert (await client.get(path+'/tracking',headers=headers('simulation-customer'))).status_code==409
    assert (await status('in_transit')).status_code==200
    points=[]
    for lat,lon in [(11.0015,76.9668),(11.016,77.005),(11.0268,77.0435)]:
        clock[0]+=timedelta(seconds=30)
        point={'latitude':lat,'longitude':lon,'accuracy':15,'captured_at':clock[0].isoformat()}
        assert (await client.post(path+'/tracking',headers=headers('simulation-partner'),json=point)).status_code==200
        points.append(point)
    tracked=(await client.get(path+'/tracking',headers=headers('simulation-customer'))).json()
    assert tracked['sharing_active'] and len(tracked['points'])==3
    assert (await client.get(path+'/tracking',headers=headers('outsider'))).status_code==404
    assert (await status('delivered')).status_code==409
    final={'signature':signature(),'recipient_name':'Synthetic Simulation Recipient','arrived_at_destination':True,'goods_received_and_checked':True,'customer_present':True}
    assert (await client.post(path+'/delivery-signature',headers=headers('simulation-customer'),json=final)).status_code==403
    assert (await client.post(path+'/delivery-signature',headers=headers('simulation-partner'),json={**final,'goods_received_and_checked':False})).status_code==422
    assert (await client.post(path+'/delivery-signature',headers=headers('simulation-partner'),json={**final,'signature':signature(True)})).status_code==422
    signed=await client.post(path+'/delivery-signature',headers=headers('simulation-partner'),json=final);assert signed.status_code==200,signed.text
    assert (await client.post(path+'/delivery-signature',headers=headers('simulation-partner'),json=final)).status_code==409
    delivered=await status('delivered');assert delivered.status_code==200 and delivered.json()['status']=='delivered'
    assert (await client.get(path+'/tracking',headers=headers('simulation-customer'))).status_code==409
    pdf=await client.get(path+'/invoice.pdf',headers=headers('simulation-customer'));assert pdf.status_code==200
    text=' '.join(' '.join(p.extract_text().split()) for p in PdfReader(BytesIO(pdf.content)).pages)
    assert 'Customer delivery acknowledgement after unloading' in text and 'Synthetic Simulation Recipient' in text
    partner_pdf=await client.get(path+'/pickup-invoice.pdf',headers=headers('simulation-partner'));assert partner_pdf.status_code==200
    assert 'Synthetic Simulation Recipient' in ' '.join(p.extract_text() for p in PdfReader(BytesIO(partner_pdf.content)).pages)
    comment='TEST SIMULATION - five stars for pickup, careful handling, progress updates, tracking and delivery.'
    assert (await client.post(path+'/rate',headers=headers('outsider'),json={'stars':5,'comment':comment})).status_code==404
    responses=await asyncio.gather(*[client.post(path+'/rate',headers=headers('simulation-customer'),json={'stars':5,'comment':comment}) for _ in range(2)])
    assert sorted(r.status_code for r in responses)==[200,409]
    record=await db.orders.find_one({'order_id':oid});partner=await db.users.find_one({'user_id':driver['user_id']})
    assert record['rating']['stars']==5 and partner['rating_sum']==5 and partner['rating_count']==1
    earnings=(await client.get('/api/partner/earnings',headers=headers('simulation-partner'))).json()
    assert earnings['delivered_count']==1 and earnings['active_count']==0 and earnings['awaiting_settlement']>0
    settle_path='/api/admin/orders/'+oid+'/settle'
    assert (await client.post(settle_path,headers=headers('simulation-partner'),json={'utr':'TEST-SETTLEMENT'})).status_code==403
    assert (await client.post(settle_path,headers=headers('simulation-admin'),json={'utr':'      '})).status_code==422
    # Test metadata only: this endpoint records an externally completed transfer; no bank API is called.
    settlements=await asyncio.gather(*[client.post(settle_path,headers=headers('simulation-admin'),json={'utr':f'TEST-REFERENCE-{i}'}) for i in range(2)])
    assert sorted(r.status_code for r in settlements)==[200,409]
    earnings=(await client.get('/api/partner/earnings',headers=headers('simulation-partner'))).json()
    assert earnings['settled']==earnings['net_earnings'] and earnings['awaiting_settlement']==0
    assert (await client.get('/api/admin/stats',headers=headers('simulation-admin'))).status_code==200
    report={'assignment':assignment,'admin_approval_verified':True,'settlement_metadata_verified':True,'environment' :'isolated simulation - no production records','test_users':['simulation-customer','simulation-partner'],'order_id':oid,
        'statuses':[t['status'] for t in record['timeline']],'finding_partner_verified':True,'partner_jobs_verified':True,'pickup_signatures_verified':True,
        'invoice_paid_in_full':True,'gps_source':'synthetic test coordinates, not a real journey','gps_points':points,'live_map_only_in_transit':True,
        'destination_confirmation':'synthetic partner/customer declaration, not independently verified arrival','delivery_signature_verified':True,
        'final_invoice_signature_verified':True,'feedback':record['rating'],'duplicate_feedback_prevented':True,'real_money':False}
    (Path(__file__).resolve().parents[3]/f'test_reports/delivery-simulation-{assignment}.json').write_text(json.dumps(report,indent=2))
