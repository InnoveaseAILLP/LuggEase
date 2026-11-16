"""Isolated workflow tests. Synthetic agreements, signatures and paid states exist only in this isolated database."""
import base64
from datetime import datetime,timedelta,timezone
from io import BytesIO
from unittest.mock import AsyncMock
import pytest
from PIL import Image, ImageDraw
from pypdf import PdfReader
import server
from logistics import departure_at,delivery_window,IST
from test_api_integration import app,enroll,headers,quote_body  # noqa: F401


def test_delivery_window_rolls_late_and_early_arrivals_and_preserves_long_trips():
    start=datetime(2026,11,16,17,30,tzinfo=IST)
    assert delivery_window(start,3*3600)['expected_delivery_at'].startswith('2026-11-16T21:00')
    late=delivery_window(start,3*3600+1)
    assert late['expected_delivery_at']=='2026-11-17T09:00:00+05:30'
    early=delivery_window(datetime(2026,11,16,2,tzinfo=IST),3600)
    assert early['expected_delivery_at']=='2026-11-16T09:00:00+05:30'
    long=delivery_window(datetime(2026,11,16,12,tzinfo=IST),36*3600)
    assert long['expected_delivery_at']=='2026-11-18T09:00:00+05:30'
    assert long['break_seconds']==6*3600


def test_schedule_validates_past_invalid_and_future_slots():
    now=datetime(2026,11,16,12,tzinfo=IST)
    assert departure_at('17-11-2026','Now',now).hour==9
    assert departure_at('16-11-2026','14:00-16:00',now).hour==14
    for date,slot in [('15-11-2026','Now'),('16-11-2026','08:00-10:00'),('31-02-2027','Now'),('17-11-2026','99:00-99:99')]:
        with pytest.raises(server.HTTPException): departure_at(date,slot,now)


@pytest.mark.asyncio
async def test_quote_uses_server_road_distance_not_client_distance(app):
    client,_=app;await enroll(client,'alice')
    r=await client.post('/api/quote',headers=headers('alice'),json={**quote_body(),'distance_km':2999})
    assert r.status_code==200 and r.json()['distance_km']==10
    assert r.json()['delivery_estimate']['source']=='google_routes'
    assert (await client.post('/api/quote',json=quote_body())).status_code==401


@pytest.mark.asyncio
async def test_agreement_requires_ownership_review_before_booking(app,monkeypatch):
    client,db=app;await enroll(client,'alice');await enroll(client,'bob')
    monkeypatch.setattr(server,'validate_booking_agreement',server.real_validate_booking_agreement)
    prepared=await client.post('/api/agreements/prepare',headers=headers('alice'),json=quote_body())
    assert prepared.status_code==200,prepared.text
    a=prepared.json();path='/api/agreements/'+a['agreement_id']
    assert a['status']=='pending_review' and len(a['document_sha256'])==64
    document=await client.get(path+'/document.pdf',headers=headers('alice'))
    assert document.content.startswith(b'%PDF') and document.headers['cache-control']=='private, no-store'
    text='\n'.join(p.extract_text() for p in PdfReader(BytesIO(document.content)).pages)
    assert 'Logistics Transfer Agreement' in text and 'sofa' in text.lower() and 'Awaiting customer review' in text
    assert (await client.get(path,headers=headers('bob'))).status_code==404
    assert (await client.get(path+'/document.pdf',headers=headers('bob'))).status_code==404
    body={'ownership_confirmed':True,'agreement_sha256':a['document_sha256']}
    assert (await client.post(path+'/accept',headers=headers('alice'),json={**body,'ownership_confirmed':False})).status_code==422
    assert (await client.post('/api/orders',headers=headers('alice'),json={**quote_body(),'agreement_id':a['agreement_id']})).status_code==409
    assert (await client.post(path+'/accept',headers=headers('alice'),json=body)).status_code==200
    assert (await client.post('/api/orders',headers=headers('alice'),json={**quote_body(),'agreement_id':a['agreement_id']})).status_code==200
    assert await db.orders.count_documents({})==1
    assert (await db.transfer_agreements.find_one({'agreement_id':a['agreement_id']}))['status']=='reviewed'


@pytest.mark.asyncio
async def test_exact_reviewed_agreement_is_single_use_and_cannot_change_goods(app,monkeypatch):
    client,db=app;await enroll(client,'alice')
    monkeypatch.setattr(server,'validate_booking_agreement',server.real_validate_booking_agreement)
    a=(await client.post('/api/agreements/prepare',headers=headers('alice'),json=quote_body())).json()
    assert (await client.post('/api/agreements/'+a['agreement_id']+'/accept',headers=headers('alice'),json={'ownership_confirmed':True,'agreement_sha256':a['document_sha256']})).status_code==200
    assert (await client.post('/api/orders',headers=headers('alice'),json={**quote_body(),'helpers':2,'agreement_id':a['agreement_id']})).status_code==409
    payload={**quote_body(),'agreement_id':a['agreement_id']}
    r=await client.post('/api/orders',headers=headers('alice'),json=payload)
    assert r.status_code==200 and r.json()['requires_pickup_signatures']
    assert (await client.post('/api/orders',headers=headers('alice'),json=payload)).status_code==409
    assert await db.orders.count_documents({})==1


async def assigned(client,db,status='assigned'):
    await enroll(client,'alice');await enroll(client,'bob');driver=await enroll(client,'driver','partner');await enroll(client,'otherdriver','partner')
    o=(await client.post('/api/orders',headers=headers('alice'),json=quote_body())).json()
    await db.orders.update_one({'order_id':o['order_id']},{'$set':{'status':status,'partner_id':driver['user_id'],'invoice_no':'LE/TEST/001','invoice_date':'2026-11-16T00:00:00Z'},'$unset':{'payment_plan':''}})
    return await db.orders.find_one({'order_id':o['order_id']},{'_id':0})


@pytest.mark.asyncio
async def test_delivery_revision_requires_assigned_partner_future_time_and_reason(app):
    client,db=app;o=await assigned(client,db)
    path=f"/api/orders/{o['order_id']}/delivery-estimate"
    body={'expected_delivery_at':(server.now_utc()+timedelta(days=2)).isoformat(),'reason':'Road closed due to an accident'}
    assert (await client.post(path,headers=headers('alice'),json=body)).status_code==403
    assert (await client.post(path,headers=headers('otherdriver'),json=body)).status_code==404
    assert (await client.post(path,headers=headers('driver'),json={**body,'reason':' '*20})).status_code==422
    assert (await client.post(path,headers=headers('driver'),json={**body,'expected_delivery_at':'2020-01-01T00:00:00Z'})).status_code==422
    r=await client.post(path,headers=headers('driver'),json=body)
    assert r.status_code==200 and r.json()['source']=='partner'
    record=await db.orders.find_one({'order_id':o['order_id']})
    assert len(record['delivery_estimate_history'])==1
    await db.orders.update_one({'order_id':o['order_id']},{'$set':{'status':'delivered'}})
    assert (await client.post(path,headers=headers('driver'),json=body)).status_code==409


@pytest.mark.asyncio
async def test_tracking_private_recent_and_bounded_to_active_trip(app):
    client,db=app;o=await assigned(client,db,'in_transit');path=f"/api/orders/{o['order_id']}/tracking"
    body={'latitude':11.0168,'longitude':76.9558,'accuracy':20,'captured_at':server.now_utc().isoformat()}
    assert (await client.get(path,headers=headers('bob'))).status_code==404
    assert (await client.get(path,headers=headers('otherdriver'))).status_code==404
    assert (await client.post(path,headers=headers('alice'),json=body)).status_code==403
    assert (await client.post(path,headers=headers('driver'),json={**body,'mocked':True})).status_code==422
    assert (await client.post(path,headers=headers('driver'),json={**body,'latitude':91})).status_code==422
    assert (await client.post(path,headers=headers('driver'),json={**body,'captured_at':'2020-01-01T00:00:00Z'})).status_code==422
    assert (await client.post(path,headers=headers('driver'),json=body)).status_code==200
    assert (await client.post(path,headers=headers('driver'),json=body)).status_code==429
    data=(await client.get(path,headers=headers('alice'))).json()
    assert data['sharing_active'] and not data['stale'] and len(data['points'])==1
    assert 'partner_id' not in data['points'][0]
    await db.orders.update_one({'order_id':o['order_id']},{'$set':{'status':'delivered'}})
    assert (await client.post(path,headers=headers('driver'),json=body)).status_code==409
    assert not (await client.get(path,headers=headers('alice'))).json()['sharing_active']


def signature(blank=False):
    image=Image.new('RGB',(800,280),'white')
    if not blank: ImageDraw.Draw(image).line([(20,100),(200,150),(400,70)],fill='black',width=8)
    output=BytesIO();image.save(output,format='PNG')
    return 'data:image/png;base64,'+base64.b64encode(output.getvalue()).decode()


@pytest.mark.asyncio
async def test_signatures_and_pickup_otp_required_before_departure(app):
    client,db=app;o=await assigned(client,db);oid=o['order_id']
    await db.transfer_agreements.insert_one({'agreement_id':o['agreement_id'],'customer_id':o['customer_id'],'status':'reviewed','document_sha256':'a'*64})
    path=f'/api/orders/{oid}/pickup-signatures'
    body={'invoice_signature':signature(),'agreement_signature':signature(),'pickup_otp':o['pickup_otp'],'customer_name':'Synthetic Test Customer','goods_loaded_and_checked':True,'customer_present':True}
    next_status={'status':'picked_up','otp':o['pickup_otp']}
    assert (await client.post(f'/api/orders/{oid}/status',headers=headers('driver'),json=next_status)).status_code==409
    assert (await client.post(path,headers=headers('otherdriver'),json=body)).status_code==404
    assert (await client.post(path,headers=headers('driver'),json={**body,'pickup_otp':'99999'})).status_code==422
    assert (await client.post(path,headers=headers('driver'),json={**body,'goods_loaded_and_checked':False})).status_code==422
    assert (await client.post(path,headers=headers('driver'),json={**body,'invoice_signature':signature(True)})).status_code==422
    r=await client.post(path,headers=headers('driver'),json=body)
    assert r.status_code==200,r.text
    assert (await client.post(path,headers=headers('driver'),json=body)).status_code==409
    assert (await client.post(f'/api/orders/{oid}/status',headers=headers('driver'),json=next_status)).status_code==200
    private=await db.pickup_signatures.find_one({'order_id':oid})
    assert private['agreement_document_sha256']=='a'*64 and len(private['invoice_signature'])>0
    invoice=await client.get(f'/api/orders/{oid}/invoice.pdf',headers=headers('alice'))
    assert invoice.status_code==200 and 'Customer acknowledgement after loading' in '\n'.join(p.extract_text() for p in PdfReader(BytesIO(invoice.content)).pages)


@pytest.mark.asyncio
async def test_traffic_cap_evidence_customer_acceptance_and_cash_receipt(app):
    client,db=app;o=await assigned(client,db,'in_transit');oid=o['order_id'];path=f'/api/orders/{oid}/traffic-charge'
    body={'amount':200,'reason':'Congestion due to a road closure and diversion'}
    assert (await client.post(path,headers=headers('driver'),json={**body,'amount':200.01})).status_code==422
    assert (await client.post(path,headers=headers('driver'),json=body)).status_code==422
    now=server.now_utc()
    for minutes in (10,5,0):
        time=now-timedelta(minutes=minutes)
        await db.tracking_points.insert_one({'order_id':oid,'latitude':11.0,'longitude':76.9,'accuracy':10,'received_at':time.isoformat(),'recorded_at':time,'captured_at':time.isoformat()})
    r=await client.post(path,headers=headers('driver'),json=body)
    assert r.status_code==200,r.text
    assert r.json()['amount']==200 and r.json()['status']=='requested' and r.json()['traffic_delay_seconds']==200
    assert (await client.post(path,headers=headers('driver'),json=body)).status_code==409
    assert (await client.get(f'/api/orders/{oid}/traffic-evidence',headers=headers('bob'))).status_code==404
    assert (await client.get(f'/api/orders/{oid}/traffic-invoice.pdf',headers=headers('alice'))).status_code==409
    assert (await client.post(path+'/decision',headers=headers('bob'),json={'accept':True})).status_code==404
    assert (await client.post(path+'/decision',headers=headers('driver'),json={'accept':True})).status_code==403
    assert (await client.post(path+'/decision',headers=headers('alice'),json={'accept':True})).status_code==200
    assert (await client.post(path+'/decision',headers=headers('alice'),json={'accept':True})).status_code==409
    current=await db.orders.find_one({'order_id':oid})
    assert current['quote']==o['quote'] and current['invoice_no']==o['invoice_no']
    assert current['traffic_surcharge']['invoice_no']!=o['invoice_no']
    pdf=await client.get(f'/api/orders/{oid}/traffic-invoice.pdf',headers=headers('alice'))
    assert pdf.status_code==200
    text='\n'.join(p.extract_text() for p in PdfReader(BytesIO(pdf.content)).pages)
    assert 'Supplementary Sales Invoice' in text and 'INR 200.00' in text and 'CGST' in text
    assert (await client.post(path+'/cash-receipt',headers=headers('alice'),json={'cash_paid':False})).status_code==422
    assert (await client.post(path+'/cash-receipt',headers=headers('alice'),json={'cash_paid':True})).status_code==200
    assert (await client.post(path+'/cash-receipt',headers=headers('alice'),json={'cash_paid':True})).status_code==409


@pytest.mark.asyncio
async def test_traffic_rejection_does_not_create_invoice(app):
    client,db=app;o=await assigned(client,db,'in_transit');oid=o['order_id']
    await db.orders.update_one({'order_id':oid},{'$set':{'traffic_surcharge':{'status':'requested','amount':100}}})
    assert (await client.post(f'/api/orders/{oid}/traffic-charge/decision',headers=headers('alice'),json={'accept':False})).status_code==200
    record=await db.orders.find_one({'order_id':oid})
    assert record['traffic_surcharge']['status']=='rejected' and 'invoice_no' not in record['traffic_surcharge']
