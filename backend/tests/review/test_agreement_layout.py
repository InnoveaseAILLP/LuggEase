from io import BytesIO
from pypdf import PdfReader
from shipment_documents import agreement_pdf,AGREEMENT_DOCUMENT_VERSION,DECLARATION


def agreement():
    return {'agreement_id':'LTA-LAYOUT-QA','version':AGREEMENT_DOCUMENT_VERSION,'status':'pending_review',
        'customer_name':'Synthetic Customer <b> & Co','customer_email':'test@example.invalid',
        'payload':{'pickup_address':'Public pickup, Coimbatore','drop_address':'Public destination, Chennai','pickup_state':'Tamil Nadu','drop_state':'Tamil Nadu'},
        'quote':{'items':[{'name':f'Test item {i+1}','qty':1,'total_kg':10} for i in range(10)],'distance_km':300,'vehicle':{'name':'Tata Ace'},'grand_total':1916,'delivery_estimate':{'expected_delivery_at':'2026-11-18T09:00:00+05:30'}}}


def test_invoice_style_agreement_has_two_a4_pages_branding_goods_and_complete_terms():
    a=agreement();reader=PdfReader(BytesIO(agreement_pdf(a)))
    assert len(reader.pages)==2
    content=' '.join(' '.join(p.extract_text().split()) for p in reader.pages)
    for phrase in ['LOGISTICS TRANSFER AGREEMENT','Innovease AI & Technology Transformation Consulting LLP','33AAMFI4627F1ZG','AAMFI4627F','Document version: 3','Synthetic Customer <b> & Co','Test item 10','INR 958.00',DECLARATION,'Customer handwritten signature after loading:','support@innovease-ai.in']:
        assert phrase in content
    for i,page in enumerate(reader.pages):
        assert abs(float(page.mediabox.width)-595.28)<0.1
        assert f'Page {i+1}' in page.extract_text() and a['agreement_id'] in page.extract_text()


def test_reformatted_archived_copy_retains_source_version_and_exact_clauses():
    a=agreement();a.update(version=1,reformatted_copy=True,source_clauses=[('Original terms',['Original reviewed wording stays exactly as supplied.'])])
    text=' '.join(p.extract_text() for p in PdfReader(BytesIO(agreement_pdf(a))).pages)
    assert 'Document version: 1' in text and 'Original reviewed wording stays exactly as supplied.' in text
    assert 'original review / signature status unchanged' in text
    assert 'An estimated arrival after 9 PM' not in text


def test_normal_generation_never_uses_archived_copy_overrides():
    a=agreement();a['source_clauses']=[('Override',['Unapproved replacement terms'])]
    text=' '.join(p.extract_text() for p in PdfReader(BytesIO(agreement_pdf(a))).pages)
    assert 'Unapproved replacement terms' not in text and 'Goods ownership' in text
