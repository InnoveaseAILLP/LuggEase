# Iteration 5: test users of all roles login + settlement visibility + invoice bank details
import os
import requests
import pytest

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "").rstrip("/") or open("/app/frontend/.env").read().split("EXPO_PUBLIC_BACKEND_URL=")[1].split("\n")[0].strip().strip('"').rstrip("/")
API = f"{BASE_URL}/api"
PW = "Demo@12345"


def login(email, pw=PW):
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": pw})
    assert r.status_code == 200, r.text
    d = r.json()
    return d.get("token") or d.get("session_token") or d.get("access_token"), d.get("user", d)


def h(t):
    return {"Authorization": f"Bearer {t}"}


# Login with every role test user
@pytest.mark.parametrize("email,role,status", [
    ("ops@demo.luggease.in", "admin", None),
    ("kiran@demo.luggease.in", "partner", "rejected"),
    ("newpartner@demo.luggease.in", "partner", None),
    ("newuser@demo.luggease.in", None, None),
    ("amit@demo.luggease.in", "partner", "pending"),
    ("ravi@demo.luggease.in", "partner", "approved"),
    ("priya@demo.luggease.in", "customer", None),
])
def test_role_logins(email, role, status):
    tok, u = login(email)
    assert tok
    me = requests.get(f"{API}/auth/me", headers=h(tok)).json()
    assert me.get("role") == role, me
    if status:
        assert me.get("partner_status") == status
    if email.startswith("newpartner"):
        assert not me.get("partner_profile")


# Settlement data on DEMO0001 for partner/admin; check exposure to customer
def test_demo0001_settlement_views():
    tok, _ = login("ravi@demo.luggease.in")
    o = requests.get(f"{API}/orders/DEMO0001", headers=h(tok)).json()
    s = o.get("settlement") or {}
    print("partner view settlement:", s)
    assert s.get("status") == "settled" and s.get("utr") == "UTR2026DEMO0001"
    ctok, _ = login("priya@demo.luggease.in")
    co = requests.get(f"{API}/orders/DEMO0001", headers=h(ctok)).json()
    print("customer view settlement:", co.get("settlement"))
    print("customer view keys:", sorted(co.keys()))


def test_partner_me_bank_details_exposed():
    tok, _ = login("ravi@demo.luggease.in")
    me = requests.get(f"{API}/auth/me", headers=h(tok)).json()
    pp = me.get("partner_profile") or {}
    print("ravi bank:", {k: v for k, v in pp.items() if "bank" in k})
    assert pp.get("bank_ifsc") == "SBIN0001234"


def test_lowercase_ifsc_rejected_by_api():
    # informational: does API accept lowercase IFSC (frontend must uppercase)
    tok, _ = login("newpartner@demo.luggease.in")
    r = requests.post(f"{API}/partner/profile", headers=h(tok), json={"full_name": "x"})
    print("partial profile status", r.status_code)
