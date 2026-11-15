from io import BytesIO
from pypdf import PdfReader
from invoice_pdf import build_invoice_pdf

def test_invoice_wraps_markup_safely_and_paginates_long_charges():
    supplier={'name':'Supplier LLP','address':'Test address','gstin':'33AAMFI4627F1ZG','pan':'AAMFI4627F'}
    order={'invoice_no':'TEST/001','invoice_date':'2026-11-15','order_id':'TEST',
        'customer_name':'<b>Customer & Co</b>', 'customer_email':'test@example.com',
        'pickup_address':'தமிழ் முகவரி ' * 30,'drop_address':'पता ' * 30,
        'quote':{'charges':[{'label':'Long moving service description ' * 6,'amount':10} for _ in range(40)],
            'taxable_value':400,'subtotal':400,'grand_total':472,'invoice_total':472,
            'gst':{'supply_type':'inter','sac':'996791','description':'Moving','igst_rate':18,'igst':72}}}
    result=build_invoice_pdf(order,supplier)
    reader=PdfReader(BytesIO(result))
    assert len(reader.pages)>1
    content='\n'.join(page.extract_text() for page in reader.pages)
    assert '<b>Customer & Co</b>' in content
    assert 'IGST @ 18%' in content and 'INR 472.00' in content
    assert 'Description' in reader.pages[1].extract_text()
    assert all(f'Page {i+1}' in page.extract_text() for i,page in enumerate(reader.pages))
