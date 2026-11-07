# Helper (not a test): creates TEST_ customer + approved TEST_ partner and paid orders for UI testing. Usage: python ui_seed_iter4.py [cleanup]
import json
import sys
import uuid
import requests
from test_luggease_api import API, mdb, h, quote_body

STATE_FILE = "/tmp/ui_iter4.json"
if len(sys.argv) > 1 and sys.argv[1] == "cleanup":
    s = json.load(open(STATE_FILE))
    for oid in s["orders"]:
        mdb.orders.delete_one({"order_id": oid})
    for uid in s["users"]:
        mdb.users.delete_one({"user_id": uid})
    print("cleaned", s)
    sys.exit()

s = {"orders": [], "users": []}


def reg(p):
    email = f"test_{p}_{uuid.uuid4().hex[:6]}@example.com"
    r = requests.post(f"{API}/auth/register", json={"name": f"TEST_{p}", "email": email, "password": "Test@12345"}).json()
    s["users"].append(r["user"]["user_id"])
    return r["token"], r["user"]["user_id"], email


ct, _, s["cust_email"] = reg("uicust")
requests.post(f"{API}/auth/role", json={"role": "customer"}, headers=h(ct))
pt, puid, s["partner_email"] = reg("uipartner")
requests.post(f"{API}/auth/role", json={"role": "partner"}, headers=h(pt))
requests.post(f"{API}/partner/profile", headers=h(pt), json={
    "full_name": "TEST_UIPartner", "phone": "9876543211", "city": "Bengaluru", "vehicle_type": "truck_14ft",
    "vehicle_number": "KA01ZZ9999", "license_number": "DL99999", "id_proof": "9999"})
mdb.users.update_one({"user_id": puid}, {"$set": {"partner_status": "approved"}})
for tip in (100, 0):
    o = requests.post(f"{API}/orders", json=quote_body(tip=tip), headers=h(ct)).json()
    s["orders"].append(o["order_id"])
    mdb.orders.update_one({"order_id": o["order_id"]}, {"$set": {"status": "paid"}})
s["otp"] = mdb.orders.find_one({"order_id": s["orders"][0]})["pickup_otp"]
json.dump(s, open(STATE_FILE, "w"))
print(json.dumps(s))
