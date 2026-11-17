import asyncio
from datetime import datetime, timezone
import pytest
from fastapi import HTTPException
import server
from admin_reports import build_report, report_window
from test_api_integration import app, enroll, headers  # noqa: F401

@pytest.mark.asyncio
async def test_signed_admin_claim_is_required_and_email_alone_never_grants_access(app):
    _,db=app
    claims={'uid':'admin-identity','email':'rmanojananth@innovease-ai.in','email_verified':True}
    ordinary=await server.firebase_profile(claims,create=True)
    assert ordinary['role'] is None
    promoted=await server.firebase_profile({**claims,'luggeaseAdmin':True})
    assert promoted['role']=='admin' and promoted['admin_claim_required'] is True
    with pytest.raises(HTTPException) as error:await server.firebase_profile(claims)
    assert error.value.status_code==403
    assert (await db.users.find_one({'firebase_uid':'admin-identity'}))['role']=='admin'

@pytest.mark.asyncio
async def test_role_choice_is_atomic_and_cannot_replace_a_concurrent_choice(app):
    client,db=app;unassigned=await enroll(client,'new-account',None)
    async def choose(role):
        try:return (await server.set_role(server.RoleBody(role=role),user=unassigned))['role']
        except HTTPException as error:return error.status_code
    result=await asyncio.gather(choose('customer'),choose('partner'))
    assert result.count(409)==1
    assert (await db.users.find_one({'user_id':unassigned['user_id']}))['role']==next(value for value in result if value!=409)

@pytest.mark.asyncio
async def test_account_directory_is_admin_only_filtered_paginated_and_has_no_bank_or_identity_data(app):
    client,db=app;admin=await enroll(client,'admin',None)
    await db.users.update_one({'user_id':admin['user_id']},{'$set':{'role':'admin'}})
    customer=await enroll(client,'customer');await enroll(client,'driver','partner')
    await db.users.update_one({'user_id':customer['user_id']},{'$set':{'password_hash':'PRIVATE','partner_profile':{'bank_account_number':'PRIVATE'},'phone':'PRIVATE'}})
    for token in ['customer','driver']:
        assert (await client.get('/api/admin/users',headers=headers(token))).status_code==403
        assert (await client.get('/api/admin/reports',headers=headers(token))).status_code==403
    assert (await client.get('/api/admin/reports')).status_code==401
    page=await client.get('/api/admin/users?role=customer&search=customer%40example.com&limit=1',headers=headers('admin'))
    assert page.status_code==200 and page.json()['total']==1
    assert set(page.json()['users'][0])<=set(['user_id','name','email','role','partner_status'])
    assert 'PRIVATE' not in page.text
    assert (await client.get('/api/admin/users?role=godmode',headers=headers('admin'))).status_code==422
    assert (await client.get('/api/admin/users?search=.%2A',headers=headers('admin'))).json()['total']==0

def order(oid,**values):
    return {'order_id':oid,'customer_id':'TEST','status':'paid','pickup_address':'Test source','drop_address':'Test destination',
        'pickup_city':'Coimbatore','drop_city':'Chennai','pickup_state':'Tamil Nadu','drop_state':'Tamil Nadu',
        'created_at':'2026-11-16T00:00:00+00:00','quote':{'invoice_total':200,'grand_total':210,'tip':10,'taxable_value':190,'gst':{'total':10},'platform_commission':9.5},**values}

@pytest.mark.asyncio
async def test_reports_reconcile_actual_event_dates_integer_paise_and_geography(app):
    client,db=app;admin=await enroll(client,'admin',None)
    await db.users.update_one({'user_id':admin['user_id']},{'$set':{'role':'admin'}})
    payment={'payment_id':'TEST-ADVANCE','stage':'advance','amount_paise':10500,'paid_at':'2026-11-16T01:00:00+00:00'}
    a=order('TEST-A',invoice_no='TEST/1',invoice_date='2026-11-16T00:00:00+00:00',
        payments=[payment,payment,{**payment,'payment_id':'TEST-BALANCE','stage':'balance','paid_at':'2026-11-17T01:00:00+00:00'}],
        payment_plan={'total_paise':21000,'paid_paise':21000},
        traffic_surcharge={'amount':200,'status':'paid_cash_customer_confirmed','invoice_no':'TEST/TRAFFIC',
            'accepted_at':'2026-11-16T01:00:00+00:00','paid_at':'2026-11-16T02:00:00+00:00'},
        settlement={'status':'settled','amount':180,'utr':'TEST-UTR','settled_at':'2026-11-16T03:00:00+00:00'})
    b=order('TEST-B',created_at='2026-11-14T00:00:00+00:00',status='cancelled',pickup_city=None,
        invoice_no='TEST/2',invoice_date='2026-11-16T02:00:00+00:00',refund_amount=50,
        timeline=[{'status':'cancelled','at':'2026-11-16T02:00:00+00:00'}],
        quote={'invoice_total':100,'grand_total':100,'taxable_value':95,'gst':{'total':5},'platform_commission':4.75})
    c=order('TEST-C',created_at='2026-11-16T18:30:00+00:00') # next day in India; excluded
    legacy=order('TEST-OLD',created_at='2026-11-14T00:00:00+00:00',amount_paise=50000,
        payment={'payment_id':'LEGACY-PAYMENT','paid_at':'2026-11-16T01:00:00+00:00'})
    d=order('TEST-D',pickup_state='Karnataka',status='pending_payment')
    await db.orders.insert_many([a,b,c,legacy,d])
    response=await client.get('/api/admin/reports?start_date=2026-11-16&end_date=2026-11-16',headers=headers('admin'))
    assert response.status_code==200,response.text
    report=response.json();s=report['summary']
    assert s['orders']==2 and s['invoice_count']==2
    assert s['invoiced_paise']==30000 and s['taxable_paise']==28500 and s['gst_paise']==1500
    assert s['collections_paise']==60500 and s['customer_confirmed_cash_paise']==20000
    assert s['refund_due_paise']==5000 and s['cancelled_invoice_paise']==10000
    assert s['quoted_commission_paise']==1425 and s['settlement_recorded_paise']==18000
    assert s['current_invoice_balance_paise']==0 and s['supplement_invoiced_paise']==20000
    assert len([r for r in report['pickup_cities'] if r['name']=='Coimbatore'])==2
    assert any(r['name']=='Unspecified' for r in report['pickup_cities'])
    assert len(report['transactions'])==5
    assert sum(r.get('invoiced_paise',0) for r in report['daily'])==s['invoiced_paise']
    assert sum(r.get('collections_paise',0) for r in report['monthly'])==s['collections_paise']
    assert 'pickup_address' not in response.text and 'customer_email' not in response.text

@pytest.mark.parametrize('start,end',[('bad','2026-11-16'),('2026-11-17','2026-11-16'),('2020-01-01','2026-11-16')])
def test_report_rejects_invalid_or_unbounded_ranges(start,end):
    with pytest.raises(HTTPException):report_window(start,end,datetime.now(timezone.utc))

def test_india_midnight_boundaries_and_unknown_city_are_explicit():
    _,_,low,high=report_window('2026-11-16','2026-11-16',datetime.now(timezone.utc))
    report=build_report([order('before',created_at='2026-11-15T18:29:59+00:00'),
        order('first',created_at='2026-11-15T18:30:00+00:00',pickup_city=None),
        order('after',created_at='2026-11-16T18:30:00+00:00')],low,high)
    assert report['summary']['orders']==1 and report['summary']['orders_without_pickup_city']==1
    assert report['pickup_cities'][0]['name']=='Unspecified'

@pytest.mark.asyncio
async def test_unallocated_captures_are_reported_separately_and_large_results_never_truncate(app,monkeypatch):
    import admin_reports
    client,db=app;admin=await enroll(client,'admin',None)
    await db.users.update_one({'user_id':admin['user_id']},{'$set':{'role':'admin'}})
    await db.payment_sessions.insert_one({'session_key':'TEST-CAPTURE','order_id':'TEST-CHANGED',
        'status':'captured_requires_refund_review','captured_at':'2026-11-16T02:00:00+00:00',
        'payment_id':'TEST-REVIEW','amount_paise':5000,'stage':'advance'})
    path='/api/admin/reports?start_date=2026-11-16&end_date=2026-11-16'
    result=(await client.get(path,headers=headers('admin'))).json()
    assert result['summary']['collections_paise']==0 and result['summary']['captured_pending_review_paise']==5000
    assert result['transactions'][0]['kind']=='capture_requires_refund_review'
    await db.orders.insert_many([order('ONE'),order('TWO')]);monkeypatch.setattr(admin_reports,'MAX_ORDERS',1)
    too_large=await client.get(path,headers=headers('admin'))
    assert too_large.status_code==413 and 'no partial report' in too_large.json()['detail']
