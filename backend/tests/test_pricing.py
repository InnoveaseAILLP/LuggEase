# Pure unit tests for the LuggEase pricing / GST engine (no network, no DB writes).
import sys
from pathlib import Path

import pytest
from fastapi import HTTPException

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from server import QuoteRequest, amount_in_words, compute_quote  # noqa: E402


def q(**kw):
    base = dict(pickup_address="Koramangala, Bengaluru", drop_address="Whitefield, Bengaluru", pickup_state="Karnataka",
                drop_state="Karnataka", distance_km=10, items=[{"key": "sofa", "qty": 1}], service_type="shift_only")
    base.update(kw)
    return compute_quote(QuoteRequest(**base))


# --- Vehicle selection ---
@pytest.mark.parametrize("items,vehicle", [
    ([{"key": "parcel_small", "qty": 1}], "two_wheeler"),
    ([{"key": "parcel_small", "qty": 4}], "two_wheeler"),          # exactly 20 kg
    ([{"key": "parcel_small", "qty": 5}], "three_wheeler"),        # 25 kg
    ([{"key": "mattress", "qty": 1}], "three_wheeler"),            # heavy item never on 2-wheeler
    ([{"key": "couch", "qty": 1}], "three_wheeler"),
    ([{"key": "sofa", "qty": 1}], "mini_truck"),                   # bulky min vehicle
    ([{"key": "bed", "qty": 9}], "pickup_8ft"),                    # 810 kg
    ([{"key": "bed", "qty": 20}], "truck_14ft"),                   # 1800 kg
])
def test_vehicle_by_weight_and_bulk(items, vehicle):
    assert q(items=items)["vehicle"]["key"] == vehicle


def test_overweight_rejected():
    with pytest.raises(HTTPException) as e:
        q(items=[{"key": "bed", "qty": 40}])
    assert e.value.status_code == 400


def test_unknown_item_and_state_rejected():
    with pytest.raises(HTTPException):
        q(items=[{"key": "piano", "qty": 1}])
    with pytest.raises(HTTPException):
        q(pickup_state="Atlantis")


# --- Distance ---
def test_distance_increases_price_and_free_km():
    near, far = q(distance_km=2), q(distance_km=52)
    assert not any(c["label"].startswith("Distance") for c in near["charges"])
    assert far["taxable_value"] - near["taxable_value"] == 50 * 25  # mini truck Rs 25/km


# --- Labour hours / service types ---
def test_shift_only_default_hours_and_labour():
    r = q()
    assert r["hours"] == 1 and r["labour_billable"] and r["min_hours"] == 1
    assert r["taxable_value"] == 890.0  # 350 base + 200 distance + 140 handling + 200 labour


def test_custom_hours_billed():
    assert q(hours=3)["taxable_value"] - q(hours=1)["taxable_value"] == 400


def test_hours_clamped_to_minimum():
    assert q(hours=0.25)["hours"] == 1


def test_pack_and_shift_adds_material_and_packing_hours():
    r = q(service_type="pack_and_shift")
    assert any(c["label"] == "Packing material" and c["amount"] == 350 for c in r["charges"])
    assert r["recommended_hours"] == 2 and r["hours"] == 2


def test_light_parcel_shift_only_has_no_labour():
    r = q(items=[{"key": "parcel_small", "qty": 1}])
    assert r["hours"] == 0 and not r["labour_billable"]
    assert not any(c["label"].startswith("Labour") for c in r["charges"])


def test_light_load_pack_and_shift_bills_packing_labour():
    r = q(items=[{"key": "parcel_small", "qty": 2}], service_type="pack_and_shift")
    assert r["labour_billable"] and r["hours"] == 0.5 and r["min_hours"] == 0.5
    assert any(c["label"].startswith("Labour") and c["amount"] == 175 for c in r["charges"])


def test_floor_charge_only_without_lift():
    with_lift = q(pickup_floor=3, drop_floor=2)
    no_lift = q(pickup_floor=3, drop_floor=2, lift_available=False)
    assert no_lift["taxable_value"] - with_lift["taxable_value"] == 0.5 * 70 * 5


# --- GST ---
def test_intra_state_cgst_sgst_5pct():
    g = q()["gst"]
    assert (g["sac"], g["rate"], g["cgst"], g["sgst"], g["igst"]) == ("996511", 5, 22.25, 22.25, 0)
    assert g["supply_type"] == "Intra-State"


def test_inter_state_igst_18pct():
    g = q(service_type="pack_and_shift", pickup_state="Maharashtra")["gst"]
    assert (g["sac"], g["rate"], g["cgst"], g["sgst"]) == ("996729", 18, 0, 0)
    assert g["igst"] == g["total"] and g["supply_type"] == "Inter-State"


def test_round_half_up_and_round_off():
    r = q()  # 890 + 44.50 = 934.50 -> 935
    assert r["grand_total"] == 935 and r["round_off"] == 0.5
    r = q(hours=1.5)  # 990 + 49.50 = 1039.50 -> 1040
    assert r["grand_total"] == 1040


# --- Commission ---
@pytest.mark.parametrize("kw", [{}, {"service_type": "pack_and_shift"}, {"distance_km": 400}])
def test_commission_is_5pct_partner_95pct(kw):
    r = q(**kw)
    assert r["platform_commission"] == round(r["taxable_value"] * 0.05, 2)
    assert round(r["platform_commission"] + r["partner_payout"], 2) == r["taxable_value"]


# --- Amount in words ---
@pytest.mark.parametrize("n,words", [
    (0, "Rupees Zero Only"),
    (935, "Rupees Nine Hundred Thirty Five Only"),
    (125000, "Rupees One Lakh Twenty Five Thousand Only"),
    (10000001, "Rupees One Crore One Only"),
])
def test_amount_in_words(n, words):
    assert amount_in_words(n) == words


# --- Lugg / Porter features (iteration 4) ---
def test_vehicle_options_and_upgrade():
    r = q()
    keys = [v["key"] for v in r["vehicle_options"]]
    assert keys == ["mini_truck", "pickup_8ft", "truck_14ft"]
    assert r["vehicle_options"][0]["estimate"] == r["grand_total"]
    up = q(vehicle_key="truck_14ft")
    assert up["vehicle"]["key"] == "truck_14ft" and up["grand_total"] > r["grand_total"]
    with pytest.raises(HTTPException):
        q(vehicle_key="two_wheeler")


def test_helpers_count_scales_labour_and_zero_helpers_waives_handling():
    one, two = q(helpers=1), q(helpers=2)
    assert two["taxable_value"] - one["taxable_value"] == 200
    none = q(helpers=0)
    assert none["hours"] == 0 and not any(c["label"].startswith(("Labour", "Loading")) for c in none["charges"])
    assert q(service_type="pack_and_shift", helpers=0)["helpers"] == 1  # packer mandatory
    assert q(items=[{"key": "bed", "qty": 3}])["recommended_helpers"] == 2


def test_extra_stops_and_intercity_toll():
    assert q(extra_stops=["Stop A", "Stop B"])["taxable_value"] - q()["taxable_value"] == 200
    r = q(distance_km=350, pickup_state="Karnataka", drop_state="Tamil Nadu", service_category="intercity")
    assert any(c["label"].startswith("Toll") and c["amount"] == 500 for c in r["charges"])


def test_junk_removal_fee():
    r = q(service_category="junk_removal", items=[{"key": "sofa", "qty": 1}, {"key": "clothes", "qty": 2}])
    assert any(c["label"].startswith("Eco-disposal") and c["amount"] == 210 for c in r["charges"])


def test_coupons():
    r = q(coupon_code="first50")
    assert r["discount"] == 50 and r["coupon_code"] == "FIRST50" and r["taxable_value"] == 840
    assert r["platform_commission"] == 42.0  # 5% after discount
    assert q(coupon_code="LUGG10")["discount"] == 89.0
    bad = q(coupon_code="NOPE")
    assert bad["discount"] == 0 and bad["coupon_message"] == "Invalid coupon code"
    assert q(coupon_code="MOVE200")["discount"] == 0  # below min / wrong category


def test_tip_is_not_taxed_and_goes_to_partner():
    base, tipped = q(), q(tip=100)
    assert tipped["gst"]["total"] == base["gst"]["total"]
    assert tipped["grand_total"] == base["grand_total"] + 100
    assert tipped["partner_payout"] == base["partner_payout"] + 100
    assert tipped["platform_commission"] == base["platform_commission"]
