import asyncio
import base64
import hashlib
import hmac
import io
import json
import math
import uuid
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from fastapi import Depends, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel, Field, ConfigDict
from PIL import Image
from shipment_documents import agreement_pdf, traffic_pdf, DECLARATION

ACTIVE = ('assigned','picked_up','in_transit')
TRANSIT = ('in_transit',)

def payload_for(body):
    return body.model_dump(exclude={'agreement_id','distance_km'})

def digest(value):
    return hashlib.sha256(json.dumps(value,sort_keys=True,separators=(',',':'),default=str).encode()).hexdigest()

def decode_signature(value):
    try:
        data=base64.b64decode(value.removeprefix('data:image/png;base64,'),validate=True)
        if len(data)>120000: raise ValueError()
        image=Image.open(io.BytesIO(data))
        if image.format!='PNG' or not 100<=image.width<=1400 or not 40<=image.height<=700: raise ValueError()
        image.load()
        rgb=Image.new('RGB',image.size,'white')
        if image.mode=='RGBA': rgb.paste(image,mask=image.getchannel('A'))
        else: rgb.paste(image.convert('RGB'))
        pixels=rgb.convert('L').histogram()
        if sum(pixels[:180])<60: raise ValueError()
        return data
    except Exception:
        raise HTTPException(422,'Provide a non-empty handwritten PNG signature.') from None

class Acceptance(BaseModel):
    ownership_confirmed: bool
    agreement_sha256: str = Field(pattern=r'^[a-f0-9]{64}$')

class ETAChange(BaseModel):
    expected_delivery_at: datetime
    reason: str = Field(min_length=10,max_length=500)

class LocationPoint(BaseModel):
    model_config=ConfigDict(allow_inf_nan=False)
    latitude: float = Field(ge=-90,le=90)
    longitude: float = Field(ge=-180,le=180)
    accuracy: float = Field(ge=0,le=250)
    captured_at: datetime
    mocked: bool = False

class PickupSignatures(BaseModel):
    invoice_signature: str = Field(max_length=165000)
    agreement_signature: str = Field(max_length=165000)
    pickup_otp: str = Field(pattern=r'^\d{4}$')
    customer_name: str = Field(min_length=2,max_length=150)
    goods_loaded_and_checked: bool
    customer_present: bool

class DeliverySignature(BaseModel):
    signature: str = Field(max_length=165000)
    recipient_name: str = Field(min_length=2,max_length=150)
    arrived_at_destination: bool
    goods_received_and_checked: bool
    customer_present: bool

class TrafficRequest(BaseModel):
    amount: Decimal = Field(gt=0,le=200,max_digits=5,decimal_places=2)
    reason: str = Field(min_length=15,max_length=500)

class ChargeDecision(BaseModel):
    accept: bool

class CashReceipt(BaseModel):
    cash_paid: bool


def install_workflow(ctx):
    api=ctx.api
    async def strict_order(order_id,user,driver=False):
        query={'order_id':order_id}
        if driver: query['partner_id']=user['user_id']
        elif user.get('role')!='admin': query['$or']=[{'customer_id':user['user_id']},{'partner_id':user['user_id']}]
        order=await ctx.db.orders.find_one(query,{'_id':0})
        if not order: raise HTTPException(404,'Order not found')
        return order

    async def validate_booking_agreement(body,user):
        a=await ctx.db.transfer_agreements.find_one({'agreement_id':body.agreement_id,'customer_id':user['user_id']},{'_id':0})
        if not a or a.get('status')!='reviewed':
            raise HTTPException(409,'Review and accept the transfer agreement and goods ownership declaration before placing the order.')
        if datetime.fromisoformat(a['expires_at'])<ctx.now_utc() or a['payload_hash']!=digest(payload_for(body)):
            raise HTTPException(409,'The booking details or agreement have changed. Generate and sign a new agreement.')
        reserved=await ctx.db.transfer_agreements.update_one({'agreement_id':a['agreement_id'],'used_at':None,'status':'reviewed'},
            {'$set':{'used_at':ctx.iso(ctx.now_utc())}})
        if reserved.modified_count!=1: raise HTTPException(409,'This agreement has already been used. Generate a new agreement.')
        return a
    ctx.validate_booking_agreement=validate_booking_agreement
    ctx.real_validate_booking_agreement=validate_booking_agreement

    @api.post('/agreements/prepare')
    async def prepare(body: ctx.QuoteRequest, user=Depends(ctx.require_role('customer'))):
        await ctx.limit_places(user)
        q=await ctx.routed_quote(body)
        n=ctx.now_utc()
        a={'agreement_id':'LTA-'+uuid.uuid4().hex[:16].upper(),'version':2,'supplier':dict(ctx.SUPPLIER),'customer_id':user['user_id'],
            'customer_name':user.get('name') or user['email'],'customer_email':user['email'],
            'payload':payload_for(body),'payload_hash':digest(payload_for(body)),'quote':q,
            'status':'pending_review','ownership_declaration':DECLARATION,'created_at':ctx.iso(n),
            'expires_at':ctx.iso(n+timedelta(minutes=30)),'used_at':None}
        # Preserve the exact pre-booking document bytes and their hash for pickup acknowledgement.
        document=agreement_pdf(a)
        a['document_sha256']=hashlib.sha256(document).hexdigest()
        await ctx.db.transfer_agreements.insert_one({**a,'document_pdf':document})
        return a

    @api.get('/agreements/{agreement_id}')
    async def agreement_status(agreement_id:str,user=Depends(ctx.require_role('customer'))):
        a=await ctx.db.transfer_agreements.find_one({'agreement_id':agreement_id,'customer_id':user['user_id']},{'_id':0,'document_pdf':0})
        if not a: raise HTTPException(404,'Agreement not found')
        return a

    @api.get('/agreements/{agreement_id}/document.pdf')
    async def agreement_download(agreement_id:str,user=Depends(ctx.require_role('customer'))):
        a=await ctx.db.transfer_agreements.find_one({'agreement_id':agreement_id,'customer_id':user['user_id']})
        if not a: raise HTTPException(404,'Agreement not found')
        return Response(bytes(a['document_pdf']),media_type='application/pdf',headers={'Cache-Control':'private, no-store','Content-Disposition':f'attachment; filename="{agreement_id}.pdf"'})

    @api.post('/agreements/{agreement_id}/accept')
    async def accept_agreement(agreement_id:str,body:Acceptance,user=Depends(ctx.require_role('customer'))):
        a=await ctx.db.transfer_agreements.find_one({'agreement_id':agreement_id,'customer_id':user['user_id']})
        if not a: raise HTTPException(404,'Agreement not found')
        if not body.ownership_confirmed or not hmac.compare_digest(a['document_sha256'],body.agreement_sha256):
            raise HTTPException(422,'Review and accept the exact agreement and ownership declaration first.')
        if datetime.fromisoformat(a['expires_at'])<ctx.now_utc() or a.get('used_at'):
            raise HTTPException(409,'This agreement has expired or was already used. Generate a new agreement.')
        accepted=ctx.iso(ctx.now_utc())
        await ctx.db.transfer_agreements.update_one({'agreement_id':agreement_id,'used_at':None},{'$set':{'ownership_accepted_at':accepted,'status':'reviewed'}})
        return {'agreement_id':agreement_id,'status':'reviewed','ownership_accepted_at':accepted}

    @api.post('/orders/{order_id}/delivery-estimate')
    async def update_eta(order_id:str,body:ETAChange,user=Depends(ctx.require_role('partner'))):
        o=await strict_order(order_id,user,True)
        if o['status'] not in ACTIVE: raise HTTPException(409,'This shipment is no longer active.')
        n=ctx.now_utc()
        if len(body.reason.strip())<10: raise HTTPException(422,'Explain the reason for the delivery revision.')
        if body.expected_delivery_at.tzinfo is None or not n<body.expected_delivery_at<=n+timedelta(days=30):
            raise HTTPException(422,'Choose a future date/time with a timezone, within 30 days.')
        change={'expected_delivery_at':body.expected_delivery_at.isoformat(),'reason':body.reason.strip(),
            'source':'partner','updated_by':user['user_id'],'updated_at':ctx.iso(n),'previous':(o.get('delivery_estimate') or {}).get('expected_delivery_at')}
        result=await ctx.db.orders.update_one({'order_id':order_id,'partner_id':user['user_id'],'status':{'$in':list(ACTIVE)}},
            {'$set':{'delivery_estimate':change},'$push':{'delivery_estimate_history':{'$each':[change],'$slice':-100}}})
        if not result.modified_count: raise HTTPException(409,'Order changed; refresh and try again.')
        return change

    @api.post('/orders/{order_id}/tracking')
    async def report_location(order_id:str,body:LocationPoint,user=Depends(ctx.require_role('partner'))):
        o=await strict_order(order_id,user,True)
        if o['status'] not in TRANSIT: raise HTTPException(409,'Live location sharing is available only while the shipment is In transit.')
        n=ctx.now_utc()
        if body.captured_at.tzinfo is None or abs((n-body.captured_at).total_seconds())>120 or body.mocked:
            raise HTTPException(422,'A recent, non-mocked location is required.')
        last=await ctx.db.tracking_points.find_one({'order_id':order_id},sort=[('received_at',-1)])
        if last and (n-last['recorded_at'].replace(tzinfo=timezone.utc)).total_seconds()<10:
            raise HTTPException(429,'Please wait before sending another location.')
        point={'order_id':order_id,'partner_id':user['user_id'],**body.model_dump(mode='json'),
            'received_at':ctx.iso(n),'recorded_at':n,'source':'device_reported'}
        await ctx.db.tracking_points.insert_one(point)
        return {'received_at':point['received_at']}

    @api.get('/orders/{order_id}/tracking')
    async def tracking(order_id:str,user=Depends(ctx.current_user)):
        o=await strict_order(order_id,user)
        if o['status'] not in TRANSIT: raise HTTPException(409,'The live map is available only while the shipment is In transit.')
        points=await ctx.db.tracking_points.find({'order_id':order_id},{'_id':0,'recorded_at':0,'partner_id':0}).sort('received_at',-1).limit(500).to_list(500)
        points.reverse()
        last=points[-1] if points else None
        stale=not last or (ctx.now_utc()-datetime.fromisoformat(last['received_at'])).total_seconds()>120
        return {'points':points,'stale':stale,'sharing_active':o['status'] in TRANSIT and not stale,
            'delivery_estimate':o.get('delivery_estimate'),'source':'device_reported',
            'note':'Updates require the partner app to stay open. Location reports are not independent proof of traffic conditions.'}

    @api.get('/orders/{order_id}/pickup-invoice.pdf')
    async def pickup_invoice(order_id:str,user=Depends(ctx.current_user)):
        o=await strict_order(order_id,user)
        if not o.get('invoice_no'): raise HTTPException(409,'The sales invoice is not issued yet.')
        signature=await ctx.db.pickup_signatures.find_one({'order_id':order_id})
        if signature:
            o['invoice_pickup_signature']=bytes(signature['invoice_signature'])
            o['invoice_pickup_signed_at']=signature['captured_at']
        delivery=await ctx.db.delivery_signatures.find_one({'order_id':order_id})
        if delivery:
            o['invoice_delivery_signature']=bytes(delivery['signature'])
            o['invoice_delivery_signed_at']=delivery['captured_at']
            o['invoice_delivery_recipient']=delivery['recipient_name']
        data=await asyncio.to_thread(ctx.build_invoice_pdf,o,o.get('invoice_supplier') or ctx.SUPPLIER)
        return Response(data,media_type='application/pdf',headers={'Cache-Control':'private, no-store','Content-Disposition':'attachment; filename="LuggEase-Pickup-Sales-Invoice.pdf"'})

    @api.post('/orders/{order_id}/pickup-signatures')
    async def pickup_signatures(order_id:str,body:PickupSignatures,user=Depends(ctx.require_role('partner'))):
        o=await strict_order(order_id,user,True)
        if o['status']!='assigned' or o.get('pickup_signatures_completed_at'): raise HTTPException(409,'Pickup signatures are already captured or pickup is closed.')
        if not body.goods_loaded_and_checked or not body.customer_present: raise HTTPException(422,'The customer must check the loaded goods and be present to sign.')
        await ctx.limit_places(user)
        if not hmac.compare_digest(body.pickup_otp,o.get('pickup_otp','')): raise HTTPException(400,'Incorrect pickup OTP.')
        a=await ctx.db.transfer_agreements.find_one({'agreement_id':o.get('agreement_id'),'customer_id':o['customer_id']})
        if not a or a['status']!='reviewed': raise HTTPException(409,'The accepted transfer agreement is missing.')
        invoice=decode_signature(body.invoice_signature); agreement=decode_signature(body.agreement_signature)
        n=ctx.iso(ctx.now_utc())
        record={'order_id':order_id,'customer_name':body.customer_name,'captured_by':user['user_id'],'captured_at':n,
            'invoice_no':o['invoice_no'],'agreement_id':a['agreement_id'],'agreement_document_sha256':a['document_sha256'],
            'invoice_signature':invoice,'agreement_signature':agreement,
            'invoice_snapshot_sha256':digest({'invoice_no':o['invoice_no'],'quote':o['quote'],'supplier':o.get('invoice_supplier') or ctx.SUPPLIER})}
        try: await ctx.db.pickup_signatures.insert_one(record)
        except ctx.DuplicateKeyError: raise HTTPException(409,'Signatures were already recorded.') from None
        updated=await ctx.db.orders.update_one({'order_id':order_id,'partner_id':user['user_id'],'status':'assigned'},
            {'$set':{'pickup_signatures_completed_at':n}})
        if updated.modified_count!=1: raise HTTPException(409,'Order changed during signature capture. The captured record is retained for audit.')
        return {'captured_at':n,'agreement_id':a['agreement_id'],'invoice_no':o['invoice_no']}

    @api.post('/orders/{order_id}/delivery-signature')
    async def delivery_signature(order_id:str,body:DeliverySignature,user=Depends(ctx.require_role('partner'))):
        o=await strict_order(order_id,user,True)
        if o['status']!='in_transit' or o.get('delivery_signature_completed_at'):
            raise HTTPException(409,'The delivery acknowledgement is available once, while In transit.')
        if not body.recipient_name.strip() or not all((body.arrived_at_destination,body.goods_received_and_checked,body.customer_present)):
            raise HTTPException(422,'The customer must be present at the destination and check the unloaded goods before signing.')
        if o.get('payment_plan') and o['payment_plan']['paid_paise']<o['payment_plan']['total_paise']:
            raise HTTPException(409,'The order invoice must be fully paid before delivery completion.')
        png=decode_signature(body.signature);n=ctx.iso(ctx.now_utc())
        record={'order_id':order_id,'recipient_name':body.recipient_name.strip(),'captured_by':user['user_id'],
            'captured_at':n,'signature':png,'invoice_no':o.get('invoice_no'),
            'arrival_confirmation':'partner_and_customer_declaration','signature_sha256':hashlib.sha256(png).hexdigest()}
        try: await ctx.db.delivery_signatures.insert_one(record)
        except ctx.DuplicateKeyError: raise HTTPException(409,'Delivery acknowledgement was already recorded.') from None
        result=await ctx.db.orders.update_one({'order_id':order_id,'partner_id':user['user_id'],'status':'in_transit'},
            {'$set':{'delivery_signature_completed_at':n,'delivery_recipient_name':record['recipient_name']}})
        if result.modified_count!=1: raise HTTPException(409,'Order changed during acknowledgement; signature retained for audit.')
        return {'captured_at':n,'recipient_name':record['recipient_name'],'arrival_confirmation':record['arrival_confirmation']}

    @api.get('/orders/{order_id}/transfer-agreement.pdf')
    async def signed_agreement(order_id:str,user=Depends(ctx.current_user)):
        o=await strict_order(order_id,user)
        a=await ctx.db.transfer_agreements.find_one({'agreement_id':o.get('agreement_id')},{'_id':0})
        if not a: raise HTTPException(404,'Transfer agreement not found')
        signature=await ctx.db.pickup_signatures.find_one({'order_id':order_id})
        from pypdf import PdfReader, PdfWriter
        from shipment_documents import document_pdf
        writer=PdfWriter()
        writer.append(PdfReader(io.BytesIO(bytes(a['document_pdf']))))
        if signature:
            acknowledgement=document_pdf('Pickup acknowledgement after loading',[
                f"Agreement: {a['agreement_id']} | Order: {order_id}",
                f"Customer: {signature['customer_name']} | Captured: {signature['captured_at']}",
                'This handwritten pickup acknowledgement is attached to the exact agreement accepted before booking.'],
                [('Customer signature after checking loaded goods',bytes(signature['agreement_signature']))])
            writer.append(PdfReader(io.BytesIO(acknowledgement)))
        output=io.BytesIO(); writer.write(output); data=output.getvalue()
        return Response(data,media_type='application/pdf',headers={'Cache-Control':'private, no-store','Content-Disposition':'attachment; filename="LuggEase-Transfer-Agreement.pdf"'})

    @api.post('/orders/{order_id}/traffic-charge')
    async def request_charge(order_id:str,body:TrafficRequest,user=Depends(ctx.require_role('partner'))):
        o=await strict_order(order_id,user,True)
        if o['status']!='in_transit' or o.get('traffic_surcharge'): raise HTTPException(409,'Only one traffic charge may be requested per shipment while in transit.')
        n=ctx.now_utc()
        if len(body.reason.strip())<15: raise HTTPException(422,'Explain the traffic delay and additional charge.')
        if not o.get('invoice_no'): raise HTTPException(409,'A paid invoice is required before requesting additional charges.')
        points=await ctx.db.tracking_points.find({'order_id':order_id,'recorded_at':{'$gte':n-timedelta(minutes=30)}},{'_id':0,'recorded_at':0}).sort('received_at',1).limit(200).to_list(200)
        if len(points)<3 or (datetime.fromisoformat(points[-1]['received_at'])-datetime.fromisoformat(points[0]['received_at'])).total_seconds()<300:
            raise HTTPException(422,'At least three location reports covering five minutes are required as route evidence.')
        route=await ctx.road_route({'location':{'latLng':{'latitude':points[-1]['latitude'],'longitude':points[-1]['longitude']}}},
            f"{o['drop_address']}, {o['drop_state']}, India",[],n)
        traffic={'checked_at':ctx.iso(n),'duration_seconds':route['duration_seconds'],
            'static_duration_seconds':route['static_duration_seconds'],
            'delay_seconds':max(0,route['duration_seconds']-route['static_duration_seconds']),'source':'google_routes'}
        evidence='TRF-'+uuid.uuid4().hex
        await ctx.db.traffic_evidence.insert_one({'evidence_id':evidence,'order_id':order_id,'points':points,'traffic':traffic,'created_at':ctx.iso(n),'sha256':digest({'points':points,'traffic':traffic})})
        charge={'amount':float(body.amount),'reason':body.reason.strip(),'status':'requested','requested_at':ctx.iso(n),
            'evidence_id':evidence,'evidence_sha256':digest({'points':points,'traffic':traffic}),'traffic_delay_seconds':traffic['delay_seconds'],'point_count':len(points),'includes_gst':True}
        result=await ctx.db.orders.update_one({'order_id':order_id,'partner_id':user['user_id'],'status':'in_transit','traffic_surcharge':{'$exists':False}}, {'$set':{'traffic_surcharge':charge}})
        if result.modified_count!=1: raise HTTPException(409,'A charge already exists or the order changed.')
        return charge

    @api.get('/orders/{order_id}/traffic-evidence')
    async def traffic_evidence(order_id:str,user=Depends(ctx.current_user)):
        o=await strict_order(order_id,user)
        e=await ctx.db.traffic_evidence.find_one({'order_id':order_id,'evidence_id':(o.get('traffic_surcharge') or {}).get('evidence_id')},{'_id':0})
        if not e: raise HTTPException(404,'No traffic evidence recorded')
        return e

    @api.post('/orders/{order_id}/traffic-charge/decision')
    async def charge_decision(order_id:str,body:ChargeDecision,user=Depends(ctx.require_role('customer'))):
        o=await ctx.db.orders.find_one({'order_id':order_id,'customer_id':user['user_id']},{'_id':0})
        if not o: raise HTTPException(404,'Order not found')
        charge=o.get('traffic_surcharge') or {}
        if charge.get('status')!='requested': raise HTTPException(409,'No pending charge to review')
        n=ctx.iso(ctx.now_utc()); update={'traffic_surcharge.status':'accepted' if body.accept else 'rejected','traffic_surcharge.accepted_at':n}
        if body.accept: update['traffic_surcharge.invoice_no']=await ctx.next_invoice_no()
        result=await ctx.db.orders.update_one({'order_id':order_id,'customer_id':user['user_id'],'traffic_surcharge.status':'requested'},{'$set':update})
        if result.modified_count!=1: raise HTTPException(409,'Charge changed; refresh and try again.')
        return {'status':update['traffic_surcharge.status']}

    @api.post('/orders/{order_id}/traffic-charge/cash-receipt')
    async def cash_receipt(order_id:str,body:CashReceipt,user=Depends(ctx.require_role('customer'))):
        if not body.cash_paid: raise HTTPException(422,'Confirm only after paying the accepted amount in cash.')
        result=await ctx.db.orders.update_one({'order_id':order_id,'customer_id':user['user_id'],'traffic_surcharge.status':'accepted'},
            {'$set':{'traffic_surcharge.status':'paid_cash_customer_confirmed','traffic_surcharge.paid_at':ctx.iso(ctx.now_utc())}})
        if result.modified_count!=1: raise HTTPException(409,'No accepted charge awaiting payment confirmation.')
        return {'status':'paid_cash_customer_confirmed'}

    @api.get('/orders/{order_id}/traffic-invoice.pdf')
    async def supplementary_invoice(order_id:str,user=Depends(ctx.current_user)):
        o=await strict_order(order_id,user)
        if (o.get('traffic_surcharge') or {}).get('status') not in ('accepted','paid_cash_customer_confirmed'):
            raise HTTPException(409,'Customer acceptance is required before invoicing a traffic charge.')
        data=await asyncio.to_thread(traffic_pdf,o,o.get('invoice_supplier') or ctx.SUPPLIER)
        return Response(data,media_type='application/pdf',headers={'Cache-Control':'private, no-store','Content-Disposition':'attachment; filename="LuggEase-Traffic-Invoice.pdf"'})
