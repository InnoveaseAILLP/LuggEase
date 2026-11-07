"""Seed LuggEase with realistic demo data (idempotent).

Run:  cd /app/backend && python seed_demo.py
Creates demo customers, delivery partners (approved + pending) and orders in every status.
All demo records use emails ending in @demo.luggease.in and order ids starting with DEMO.
"""
import os
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

import bcrypt
from dotenv import load_dotenv
from pymongo import MongoClient

sys.path.insert(0, str(Path(__file__).parent))
load_dotenv(Path(__file__).parent / ".env")
from server import QuoteRequest, compute_quote  # noqa: E402

db = MongoClient(os.environ["MONGO_URL"])[os.environ["DB_NAME"]]
PASSWORD = "Demo@12345"
PWD_HASH = bcrypt.hashpw(PASSWORD.encode(), bcrypt.gensalt(12)).decode()
NOW = datetime.now(timezone.utc)

CUSTOMERS = [
    {"user_id": "user_democust01", "email": "priya@demo.luggease.in", "name": "Priya Nair", "phone": "9845012345"},
    {"user_id": "user_democust02", "email": "arjun@demo.luggease.in", "name": "Arjun Mehta", "phone": "9820098765"},
]
PARTNERS = [
    {"user_id": "user_demopart01", "email": "ravi@demo.luggease.in", "status": "approved",
     "profile": {"full_name": "Ravi Kumar", "phone": "9900112233", "city": "Bengaluru", "vehicle_type": "mini_truck",
                 "vehicle_number": "KA05MN4521", "license_number": "KA0520190012345", "id_proof": "ABCPK1234F", "upi_id": "ravi@okaxis", "gstin": None,
                 "bank_account_holder": "Ravi Kumar", "bank_account_number": "123456789012", "bank_ifsc": "SBIN0001234", "bank_name": "State Bank of India"}},
    {"user_id": "user_demopart02", "email": "suresh@demo.luggease.in", "status": "approved",
     "profile": {"full_name": "Suresh Yadav", "phone": "9811223344", "city": "Bengaluru", "vehicle_type": "truck_14ft",
                 "vehicle_number": "KA01AC7788", "license_number": "KA0120150067890", "id_proof": "4521", "upi_id": "suresh@ybl", "gstin": "29AAKPY1234M1Z2",
                 "bank_account_holder": "Suresh Yadav", "bank_account_number": "998877665544", "bank_ifsc": "ICIC0004321", "bank_name": "ICICI Bank"}},
    {"user_id": "user_demopart03", "email": "imran@demo.luggease.in", "status": "approved",
     "profile": {"full_name": "Imran Sheikh", "phone": "9765432109", "city": "Bengaluru", "vehicle_type": "two_wheeler",
                 "vehicle_number": "KA03HX9911", "license_number": "KA0320210004567", "id_proof": "7788", "upi_id": "imran@paytm", "gstin": None}},
    {"user_id": "user_demopart04", "email": "amit@demo.luggease.in", "status": "pending",
     "profile": {"full_name": "Amit Verma", "phone": "9123456780", "city": "Mysuru", "vehicle_type": "pickup_8ft",
                 "vehicle_number": "KA09B3456", "license_number": "KA0920180009876", "id_proof": "AQWPV9876K", "upi_id": None, "gstin": None}},
    {"user_id": "user_demopart05", "email": "kiran@demo.luggease.in", "status": "rejected",
     "profile": {"full_name": "Kiran Rao", "phone": "9000011111", "city": "Bengaluru", "vehicle_type": "three_wheeler",
                 "vehicle_number": "KA02X1111", "license_number": "KA0220170001111", "id_proof": "1111", "upi_id": None, "gstin": None}},
]
EXTRA_USERS = [
    # Partner who signed up but has not submitted documents yet
    {"user_id": "user_demopart06", "email": "newpartner@demo.luggease.in", "name": "Neha Partner", "role": "partner", "partner_status": "incomplete"},
    # Signed up, role not chosen yet (onboarding screen)
    {"user_id": "user_demonew01", "email": "newuser@demo.luggease.in", "name": "New User", "role": None},
    # Second admin for operations / QA
    {"user_id": "user_demoadmin1", "email": "ops@demo.luggease.in", "name": "Ops Admin", "role": "admin"},
]
TEST_USERS_SUMMARY = (
    [{"email": c["email"], "role": "customer"} for c in CUSTOMERS]
    + [{"email": p["email"], "role": f"partner ({p['status']})"} for p in PARTNERS]
    + [{"email": u["email"], "role": u["role"] + (f" ({u['partner_status']})" if u.get("partner_status") else "") if u["role"] else "no role yet"} for u in EXTRA_USERS]
    + [{"email": "all of the above", "role": f"password {PASSWORD}"}]
)

ORDERS = [
    ("DEMO0001", 0, "delivered", 0, dict(pickup_address="12, 4th Cross, Koramangala, Bengaluru 560034", drop_address="88, ITPL Main Rd, Whitefield, Bengaluru 560066",
      pickup_state="Karnataka", drop_state="Karnataka", distance_km=18, service_type="pack_and_shift", pickup_floor=2, drop_floor=1, lift_available=False,
      items=[{"key": "fridge_double", "qty": 1}, {"key": "sofa", "qty": 1}, {"key": "bed", "qty": 1}, {"key": "kitchen_utensils", "qty": 4}, {"key": "clothes", "qty": 5}])),
    ("DEMO0002", 1, "in_transit", 1, dict(pickup_address="Flat 1203, Lodha Towers, Lower Parel, Mumbai 400013", drop_address="45, MG Road, Bengaluru 560001",
      pickup_state="Maharashtra", drop_state="Karnataka", distance_km=985, service_type="pack_and_shift", service_category="intercity",
      items=[{"key": "washing_machine", "qty": 1}, {"key": "dining_table", "qty": 1}, {"key": "tv", "qty": 2}, {"key": "mattress", "qty": 2}, {"key": "cot", "qty": 2}])),
    ("DEMO0003", 0, "assigned", 2, dict(pickup_address="HSR Layout Sector 2, Bengaluru 560102", drop_address="Jayanagar 4th Block, Bengaluru 560011",
      pickup_state="Karnataka", drop_state="Karnataka", distance_km=7, service_type="shift_only", service_category="parcel", items=[{"key": "parcel_small", "qty": 2}])),
    ("DEMO0004", 1, "paid", None, dict(pickup_address="Indiranagar 100ft Rd, Bengaluru 560038", drop_address="Hebbal, Bengaluru 560024",
      pickup_state="Karnataka", drop_state="Karnataka", distance_km=12, service_type="shift_only", items=[{"key": "couch", "qty": 1}, {"key": "fridge_single", "qty": 1}])),
    ("DEMO0005", 0, "pending_payment", None, dict(pickup_address="BTM Layout, Bengaluru 560076", drop_address="Electronic City, Bengaluru 560100",
      pickup_state="Karnataka", drop_state="Karnataka", distance_km=11, service_type="shift_only", items=[{"key": "carton_box", "qty": 6}, {"key": "tv", "qty": 1}])),
    ("DEMO0006", 1, "cancelled", None, dict(pickup_address="Banjara Hills, Hyderabad 500034", drop_address="Gachibowli, Hyderabad 500032",
      pickup_state="Telangana", drop_state="Telangana", distance_km=14, service_type="shift_only", items=[{"key": "mattress", "qty": 1}])),
]
FLOW = ["pending_payment", "paid", "assigned", "picked_up", "in_transit", "delivered"]


def seed():
    for c in CUSTOMERS:
        db.users.update_one({"email": c["email"]}, {"$setOnInsert": {
            **c, "password_hash": PWD_HASH, "providers": ["password"], "role": "customer", "created_at": NOW.isoformat()}}, upsert=True)
    for p in PARTNERS:
        db.users.update_one({"email": p["email"]}, {"$setOnInsert": {
            "user_id": p["user_id"], "email": p["email"], "name": p["profile"]["full_name"], "phone": p["profile"]["phone"],
            "password_hash": PWD_HASH, "providers": ["password"], "role": "partner", "partner_status": p["status"],
            "partner_profile": {**p["profile"], "submitted_at": NOW.isoformat()}, "created_at": NOW.isoformat()}}, upsert=True)

    for u in EXTRA_USERS:
        db.users.update_one({"email": u["email"]}, {"$setOnInsert": {
            **u, "password_hash": PWD_HASH, "providers": ["password"], "created_at": NOW.isoformat()}}, upsert=True)
    for p in PARTNERS:  # keep bank details current on re-seed
        db.users.update_one({"email": p["email"]}, {"$set": {"partner_profile": {**p["profile"], "submitted_at": NOW.isoformat()}}})

    for i, (oid, ci, status, pi, body) in enumerate(ORDERS):
        if db.orders.find_one({"order_id": oid}):
            continue
        cust, created = CUSTOMERS[ci], NOW - timedelta(days=len(ORDERS) - i, hours=3)
        q = compute_quote(QuoteRequest(**body))
        steps = FLOW[: FLOW.index(status) + 1] if status != "cancelled" else ["pending_payment", "paid", "cancelled"]
        timeline = [{"status": s, "at": (created + timedelta(minutes=30 * k)).isoformat()} for k, s in enumerate(steps)]
        partner = PARTNERS[pi] if pi is not None else None
        paid = status not in ("pending_payment",)
        db.orders.insert_one({
            "order_id": oid, "customer_id": cust["user_id"], "customer_name": cust["name"], "customer_email": cust["email"],
            "customer_phone": cust["phone"], "customer_gstin": None, **{k: v for k, v in body.items() if k not in ("items", "service_type", "distance_km", "service_category")},
            "pickup_floor": body.get("pickup_floor", 0), "drop_floor": body.get("drop_floor", 0), "lift_available": body.get("lift_available", True),
            "move_date": created.strftime("%d-%m-%Y"), "time_slot": "10:00-12:00", "extra_stops": [],
            "service_category": body.get("service_category", "home_shifting"), "pickup_otp": f"{1234 + i:04d}",
            "rating": {"stars": 5, "comment": "Careful with the fridge, on time!", "at": timeline[-1]["at"]} if status == "delivered" else None,
            "quote": q, "status": status,
            "partner_id": partner["user_id"] if partner else None, "partner_name": partner["profile"]["full_name"] if partner else None,
            "partner_phone": partner["profile"]["phone"] if partner else None, "partner_vehicle": partner["profile"]["vehicle_number"] if partner else None,
            "assigned_by": "partner" if partner else None,
            "settlement": ({"status": "settled" if status == "delivered" else "pending",
                            "account_holder": partner["profile"].get("bank_account_holder"),
                            "account_number_masked": f"XXXX{partner['profile']['bank_account_number'][-4:]}" if partner["profile"].get("bank_account_number") else None,
                            "ifsc": partner["profile"].get("bank_ifsc"), "bank_name": partner["profile"].get("bank_name"),
                            "upi_id": partner["profile"].get("upi_id"), "utr": "UTR2026DEMO0001" if status == "delivered" else None,
                            "settled_at": timeline[-1]["at"] if status == "delivered" else None,
                            **({"amount": q["partner_payout"]} if status == "delivered" else {})} if partner else None),
            "invoice_no": f"LE/DEMO/{i + 1:06d}" if paid else None, "invoice_date": timeline[1]["at"] if paid else None,
            "payment": {"provider": "razorpay", "payment_id": f"pay_DEMO{i + 1:04d}", "method": "upi", "paid_at": timeline[1]["at"]} if paid else None,
            "refund_note": "Refund will be processed to the original payment method" if status == "cancelled" else None,
            "timeline": timeline, "created_at": created.isoformat(), "updated_at": timeline[-1]["at"],
            **({"delivered_at": timeline[-1]["at"]} if status == "delivered" else {}),
        })
    db.users.update_one({"user_id": "user_demopart01", "rating_count": {"$exists": False}}, {"$set": {"rating_sum": 5, "rating_count": 1}})
    print(f"users: {db.users.count_documents({'email': {'$regex': '@demo.luggease.in$'}})}, "
          f"orders: {db.orders.count_documents({'order_id': {'$regex': '^DEMO'}})}")


if __name__ == "__main__":
    for u in TEST_USERS_SUMMARY:
        print(f"  {u['role']:<22} {u['email']}")
    seed()
