# Iteration 5 UI seed: TEST customer + TEST orders (pending, assigned, delivered-unsettled). `python ui_seed_iter5.py cleanup` removes them by id
import json
import sys
import uuid
import requests
from test_luggease_api import API, mdb, h, quote_body

OUT = "/tmp/iter5_seed.json"

if len(sys.argv) > 1 and sys.argv[1] == "cleanup":
    d = json.load(open(OUT))
    for oid in d["orders"]:
        mdb.orders.delete_one({"order_id": oid})
    mdb.users.delete_one({"user_id": d["cust_id"]})
    print("cleaned", d)
    sys.exit(0)

email = f"test_ui5_{uuid.uuid4().hex[:6]}@example.com"
r = requests.post(f"{API}/auth/register", json={"name": "TEST_UI5", "email": email, "password": "Test@12345"}).json()
ct, cid = r["token"], r["user"]["user_id"]
requests.post(f"{API}/auth/role", json={"role": "customer"}, headers=h(ct))
ravi = requests.post(f"{API}/auth/login", json={"email": "ravi@demo.luggease.in", "password": "Demo@12345"}).json()["token"]
orders = {}
for name in ("pending", "assigned", "delivered"):
    o = requests.post(f"{API}/orders", json=quote_body(), headers=h(ct)).json()
    orders[name] = o["order_id"]
    if name != "pending":
        mdb.orders.update_one({"order_id": o["order_id"]}, {"$set": {"status": "paid"}})
        a = requests.post(f"{API}/orders/{o['order_id']}/accept", headers=h(ravi))
        print(name, "accept", a.status_code, a.text[:120] if a.status_code != 200 else "")
mdb.orders.update_one({"order_id": orders["delivered"]}, {"$set": {"status": "delivered"}})
json.dump({"email": email, "cust_id": cid, "orders": list(orders.values()), "map": orders}, open(OUT, "w"))
print(json.dumps({"email": email, "map": orders}))
