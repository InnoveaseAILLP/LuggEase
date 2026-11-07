import asyncio
import hashlib
import hmac
import secrets
import json
import logging
import math
import os
import uuid
from contextlib import suppress
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import List, Literal, Optional

import bcrypt
import httpx
import jwt
import razorpay
from dotenv import load_dotenv
from fastapi import APIRouter, Depends, FastAPI, HTTPException, Request
from fastapi.responses import HTMLResponse
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, EmailStr, Field
from pymongo import ASCENDING, DESCENDING, IndexModel
from starlette.middleware.cors import CORSMiddleware

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

client = AsyncIOMotorClient(os.environ["MONGO_URL"])
db = client[os.environ["DB_NAME"]]

JWT_SECRET = os.environ["JWT_SECRET"]
ADMIN_EMAIL = os.environ["ADMIN_EMAIL"].strip().lower()
ADMIN_PASSWORD = os.environ["ADMIN_PASSWORD"]
SUPPLIER = {
    "name": os.environ["SUPPLIER_NAME"],
    "gstin": os.environ["SUPPLIER_GSTIN"],
    "state": os.environ["SUPPLIER_STATE"],
    "address": os.environ["SUPPLIER_ADDRESS"],
    "pan": os.environ["SUPPLIER_PAN"],
    "bank": {
        "account_name": os.environ["SUPPLIER_NAME"], "bank_name": os.environ["SUPPLIER_BANK_NAME"],
        "account_number": os.environ["SUPPLIER_BANK_ACCOUNT"], "ifsc": os.environ["SUPPLIER_BANK_IFSC"],
        "branch": os.environ["SUPPLIER_BANK_BRANCH"],
    },
}
APP_ENV = os.environ["APP_ENV"]
APP_VERSION = os.environ["APP_VERSION"]
COMMISSION_RATE = 0.05

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)

INDEXES: dict[str, list[IndexModel]] = {
    "users": [
        IndexModel([("email", ASCENDING)], name="email", unique=True),
        IndexModel([("user_id", ASCENDING)], name="user_id", unique=True),
        IndexModel([("role", ASCENDING), ("partner_status", ASCENDING)], name="role_status"),
    ],
    "user_sessions": [
        IndexModel([("session_token", ASCENDING)], name="session_token", unique=True),
        IndexModel([("user_id", ASCENDING)], name="user_id"),
        IndexModel([("expires_at", ASCENDING)], name="expires_ttl", expireAfterSeconds=0),
    ],
    "orders": [
        IndexModel([("order_id", ASCENDING)], name="order_id", unique=True),
        IndexModel([("customer_id", ASCENDING), ("created_at", DESCENDING)], name="customer_created"),
        IndexModel([("partner_id", ASCENDING), ("created_at", DESCENDING)], name="partner_created"),
        IndexModel([("status", ASCENDING), ("created_at", DESCENDING)], name="status_created"),
        IndexModel([("razorpay_order_id", ASCENDING)], name="rzp_order"),
    ],
    "counters": [IndexModel([("key", ASCENDING)], name="key", unique=True)],
}


# MongoDB schema validation: rejects malformed writes at the database level.
VALIDATORS: dict[str, dict] = {
    "users": {"$jsonSchema": {
        "bsonType": "object",
        "required": ["user_id", "email", "created_at"],
        "properties": {
            "user_id": {"bsonType": "string", "pattern": "^user_"},
            "email": {"bsonType": "string"},
            "role": {"enum": [None, "customer", "partner", "admin"]},
            "partner_status": {"enum": [None, "incomplete", "pending", "approved", "rejected"]},
            "providers": {"bsonType": "array"},
        },
    }},
    "orders": {"$jsonSchema": {
        "bsonType": "object",
        "required": ["order_id", "customer_id", "status", "quote", "pickup_address", "drop_address", "created_at"],
        "properties": {
            "order_id": {"bsonType": "string"},
            "customer_id": {"bsonType": "string"},
            "status": {"enum": ["pending_payment", "paid", "assigned", "picked_up", "in_transit", "delivered", "cancelled"]},
            "quote": {"bsonType": "object", "required": ["taxable_value", "grand_total", "gst", "platform_commission", "partner_payout"]},
            "partner_id": {"bsonType": ["string", "null"]},
        },
    }},
}


async def ensure_validators() -> None:
    existing = set(await db.list_collection_names())
    for name, validator in VALIDATORS.items():
        try:
            if name in existing:
                await db.command({"collMod": name, "validator": validator, "validationLevel": "moderate"})
            else:
                await db.create_collection(name, validator=validator, validationLevel="moderate")
        except Exception as exc:
            logger.error("ensure_validators(%s): %s", name, exc)


async def ensure_indexes() -> None:
    for collection, models in INDEXES.items():
        for model in models:
            try:
                await db[collection].create_indexes([model])
            except Exception as exc:
                logger.error("ensure_indexes(%s.%s): %s", collection, model.document["name"], exc)


app = FastAPI()


@app.get("/health", include_in_schema=False)
@app.head("/health", include_in_schema=False)
async def health():
    return {"status": "ok"}


api = APIRouter(prefix="/api")


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def iso(dt: datetime) -> str:
    return dt.isoformat()


# ----------------------------------------------------------------------------
# Catalog & pricing
# ----------------------------------------------------------------------------
ITEMS = [
    {"key": "parcel_small", "name": "Small Parcel / Documents", "weight": 5, "size": "light", "pack_hours": 0.1, "material": 20, "icon": "package-variant-closed"},
    {"key": "carton_box", "name": "Carton Box (Medium)", "weight": 20, "size": "light", "pack_hours": 0.25, "material": 60, "icon": "package-variant"},
    {"key": "clothes", "name": "Clothes (per bag)", "weight": 10, "size": "light", "pack_hours": 0.25, "material": 60, "icon": "tshirt-crew"},
    {"key": "kitchen_utensils", "name": "Kitchen Utensils (per box)", "weight": 15, "size": "heavy", "pack_hours": 0.5, "material": 120, "icon": "pot-steam"},
    {"key": "fridge_single", "min_vehicle": "three_wheeler", "name": "Fridge (Single Door)", "weight": 45, "size": "heavy", "pack_hours": 0.5, "material": 250, "icon": "fridge-outline"},
    {"key": "fridge_double", "min_vehicle": "mini_truck", "name": "Fridge (Double Door)", "weight": 80, "size": "heavy", "pack_hours": 0.75, "material": 400, "icon": "fridge"},
    {"key": "sofa", "min_vehicle": "mini_truck", "name": "Sofa (3 Seater)", "weight": 70, "size": "heavy", "pack_hours": 0.75, "material": 350, "icon": "sofa"},
    {"key": "couch", "min_vehicle": "three_wheeler", "name": "Couch (2 Seater)", "weight": 45, "size": "heavy", "pack_hours": 0.5, "material": 250, "icon": "sofa-single"},
    {"key": "dining_table", "min_vehicle": "mini_truck", "name": "Dining Table (4-6 Seater)", "weight": 50, "size": "heavy", "pack_hours": 1.0, "material": 400, "icon": "table-furniture"},
    {"key": "tv", "name": "TV Set", "weight": 15, "size": "heavy", "pack_hours": 0.5, "material": 300, "icon": "television"},
    {"key": "washing_machine", "min_vehicle": "mini_truck", "name": "Washing Machine", "weight": 65, "size": "heavy", "pack_hours": 0.5, "material": 300, "icon": "washing-machine"},
    {"key": "cot", "min_vehicle": "mini_truck", "name": "Cot", "weight": 40, "size": "heavy", "pack_hours": 1.0, "material": 250, "icon": "bed-single-outline"},
    {"key": "bed", "min_vehicle": "mini_truck", "name": "Bed (Double / King)", "weight": 90, "size": "heavy", "pack_hours": 1.5, "material": 450, "icon": "bed-king-outline"},
    {"key": "mattress", "name": "Mattress", "weight": 20, "size": "heavy", "pack_hours": 0.25, "material": 150, "icon": "bed-outline"},
]
ITEM_MAP = {i["key"]: i for i in ITEMS}

VEHICLES = [
    {"key": "two_wheeler", "name": "2-Wheeler", "max_kg": 20, "base": 50, "per_km": 10, "icon": "moped"},
    {"key": "three_wheeler", "name": "3-Wheeler", "max_kg": 500, "base": 200, "per_km": 18, "icon": "rickshaw"},
    {"key": "mini_truck", "name": "Mini Truck (Tata Ace)", "max_kg": 750, "base": 350, "per_km": 25, "icon": "truck-outline"},
    {"key": "pickup_8ft", "name": "Pickup 8ft", "max_kg": 1250, "base": 550, "per_km": 32, "icon": "truck"},
    {"key": "truck_14ft", "name": "Truck 14ft", "max_kg": 3500, "base": 1400, "per_km": 48, "icon": "truck-cargo-container"},
]
VEHICLE_KEYS = [v["key"] for v in VEHICLES]
FREE_KM = 2
HANDLING_PER_KG = 2.0
FLOOR_PER_KG = 0.5
LABOUR_RATE = {"shift_only": 200, "pack_and_shift": 350}  # per helper per hour (INR)
STOP_CHARGE = 100          # per extra pickup/drop stop (Porter multi-stop)
JUNK_FEE = {"heavy": 150, "light": 30}  # eco-disposal / donation drop per item (Lugg junk removal)
INTERCITY_KM = 100
TOLL_PER_KM = 2.0          # toll & state-permit estimate beyond 100 km
TIP_MAX = 2000
GST_RULES = {
    "shift_only": {"rate": 5, "sac": "996511", "desc": "Road transport services of goods (GTA)"},
    "pack_and_shift": {"rate": 18, "sac": "996729", "desc": "Packing & moving services (composite supply)"},
}
SERVICE_CATEGORIES = [
    {"key": "home_shifting", "name": "Home shifting", "desc": "Full house or room moves with helpers", "icon": "home-export-outline"},
    {"key": "furniture", "name": "Furniture & appliances", "desc": "Sofa, bed, fridge, washing machine", "icon": "sofa"},
    {"key": "store_pickup", "name": "Store pickup", "desc": "Bring home what you bought from any store", "icon": "storefront-outline"},
    {"key": "parcel", "name": "Send a parcel", "desc": "2-Wheeler for documents & small boxes", "icon": "package-variant-closed"},
    {"key": "junk_removal", "name": "Junk removal", "desc": "Haul away or donate old items", "icon": "delete-sweep-outline"},
    {"key": "intercity", "name": "Intercity move", "desc": "City to city with toll & permit included", "icon": "highway"},
]
CATEGORY_KEYS = [c["key"] for c in SERVICE_CATEGORIES]
COUPONS = {
    "FIRST50": {"type": "flat", "value": 50, "min": 300, "desc": "₹50 off on bookings above ₹300"},
    "LUGG10": {"type": "percent", "value": 10, "max": 200, "min": 500, "desc": "10% off up to ₹200 on bookings above ₹500"},
    "MOVE200": {"type": "flat", "value": 200, "min": 3000, "category": "home_shifting", "desc": "₹200 off home shifting above ₹3,000"},
}
CANCELLATION_FEE = 100  # once a partner is assigned
TIME_SLOTS = ["Now", "08:00-10:00", "10:00-12:00", "12:00-14:00", "14:00-16:00", "16:00-18:00", "18:00-20:00"]

INDIAN_STATES = [
    "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar", "Chhattisgarh", "Delhi", "Goa", "Gujarat",
    "Haryana", "Himachal Pradesh", "Jammu and Kashmir", "Jharkhand", "Karnataka", "Kerala", "Madhya Pradesh",
    "Maharashtra", "Manipur", "Meghalaya", "Mizoram", "Nagaland", "Odisha", "Puducherry", "Punjab", "Rajasthan",
    "Sikkim", "Tamil Nadu", "Telangana", "Tripura", "Uttar Pradesh", "Uttarakhand", "West Bengal",
]


class ItemQty(BaseModel):
    key: str
    qty: int = Field(ge=1, le=100)


class QuoteRequest(BaseModel):
    pickup_address: str = Field(min_length=3)
    drop_address: str = Field(min_length=3)
    pickup_state: str
    drop_state: str
    distance_km: float = Field(gt=0, le=3000)
    items: List[ItemQty] = Field(min_length=1)
    service_type: Literal["shift_only", "pack_and_shift"]
    service_category: str = "home_shifting"
    vehicle_key: Optional[str] = None
    helpers: Optional[int] = Field(default=None, ge=0, le=6)
    hours: Optional[float] = Field(default=None, ge=0, le=72)
    extra_stops: List[str] = Field(default_factory=list, max_length=3)
    pickup_floor: int = Field(default=0, ge=0, le=50)
    drop_floor: int = Field(default=0, ge=0, le=50)
    lift_available: bool = True
    coupon_code: Optional[str] = None
    tip: float = Field(default=0, ge=0, le=TIP_MAX)
    customer_gstin: Optional[str] = None
    move_date: Optional[str] = None
    time_slot: Optional[str] = None


def r2(x: float) -> float:
    return round(x + 1e-9, 2)


def recommended_helpers(total_kg: float, service_type: str) -> int:
    if total_kg <= 20:
        return 1 if service_type == "pack_and_shift" else 0
    if total_kg <= 100:
        return 1
    if total_kg <= 500:
        return 2
    return 3


def apply_coupon(code: Optional[str], subtotal: float, category: str):
    """Returns (discount, applied_code, message)."""
    if not code:
        return 0.0, None, None
    c = COUPONS.get(code.strip().upper())
    if not c:
        return 0.0, None, "Invalid coupon code"
    if c.get("category") and c["category"] != category:
        return 0.0, None, "Coupon not valid for this service"
    if subtotal < c["min"]:
        return 0.0, None, f"Add ₹{c['min'] - subtotal:,.0f} more to use this coupon"
    disc = c["value"] if c["type"] == "flat" else min(subtotal * c["value"] / 100, c["max"])
    return r2(disc), code.strip().upper(), c["desc"]


def compute_quote(q: QuoteRequest, with_options: bool = True) -> dict:
    if q.pickup_state not in INDIAN_STATES or q.drop_state not in INDIAN_STATES:
        raise HTTPException(400, "Invalid state")
    if q.service_category not in CATEGORY_KEYS:
        raise HTTPException(400, "Invalid service category")
    lines, total_kg, heavy_kg, est_pack_hours, material, junk_fee = [], 0.0, 0.0, 0.0, 0.0, 0.0
    for it in q.items:
        item = ITEM_MAP.get(it.key)
        if not item:
            raise HTTPException(400, f"Unknown item {it.key}")
        kg = item["weight"] * it.qty
        total_kg += kg
        if item["size"] == "heavy":
            heavy_kg += kg
        est_pack_hours += item["pack_hours"] * it.qty
        material += item["material"] * it.qty
        junk_fee += JUNK_FEE[item["size"]] * it.qty
        lines.append({"key": it.key, "name": item["name"], "qty": it.qty, "unit_kg": item["weight"], "total_kg": kg, "icon": item["icon"]})

    min_idx = max([VEHICLE_KEYS.index(ITEM_MAP[i.key].get("min_vehicle", "two_wheeler")) for i in q.items] + [0])
    if heavy_kg > 0:
        min_idx = max(min_idx, 1)
    eligible = [v for i, v in enumerate(VEHICLES) if i >= min_idx and v["max_kg"] >= total_kg]
    if not eligible:
        raise HTTPException(400, "Load exceeds 3500 kg. Please split into multiple bookings.")
    if q.vehicle_key:
        vehicle = next((v for v in eligible if v["key"] == q.vehicle_key), None)
        if not vehicle:
            raise HTTPException(400, "Selected vehicle is too small for this load")
    else:
        vehicle = eligible[0]

    # Helpers (Lugg Pros / Porter labour). Pack & Shift always needs at least one packer.
    rec_helpers = recommended_helpers(total_kg, q.service_type)
    min_helpers = 1 if q.service_type == "pack_and_shift" else 0
    helpers = rec_helpers if q.helpers is None else max(q.helpers, min_helpers)

    shift_hours = max(1.0, math.ceil(total_kg / 150 * 2) / 2) if total_kg > 20 else 0.0
    pack_hours = math.ceil(est_pack_hours * 2) / 2 if q.service_type == "pack_and_shift" else 0.0
    recommended_hours = shift_hours + pack_hours
    billable_labour = helpers > 0
    min_hours = (1.0 if total_kg > 20 else 0.5) if billable_labour else 0.0
    hours = recommended_hours if q.hours is None else q.hours
    hours = max(hours, min_hours) if billable_labour else 0.0

    km_beyond_free = max(q.distance_km - FREE_KM, 0)
    base = vehicle["base"]
    distance_charge = vehicle["per_km"] * km_beyond_free
    handling = HANDLING_PER_KG * heavy_kg if billable_labour else 0.0
    labour = LABOUR_RATE[q.service_type] * hours * helpers
    packing_material = material if q.service_type == "pack_and_shift" else 0.0
    floors = 0 if q.lift_available else (q.pickup_floor + q.drop_floor)
    floor_charge = FLOOR_PER_KG * heavy_kg * floors if billable_labour else 0.0
    stops = [s.strip() for s in q.extra_stops if s.strip()]
    stop_charge = STOP_CHARGE * len(stops)
    toll = TOLL_PER_KM * max(q.distance_km - INTERCITY_KM, 0)
    junk = junk_fee if q.service_category == "junk_removal" else 0.0

    charges = [
        {"label": f"Base fare ({vehicle['name']}, first {FREE_KM} km)", "amount": r2(base)},
        {"label": f"Distance charge ({r2(km_beyond_free)} km × ₹{vehicle['per_km']}/km)", "amount": r2(distance_charge)},
        {"label": f"Extra stops ({len(stops)} × ₹{STOP_CHARGE})", "amount": r2(stop_charge)},
        {"label": f"Toll & state permit estimate ({r2(max(q.distance_km - INTERCITY_KM, 0))} km × ₹{TOLL_PER_KM:g})", "amount": r2(toll)},
        {"label": f"Loading/unloading by weight ({r2(heavy_kg)} kg × ₹{HANDLING_PER_KG:g})", "amount": r2(handling)},
        {"label": f"Labour ({helpers} helper{'s' if helpers != 1 else ''} × {hours:g} hr × ₹{LABOUR_RATE[q.service_type]})", "amount": r2(labour)},
        {"label": "Packing material", "amount": r2(packing_material)},
        {"label": f"Floor charge ({floors} floor(s) without lift)", "amount": r2(floor_charge)},
        {"label": "Eco-disposal / donation drop fee", "amount": r2(junk)},
    ]
    charges = [c for c in charges if c["amount"] > 0 or c["label"].startswith("Base")]
    subtotal = r2(sum(c["amount"] for c in charges))
    discount, coupon, coupon_msg = apply_coupon(q.coupon_code, subtotal, q.service_category)
    if discount:
        charges.append({"label": f"Coupon discount ({coupon})", "amount": -discount})
    taxable = r2(subtotal - discount)

    rule = GST_RULES[q.service_type]
    place_of_supply = q.pickup_state
    intra = place_of_supply == SUPPLIER["state"]
    gst_total = r2(taxable * rule["rate"] / 100)
    if intra:
        cgst = r2(gst_total / 2)
        sgst = r2(gst_total - cgst)
        igst = 0.0
    else:
        cgst = sgst = 0.0
        igst = gst_total
    gross = taxable + gst_total
    invoice_total = float(math.floor(gross + 0.5))  # round half up, as on Indian tax invoices
    round_off = r2(invoice_total - gross)
    tip = r2(q.tip)
    grand_total = r2(invoice_total + tip)
    commission = r2(taxable * COMMISSION_RATE)
    payout = r2(taxable - commission + tip)

    options = []
    if with_options:
        for v in eligible:
            alt = compute_quote(q.model_copy(update={"vehicle_key": v["key"], "coupon_code": None, "tip": 0}), with_options=False)
            options.append({**v, "estimate": alt["grand_total"]})

    return {
        "items": lines,
        "total_weight_kg": r2(total_kg),
        "vehicle": vehicle,
        "vehicle_options": options,
        "service_type": q.service_type,
        "service_category": q.service_category,
        "helpers": helpers,
        "recommended_helpers": rec_helpers,
        "min_helpers": min_helpers,
        "recommended_hours": recommended_hours,
        "labour_billable": billable_labour,
        "min_hours": min_hours,
        "hours": hours,
        "distance_km": r2(q.distance_km),
        "extra_stops": stops,
        "charges": charges,
        "subtotal": subtotal,
        "discount": discount,
        "coupon_code": coupon,
        "coupon_message": coupon_msg,
        "taxable_value": taxable,
        "gst": {
            "sac": rule["sac"], "description": rule["desc"], "rate": rule["rate"],
            "supply_type": "Intra-State" if intra else "Inter-State",
            "cgst_rate": rule["rate"] / 2 if intra else 0, "sgst_rate": rule["rate"] / 2 if intra else 0,
            "igst_rate": 0 if intra else rule["rate"],
            "cgst": cgst, "sgst": sgst, "igst": igst, "total": gst_total,
        },
        "place_of_supply": place_of_supply,
        "round_off": round_off,
        "invoice_total": invoice_total,
        "tip": tip,
        "grand_total": grand_total,
        "amount_in_words": amount_in_words(int(invoice_total)),
        "commission_rate": COMMISSION_RATE * 100,
        "platform_commission": commission,
        "partner_payout": payout,
    }


ONES = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve",
        "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"]
TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"]


def _two(n: int) -> str:
    return ONES[n] if n < 20 else (TENS[n // 10] + (" " + ONES[n % 10] if n % 10 else ""))


def _three(n: int) -> str:
    h, rest = divmod(n, 100)
    parts = []
    if h:
        parts.append(ONES[h] + " Hundred")
    if rest:
        parts.append(_two(rest))
    return " ".join(parts)


def amount_in_words(n: int) -> str:
    if n == 0:
        return "Rupees Zero Only"
    parts = []
    crore, n = divmod(n, 10_000_000)
    lakh, n = divmod(n, 100_000)
    thousand, n = divmod(n, 1000)
    if crore:
        parts.append(_three(crore) + " Crore")
    if lakh:
        parts.append(_two(lakh) + " Lakh")
    if thousand:
        parts.append(_two(thousand) + " Thousand")
    if n:
        parts.append(_three(n))
    return "Rupees " + " ".join(parts) + " Only"


# ----------------------------------------------------------------------------
# Auth (email/password JWT + Emergent Google sessions share one users collection)
# ----------------------------------------------------------------------------
def public_user(u: dict) -> dict:
    return {
        "user_id": u["user_id"], "email": u["email"], "name": u.get("name") or "",
        "picture": u.get("picture"), "role": u.get("role"), "phone": u.get("phone"),
        "partner_status": u.get("partner_status"), "partner_profile": u.get("partner_profile"),
        "rating": r2(u["rating_sum"] / u["rating_count"]) if u.get("rating_count") else None,
        "rating_count": u.get("rating_count", 0),
    }


def issue_jwt(user_id: str) -> str:
    n = now_utc()
    return jwt.encode({"sub": user_id, "iat": n, "exp": n + timedelta(days=7)}, JWT_SECRET, algorithm="HS256")


async def current_user(request: Request) -> dict:
    auth = request.headers.get("Authorization", "")
    if not auth.lower().startswith("bearer "):
        raise HTTPException(401, "Not authenticated")
    token = auth[7:].strip()
    user_id = None
    try:
        user_id = jwt.decode(token, JWT_SECRET, algorithms=["HS256"]).get("sub")
    except jwt.InvalidTokenError:
        sess = await db.user_sessions.find_one({"session_token": token}, {"_id": 0})
        if sess:
            exp = sess["expires_at"]
            if exp.tzinfo is None:
                exp = exp.replace(tzinfo=timezone.utc)
            if exp > now_utc():
                user_id = sess["user_id"]
    if not user_id:
        raise HTTPException(401, "Invalid or expired session")
    user = await db.users.find_one({"user_id": user_id}, {"_id": 0})
    if not user:
        raise HTTPException(401, "User not found")
    return user


def require_role(*roles: str):
    async def dep(user=Depends(current_user)):
        if user.get("role") not in roles:
            raise HTTPException(403, "Not allowed")
        return user
    return dep


class RegisterBody(BaseModel):
    name: str = Field(min_length=2, max_length=80)
    email: EmailStr
    password: str = Field(min_length=8, max_length=72)


class LoginBody(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=72)


@api.post("/auth/register")
async def register(body: RegisterBody):
    email = body.email.strip().lower()
    if await db.users.find_one({"email": email}):
        raise HTTPException(409, "An account already exists for this email")
    user = {
        "user_id": f"user_{uuid.uuid4().hex[:12]}", "email": email, "name": body.name.strip(),
        "password_hash": bcrypt.hashpw(body.password.encode(), bcrypt.gensalt(12)).decode(),
        "providers": ["password"], "role": None, "created_at": iso(now_utc()),
    }
    await db.users.insert_one(user)
    return {"token": issue_jwt(user["user_id"]), "user": public_user(user)}


@api.post("/auth/login")
async def login(body: LoginBody):
    user = await db.users.find_one({"email": body.email.strip().lower()}, {"_id": 0})
    ok = bool(user and user.get("password_hash") and bcrypt.checkpw(body.password.encode(), user["password_hash"].encode()))
    if not ok:
        raise HTTPException(401, "Invalid email or password")
    return {"token": issue_jwt(user["user_id"]), "user": public_user(user)}


class SessionBody(BaseModel):
    session_id: str


@api.post("/auth/session")
async def google_session(body: SessionBody):
    async with httpx.AsyncClient(timeout=15) as hc:
        r = await hc.get("https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data",
                         headers={"X-Session-ID": body.session_id})
    if r.status_code != 200:
        raise HTTPException(401, "Invalid session")
    data = r.json()
    email = data["email"].strip().lower()
    existing = await db.users.find_one({"email": email}, {"_id": 0})
    if existing:
        user_id = existing["user_id"]
        await db.users.update_one({"user_id": user_id}, {"$addToSet": {"providers": "google"},
                                                          "$set": {"picture": data.get("picture")}})
    else:
        user_id = f"user_{uuid.uuid4().hex[:12]}"
        await db.users.insert_one({"user_id": user_id, "email": email, "name": data.get("name") or "",
                                   "picture": data.get("picture"), "providers": ["google"], "role": None,
                                   "created_at": iso(now_utc())})
    token = data["session_token"]
    await db.user_sessions.update_one(
        {"session_token": token},
        {"$set": {"session_token": token, "user_id": user_id, "expires_at": now_utc() + timedelta(days=7),
                  "created_at": now_utc()}}, upsert=True)
    user = await db.users.find_one({"user_id": user_id}, {"_id": 0})
    return {"session_token": token, "user": public_user(user)}


@api.get("/auth/me")
async def me(user=Depends(current_user)):
    return public_user(user)


@api.post("/auth/logout")
async def logout(request: Request):
    token = request.headers.get("Authorization", "")[7:].strip()
    if token:
        await db.user_sessions.delete_one({"session_token": token})
    return {"ok": True}


class RoleBody(BaseModel):
    role: Literal["customer", "partner"]
    phone: Optional[str] = None


@api.post("/auth/role")
async def set_role(body: RoleBody, user=Depends(current_user)):
    if user.get("role") == "admin":
        raise HTTPException(400, "Admin role cannot be changed")
    if user.get("role") and user["role"] != body.role:
        raise HTTPException(400, "Role already chosen for this account. Use a different account for the other role.")
    update = {"role": body.role}
    if body.phone:
        update["phone"] = body.phone
    if body.role == "partner" and not user.get("partner_status"):
        update["partner_status"] = "incomplete"
    await db.users.update_one({"user_id": user["user_id"]}, {"$set": update})
    return public_user(await db.users.find_one({"user_id": user["user_id"]}, {"_id": 0}))


# ----------------------------------------------------------------------------
# Catalog / geo / quote
# ----------------------------------------------------------------------------
@api.get("/catalog")
async def catalog():
    return {"items": ITEMS, "vehicles": VEHICLES, "states": INDIAN_STATES, "supplier": SUPPLIER,
            "gst_rules": GST_RULES, "commission_rate": COMMISSION_RATE * 100, "categories": SERVICE_CATEGORIES,
            "coupons": [{"code": k, "desc": v["desc"]} for k, v in COUPONS.items()], "time_slots": TIME_SLOTS,
            "cancellation_fee": CANCELLATION_FEE, "stop_charge": STOP_CHARGE}


class DistanceBody(BaseModel):
    pickup: str
    drop: str


async def geocode(hc: httpx.AsyncClient, q: str):
    r = await hc.get("https://nominatim.openstreetmap.org/search",
                     params={"q": q, "format": "json", "limit": 1, "countrycodes": "in"},
                     headers={"User-Agent": "LuggEase/1.0 (support@luggease.in)"})
    js = r.json() if r.status_code == 200 else []
    return (float(js[0]["lat"]), float(js[0]["lon"])) if js else None


@api.post("/geo/distance")
async def distance(body: DistanceBody, user=Depends(current_user)):
    try:
        async with httpx.AsyncClient(timeout=12) as hc:
            a = await geocode(hc, body.pickup)
            await asyncio.sleep(1)
            b = await geocode(hc, body.drop)
    except Exception:
        a = b = None
    if not a or not b:
        raise HTTPException(422, "Could not locate one of the addresses. Please enter distance manually.")
    lat1, lon1, lat2, lon2 = map(math.radians, [a[0], a[1], b[0], b[1]])
    h = math.sin((lat2 - lat1) / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin((lon2 - lon1) / 2) ** 2
    km = 6371 * 2 * math.asin(math.sqrt(h)) * 1.3  # road-distance factor
    return {"distance_km": round(max(km, 1), 1)}


@api.post("/quote")
async def quote(body: QuoteRequest, user=Depends(current_user)):
    return compute_quote(body)


# ----------------------------------------------------------------------------
# Orders
# ----------------------------------------------------------------------------
STATUS_FLOW = ["pending_payment", "paid", "assigned", "picked_up", "in_transit", "delivered"]


async def next_invoice_no() -> str:
    n = now_utc()
    fy_start = n.year if n.month >= 4 else n.year - 1
    fy = f"{fy_start}-{str(fy_start + 1)[-2:]}"
    c = await db.counters.find_one_and_update({"key": f"inv_{fy}"}, {"$inc": {"seq": 1}}, upsert=True,
                                              return_document=True)
    return f"LE/{fy}/{c['seq']:06d}"


def order_out(o: dict) -> dict:
    o.pop("_id", None)
    return o


@api.post("/orders")
async def create_order(body: QuoteRequest, user=Depends(require_role("customer"))):
    q = compute_quote(body)
    n = now_utc()
    order = {
        "order_id": f"LE{n.strftime('%y%m%d')}{uuid.uuid4().hex[:6].upper()}",
        "customer_id": user["user_id"], "customer_name": user.get("name"), "customer_email": user["email"],
        "customer_phone": user.get("phone"), "customer_gstin": (body.customer_gstin or "").strip().upper() or None,
        "pickup_address": body.pickup_address, "drop_address": body.drop_address,
        "pickup_state": body.pickup_state, "drop_state": body.drop_state,
        "pickup_floor": body.pickup_floor, "drop_floor": body.drop_floor, "lift_available": body.lift_available,
        "move_date": body.move_date, "time_slot": body.time_slot, "extra_stops": q["extra_stops"],
        "service_category": body.service_category, "pickup_otp": f"{secrets.randbelow(10000):04d}",
        "rating": None, "quote": q, "status": "pending_payment", "partner_id": None,
        "partner_name": None, "invoice_no": None, "payment": None,
        "timeline": [{"status": "pending_payment", "at": iso(n)}],
        "created_at": iso(n), "updated_at": iso(n),
    }
    await db.orders.insert_one(order)
    return order_out(order)


@api.get("/orders")
async def list_orders(user=Depends(current_user)):
    role = user.get("role")
    if role == "customer":
        f = {"customer_id": user["user_id"]}
    elif role == "partner":
        f = {"partner_id": user["user_id"]}
    elif role == "admin":
        f = {}
    else:
        raise HTTPException(403, "Choose a role first")
    rows = await db.orders.find(f, {"_id": 0}).sort("created_at", -1).limit(200).to_list(200)
    return [partner_view(r) for r in rows] if role == "partner" else rows


def hide_contact(o: dict) -> dict:
    """Partners see customer contact details only after they accept the job."""
    return {**o, "customer_email": None, "customer_phone": None, "pickup_otp": None}


def partner_view(o: dict) -> dict:
    """The pickup OTP is shared by the customer in person; partners never receive it from the API."""
    return {**o, "pickup_otp": None}


async def get_order_for(order_id: str, user: dict) -> dict:
    o = await db.orders.find_one({"order_id": order_id}, {"_id": 0})
    if not o:
        raise HTTPException(404, "Order not found")
    role = user.get("role")
    if role == "admin" or o["customer_id"] == user["user_id"]:
        return o
    if o.get("partner_id") == user["user_id"]:
        return partner_view(o)
    if role == "partner" and user.get("partner_status") == "approved" and o["status"] == "paid" and not o.get("partner_id"):
        return hide_contact(o)
    raise HTTPException(404, "Order not found")


@api.get("/orders/{order_id}")
async def get_order(order_id: str, user=Depends(current_user)):
    return await get_order_for(order_id, user)


@api.post("/orders/{order_id}/cancel")
async def cancel_order(order_id: str, user=Depends(require_role("customer", "admin"))):
    o = await get_order_for(order_id, user)
    if o["status"] not in ("pending_payment", "paid", "assigned"):
        raise HTTPException(400, "Order can no longer be cancelled")
    fee = CANCELLATION_FEE if o["status"] == "assigned" else 0
    refund = r2(o["quote"]["grand_total"] - fee) if o["status"] != "pending_payment" else 0
    refund_note = None
    if o["status"] != "pending_payment":
        refund_note = f"Refund of ₹{refund:,.2f} will be processed to the original payment method" + (
            f" (₹{fee} cancellation fee as a partner was already assigned)" if fee else "")
    await db.orders.update_one({"order_id": order_id}, {
        "$set": {"status": "cancelled", "refund_note": refund_note, "cancellation_fee": fee, "refund_amount": refund,
                 "updated_at": iso(now_utc())},
        "$push": {"timeline": {"status": "cancelled", "at": iso(now_utc())}}})
    return await db.orders.find_one({"order_id": order_id}, {"_id": 0})


def vehicle_ok(partner_vehicle: str, order_vehicle: str) -> bool:
    return VEHICLE_KEYS.index(partner_vehicle) >= VEHICLE_KEYS.index(order_vehicle)


def mask(num: Optional[str]) -> Optional[str]:
    return f"XXXX{num[-4:]}" if num else None


def settlement_snapshot(partner: dict) -> dict:
    p = partner.get("partner_profile") or {}
    return {
        "status": "pending", "account_holder": p.get("bank_account_holder"), "account_number_masked": mask(p.get("bank_account_number")),
        "ifsc": p.get("bank_ifsc"), "bank_name": p.get("bank_name"), "upi_id": p.get("upi_id"), "utr": None, "settled_at": None,
    }


async def assign(order_id: str, partner: dict, by: str):
    n = iso(now_utc())
    res = await db.orders.update_one(
        {"order_id": order_id, "status": "paid", "partner_id": None},
        {"$set": {"status": "assigned", "partner_id": partner["user_id"], "partner_name": partner.get("name"),
                  "partner_phone": partner.get("phone"),
                  "partner_vehicle": (partner.get("partner_profile") or {}).get("vehicle_number"),
                  "settlement": settlement_snapshot(partner),
                  "assigned_by": by, "updated_at": n},
         "$push": {"timeline": {"status": "assigned", "at": n}}})
    if res.modified_count == 0:
        raise HTTPException(409, "Order is no longer open")
    return await db.orders.find_one({"order_id": order_id}, {"_id": 0})


@api.post("/orders/{order_id}/accept")
async def accept_order(order_id: str, user=Depends(require_role("partner"))):
    if user.get("partner_status") != "approved":
        raise HTTPException(403, "Your partner account is not approved yet")
    o = await db.orders.find_one({"order_id": order_id}, {"_id": 0})
    if not o:
        raise HTTPException(404, "Order not found")
    if not vehicle_ok(user["partner_profile"]["vehicle_type"], o["quote"]["vehicle"]["key"]):
        raise HTTPException(400, "Your vehicle is too small for this load")
    return partner_view(await assign(order_id, user, "partner"))


class StatusBody(BaseModel):
    status: Literal["picked_up", "in_transit", "delivered"]
    otp: Optional[str] = None


@api.post("/orders/{order_id}/status")
async def update_status(order_id: str, body: StatusBody, user=Depends(require_role("partner"))):
    o = await db.orders.find_one({"order_id": order_id, "partner_id": user["user_id"]}, {"_id": 0})
    if not o:
        raise HTTPException(404, "Order not found")
    if o["status"] not in STATUS_FLOW or STATUS_FLOW.index(body.status) != STATUS_FLOW.index(o["status"]) + 1:
        raise HTTPException(400, "Invalid status change")
    if body.status == "picked_up" and o.get("pickup_otp") and body.otp != o["pickup_otp"]:
        raise HTTPException(400, "Incorrect pickup OTP. Ask the customer for the 4-digit code.")
    n = iso(now_utc())
    upd = {"status": body.status, "updated_at": n}
    if body.status == "delivered":
        upd["delivered_at"] = n
    await db.orders.update_one({"order_id": order_id}, {"$set": upd, "$push": {"timeline": {"status": body.status, "at": n}}})
    return partner_view(await db.orders.find_one({"order_id": order_id}, {"_id": 0}))


class RateBody(BaseModel):
    stars: int = Field(ge=1, le=5)
    comment: Optional[str] = Field(default=None, max_length=300)


@api.post("/orders/{order_id}/rate")
async def rate_order(order_id: str, body: RateBody, user=Depends(require_role("customer"))):
    o = await db.orders.find_one({"order_id": order_id, "customer_id": user["user_id"]}, {"_id": 0})
    if not o:
        raise HTTPException(404, "Order not found")
    if o["status"] != "delivered" or not o.get("partner_id"):
        raise HTTPException(400, "You can rate only after delivery")
    if o.get("rating"):
        raise HTTPException(409, "Already rated")
    rating = {"stars": body.stars, "comment": (body.comment or "").strip() or None, "at": iso(now_utc())}
    await db.orders.update_one({"order_id": order_id}, {"$set": {"rating": rating}})
    await db.users.update_one({"user_id": o["partner_id"]}, {"$inc": {"rating_sum": body.stars, "rating_count": 1}})
    return await db.orders.find_one({"order_id": order_id}, {"_id": 0})


# ----------------------------------------------------------------------------
# Partners
# ----------------------------------------------------------------------------
class PartnerProfile(BaseModel):
    full_name: str = Field(min_length=2)
    phone: str = Field(pattern=r"^(\+91)?[6-9]\d{9}$")
    city: str = Field(min_length=2)
    vehicle_type: Literal["two_wheeler", "three_wheeler", "mini_truck", "pickup_8ft", "truck_14ft"]
    vehicle_number: str = Field(min_length=4)
    license_number: str = Field(min_length=5)
    id_proof: str = Field(min_length=4, description="PAN or Aadhaar (last 4)")
    upi_id: Optional[str] = None
    gstin: Optional[str] = None
    bank_account_holder: Optional[str] = Field(default=None, max_length=80)
    bank_account_number: Optional[str] = Field(default=None, pattern=r"^\d{9,18}$")
    bank_ifsc: Optional[str] = Field(default=None, pattern=r"^[A-Z]{4}0[A-Z0-9]{6}$")
    bank_name: Optional[str] = Field(default=None, max_length=80)


@api.post("/partner/profile")
async def save_partner_profile(body: PartnerProfile, user=Depends(require_role("partner"))):
    profile = body.model_dump()
    profile["vehicle_number"] = profile["vehicle_number"].upper()
    bank = [profile.get(k) for k in ("bank_account_holder", "bank_account_number", "bank_ifsc")]
    if any(bank) and not all(bank):
        raise HTTPException(422, "Enter account holder, account number and IFSC together")
    profile["submitted_at"] = iso(now_utc())
    await db.users.update_one({"user_id": user["user_id"]}, {"$set": {
        "partner_profile": profile, "partner_status": "pending", "phone": body.phone, "name": body.full_name}})
    return public_user(await db.users.find_one({"user_id": user["user_id"]}, {"_id": 0}))


@api.get("/partner/jobs")
async def open_jobs(user=Depends(require_role("partner"))):
    if user.get("partner_status") != "approved":
        return []
    vt = user["partner_profile"]["vehicle_type"]
    jobs = await db.orders.find({"status": "paid", "partner_id": None}, {"_id": 0}).sort("created_at", -1).to_list(100)
    return [hide_contact(j) for j in jobs if vehicle_ok(vt, j["quote"]["vehicle"]["key"])]


@api.get("/partner/earnings")
async def earnings(user=Depends(require_role("partner"))):
    orders = await db.orders.find({"partner_id": user["user_id"]}, {"_id": 0}).to_list(1000)
    delivered = [o for o in orders if o["status"] == "delivered"]
    active = [o for o in orders if o["status"] in ("assigned", "picked_up", "in_transit")]
    return {
        "delivered_count": len(delivered), "active_count": len(active),
        "gross_fare": r2(sum(o["quote"]["taxable_value"] for o in delivered)),
        "commission": r2(sum(o["quote"]["platform_commission"] for o in delivered)),
        "net_earnings": r2(sum(o["quote"]["partner_payout"] for o in delivered)),
        "tips": r2(sum(o["quote"].get("tip", 0) for o in delivered)),
        "pending_payout": r2(sum(o["quote"]["partner_payout"] for o in active)),
        "settled": r2(sum(o["quote"]["partner_payout"] for o in delivered if (o.get("settlement") or {}).get("status") == "settled")),
        "awaiting_settlement": r2(sum(o["quote"]["partner_payout"] for o in delivered if (o.get("settlement") or {}).get("status") != "settled")),
    }


# ----------------------------------------------------------------------------
# Admin
# ----------------------------------------------------------------------------
@api.get("/admin/partners")
async def admin_partners(status: Optional[str] = None, user=Depends(require_role("admin"))):
    f = {"role": "partner", "partner_status": status} if status else {"role": "partner", "partner_status": {"$ne": "incomplete"}}
    rows = await db.users.find(f, {"_id": 0, "password_hash": 0}).limit(500).to_list(500)
    return [public_user(r) for r in rows]


class DecisionBody(BaseModel):
    decision: Literal["approved", "rejected"]


@api.post("/admin/partners/{user_id}/decision")
async def partner_decision(user_id: str, body: DecisionBody, user=Depends(require_role("admin"))):
    res = await db.users.update_one({"user_id": user_id, "role": "partner", "partner_profile": {"$ne": None}},
                                    {"$set": {"partner_status": body.decision}})
    if res.matched_count == 0:
        raise HTTPException(404, "Partner not found")
    return {"ok": True}


class AssignBody(BaseModel):
    partner_id: str


@api.post("/admin/orders/{order_id}/assign")
async def admin_assign(order_id: str, body: AssignBody, user=Depends(require_role("admin"))):
    p = await db.users.find_one({"user_id": body.partner_id, "role": "partner", "partner_status": "approved"}, {"_id": 0})
    if not p:
        raise HTTPException(404, "Approved partner not found")
    o = await db.orders.find_one({"order_id": order_id}, {"_id": 0})
    if not o:
        raise HTTPException(404, "Order not found")
    if not vehicle_ok(p["partner_profile"]["vehicle_type"], o["quote"]["vehicle"]["key"]):
        raise HTTPException(400, "Partner vehicle is too small for this load")
    return await assign(order_id, p, "admin")


class SettleBody(BaseModel):
    utr: str = Field(min_length=6, max_length=30, description="Bank transfer reference (UTR / NEFT / IMPS)")


@api.post("/admin/orders/{order_id}/settle")
async def settle_order(order_id: str, body: SettleBody, user=Depends(require_role("admin"))):
    o = await db.orders.find_one({"order_id": order_id}, {"_id": 0})
    if not o:
        raise HTTPException(404, "Order not found")
    if o["status"] != "delivered":
        raise HTTPException(400, "Settle only after delivery")
    if (o.get("settlement") or {}).get("status") == "settled":
        raise HTTPException(409, "Already settled")
    p = await db.users.find_one({"user_id": o["partner_id"]}, {"_id": 0})
    snap = {**settlement_snapshot(p), **{k: v for k, v in (o.get("settlement") or {}).items() if v}}
    if not snap.get("account_number_masked") and not snap.get("upi_id"):
        raise HTTPException(400, "Partner has no bank account or UPI ID on file")
    snap.update({"status": "settled", "utr": body.utr.strip().upper(), "settled_at": iso(now_utc()),
                 "amount": o["quote"]["partner_payout"]})
    await db.orders.update_one({"order_id": order_id}, {"$set": {"settlement": snap}})
    return await db.orders.find_one({"order_id": order_id}, {"_id": 0})


@api.get("/health")
async def api_health():
    await db.command("ping")
    return {"status": "ok", "env": APP_ENV}


@api.get("/system/info")
async def system_info():
    return {"env": APP_ENV, "version": APP_VERSION, "database": os.environ["DB_NAME"],
            "payments": "razorpay-" + ("live" if os.environ.get("RAZORPAY_KEY_ID", "").startswith("rzp_live") else "test"),
            "server_time": iso(now_utc())}


@api.post("/admin/seed-test-users")
async def seed_test_users(user=Depends(require_role("admin"))):
    if APP_ENV == "production":
        raise HTTPException(403, "Test users cannot be seeded in production")
    import seed_demo
    await asyncio.to_thread(seed_demo.seed)
    return {"ok": True, "users": seed_demo.TEST_USERS_SUMMARY}


@api.get("/admin/stats")
async def admin_stats(user=Depends(require_role("admin"))):
    orders = await db.orders.find({"status": {"$nin": ["pending_payment", "cancelled"]}}, {"_id": 0, "quote": 1, "status": 1}).to_list(5000)
    return {
        "paid_orders": len(orders),
        "open_orders": sum(1 for o in orders if o["status"] == "paid"),
        "gmv": r2(sum(o["quote"]["grand_total"] for o in orders)),
        "commission_earned": r2(sum(o["quote"]["platform_commission"] for o in orders)),
        "gst_collected": r2(sum(o["quote"]["gst"]["total"] for o in orders)),
        "pending_partners": await db.users.count_documents({"role": "partner", "partner_status": "pending"}),
    }


# ----------------------------------------------------------------------------
# Payments (Razorpay)
# ----------------------------------------------------------------------------
def rzp_client() -> razorpay.Client:
    key_id, secret = os.environ.get("RAZORPAY_KEY_ID"), os.environ.get("RAZORPAY_KEY_SECRET")
    if not key_id or not secret:
        raise HTTPException(503, "Online payments are not configured yet")
    return razorpay.Client(auth=(key_id, secret))


def public_base(request: Request) -> str:
    host = request.headers.get("x-forwarded-host") or request.headers.get("host")
    return f"https://{host}"


class PayBody(BaseModel):
    order_id: str


@api.post("/payments/create")
async def create_payment(body: PayBody, request: Request, user=Depends(require_role("customer"))):
    o = await db.orders.find_one({"order_id": body.order_id, "customer_id": user["user_id"]}, {"_id": 0})
    if not o:
        raise HTTPException(404, "Order not found")
    if o["status"] != "pending_payment":
        raise HTTPException(400, "Order is already paid or closed")
    rz = rzp_client()
    amount = int(round(o["quote"]["grand_total"] * 100))
    try:
        rorder = await asyncio.to_thread(rz.order.create, {
            "amount": amount, "currency": "INR", "receipt": o["order_id"],
            "notes": {"order_id": o["order_id"]}, "payment_capture": 1})
    except Exception as exc:
        logger.error("razorpay order create failed: %s", exc)
        raise HTTPException(502, "Could not start payment. Please try again.")
    await db.orders.update_one({"order_id": o["order_id"]}, {"$set": {"razorpay_order_id": rorder["id"], "amount_paise": amount}})
    return {"key_id": os.environ["RAZORPAY_KEY_ID"], "razorpay_order_id": rorder["id"], "amount": amount,
            "currency": "INR", "order_id": o["order_id"], "name": user.get("name"), "email": user["email"],
            "contact": f"+91{user['phone'][-10:]}" if user.get("phone") else "",
            "checkout_url": f"{public_base(request)}/api/payments/page/{rorder['id']}"}


async def mark_paid(rzp_order_id: str, payment_id: str, signature: str, customer_id: Optional[str] = None) -> dict:
    o = await db.orders.find_one({"razorpay_order_id": rzp_order_id}, {"_id": 0})
    if not o or (customer_id and o["customer_id"] != customer_id):
        raise HTTPException(404, "Unknown payment order")
    if o["status"] != "pending_payment":
        return o
    secret = os.environ["RAZORPAY_KEY_SECRET"]
    expected = hmac.new(secret.encode(), f"{rzp_order_id}|{payment_id}".encode(), hashlib.sha256).hexdigest()
    if not hmac.compare_digest(expected, signature):
        raise HTTPException(400, "Invalid payment signature")
    pay = await asyncio.to_thread(rzp_client().payment.fetch, payment_id)
    if pay.get("order_id") != rzp_order_id or pay.get("amount") != o["amount_paise"] or pay.get("status") not in ("captured", "authorized"):
        raise HTTPException(400, "Payment not completed")
    if pay.get("status") == "authorized":
        await asyncio.to_thread(rzp_client().payment.capture, payment_id, o["amount_paise"], {"currency": "INR"})
    n = iso(now_utc())
    inv = await next_invoice_no()
    await db.orders.update_one({"order_id": o["order_id"], "status": "pending_payment"}, {
        "$set": {"status": "paid", "invoice_no": inv, "invoice_date": n, "updated_at": n,
                 "payment": {"provider": "razorpay", "payment_id": payment_id, "method": pay.get("method"), "paid_at": n}},
        "$push": {"timeline": {"status": "paid", "at": n}}})
    return await db.orders.find_one({"order_id": o["order_id"]}, {"_id": 0})


class VerifyBody(BaseModel):
    razorpay_order_id: str
    razorpay_payment_id: str
    razorpay_signature: str


@api.post("/payments/verify")
async def verify_payment(body: VerifyBody, user=Depends(require_role("customer"))):
    return await mark_paid(body.razorpay_order_id, body.razorpay_payment_id, body.razorpay_signature, user["user_id"])


@api.get("/payments/page/{rzp_order_id}", response_class=HTMLResponse)
async def checkout_page(rzp_order_id: str, request: Request):
    o = await db.orders.find_one({"razorpay_order_id": rzp_order_id}, {"_id": 0})
    if not o:
        raise HTTPException(404, "Unknown payment")
    key_id = os.environ.get("RAZORPAY_KEY_ID", "")
    cb = f"{public_base(request)}/api/payments/callback"
    return f"""<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1">
<style>body{{font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;background:#FAFAFA;color:#1A1A1A}}</style></head>
<body><p>Opening secure Razorpay checkout...</p>
<script src="https://checkout.razorpay.com/v1/checkout.js"></script>
<script>
var rzp = new Razorpay({{key:"{key_id}",amount:{o['amount_paise']},currency:"INR",name:"LuggEase",
description:"Order {o['order_id']}",order_id:"{rzp_order_id}",callback_url:"{cb}",redirect:true,
prefill:{json.dumps({"name": o.get("customer_name") or "", "email": o["customer_email"], "contact": f"+91{o['customer_phone'][-10:]}" if o.get("customer_phone") else ""})},theme:{{color:"#CC5500"}},
modal:{{ondismiss:function(){{window.ReactNativeWebView&&window.ReactNativeWebView.postMessage("dismissed")}}}}}});
rzp.open();
</script></body></html>"""


@api.post("/payments/callback", response_class=HTMLResponse)
async def payment_callback(request: Request):
    form = await request.form()
    ok = False
    try:
        await mark_paid(str(form.get("razorpay_order_id", "")), str(form.get("razorpay_payment_id", "")),
                        str(form.get("razorpay_signature", "")))
        ok = True
    except Exception as exc:
        logger.warning("payment callback failed: %s", exc)
    msg = "success" if ok else "failed"
    text = "Payment successful. Returning to LuggEase..." if ok else "Payment could not be verified."
    return f"""<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh">
<h3>{text}</h3><script>window.ReactNativeWebView&&window.ReactNativeWebView.postMessage("{msg}")</script></body></html>"""


app.include_router(api)
app.add_middleware(CORSMiddleware, allow_credentials=True, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])


async def seed_admin():
    existing = await db.users.find_one({"email": ADMIN_EMAIL})
    if not existing:
        await db.users.insert_one({
            "user_id": f"user_{uuid.uuid4().hex[:12]}", "email": ADMIN_EMAIL, "name": "LuggEase Admin",
            "password_hash": bcrypt.hashpw(ADMIN_PASSWORD.encode(), bcrypt.gensalt(12)).decode(),
            "providers": ["password"], "role": "admin", "created_at": iso(now_utc())})
    elif not bcrypt.checkpw(ADMIN_PASSWORD.encode(), existing.get("password_hash", "").encode() or b"x"):
        await db.users.update_one({"email": ADMIN_EMAIL}, {"$set": {
            "password_hash": bcrypt.hashpw(ADMIN_PASSWORD.encode(), bcrypt.gensalt(12)).decode(), "role": "admin"}})


@app.on_event("startup")
async def startup():
    await ensure_validators()
    app.state.index_task = asyncio.create_task(ensure_indexes())
    await seed_admin()


@app.on_event("shutdown")
async def shutdown():
    app.state.index_task.cancel()
    with suppress(asyncio.CancelledError):
        await app.state.index_task
    client.close()
