"""Private transfer agreement and supplementary charge documents."""
from io import BytesIO
from reportlab.lib.styles import ParagraphStyle
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Image
from invoice_pdf import fonts, text

DECLARATION = ('I declare that the listed goods belong to me, that I have the right to transfer them from the stated pickup to the stated destination, and that the list and addresses are accurate. I will not tender stolen, unlawful or prohibited goods. I will review the items, delivery estimate and charges before signing.')

def document_pdf(title, lines, signatures=()):
    fonts(); output=BytesIO()
    doc=SimpleDocTemplate(output, title=title, leftMargin=40, rightMargin=40, topMargin=40, bottomMargin=40)
    style=ParagraphStyle('Document',fontName='Invoice',fontSize=10,leading=15,spaceAfter=9,shaping=1)
    content=[Paragraph(text(title),ParagraphStyle('Title',parent=style,fontSize=17,leading=23)),Spacer(1,12)]
    content += [Paragraph(text(line),style) for line in lines]
    for label, data in signatures:
        content += [Spacer(1,14),Paragraph(text(label),style)]
        if data: content.append(Image(BytesIO(data),width=240,height=90,kind='proportional'))
        else: content.append(Paragraph('Customer handwritten signature: ____________________   Date/time: ____________________',style))
    doc.build(content)
    return output.getvalue()


def agreement_pdf(a, pickup_signature=None):
    q=a['quote']; p=a['payload']
    lines=[f"Agreement: {a['agreement_id']} | Version: {a['version']}",
        f"Consignor / customer: {a['customer_name']} ({a['customer_email']})",
        f"Pickup: {p['pickup_address']}, {p['pickup_state']}", f"Destination: {p['drop_address']}, {p['drop_state']}"]
    lines += [f"Additional stop {i+1}: {stop}" for i,stop in enumerate(p.get('extra_stops',[]))]
    lines += ['ITEMS / GOODS']+[f"{it['name']} — quantity {it['qty']}; estimated total weight {it['total_kg']} kg" for it in q['items']]
    lines += [f"Road distance: {q['distance_km']} km | Vehicle: {q['vehicle']['name']}",
        f"Quoted total including configured GST: INR {q['grand_total']:,.2f}",
        f"Approximate delivery (India time): {q.get('delivery_estimate',{}).get('expected_delivery_at','Awaiting route estimate')}",
        'PAYMENT SCHEDULE: 50% at booking; remaining 50% after loading on pickup day, before leaving the source. Both customer signatures and payment completion are required before departure.',
        'OWNERSHIP DECLARATION',DECLARATION,
        'Before booking, the customer reviews this agreement and declares ownership. After loading and checking the goods, the customer personally hand-signs this agreement and the sales invoice before departure.',
        'Agreement review: '+('Accepted before booking' if a['status']=='reviewed' else 'Awaiting customer review'),
        'After loading, the customer must check the actual goods and manually sign both this agreement and the sales invoice before departure.',
        'A documented traffic charge may be requested up to INR 200 including GST, subject to customer acceptance. It is shown separately and does not change the original paid invoice.',
        'Delivery estimates may change due to road conditions, traffic, breakdowns or other difficulties. Partner revisions include an explanation and are visible to the customer.',
        'Support: support@innovease-ai.in']
    return document_pdf('LuggEase Logistics Transfer Agreement',lines,[('Pickup acknowledgement after loading',pickup_signature)])


def traffic_pdf(order, supplier):
    charge=order['traffic_surcharge']; gross=float(charge['amount']); rate=order['quote']['gst']['rate']
    taxable=round(gross/(1+rate/100),2); gst=round(gross-taxable,2)
    lines=[supplier['name'],supplier['address'],f"GSTIN: {supplier['gstin']} | PAN: {supplier['pan']}",
        f"Supplementary invoice: {charge['invoice_no']}",f"Original invoice: {order['invoice_no']} | Order: {order['order_id']}",
        f"Bill to: {order.get('customer_name')} ({order.get('customer_email')})",f"Reason: {charge['reason']}",
        f"Device-reported route evidence: {charge['evidence_id']} ({charge['point_count']} recorded points)",
        f"Google Routes predicted traffic delay at request time: {charge.get('traffic_delay_seconds',0)} seconds",
        'The recorded path shows location reports; it does not independently prove the cause of congestion.',
        f"Taxable value: INR {taxable:,.2f}",f"SAC: {order['quote']['gst']['sac']} | Place of supply: {order['quote']['place_of_supply']}"]
    if order['quote']['gst']['igst_rate']:
        lines += [f"IGST @ {rate}%: INR {gst:,.2f}"]
    else:
        cgst=round(gst/2,2)
        lines += [f"CGST @ {rate/2:g}%: INR {cgst:,.2f}",f"SGST @ {rate/2:g}%: INR {gst-cgst:,.2f}"]
    lines += [f"Additional amount including GST: INR {gross:,.2f}",f"Settlement: {charge['status']}",
        f"Customer accepted at: {charge['accepted_at']}",
        f"Original invoice total: INR {order['quote']['grand_total']:,.2f}",
        f"Combined payable including this charge: INR {order['quote']['grand_total']+gross:,.2f}",
        'The original invoice remains unchanged. Signature obtained at pickup applies to the original invoice and transfer agreement.']
    return document_pdf('LuggEase Supplementary Sales Invoice — Traffic Charge',lines)
