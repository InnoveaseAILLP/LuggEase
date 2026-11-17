"""Private administrator directory and dated operational reports; no provider calls."""
from collections import defaultdict
from datetime import date, datetime, time, timedelta, timezone
from decimal import Decimal, ROUND_HALF_UP
import re
from typing import Literal, Optional
from zoneinfo import ZoneInfo
from fastapi import Depends, HTTPException, Query

IST = ZoneInfo('Asia/Kolkata')
MAX_ORDERS = 10000

def paise(value):
    return int((Decimal(str(value or 0))*100).quantize(Decimal('1'),rounding=ROUND_HALF_UP))

def instant(value):
    if not value:return None
    parsed=datetime.fromisoformat(str(value).replace('Z','+00:00'))
    return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)

def report_window(start, end, now):
    today=now.astimezone(IST).date()
    try:
        first=date.fromisoformat(start) if start else today-timedelta(days=29)
        last=date.fromisoformat(end) if end else today
    except ValueError:raise HTTPException(422,'Use YYYY-MM-DD dates.') from None
    if last<first or (last-first).days>365:
        raise HTTPException(422,'Choose an ordered date range of at most 366 days.')
    low=datetime.combine(first,time.min,IST).astimezone(timezone.utc)
    high=datetime.combine(last+timedelta(days=1),time.min,IST).astimezone(timezone.utc)
    return first,last,low,high

def build_report(orders, low, high):
    summary=defaultdict(int);daily=defaultdict(lambda:defaultdict(int))
    cities={side:defaultdict(lambda:defaultdict(int)) for side in ('pickup','drop')}
    states={side:defaultdict(lambda:defaultdict(int)) for side in ('pickup','drop')}
    statuses=defaultdict(int);services=defaultdict(int);transactions=[];seen=set()
    def within(value):
        parsed=instant(value)
        return parsed is not None and low<=parsed<high
    def bucket(value):return instant(value).astimezone(IST).date().isoformat()
    def geo(order,field,amount):
        for side in ('pickup','drop'):
            state=(order.get(side+'_state') or 'Unspecified').strip()
            city=' '.join((order.get(side+'_city') or 'Unspecified').split()).casefold()
            cities[side][(city,state)][field]+=amount
            states[side][state][field]+=amount
    def transaction(order,kind,amount,when,reference='',stage='',method=''):
        if not within(when):return
        transactions.append({'at':instant(when).astimezone(IST).isoformat(),'kind':kind,
            'order_id':order['order_id'],'reference':reference,'stage':stage,'method':method,
            'amount_paise':amount,'order_status':order['status'],
            'pickup_city':order.get('pickup_city') or 'Unspecified','pickup_state':order.get('pickup_state') or 'Unspecified'})
    for order in orders:
        if order.get("is_test"):continue
        q=order.get('quote') or {};status=order['status'];traffic=order.get('traffic_surcharge') or {}
        if within(order.get('created_at')):
            summary['orders']+=1;statuses[status]+=1;services[order.get('service_category') or 'Unspecified']+=1
            daily[bucket(order['created_at'])]['orders']+=1;geo(order,'orders',1)
            if not order.get('pickup_city'):summary['orders_without_pickup_city']+=1
            if not order.get('drop_city'):summary['orders_without_drop_city']+=1
        if order.get('invoice_no') and within(order.get('invoice_date')):
            amount=paise(q.get('invoice_total',Decimal(str(q.get('grand_total',0)))-Decimal(str(q.get('tip',0)))))
            summary['invoice_count']+=1;summary['invoiced_paise']+=amount
            summary['taxable_paise']+=paise(q.get('taxable_value'));summary['gst_paise']+=paise((q.get('gst') or {}).get('total'))
            summary['quoted_commission_paise']+=paise(q.get('platform_commission'))
            if status=='cancelled':summary['cancelled_invoice_paise']+=amount
            else:
                plan=order.get('payment_plan') or {}
                if plan:summary['current_invoice_balance_paise']+=max(0,int(plan['total_paise'])-int(plan.get('paid_paise',0)))
            day=daily[bucket(order['invoice_date'])];day['invoiced_paise']+=amount
            day['gst_paise']+=paise((q.get('gst') or {}).get('total'))
            day['taxable_paise']+=paise(q.get('taxable_value'))
            day['quoted_commission_paise']+=paise(q.get('platform_commission'))
            if status=='cancelled':day['cancelled_invoice_paise']+=amount
            geo(order,'invoiced_paise',amount)
        payments=order.get('payments') or ([order['payment']] if order.get('payment') else [])
        for payment in payments:
            reference=payment.get('payment_id') or payment.get('razorpay_payment_id')
            key=(payment.get('provider','razorpay'),reference) if reference else (order['order_id'],payment.get('stage'),payment.get('paid_at'))
            if key in seen:
                summary['duplicate_payment_references']+=1;continue
            seen.add(key)
            if not payment.get('paid_at'):
                summary['undated_payment_records']+=1;continue
            if within(payment['paid_at']):
                amount=int(payment.get('amount_paise',order.get('amount_paise',0)))
                summary['collections_paise']+=amount;daily[bucket(payment['paid_at'])]['collections_paise']+=amount
                transaction(order,'payment_captured',amount,payment['paid_at'],reference or '',payment.get('stage','legacy'),payment.get('method') or '')
        if traffic.get('invoice_no') and traffic.get('status') in ('accepted','paid_cash_customer_confirmed') and within(traffic.get('accepted_at')):
            amount=paise(traffic['amount']);summary['supplement_invoiced_paise']+=amount
            daily[bucket(traffic['accepted_at'])]['supplement_invoiced_paise']+=amount
        if traffic.get('status')=='paid_cash_customer_confirmed' and within(traffic.get('paid_at')):
            amount=paise(traffic['amount']);summary['customer_confirmed_cash_paise']+=amount
            transaction(order,'traffic_cash_customer_confirmed',amount,traffic['paid_at'],traffic.get('invoice_no',''),method='cash')
        cancelled=next((t.get('at') for t in reversed(order.get('timeline',[])) if t.get('status')=='cancelled'),None)
        if status=='cancelled' and within(cancelled) and order.get('refund_amount'):
            amount=paise(order['refund_amount']);summary['refund_due_paise']+=amount
            transaction(order,'refund_due_not_confirmed',amount,cancelled)
        settlement=order.get('settlement') or {}
        if settlement.get('status')=='settled' and within(settlement.get('settled_at')):
            amount=paise(settlement.get('amount'));summary['settlement_recorded_paise']+=amount
            transaction(order,'partner_settlement_recorded',amount,settlement['settled_at'],settlement.get('utr',''))
    for key in ['orders','invoice_count','invoiced_paise','taxable_paise','gst_paise','quoted_commission_paise',
                'cancelled_invoice_paise','current_invoice_balance_paise','collections_paise','supplement_invoiced_paise',
                'customer_confirmed_cash_paise','refund_due_paise','settlement_recorded_paise',
                'orders_without_pickup_city','orders_without_drop_city','undated_payment_records','duplicate_payment_references']:
        summary.setdefault(key,0)
    days=[{'period':key,**value} for key,value in sorted(daily.items())]
    monthly=defaultdict(lambda:defaultdict(int))
    for row in days:
        for key,value in row.items():
            if key!='period':monthly[row['period'][:7]][key]+=value
    result={'summary':dict(summary),'daily':days,'monthly':[{'period':key,**value} for key,value in sorted(monthly.items())],
        'statuses':[{'name':key,'orders':value} for key,value in sorted(statuses.items())],
        'services':[{'name':key,'orders':value} for key,value in sorted(services.items())],
        'transactions':sorted(transactions,key=lambda row:(row['at'],row['order_id'],row['kind']))}
    for side in ('pickup','drop'):
        result[side+'_cities']=sorted([{'name':city.title(),'state':state,**values} for (city,state),values in cities[side].items()],key=lambda row:(-row.get('orders',0),row['state'],row['name']))
        result[side+'_states']=sorted([{'name':state,**values} for state,values in states[side].items()],key=lambda row:(-row.get('orders',0),row['name']))
    return result

def install_admin_routes(ctx):
    @ctx.api.get('/admin/users')
    async def users(role:Optional[Literal['customer','partner','admin','unassigned']]=None,
                    search:str=Query('',max_length=100),offset:int=Query(0,ge=0,le=100000),
                    limit:int=Query(20,ge=1,le=100),user=Depends(ctx.require_role('admin'))):
        query={}
        if role:query['role']=None if role=='unassigned' else role
        if search.strip():query['$or']=[{key:{'$regex':re.escape(search.strip()),'$options':'i'}} for key in ('name','email')]
        projection={'_id':0,'user_id':1,'name':1,'email':1,'role':1,'partner_status':1}
        rows=await ctx.db.users.find(query,projection).sort([('name',1),('user_id',1)]).skip(offset).limit(limit).to_list(limit)
        return {'users':rows,'total':await ctx.db.users.count_documents(query),'offset':offset,'limit':limit}

    @ctx.api.get('/admin/reports')
    async def reports(start_date:Optional[str]=None,end_date:Optional[str]=None,user=Depends(ctx.require_role('admin'))):
        first,last,low,high=report_window(start_date,end_date,ctx.now_utc())
        bounds={'$gte':ctx.iso(low),'$lt':ctx.iso(high)}
        query={'is_test':{'$ne':True},'$or':[{field:bounds} for field in ('created_at','invoice_date','payment.paid_at','traffic_surcharge.accepted_at','traffic_surcharge.paid_at','settlement.settled_at')]+
            [{'payments':{'$elemMatch':{'paid_at':bounds}}},{'timeline':{'$elemMatch':{'status':'cancelled','at':bounds}}}]}
        projection={key:1 for key in ('order_id','status','quote','pickup_city','drop_city','pickup_state','drop_state','created_at','invoice_no','invoice_date',
            'payments','payment','amount_paise','payment_plan','traffic_surcharge','timeline','refund_amount','settlement','service_category')}
        projection['_id']=0
        orders=await ctx.db.orders.find(query,projection).to_list(MAX_ORDERS+1)
        if len(orders)>MAX_ORDERS:raise HTTPException(413,'Report exceeds 10,000 relevant orders. Choose a shorter date range; no partial report was generated.')
        result=build_report(orders,low,high)
        pending=await ctx.db.payment_sessions.find({'status':'captured_requires_refund_review','captured_at':bounds},
            {'_id':0,'order_id':1,'payment_id':1,'amount_paise':1,'captured_at':1,'stage':1}).to_list(MAX_ORDERS+1)
        if len(pending)>MAX_ORDERS:raise HTTPException(413,'Too many reconciliation records. Choose a shorter date range.')
        result['summary']['captured_pending_review_paise']=sum(int(p.get('amount_paise',0)) for p in pending)
        for payment in pending:
            result['transactions'].append({'at':instant(payment['captured_at']).astimezone(IST).isoformat(),
                'kind':'capture_requires_refund_review','order_id':payment['order_id'],'reference':payment.get('payment_id',''),
                'stage':payment.get('stage',''),'method':'provider capture awaiting reconciliation',
                'amount_paise':int(payment.get('amount_paise',0)),'order_status':'requires_review','pickup_city':'Unspecified','pickup_state':'Unspecified'})
        result['transactions'].sort(key=lambda row:(row['at'],row['order_id'],row['kind']))
        result.update({'start_date':first.isoformat(),'end_date':last.isoformat(),'timezone':'Asia/Kolkata','generated_at':ctx.iso(ctx.now_utc()),
            'basis':'Demand and status use booking dates. Invoices use invoice dates; collections use recorded payment dates. Balances and cancellation status are current. Amounts are INR paise.',
            'notes':['Gross invoices include subsequently cancelled invoices, shown separately. Quoted commission is not recognized revenue.',
                     'Refunds due and partner settlements are recorded obligations/metadata, not bank-confirmed transfers.',
                     'Cash traffic receipts are customer-confirmed; unallocated provider captures awaiting review are shown separately from posted collections.',
                     'City trends use structured booking cities. Historical orders without cities remain Unspecified.']})
        return result
