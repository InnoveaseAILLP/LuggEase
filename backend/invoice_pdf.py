"""Render paid sales invoices without embedding customer-controlled markup."""
from io import BytesIO
from pathlib import Path
from functools import lru_cache
from xml.sax.saxutils import escape
from reportlab.lib import colors
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.enums import TA_RIGHT
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, Image

ASSETS = Path(__file__).parent / 'assets'

@lru_cache(maxsize=1)
def fonts():
    for family, filename in [('Invoice', 'NotoSans'), ('Tamil', 'NotoSansTamil'), ('Deva', 'NotoSansDevanagari')]:
        for suffix, weight in [('', 'Regular'), ('Bold', 'Bold')]:
            pdfmetrics.registerFont(TTFont(family + suffix, str(ASSETS / 'fonts' / f'{filename}-{weight}.ttf')))
        pdfmetrics.registerFontFamily(family, normal=family, bold=family + 'Bold', italic=family, boldItalic=family + 'Bold')


def text(value):
    # Bound arbitrary notes and address lengths and select fonts for Indian scripts.
    runs = []
    for char in str(value or '')[:2000]:
        font = 'Tamil' if '\u0b80' <= char <= '\u0bff' else 'Deva' if '\u0900' <= char <= '\u097f' else 'Invoice'
        if runs and runs[-1][0] == font:
            runs[-1][1] += char
        else:
            runs.append([font, char])
    return ''.join(f'<font name="{font}">{escape(run).replace(chr(10), "<br/>")}</font>' for font, run in runs)


def build_invoice_pdf(order, supplier):
    fonts()
    output = BytesIO()
    doc = SimpleDocTemplate(output, pagesize=(595.28, 841.89), rightMargin=36, leftMargin=36, topMargin=36, bottomMargin=42,
                            title='LuggEase Sales Invoice ' + str(order['invoice_no']), author=supplier['name'])
    normal = ParagraphStyle('Body', fontName='Invoice', fontSize=9, leading=13, shaping=1, textColor=colors.HexColor('#333333'), spaceAfter=5)
    heading = ParagraphStyle('Heading', parent=normal, fontName='InvoiceBold', fontSize=17, leading=23, textColor=colors.HexColor('#C85500'))
    small = ParagraphStyle('Small', parent=normal, fontSize=8, leading=11)
    right = ParagraphStyle('Right', parent=normal, alignment=TA_RIGHT)
    p = lambda value, style=normal: Paragraph(text(value), style)
    money = lambda value: f'INR {float(value or 0):,.2f}'
    story = [Table([[Image(str(ASSETS / 'luggease-icon.png'), width=58, height=58),
        [p('TEST INVOICE - NOT VALID FOR TAX' if order.get('is_test') else 'SALES INVOICE', heading), p(order['invoice_no']), p('Date: ' + str(order.get('invoice_date', ''))[:10])]]],
        colWidths=[75, 448]), Spacer(1, 12), p(supplier['name']), p(supplier['address']),
        p(f"GSTIN: {supplier['gstin']}   |   PAN: {supplier['pan']}", small), Spacer(1, 10),
        p('BILL TO'), p(order.get('customer_name') or order.get('customer_email')),
        p(order.get('customer_email')), p('GSTIN: ' + (order.get('customer_gstin') or 'Unregistered (B2C)'), small),
        Spacer(1, 10), p('Order: ' + order['order_id'], small),
        p('Pickup: ' + order.get('pickup_address', '')), p('Drop: ' + order.get('drop_address', ''))]
    if order.get('is_test'):story += [p('TEST ONLY - NO PAYMENT RECEIVED. This document is for workflow testing and is not a receipt.', heading)]
    q = order['quote']; g = q['gst']
    story += [p(f"Place of supply: {q.get('place_of_supply', '')} ({g['supply_type']})", small),
              p(f"SAC {g['sac']} | {g['description']}", small), Spacer(1, 10)]
    rows = [[p('Description'), p('Amount', right)]]
    rows += [[p(c['label']), p(money(c['amount']), right)] for c in q['charges'] if c['amount']>=0]
    rows += [[p('Subtotal'), p(money(q.get('subtotal', q['taxable_value'])), right)]]
    if q.get('discount'):
        rows += [[p('Discount'), p('-' + money(q['discount']), right)]]
    rows += [[p('Taxable value'), p(money(q['taxable_value']), right)]]
    if g['igst_rate']:
        rows += [[p(f"IGST @ {g['igst_rate']}%"), p(money(g['igst']), right)]]
    else:
        rows += [[p(f"CGST @ {g['cgst_rate']}%"), p(money(g['cgst']), right)], [p(f"SGST @ {g['sgst_rate']}%"), p(money(g['sgst']), right)]]
    if q.get('round_off'):
        rows += [[p('Round off'), p(money(q['round_off']), right)]]
    rows += [[p('Invoice total'), p(money(q.get('invoice_total', q['grand_total'])), right)]]
    table = Table(rows, colWidths=[373, 150], repeatRows=1, hAlign='LEFT')
    table.setStyle(TableStyle([('BACKGROUND', (0,0), (-1,0), colors.HexColor('#FFF0DF')),
        ('BACKGROUND', (0,-1), (-1,-1), colors.HexColor('#FFF0DF')),
        ('VALIGN', (0,0), (-1,-1), 'TOP'), ('LINEBELOW', (0,0), (-1,0), 0.5, colors.HexColor('#E5C8AB')),
        ('TOPPADDING', (0,0), (-1,-1), 7), ('BOTTOMPADDING', (0,0), (-1,-1), 7)]))
    story += [table, Spacer(1, 8), p(q.get('amount_in_words', ''))]
    if q.get('tip'):
        story += [p('Tip to partner (not taxable): ' + money(q['tip'])), p(('Test total including tip: ' if order.get('is_test') else 'Total paid including tip: ') + money(q['grand_total']))]
    plan=order.get('payment_plan')
    if plan:
        story += [Spacer(1,8),p('Payment schedule: 50% at booking; remaining 50% after loading on pickup day, before departure.', small), p(('Simulated credit (no money received): ' if order.get('is_test') else 'Payments received: ')+money(plan['paid_paise']/100)), p('Outstanding order balance: '+money(max(0,plan['total_paise']-plan['paid_paise'])/100))]
    bank=supplier.get('bank') or {}
    if str(bank.get('account_number','')).isdigit():
        story += [Spacer(1,10),p('Bank details for NEFT / RTGS payment',small),
            p(bank.get('account_name') or supplier['name'],small),
            p(f"{bank.get('bank_name','')} | {bank.get('branch','')}",small),
            p(f"Account number: {bank['account_number']} | IFSC: {bank.get('ifsc','')}",small)]
    story += [Spacer(1, 12), p('Tax payable under reverse charge: No.', small),
              p('Computer generated invoice. Customer pickup acknowledgement is required after loading.', small),
              p('Need help? support@innovease-ai.in', small)]
    story += [Spacer(1, 12), p('Customer acknowledgement after loading', small)]
    if order.get('invoice_pickup_signature'):
        story += [Image(BytesIO(order['invoice_pickup_signature']), width=220, height=80, kind='proportional'), p(order.get('invoice_pickup_signed_at', ''), small)]
    else:
        story += [p('Customer handwritten signature: ____________________    Date/time: ____________________', small)]
    if order.get('invoice_delivery_signature'):
        story += [Spacer(1,12),p('Customer delivery acknowledgement after unloading',small),
            p(order.get('invoice_delivery_recipient',''),small),
            Image(BytesIO(order['invoice_delivery_signature']),width=220,height=80,kind='proportional'),
            p(order.get('invoice_delivery_signed_at',''),small)]
    def footer(canvas, document):
        canvas.saveState(); canvas.setFont('Invoice', 8); canvas.setFillColor(colors.HexColor('#666666'))
        if order.get('is_test'):canvas.drawString(36, 38, 'TEST ONLY | NO PAYMENT RECEIVED | NOT VALID FOR TAX')
        canvas.drawString(36, 24, 'LuggEase | Test invoice' if order.get('is_test') else 'LuggEase | Sales invoice'); canvas.drawRightString(559, 24, f'Page {document.page}'); canvas.restoreState()
    doc.build(story, onFirstPage=footer, onLaterPages=footer)
    return output.getvalue()
