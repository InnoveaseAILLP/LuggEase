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
    """Branded agreement; accepted document bytes are stored separately and never regenerated."""
    from datetime import datetime
    from decimal import Decimal, ROUND_HALF_UP
    from zoneinfo import ZoneInfo
    from reportlab.lib import colors
    from reportlab.lib.enums import TA_RIGHT
    from reportlab.platypus import Table, TableStyle, PageBreak, KeepTogether
    from invoice_pdf import ASSETS
    fonts(); output=BytesIO()
    company=a.get('supplier') or {
        'name':'Innovease AI & Technology Transformation Consulting LLP',
        'address':'D No, 4/518 Nethaji Garden, Pannimadai Road, Coimbatore North, Coimbatore- 641017, Tamil Nadu, India',
        'gstin':'33AAMFI4627F1ZG','pan':'AAMFI4627F'}
    q=a['quote']; payload=a['payload']; width=515.28
    doc=SimpleDocTemplate(output,pagesize=(595.28,841.89),title='LuggEase Logistics Transfer Agreement '+a['agreement_id'],
        author=company['name'],leftMargin=40,rightMargin=40,topMargin=38,bottomMargin=43)
    ink=colors.HexColor('#362C25'); orange=colors.HexColor('#C85500'); line=colors.HexColor('#E9D8C8')
    body=ParagraphStyle('AgreementBody',fontName='Invoice',fontSize=8.7,leading=12,spaceAfter=4,shaping=1,textColor=ink)
    small=ParagraphStyle('AgreementSmall',parent=body,fontSize=7.8,leading=10.5)
    heading=ParagraphStyle('AgreementSection',parent=body,fontSize=11,leading=15,textColor=orange,spaceBefore=7,spaceAfter=4,keepWithNext=True)
    title=ParagraphStyle('AgreementTitle',parent=body,fontSize=17,leading=22,textColor=orange,spaceAfter=6)
    right=ParagraphStyle('AgreementRight',parent=body,alignment=TA_RIGHT)
    def p(value,style=body): return Paragraph(text(value),style)
    def section(value): return p(value,heading)
    def dt(value):
        if not value: return 'Awaiting route / partner confirmation'
        try: return datetime.fromisoformat(value.replace('Z','+00:00')).astimezone(ZoneInfo('Asia/Kolkata')).strftime('%d %b %Y, %I:%M %p IST')
        except ValueError: return str(value)
    def table(rows,widths,header=False):
        t=Table(rows,colWidths=widths,repeatRows=1 if header else 0,hAlign='LEFT')
        commands=[('VALIGN',(0,0),(-1,-1),'TOP'),('LEFTPADDING',(0,0),(-1,-1),9),('RIGHTPADDING',(0,0),(-1,-1),9),
            ('TOPPADDING',(0,0),(-1,-1),4),('BOTTOMPADDING',(0,0),(-1,-1),4),('LINEBELOW',(0,0),(-1,-1),.35,line)]
        if header: commands += [('BACKGROUND',(0,0),(-1,0),colors.HexColor('#FFF0DF'))]
        t.setStyle(TableStyle(commands)); return t
    status='Customer review recorded' if a['status']=='reviewed' else 'Awaiting customer review - unsigned'
    if a.get('reformatted_copy'): status='Reformatted copy - original review / signature status unchanged'
    story=[table([[Image(str(ASSETS/'luggease-icon.png'),width=62,height=62),
        [p('LuggEase',title),p(company['name']),p('Logistics transfer services',small)]]],[80,width-80]),
        Spacer(1,8),p('LOGISTICS TRANSFER AGREEMENT',title),
        p(f"Reference: {a['agreement_id']}   |   Document version: {a['version']}",small),p(status,small),
        section('1. Parties to this agreement'),
        table([[p('Service provider',small),p(company['name']+'\n'+company['address'])],
            [p('Tax registration',small),p(f"GSTIN: {company['gstin']}   |   PAN: {company['pan']}",small)],
            [p('Customer / consignor',small),p(a['customer_name']+'\n'+a['customer_email'])]], [125,width-125]),
        p('This agreement records the transfer requested by the customer through LuggEase, operated by the service provider named above.',small),
        section('2. Collection and destination'),
        table([[p('Pickup / source',small),p(payload['pickup_address']+('' if payload['pickup_state'] in payload['pickup_address'] else '\n'+payload['pickup_state']))],
               [p('Drop / destination',small),p(payload['drop_address']+('' if payload['drop_state'] in payload['drop_address'] else '\n'+payload['drop_state']))]]+
              [[p(f'Additional stop {i+1}',small),p(stop)] for i,stop in enumerate(payload.get('extra_stops',[]))], [125,width-125]),
        section('3. Schedule of goods')]
    rows=[[p('No.',small),p('Item / goods description',small),p('Qty',small),p('Total kg',small)]]
    rows += [[p(i+1,small),p(item['name'],small),p(item['qty'],small),p(f"{float(item['total_kg']):g}",small)] for i,item in enumerate(q['items'])]
    story += [table(rows,[32,width-147,40,75],True),
        p(f"Estimated combined weight: {sum(float(item['total_kg']) for item in q['items']):g} kg",small),
        section('4. Journey and agreed quotation'),
        table([[p('Road distance',small),p(f"{q['distance_km']} km",small),p('Vehicle',small),p(q['vehicle']['name'],small)],
            [p('Approx. delivery',small),p(dt(q.get('delivery_estimate',{}).get('expected_delivery_at')),small),p('Quoted total',small),p(f"INR {q['grand_total']:,.2f} (including GST)",small)]],[95,170,75,width-340]),
        PageBreak(),section('5. Goods ownership and customer declaration'),p(DECLARATION),
        section('6. Payment and departure conditions')]
    paise=int((Decimal(str(q['grand_total']))*100).quantize(Decimal('1'),rounding=ROUND_HALF_UP));advance=(paise+1)//2
    story += [table([[p('Booking advance - 50%',small),p(f'INR {advance/100:,.2f}',right)],
        [p('Pickup balance - remaining 50%',small),p(f'INR {(paise-advance)/100:,.2f}',right)]],[width-140,140]),
        p('The booking advance is due when the order is placed. The remaining balance is due after loading on pickup day, before the vehicle leaves the source. Any odd paise is allocated to the booking advance.'),
        p('The customer must check the loaded goods and personally provide separate handwritten signatures on this transfer agreement and the sales invoice. Both signatures, the pickup OTP and full invoice payment are required before departure.'),
        section('7. Delivery estimate and exceptional conditions'),
        p('Delivery time is approximate. An estimated arrival after 9 PM defaults to 9 AM the following day. The assigned delivery partner may revise the approximate date and time for road conditions, traffic congestion, breakdowns or other difficulties; the explanation is visible to the customer.'),
        p('Live location is available only while the shipment status is In transit and the assigned partner is sharing location. Updates require the partner tracking screen to remain open; backgrounding or closing the screen stops sharing.'),
        section('8. Documented traffic supplement'),
        p('A single additional traffic charge of up to INR 200, including GST, may be requested with a reason, recorded route evidence and a Google traffic comparison. Customer acceptance is required. An accepted charge appears on a separate supplementary invoice; the original invoice remains unchanged. Location reports alone do not independently establish the cause of congestion.'),
        section('9. Review and pickup acknowledgement'),
        p('Before booking, the customer reviews the agreement and confirms the ownership declaration. No Aadhaar authentication is required. After loading, the customer signs below and separately signs the sales invoice before departure.'),
        KeepTogether([p('Customer / consignor: '+a['customer_name']),p('Customer handwritten signature after loading:',small),
            Image(BytesIO(pickup_signature),width=235,height=75,kind='proportional') if pickup_signature else Spacer(1,44),
            p('Signature: ______________________________    Date / time: ______________________________',small),
            p('Pickup partner / representative: ______________________________',small)]),
        Spacer(1,12),p('For '+company['name'],small),p('Service coordination and support: support@innovease-ai.in',small)]
    def footer(canvas,document):
        canvas.saveState(); canvas.setStrokeColor(line);canvas.line(40,34,555.28,34);canvas.setFont('Invoice',7);canvas.setFillColor(ink)
        canvas.drawString(40,23,'LuggEase | '+a['agreement_id']);canvas.drawRightString(555.28,23,f'Page {document.page}');canvas.restoreState()
    doc.build(story,onFirstPage=footer,onLaterPages=footer)
    return output.getvalue()


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
