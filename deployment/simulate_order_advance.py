"""One-off, owner-authorized test conversion for LE261116A46516; no payment writes/provider mutations."""
import copy
import json
import os
from datetime import datetime,timezone

ORDER_ID='LE261116A46516'

def changes(order,now):
    if order.get('order_id')!=ORDER_ID or order.get('status')!='pending_payment' or order.get('partner_id') or order.get('payment') or order.get('payments') or order.get('invoice_no'):
        raise RuntimeError('Order is not eligible for an unpaid test conversion.')
    plan=copy.deepcopy(order.get('payment_plan',{}))
    if plan.get('paid_paise')!=0 or plan.get('total_paise')!=191600 or plan.get('advance_paise')!=95800:
        raise RuntimeError('Order amount or payment state changed. No update applied.')
    plan.update(advance_paid_paise=95800,paid_paise=95800)
    return {'is_test':True,'status':'paid','payment_plan':plan,'invoice_no':'TEST-'+ORDER_ID,'invoice_date':now,'updated_at':now,
        'testing':{'stage':'advance','simulated_paise':95800,'actual_received_paise':0,'authorized_by':'owner explicit testing request','converted_at':now,'previous_status':'pending_payment','no_real_dispatch':True}}

def main():
    import pymongo
    import razorpay
    db=pymongo.MongoClient(os.environ['MONGO_URL'],serverSelectionTimeoutMS=20000)[os.environ['DB_NAME']]
    order=db.orders.find_one({'order_id':ORDER_ID})
    if not order:raise RuntimeError('Requested order not found.')
    if order.get('is_test') and order.get('testing',{}).get('simulated_paise')==95800:
        print(json.dumps({'order_id':ORDER_ID,'status':order['status'],'is_test':True,'actual_received_paise':0,'result':'already converted; no duplicate update'}));return
    now=datetime.now(timezone.utc).isoformat();updates=changes(order,now)
    sessions=list(db.payment_sessions.find({'order_id':ORDER_ID},{'razorpay_order_id':1}))
    provider=razorpay.Client(auth=(os.environ['RAZORPAY_KEY_ID'],os.environ['RAZORPAY_KEY_SECRET']))
    for session in sessions:
        if not session.get('razorpay_order_id'):raise RuntimeError('Payment setup is in progress; no update applied.')
        payments=provider.order.payments(session['razorpay_order_id']).get('items',[])
        if any(payment.get('status') in ('authorized','captured') for payment in payments):
            raise RuntimeError('Provider reports money authorized or captured; test conversion aborted.')
    if os.environ.get('LUGGEASE_TEST_ORDER_ACTION')!='apply':
        print(json.dumps({'order_id':ORDER_ID,'status':order['status'],'paid_paise':order['payment_plan']['paid_paise'],'provider_sessions_checked':len(sessions),'result':'precheck passed; no changes'}));return
    result=db.orders.update_one({'_id':order['_id'],'status':'pending_payment','partner_id':None,'invoice_no':None,'payment':None,'payment_plan.paid_paise':0,'$or':[{'payments':{'$exists':False}},{'payments':{'$size':0}}]},
        {'$set':updates,'$push':{'timeline':{'status':'paid','at':now,'simulation':True,'note':'Owner-authorized simulated booking advance; no payment received'}}})
    if result.modified_count!=1:raise RuntimeError('Order changed during the precheck. No update applied.')
    current=db.orders.find_one({'order_id':ORDER_ID})
    assert current['is_test'] and current['status']=='paid' and not current.get('payments') and not current.get('payment')
    print(json.dumps({'order_id':ORDER_ID,'status':'paid','display_status':'Finding partner','is_test':True,'simulated_advance_paise':95800,'actual_received_paise':0,'remaining_simulation_balance_paise':95800,'invoice_no':current['invoice_no'],'real_dispatch':False,'result':'test conversion verified'}))

if __name__=='__main__':main()
