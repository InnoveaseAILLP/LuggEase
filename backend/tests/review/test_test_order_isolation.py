from datetime import datetime,timezone
from io import BytesIO
from pypdf import PdfReader
import pytest
import server
from admin_reports import build_report
from test_api_integration import app,enroll,headers,quote_body  # noqa:F401

@pytest.mark.asyncio
async def test_simulated_orders_never_dispatch_collect_pay_out_or_create_refunds(app,monkeypatch):
    client,db=app;await enroll(client,'alice');driver=await enroll(client,'driver','partner');admin=await enroll(client,'admin')
    await db.users.update_one({'user_id':driver['user_id']},{'$set':{'partner_status':'approved','partner_profile.vehicle_type':'mini_truck'}})
    await db.users.update_one({'user_id':admin['user_id']},{'$set':{'role':'admin'}})
    order=(await client.post('/api/orders',headers=headers('alice'),json=quote_body())).json();oid=order['order_id']
    await db.orders.update_one({'order_id':oid},{'$set':{'is_test':True,'status':'paid','invoice_no':'TEST-ADVANCE-ONLY','payment_plan.advance_paid_paise':order['payment_plan']['advance_paise'],'payment_plan.paid_paise':order['payment_plan']['advance_paise']}})
    def forbidden_provider():raise AssertionError('A test order must never call the live provider')
    monkeypatch.setattr(server,'rzp_client',forbidden_provider)
    assert all(o['order_id']!=oid for o in (await client.get('/api/partner/jobs',headers=headers('driver'))).json())
    assert (await client.get(f'/api/orders/{oid}',headers=headers('driver'))).status_code==404
    assert (await client.post(f'/api/orders/{oid}/accept',headers=headers('driver'))).status_code==409
    for endpoint in ['create','reconcile']:
        assert (await client.post('/api/payments/'+endpoint,headers=headers('alice'),json={'order_id':oid,'stage':'advance'})).status_code==409
    assert (await client.post(f'/api/admin/orders/{oid}/settle',headers=headers('admin'),json={'utr':'TEST-NO-MONEY'})).status_code==409
    assert (await client.get('/api/admin/stats',headers=headers('admin'))).json()['paid_orders']==0
    invoice=await client.get(f'/api/orders/{oid}/pickup-invoice.pdf',headers=headers('alice'));assert invoice.status_code==200
    assert all('NO PAYMENT RECEIVED' in page.extract_text() for page in PdfReader(BytesIO(invoice.content)).pages)
    cancelled=await client.post(f'/api/orders/{oid}/cancel',headers=headers('alice'));assert cancelled.status_code==200
    assert cancelled.json()['refund_amount']==0 and cancelled.json()['refund_note'] is None

def test_test_orders_are_excluded_even_when_passed_directly_to_reporting():
    test={'is_test':True,'status':'paid','order_id':'TEST','created_at':'2026-11-17T00:00:00+00:00','invoice_no':'TEST','invoice_date':'2026-11-17T00:00:00+00:00','payment':{'amount_paise':95800,'paid_at':'2026-11-17T00:00:00+00:00'}}
    report=build_report([test],datetime(2026,11,16,tzinfo=timezone.utc),datetime(2026,11,18,tzinfo=timezone.utc))
    assert report['summary']['orders']==0 and report['summary']['collections_paise']==0 and report['summary']['invoice_count']==0
