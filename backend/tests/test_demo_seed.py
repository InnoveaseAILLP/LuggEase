# LuggEase demo dataset (seed_demo.py) + iteration-2 fix verification via public API (read-only on DEMO data)
import pytest
import requests

from test_luggease_api import API, ADMIN, h, quote_body, register, cleanup  # noqa: F401

DEMO_PWD = "Demo@12345"


def login(email, pwd=DEMO_PWD):
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": pwd})
    assert r.status_code == 200, r.text
    return r.json()["token"], r.json()["user"]


# --- Demo customers ---
def test_priya_sees_three_orders():
    tok, u = login("priya@demo.luggease.in")
    assert u["role"] == "customer"
    orders = requests.get(f"{API}/orders", headers=h(tok)).json()
    demo = {o["order_id"]: o["status"] for o in orders if o["order_id"].startswith("DEMO")}
    assert demo == {"DEMO0001": "delivered", "DEMO0003": "assigned", "DEMO0005": "pending_payment"}


def test_demo0001_tax_invoice():
    tok, _ = login("priya@demo.luggease.in")
    o = requests.get(f"{API}/orders/DEMO0001", headers=h(tok)).json()
    assert o["invoice_no"] == "LE/DEMO/000001"
    assert o["status"] == "delivered" and o["quote"]["grand_total"] > 0
    assert o["quote"]["gst"]["supply_type"] == "Intra-State"


# --- Demo partners ---
def test_ravi_sees_demo0004_without_contact():
    tok, u = login("ravi@demo.luggease.in")
    assert u["partner_status"] == "approved"
    jobs = requests.get(f"{API}/partner/jobs", headers=h(tok)).json()
    j = next((j for j in jobs if j["order_id"] == "DEMO0004"), None)
    assert j is not None
    assert j["customer_email"] is None and j["customer_phone"] is None
    d = requests.get(f"{API}/orders/DEMO0004", headers=h(tok)).json()
    assert d["customer_email"] is None and d["customer_phone"] is None


def test_ravi_cannot_view_others_closed_order():
    tok, _ = login("ravi@demo.luggease.in")
    assert requests.get(f"{API}/orders/DEMO0002", headers=h(tok)).status_code == 404  # DEMO0002 belongs to suresh


def test_imran_two_wheeler_does_not_see_heavy_job():
    tok, _ = login("imran@demo.luggease.in")
    jobs = requests.get(f"{API}/partner/jobs", headers=h(tok)).json()
    assert all(j["order_id"] != "DEMO0004" for j in jobs)


def test_amit_pending_cannot_see_jobs():
    tok, u = login("amit@demo.luggease.in")
    assert u["partner_status"] == "pending"
    assert requests.get(f"{API}/partner/jobs", headers=h(tok)).json() == []


# --- Admin ---
def test_admin_sees_pending_amit_and_all_demo_orders():
    tok, _ = login(ADMIN["email"], ADMIN["password"])
    pend = requests.get(f"{API}/admin/partners", params={"status": "pending"}, headers=h(tok)).json()
    assert any(p["email"] == "amit@demo.luggease.in" for p in pend)
    orders = requests.get(f"{API}/orders", headers=h(tok)).json()
    ids = {o["order_id"] for o in orders}
    assert {f"DEMO000{i}" for i in range(1, 7)} <= ids


# --- Fixes via API ---
def test_light_load_pack_and_shift_labour_api():
    tok, _ = register("demofix")
    r = requests.post(f"{API}/auth/role", json={"role": "customer"}, headers=h(tok))
    assert r.status_code == 200
    q = requests.post(f"{API}/quote", headers=h(tok), json=quote_body(
        items=[{"key": "parcel_small", "qty": 2}], service_type="pack_and_shift")).json()
    assert q["labour_billable"] is True and q["hours"] == 0.5 and q["min_hours"] == 0.5
    lab = [c for c in q["charges"] if c["label"].startswith("Labour")]
    assert lab and lab[0]["amount"] == 175
    assert q["grand_total"] == int(q["grand_total"])
    # role is locked once chosen
    assert requests.post(f"{API}/auth/role", json={"role": "partner"}, headers=h(tok)).status_code == 400
    # empty quote body (the old post-confirm bug) is a 422
    assert requests.post(f"{API}/quote", headers=h(tok), json={}).status_code == 422


@pytest.mark.parametrize("phone,ok", [("9876543210", True), ("+919876543210", True), ("5876543210", False), ("98765", False)])
def test_partner_phone_regex(phone, ok):
    tok, _ = register("demophone")
    requests.post(f"{API}/auth/role", json={"role": "partner"}, headers=h(tok))
    r = requests.post(f"{API}/partner/profile", headers=h(tok), json={
        "full_name": "TEST Partner", "phone": phone, "city": "Bengaluru", "vehicle_type": "mini_truck",
        "vehicle_number": "KA01TEST", "license_number": "KA0120200001", "id_proof": "1234"})
    assert (r.status_code == 200) == ok, r.text


def test_payments_verify_partner_forbidden():
    tok, _ = login("ravi@demo.luggease.in")
    r = requests.post(f"{API}/payments/verify", headers=h(tok), json={
        "razorpay_order_id": "order_x", "razorpay_payment_id": "pay_x", "razorpay_signature": "x"})
    assert r.status_code == 403
