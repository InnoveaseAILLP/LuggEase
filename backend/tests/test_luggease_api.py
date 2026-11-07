# LuggEase backend regression tests: auth, catalog, quote/GST pricing, orders, partner, admin, payments
import os
import uuid
import pytest
import requests
from pymongo import MongoClient


def _env(path, key):
    for line in open(path):
        if line.startswith(key + "="):
            return line.split("=", 1)[1].strip().strip('"')


BASE_URL = (os.environ.get("EXPO_PUBLIC_BACKEND_URL") or _env("/app/frontend/.env", "EXPO_PUBLIC_BACKEND_URL")).rstrip("/")
API = f"{BASE_URL}/api"
mdb = MongoClient(_env("/app/backend/.env", "MONGO_URL"))[_env("/app/backend/.env", "DB_NAME")]

ADMIN = {"email": "admin@luggease.in", "password": "Admin@12345"}
STATE = {}


def h(tok):
    return {"Authorization": f"Bearer {tok}"}


def quote_body(**kw):
    b = {"pickup_address": "TEST_Indiranagar, Bengaluru", "drop_address": "TEST_Whitefield, Bengaluru",
         "pickup_state": "Karnataka", "drop_state": "Karnataka", "distance_km": 10,
         "items": [{"key": "sofa", "qty": 1}], "service_type": "shift_only"}
    b.update(kw)
    return b


def register(prefix):
    email = f"test_{prefix}_{uuid.uuid4().hex[:8]}@example.com"
    r = requests.post(f"{API}/auth/register", json={"name": f"TEST_{prefix}", "email": email, "password": "Test@12345"})
    assert r.status_code == 200, r.text
    STATE.setdefault("users", []).append(r.json()["user"]["user_id"])
    return r.json()["token"], r.json()["user"]


@pytest.fixture(scope="module", autouse=True)
def cleanup():
    yield
    for oid in STATE.get("orders", []):
        mdb.orders.delete_one({"order_id": oid})
    for uid in STATE.get("users", []):
        mdb.users.delete_one({"user_id": uid})


# --- Auth ---
def test_admin_login_and_me():
    r = requests.post(f"{API}/auth/login", json=ADMIN)
    assert r.status_code == 200
    STATE["admin"] = r.json()["token"]
    me = requests.get(f"{API}/auth/me", headers=h(STATE["admin"])).json()
    assert me["role"] == "admin" and me["email"] == ADMIN["email"]


def test_login_wrong_password_and_dup_register():
    assert requests.post(f"{API}/auth/login", json={"email": ADMIN["email"], "password": "wrong"}).status_code == 401
    r = requests.post(f"{API}/auth/register", json={"name": "TEST_x", "email": ADMIN["email"], "password": "Test@12345"})
    assert r.status_code == 409
    assert requests.get(f"{API}/auth/me").status_code == 401


def test_register_customer_role():
    tok, user = register("cust")
    assert user["role"] is None
    r = requests.post(f"{API}/auth/role", json={"role": "customer", "phone": "9876543210"}, headers=h(tok))
    assert r.status_code == 200 and r.json()["role"] == "customer"
    STATE["cust"] = tok
    # admin cannot change role
    assert requests.post(f"{API}/auth/role", json={"role": "customer"}, headers=h(STATE["admin"])).status_code == 400


# --- Catalog / Quote ---
def test_catalog():
    d = requests.get(f"{API}/catalog").json()
    keys = {i["key"] for i in d["items"]}
    for k in ["kitchen_utensils", "fridge_single", "sofa", "couch", "dining_table", "tv", "washing_machine", "cot", "bed", "clothes", "mattress"]:
        assert k in keys
    assert d["commission_rate"] == 5 and "Karnataka" in d["states"]


def test_quote_shift_only_intra_state():
    q = requests.post(f"{API}/quote", json=quote_body(), headers=h(STATE["cust"])).json()
    assert q["vehicle"]["key"] == "mini_truck"  # sofa min vehicle
    assert q["hours"] == 1 and q["taxable_value"] == 890.0  # 350 + 200 + 140 + 200
    g = q["gst"]
    assert g["rate"] == 5 and g["sac"] == "996511" and g["cgst"] == 22.25 and g["sgst"] == 22.25 and g["igst"] == 0
    assert q["platform_commission"] == 44.5 and q["partner_payout"] == 845.5
    assert not any(c["label"] == "Packing material" for c in q["charges"])
    print("grand_total", q["grand_total"], "round_off", q["round_off"])


def test_quote_pack_and_shift_inter_state():
    q = requests.post(f"{API}/quote", json=quote_body(service_type="pack_and_shift", pickup_state="Maharashtra"),
                      headers=h(STATE["cust"])).json()
    g = q["gst"]
    assert g["rate"] == 18 and g["sac"] == "996729" and g["igst"] == g["total"] and g["cgst"] == 0
    assert any(c["label"] == "Packing material" and c["amount"] == 350 for c in q["charges"])
    assert q["hours"] == 2 and q["taxable_value"] == 1740.0


def test_quote_vehicle_by_weight_and_hours_override():
    q = requests.post(f"{API}/quote", json=quote_body(items=[{"key": "parcel_small", "qty": 2}]), headers=h(STATE["cust"])).json()
    assert q["vehicle"]["key"] == "two_wheeler"
    q = requests.post(f"{API}/quote", json=quote_body(items=[{"key": "carton_box", "qty": 10}]), headers=h(STATE["cust"])).json()
    assert q["vehicle"]["key"] == "three_wheeler"
    q = requests.post(f"{API}/quote", json=quote_body(hours=4), headers=h(STATE["cust"])).json()
    assert q["hours"] == 4
    r = requests.post(f"{API}/quote", json=quote_body(items=[{"key": "bed", "qty": 50}]), headers=h(STATE["cust"]))
    assert r.status_code == 400
    assert requests.post(f"{API}/quote", json=quote_body(pickup_state="Xyz"), headers=h(STATE["cust"])).status_code == 400


# --- Orders ---
def test_create_list_get_order():
    r = requests.post(f"{API}/orders", json=quote_body(), headers=h(STATE["cust"]))
    assert r.status_code == 200, r.text
    o = r.json()
    assert o["status"] == "pending_payment" and "_id" not in o
    STATE.setdefault("orders", []).append(o["order_id"])
    STATE["order"] = o["order_id"]
    lst = requests.get(f"{API}/orders", headers=h(STATE["cust"])).json()
    assert [x["order_id"] for x in lst] == [o["order_id"]]
    assert requests.get(f"{API}/orders/{o['order_id']}", headers=h(STATE["cust"])).json()["quote"]["taxable_value"] == 890.0
    # admin can create? no
    assert requests.post(f"{API}/orders", json=quote_body(), headers=h(STATE["admin"])).status_code == 403


def test_payment_create_razorpay():
    r = requests.post(f"{API}/payments/create", json={"order_id": STATE["order"]}, headers=h(STATE["cust"]))
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["razorpay_order_id"].startswith("order_") and d["amount"] > 0 and "/api/payments/page/" in d["checkout_url"]
    page = requests.get(d["checkout_url"])
    assert page.status_code == 200 and "checkout.razorpay.com" in page.text


def test_cancel_order():
    o = requests.post(f"{API}/orders", json=quote_body(), headers=h(STATE["cust"])).json()
    STATE["orders"].append(o["order_id"])
    r = requests.post(f"{API}/orders/{o['order_id']}/cancel", headers=h(STATE["cust"]))
    assert r.status_code == 200 and r.json()["status"] == "cancelled"
    assert requests.post(f"{API}/orders/{o['order_id']}/cancel", headers=h(STATE["cust"])).status_code == 400


# --- Partner + Admin ---
def _partner(vehicle):
    tok, user = register("partner")
    r = requests.post(f"{API}/auth/role", json={"role": "partner"}, headers=h(tok))
    assert r.json()["partner_status"] == "incomplete"
    r = requests.post(f"{API}/partner/profile", headers=h(tok), json={
        "full_name": "TEST_Partner", "phone": "9876543210", "city": "Bengaluru", "vehicle_type": vehicle,
        "vehicle_number": "ka01ab1234", "license_number": "KA0120200001", "id_proof": "1234"})
    assert r.status_code == 200 and r.json()["partner_status"] == "pending"
    return tok, user["user_id"]


def test_partner_pending_then_approved():
    tok, uid = _partner("mini_truck")
    STATE["p"], STATE["pid"] = tok, uid
    assert requests.get(f"{API}/partner/jobs", headers=h(tok)).json() == []
    pend = requests.get(f"{API}/admin/partners", params={"status": "pending"}, headers=h(STATE["admin"])).json()
    assert uid in [p["user_id"] for p in pend]
    r = requests.post(f"{API}/admin/partners/{uid}/decision", json={"decision": "approved"}, headers=h(STATE["admin"]))
    assert r.status_code == 200
    assert requests.get(f"{API}/auth/me", headers=h(tok)).json()["partner_status"] == "approved"


def test_partner_jobs_accept_status_flow_and_earnings():
    oid = STATE["order"]
    mdb.orders.update_one({"order_id": oid}, {"$set": {"status": "paid", "invoice_no": "LE/TEST/000001"}})
    small_tok, small_id = _partner("two_wheeler")
    requests.post(f"{API}/admin/partners/{small_id}/decision", json={"decision": "approved"}, headers=h(STATE["admin"]))
    assert oid not in [j["order_id"] for j in requests.get(f"{API}/partner/jobs", headers=h(small_tok)).json()]
    assert requests.post(f"{API}/orders/{oid}/accept", headers=h(small_tok)).status_code == 400
    assert oid in [j["order_id"] for j in requests.get(f"{API}/partner/jobs", headers=h(STATE["p"])).json()]
    r = requests.post(f"{API}/orders/{oid}/accept", headers=h(STATE["p"]))
    assert r.status_code == 200 and r.json()["status"] == "assigned" and r.json()["partner_id"] == STATE["pid"]
    assert requests.post(f"{API}/orders/{oid}/accept", headers=h(STATE["p"])).status_code == 409
    assert requests.post(f"{API}/orders/{oid}/status", json={"status": "delivered"}, headers=h(STATE["p"])).status_code == 400
    assert requests.get(f"{API}/orders/{oid}", headers=h(STATE["p"])).json()["pickup_otp"] is None
    assert requests.post(f"{API}/orders/{oid}/status", json={"status": "picked_up", "otp": "0000x"}, headers=h(STATE["p"])).status_code == 400
    otp = requests.get(f"{API}/orders/{oid}", headers=h(STATE["cust"])).json()["pickup_otp"]
    assert len(otp) == 4
    for s in ["picked_up", "in_transit", "delivered"]:
        r = requests.post(f"{API}/orders/{oid}/status", json={"status": s, "otp": otp}, headers=h(STATE["p"]))
        assert r.status_code == 200 and r.json()["status"] == s
    e = requests.get(f"{API}/partner/earnings", headers=h(STATE["p"])).json()
    assert e["delivered_count"] == 1 and e["net_earnings"] == 845.5 and e["commission"] == 44.5
    assert len(requests.get(f"{API}/orders", headers=h(STATE["p"])).json()) == 1
    # rating after delivery (once)
    r = requests.post(f"{API}/orders/{oid}/rate", json={"stars": 5, "comment": "Great"}, headers=h(STATE["cust"]))
    assert r.status_code == 200 and r.json()["rating"]["stars"] == 5
    assert requests.post(f"{API}/orders/{oid}/rate", json={"stars": 4}, headers=h(STATE["cust"])).status_code == 409
    assert requests.get(f"{API}/auth/me", headers=h(STATE["p"])).json()["rating"] == 5


def test_admin_assign_and_stats():
    o = requests.post(f"{API}/orders", json=quote_body(), headers=h(STATE["cust"])).json()
    STATE["orders"].append(o["order_id"])
    mdb.orders.update_one({"order_id": o["order_id"]}, {"$set": {"status": "paid", "invoice_no": "LE/TEST/000002"}})
    st = requests.get(f"{API}/admin/stats", headers=h(STATE["admin"])).json()
    assert st["open_orders"] >= 1 and "commission_earned" in st
    r = requests.post(f"{API}/admin/orders/{o['order_id']}/assign", json={"partner_id": STATE["pid"]}, headers=h(STATE["admin"]))
    assert r.status_code == 200 and r.json()["assigned_by"] == "admin"
    assert requests.get(f"{API}/admin/stats", headers=h(STATE["cust"])).status_code == 403
    assert requests.get(f"{API}/admin/partners", headers=h(STATE["p"])).status_code == 403


# --- Hardening / regression (iteration 2) ---
def test_role_locked_after_choice():
    r = requests.post(f"{API}/auth/role", json={"role": "partner"}, headers=h(STATE["cust"]))
    assert r.status_code == 400


def test_partner_phone_validation():
    tok, _ = register("badphone")
    requests.post(f"{API}/auth/role", json={"role": "partner"}, headers=h(tok))
    r = requests.post(f"{API}/partner/profile", headers=h(tok), json={
        "full_name": "TEST_P", "phone": "12345", "city": "Bengaluru", "vehicle_type": "mini_truck",
        "vehicle_number": "KA01AB1234", "license_number": "KA0120200001", "id_proof": "1234"})
    assert r.status_code == 422


def test_open_jobs_hide_customer_contact():
    o = requests.post(f"{API}/orders", json=quote_body(), headers=h(STATE["cust"])).json()
    STATE["orders"].append(o["order_id"])
    mdb.orders.update_one({"order_id": o["order_id"]}, {"$set": {"status": "paid"}})
    jobs = requests.get(f"{API}/partner/jobs", headers=h(STATE["p"])).json()
    job = next(j for j in jobs if j["order_id"] == o["order_id"])
    assert job["customer_email"] is None and job["customer_phone"] is None
    d = requests.get(f"{API}/orders/{o['order_id']}", headers=h(STATE["p"])).json()
    assert d["customer_email"] is None
    requests.post(f"{API}/orders/{o['order_id']}/accept", headers=h(STATE["p"]))
    d = requests.get(f"{API}/orders/{o['order_id']}", headers=h(STATE["p"])).json()
    assert d["customer_email"]


def test_payment_verify_requires_owner():
    other, _ = register("other")
    requests.post(f"{API}/auth/role", json={"role": "customer"}, headers=h(other))
    rz = mdb.orders.find_one({"order_id": STATE["order"]})["razorpay_order_id"]
    r = requests.post(f"{API}/payments/verify", headers=h(other),
                      json={"razorpay_order_id": rz, "razorpay_payment_id": "pay_x", "razorpay_signature": "bad"})
    assert r.status_code == 404
    assert requests.post(f"{API}/payments/verify", headers=h(STATE["p"]),
                         json={"razorpay_order_id": rz, "razorpay_payment_id": "pay_x", "razorpay_signature": "bad"}).status_code == 403


def test_db_schema_rejects_bad_order_status():
    from pymongo.errors import WriteError
    with pytest.raises(WriteError):
        mdb.orders.insert_one({"order_id": "TEST_bad", "customer_id": "x", "status": "flying", "quote": {},
                               "pickup_address": "a", "drop_address": "b", "created_at": "now"})


def test_cancellation_fee_after_assignment():
    o = requests.post(f"{API}/orders", json=quote_body(tip=50), headers=h(STATE["cust"])).json()
    STATE["orders"].append(o["order_id"])
    mdb.orders.update_one({"order_id": o["order_id"]}, {"$set": {"status": "paid"}})
    requests.post(f"{API}/orders/{o['order_id']}/accept", headers=h(STATE["p"]))
    r = requests.post(f"{API}/orders/{o['order_id']}/cancel", headers=h(STATE["cust"])).json()
    assert r["cancellation_fee"] == 100 and r["refund_amount"] == o["quote"]["grand_total"] - 100


def test_catalog_has_lugg_porter_options():
    d = requests.get(f"{API}/catalog").json()
    assert {"home_shifting", "store_pickup", "junk_removal", "parcel", "intercity"} <= {c["key"] for c in d["categories"]}
    assert "FIRST50" in [c["code"] for c in d["coupons"]] and "Now" in d["time_slots"]


# --- Iteration 5: bank settlement, environments, test users ---
def test_system_info_and_health():
    d = requests.get(f"{API}/system/info").json()
    assert d["env"] == "development" and d["version"] and d["payments"].startswith("razorpay-")
    assert requests.get(f"{API}/health").json()["status"] == "ok"


def test_partner_bank_validation_and_settlement():
    tok, uid = _partner("mini_truck")
    base = {"full_name": "TEST_Partner", "phone": "9876543210", "city": "Bengaluru", "vehicle_type": "mini_truck",
            "vehicle_number": "KA01AB1234", "license_number": "KA0120200001", "id_proof": "1234"}
    assert requests.post(f"{API}/partner/profile", headers=h(tok), json={**base, "bank_ifsc": "BAD"}).status_code == 422
    assert requests.post(f"{API}/partner/profile", headers=h(tok), json={**base, "bank_account_number": "123456789"}).status_code == 422
    r = requests.post(f"{API}/partner/profile", headers=h(tok), json={**base, "bank_account_holder": "TEST P", "bank_account_number": "123456789012",
                                                                       "bank_ifsc": "SBIN0001234", "bank_name": "SBI"})
    assert r.status_code == 200 and r.json()["partner_profile"]["bank_ifsc"] == "SBIN0001234"
    requests.post(f"{API}/admin/partners/{uid}/decision", json={"decision": "approved"}, headers=h(STATE["admin"]))
    o = requests.post(f"{API}/orders", json=quote_body(), headers=h(STATE["cust"])).json()
    STATE["orders"].append(o["order_id"])
    mdb.orders.update_one({"order_id": o["order_id"]}, {"$set": {"status": "paid"}})
    a = requests.post(f"{API}/orders/{o['order_id']}/accept", headers=h(tok)).json()
    assert a["settlement"]["account_number_masked"] == "XXXX9012" and a["settlement"]["status"] == "pending"
    assert requests.post(f"{API}/admin/orders/{o['order_id']}/settle", json={"utr": "UTR123456"}, headers=h(STATE["admin"])).status_code == 400
    otp = mdb.orders.find_one({"order_id": o["order_id"]})["pickup_otp"]
    for s in ["picked_up", "in_transit", "delivered"]:
        requests.post(f"{API}/orders/{o['order_id']}/status", json={"status": s, "otp": otp}, headers=h(tok))
    assert requests.post(f"{API}/admin/orders/{o['order_id']}/settle", json={"utr": "UTR123456"}, headers=h(tok)).status_code == 403
    r = requests.post(f"{API}/admin/orders/{o['order_id']}/settle", json={"utr": "utr123456"}, headers=h(STATE["admin"]))
    assert r.status_code == 200 and r.json()["settlement"]["status"] == "settled" and r.json()["settlement"]["utr"] == "UTR123456"
    assert requests.post(f"{API}/admin/orders/{o['order_id']}/settle", json={"utr": "UTR123456"}, headers=h(STATE["admin"])).status_code == 409
    e = requests.get(f"{API}/partner/earnings", headers=h(tok)).json()
    assert e["settled"] == o["quote"]["partner_payout"] and e["awaiting_settlement"] == 0


def test_seed_test_users_all_roles():
    r = requests.post(f"{API}/admin/seed-test-users", headers=h(STATE["admin"]))
    assert r.status_code == 200
    roles = " ".join(u["role"] for u in r.json()["users"])
    for want in ["customer", "approved", "pending", "rejected", "incomplete", "admin", "no role"]:
        assert want in roles
    assert requests.post(f"{API}/admin/seed-test-users", headers=h(STATE["cust"])).status_code == 403
    for email in ["ops@demo.luggease.in", "kiran@demo.luggease.in", "newuser@demo.luggease.in"]:
        assert requests.post(f"{API}/auth/login", json={"email": email, "password": "Demo@12345"}).status_code == 200
