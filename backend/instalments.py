"""Two-stage order payments. Amounts are integer paise and verified with Razorpay server-side."""
import asyncio
import copy
import hashlib
import hmac
import uuid
from decimal import Decimal, ROUND_HALF_UP
from fastapi import HTTPException


def payment_plan(total):
    paise=int((Decimal(str(total))*100).quantize(Decimal('1'),rounding=ROUND_HALF_UP))
    advance=(paise+1)//2
    return {'total_paise':paise,'advance_paise':advance,'balance_paise':paise-advance,
        'advance_paid_paise':0,'balance_paid_paise':0,'paid_paise':0,
        'balance_due':'After loading on pickup day, before departure'}


def due_stage(order):
    plan=order['payment_plan']
    if order['status']=='cancelled': raise HTTPException(409,'This booking is cancelled.')
    if plan['advance_paid_paise']<plan['advance_paise']:
        if order['status']!='pending_payment': raise HTTPException(409,'Order payment state changed. Refresh before paying.')
        return 'advance',plan['advance_paise']
    if plan['balance_paid_paise']<plan['balance_paise']:
        if order['status'] not in ('assigned','picked_up') or not order.get('pickup_signatures_completed_at'):
            raise HTTPException(409,'The pickup balance is payable after loading and customer signatures, before departure.')
        return 'balance',plan['balance_paise']
    raise HTTPException(409,'The order invoice is already fully paid.')


async def create_instalment(ctx,order,user,request,expected_stage):
    stage,amount=due_stage(order)
    if expected_stage!=stage: raise HTTPException(409,'The payment stage changed. Refresh the order before paying.')
    provider=ctx.rzp_client()  # Remains disabled until merchant credentials are configured.
    key=f"{order['order_id']}:{stage}"
    session=await ctx.db.payment_sessions.find_one({'session_key':key},{'_id':0})
    if not session:
        session={'session_key':key,'order_id':order['order_id'],'customer_id':order['customer_id'],
            'stage':stage,'amount_paise':amount,'status':'creating','created_at':ctx.iso(ctx.now_utc()),'claim':uuid.uuid4().hex}
        try: await ctx.db.payment_sessions.insert_one(session)
        except ctx.DuplicateKeyError:
            session=await ctx.db.payment_sessions.find_one({'session_key':key},{'_id':0})
            if session.get('status')!='created': raise HTTPException(409,'Payment is being prepared. Please refresh in a moment.')
        else:
            try:
                remote=await asyncio.to_thread(provider.order.create,{'amount':amount,'currency':'INR',
                    'receipt':f"{order['order_id']}-{'A' if stage=='advance' else 'B'}",
                    'notes':{'order_id':order['order_id'],'instalment':stage},'payment_capture':1})
            except Exception:
                await ctx.db.payment_sessions.delete_one({'session_key':key,'claim':session['claim'],'status':'creating'})
                raise HTTPException(502,'Unable to prepare payment. Please try again.') from None
            if remote.get('amount')!=amount or remote.get('currency')!='INR' or not remote.get('id'):
                raise HTTPException(502,'The payment could not be prepared. Please contact support.')
            session.update({'razorpay_order_id':remote['id'],'status':'created'})
            await ctx.db.payment_sessions.update_one({'session_key':key,'claim':session['claim']},{'$set':{'razorpay_order_id':remote['id'],'status':'created'}})
    if session.get('status')!='created': raise HTTPException(409,'Payment is already recorded or awaiting review. Refresh the order.')
    return {'key_id':ctx.os.environ['RAZORPAY_KEY_ID'],'razorpay_order_id':session['razorpay_order_id'],
        'amount':session['amount_paise'],'currency':'INR','order_id':order['order_id'],'stage':stage,
        'name':user.get('name'),'email':user['email'],'contact':f"+91{user['phone'][-10:]}" if user.get('phone') else '',
        'checkout_url':f"{ctx.public_base(request)}/api/payments/page/{session['razorpay_order_id']}"}


async def confirm_instalment(ctx,session,payment_id,signature,customer_id):
    if customer_id and session['customer_id']!=customer_id: raise HTTPException(404,'The payment could not be found. Refresh the order or contact support.')
    provider=ctx.rzp_client()
    expected=hmac.new(ctx.os.environ['RAZORPAY_KEY_SECRET'].encode(),f"{session['razorpay_order_id']}|{payment_id}".encode(),hashlib.sha256).hexdigest()
    if not hmac.compare_digest(expected,signature): raise HTTPException(400,'The payment could not be verified. Refresh payment status before trying to pay again. Contact support if money was deducted.')
    order=await ctx.db.orders.find_one({'order_id':session['order_id']},{'_id':0})
    if not order: raise HTTPException(404,'Order not found')
    existing=next((p for p in order.get('payments',[]) if p.get('razorpay_order_id')==session['razorpay_order_id']),None)
    if existing:
        if existing['payment_id']!=payment_id: raise HTTPException(409,'This instalment was paid by a different payment.')
        return order
    try: pay=await asyncio.to_thread(provider.payment.fetch,payment_id)
    except Exception: raise HTTPException(502,'Payment status could not be checked. Refresh payment status before retrying.') from None
    if pay.get('order_id')!=session['razorpay_order_id'] or pay.get('amount')!=session['amount_paise'] or pay.get('currency')!='INR' or pay.get('status') not in ('captured','authorized'):
        raise HTTPException(400,'Payment not completed or does not match the instalment.')
    if pay['status']=='authorized':
        try: await asyncio.to_thread(provider.payment.capture,payment_id,session['amount_paise'],{'currency':'INR'})
        except Exception: raise HTTPException(502,'Payment capture could not be confirmed. Refresh before retrying.') from None
    n=ctx.iso(ctx.now_utc());stage=session['stage'];amount=session['amount_paise']
    entry={'provider':'razorpay','payment_id':payment_id,'razorpay_order_id':session['razorpay_order_id'],
        'stage':stage,'amount_paise':amount,'method':pay.get('method'),'paid_at':n}
    query={'order_id':order['order_id'],f'payment_plan.{stage}_paid_paise':0,'status':'pending_payment' if stage=='advance' else {'$in':['assigned','picked_up']}}
    if stage=='balance': query['pickup_signatures_completed_at']={'$exists':True}
    updates={f'payment_plan.{stage}_paid_paise':amount,'payment':entry,'updated_at':n}
    pushes={'payments':entry}
    if stage=='advance':
        updates.update({'status':'paid','invoice_no':await ctx.next_invoice_no(),'invoice_date':n,'invoice_supplier':copy.deepcopy(ctx.SUPPLIER)})
        pushes['timeline']={'status':'paid','at':n}
    result=await ctx.db.orders.update_one(query,{'$set':updates,'$inc':{'payment_plan.paid_paise':amount},'$push':pushes})
    if result.modified_count!=1:
        latest=await ctx.db.orders.find_one({'order_id':order['order_id']},{'_id':0})
        recorded=next((p for p in latest.get('payments',[]) if p.get('razorpay_order_id')==session['razorpay_order_id'] and p.get('payment_id')==payment_id),None)
        if recorded: return latest
        await ctx.db.payment_sessions.update_one({'session_key':session['session_key']},{'$set':{'status':'captured_requires_refund_review','payment_id':payment_id,'captured_at':n}})
        raise HTTPException(409,'Payment was captured after the order changed. Support must reconcile or refund it; the shipment was not advanced.')
    await ctx.db.payment_sessions.update_one({'session_key':session['session_key']},{'$set':{'status':'paid','payment_id':payment_id,'paid_at':n}})
    return await ctx.db.orders.find_one({'order_id':order['order_id']},{'_id':0})


async def reconcile_instalments(ctx,order):
    provider=ctx.rzp_client()
    sessions=await ctx.db.payment_sessions.find({'order_id':order['order_id'],'customer_id':order['customer_id'],'status':'created'},{'_id':0}).to_list(2)
    for session in sessions:
        try: result=await asyncio.to_thread(provider.order.payments,session['razorpay_order_id'])
        except Exception: raise HTTPException(502,'Unable to refresh payment status. Please try again later.') from None
        for payment in result.get('items',[]):
            if payment.get('status') in ('captured','authorized') and payment.get('amount')==session['amount_paise'] and payment.get('currency')=='INR':
                # These identifiers came from the authenticated provider API, never from the client.
                signature=hmac.new(ctx.os.environ['RAZORPAY_KEY_SECRET'].encode(),f"{session['razorpay_order_id']}|{payment['id']}".encode(),hashlib.sha256).hexdigest()
                await confirm_instalment(ctx,session,payment['id'],signature,order['customer_id'])
                break
    return await ctx.db.orders.find_one({'order_id':order['order_id']},{'_id':0})
