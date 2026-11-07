# Iteration 4: Lugg/Porter features via public API - coupons, tips, helpers, stops, OTP, rating, cancellation, earnings
import uuid
import pytest
import requests
from test_luggease_api import API, mdb, h, quote_body, ADMIN

S = {"orders": [], "users": []}


def reg(prefix):
    email = f"test_{prefix}_{uuid.uuid4().hex[:8]}@example.com"
    r = requests.post(f"{API}/auth/register", json={"name": f"TEST_{prefix}", "email": email, "password": "Test@12345"})
    assert r.status_code == 200, r.text
    S["users"].append(r.json()["user"]["user_id"])
    return r.json()["token"], r.json()["user"]


@pytest.fixture(scope="module", autouse=True)
def setup():
    S["cust"], _ = reg("c4")
    requests.post(f"{API}/auth/role", json={"role": "customer"}, headers=h(S["cust"]))
    S["p"], pu = reg("p4")
    requests.post(f"{API}/auth/role", json={"role": "partner"}, headers=h(S["p"]))
    r = requests.post(f"{API}/partner/profile", headers=h(S["p"]), json={
        "full_name": "TEST_P4", "phone": "9876543210", "city": "Bengaluru", "vehicle_type": "truck_14ft",
        "vehicle_number": "KA01AB1234", "license_number": "DL12345", "id_proof": "1234"})
    assert r.status_code == 200, r.text
    mdb.users.update_one({"user_id": pu["user_id"]}, {"$set": {"partner_status": "approved"}})
    S["admin"] = requests.post(f"{API}/auth/login", json=ADMIN).json()["token"]
    yield
    for oid in S["orders"]:
        mdb.orders.delete_one({"order_id": oid})
    for uid in S["users"]:
        mdb.users.delete_one({"user_id": uid})


def q(**kw):
    r = requests.post(f"{API}/quote", json=quote_body(**kw), headers=h(S["cust"]))
    return r


def new_paid_order(**kw):
    o = requests.post(f"{API}/orders", json=quote_body(**kw), headers=h(S["cust"])).json()
    S["orders"].append(o["order_id"])
    mdb.orders.update_one({"order_id": o["order_id"]}, {"$set": {"status": "paid"}})
    return o


def test_coupon_invalid_and_category_mismatch_and_lugg10_cap():
    r = q(coupon_code="BOGUS").json()
    assert r["discount"] == 0 and r["coupon_message"] == "Invalid coupon code"
    r = q(coupon_code="MOVE200", service_category="furniture").json()
    assert r["discount"] == 0 and "not valid" in r["coupon_message"]
    big = q(distance_km=200, coupon_code="lugg10", items=[{"key": "sofa", "qty": 5}]).json()
    assert big["coupon_code"] == "LUGG10" and big["discount"] == 200
    assert any(c["label"].startswith("Coupon discount") and c["amount"] == -200 for c in big["charges"])
    assert big["taxable_value"] == big["subtotal"] - 200


def test_tip_limits_and_helpers_min_via_api():
    assert q(tip=-1).status_code == 422
    assert q(tip=100000).status_code == 422
    r = q(service_type="pack_and_shift", helpers=0).json()
    assert r["helpers"] == 1 and r["min_helpers"] == 1
    r0 = q(helpers=0).json()
    assert r0["helpers"] == 0 and r0["hours"] == 0 and not any(c["label"].startswith(("Labour", "Loading")) for c in r0["charges"])
    r2 = q(helpers=2, hours=2).json()
    lab = next(c for c in r2["charges"] if c["label"].startswith("Labour"))
    r3 = q(helpers=3, hours=2).json()
    lab3 = next(c for c in r3["charges"] if c["label"].startswith("Labour"))
    assert lab3["amount"] == lab["amount"] * 1.5


def test_extra_stops_max_3_and_blank_ignored():
    assert q(extra_stops=["a", "b", "c", "d"]).status_code == 422
    r = q(extra_stops=["TEST_Stop1", "  "]).json()
    assert r["extra_stops"] == ["TEST_Stop1"]
    assert any(c["label"].startswith("Extra stops (1") and c["amount"] == 100 for c in r["charges"])


def test_partner_list_hides_otp_admin_sees_otp():
    o = new_paid_order(tip=100)
    oid = o["order_id"]
    acc = requests.post(f"{API}/orders/{oid}/accept", headers=h(S["p"]))
    assert acc.status_code == 200 and acc.json()["pickup_otp"] is None
    rows = requests.get(f"{API}/orders", headers=h(S["p"])).json()
    assert all(r["pickup_otp"] is None for r in rows if r["order_id"] == oid)
    assert len(requests.get(f"{API}/orders/{oid}", headers=h(S["admin"])).json()["pickup_otp"]) == 4
    S["tip_order"] = oid


def test_rating_before_delivery_rejected_and_partner_cannot_rate():
    oid = S["tip_order"]
    assert requests.post(f"{API}/orders/{oid}/rate", json={"stars": 5}, headers=h(S["cust"])).status_code == 400
    assert requests.post(f"{API}/orders/{oid}/rate", json={"stars": 5}, headers=h(S["p"])).status_code == 403
    assert requests.post(f"{API}/orders/{oid}/rate", json={"stars": 6}, headers=h(S["cust"])).status_code == 422


def test_skip_status_rejected_then_full_flow_and_tip_earnings():
    oid = S["tip_order"]
    assert requests.post(f"{API}/orders/{oid}/status", json={"status": "delivered"}, headers=h(S["p"])).status_code == 400
    assert requests.post(f"{API}/orders/{oid}/status", json={"status": "picked_up"}, headers=h(S["p"])).status_code == 400
    otp = requests.get(f"{API}/orders/{oid}", headers=h(S["cust"])).json()["pickup_otp"]
    for s in ("picked_up", "in_transit", "delivered"):
        assert requests.post(f"{API}/orders/{oid}/status", json={"status": s, "otp": otp}, headers=h(S["p"])).status_code == 200
    e = requests.get(f"{API}/partner/earnings", headers=h(S["p"])).json()
    assert e["tips"] == 100 and e["delivered_count"] == 1
    o = requests.get(f"{API}/orders/{oid}", headers=h(S["cust"])).json()
    assert e["net_earnings"] == o["quote"]["partner_payout"]
    assert o["quote"]["partner_payout"] == round(o["quote"]["taxable_value"] * 0.95 + 100, 2)
    assert o["quote"]["grand_total"] == o["quote"]["invoice_total"] + 100


def test_cancel_delivered_rejected_and_paid_cancel_full_refund():
    assert requests.post(f"{API}/orders/{S['tip_order']}/cancel", headers=h(S["cust"])).status_code == 400
    o = new_paid_order()
    r = requests.post(f"{API}/orders/{o['order_id']}/cancel", headers=h(S["cust"])).json()
    assert r["status"] == "cancelled" and r["cancellation_fee"] == 0 and r["refund_amount"] == o["quote"]["grand_total"]
    assert "Refund of" in r["refund_note"]


def test_order_persists_category_slot_stops():
    o = requests.post(f"{API}/orders", headers=h(S["cust"]), json=quote_body(
        service_category="junk_removal", time_slot="10:00-12:00", extra_stops=["TEST_S1"])).json()
    S["orders"].append(o["order_id"])
    g = requests.get(f"{API}/orders/{o['order_id']}", headers=h(S["cust"])).json()
    assert g["service_category"] == "junk_removal" and g["time_slot"] == "10:00-12:00" and g["extra_stops"] == ["TEST_S1"]
    assert any("Eco-disposal" in c["label"] for c in g["quote"]["charges"])
