export type Role = "customer" | "partner" | "admin";

export type PartnerProfile = {
  full_name: string;
  phone: string;
  city: string;
  vehicle_type: string;
  vehicle_number: string;
  license_number: string;
  id_proof: string;
  upi_id?: string | null;
  gstin?: string | null;
  bank_account_holder?: string | null;
  bank_account_number?: string | null;
  bank_ifsc?: string | null;
  bank_name?: string | null;
};

export type User = {
  user_id: string;
  email: string;
  name: string;
  picture?: string | null;
  role: Role | null;
  phone?: string | null;
  partner_status?: "incomplete" | "pending" | "approved" | "rejected" | null;
  partner_profile?: PartnerProfile | null;
  rating?: number | null;
  rating_count?: number;
};

export type CatalogItem = { key: string; name: string; weight: number; size: "light" | "heavy"; icon: string; pack_hours: number; material: number };
export type Vehicle = { key: string; name: string; max_kg: number; base: number; per_km: number; icon: string };
export type Catalog = {
  items: CatalogItem[];
  vehicles: Vehicle[];
  states: string[];
  supplier: { name: string; gstin: string; state: string; address: string; pan: string; bank: { account_name: string; bank_name: string; account_number: string; ifsc: string; branch: string } };
  commission_rate: number;
  categories: { key: string; name: string; desc: string; icon: string }[];
  coupons: { code: string; desc: string }[];
  time_slots: string[];
  cancellation_fee: number;
  stop_charge: number;
};

export type Quote = {
  items: { key: string; name: string; qty: number; unit_kg: number; total_kg: number; icon: string }[];
  total_weight_kg: number;
  vehicle: Vehicle;
  vehicle_options: (Vehicle & { estimate: number })[];
  service_category: string;
  helpers: number;
  recommended_helpers: number;
  min_helpers: number;
  extra_stops: string[];
  subtotal: number;
  discount: number;
  coupon_code: string | null;
  coupon_message: string | null;
  invoice_total: number;
  tip: number;
  service_type: "shift_only" | "pack_and_shift";
  recommended_hours: number;
  labour_billable: boolean;
  min_hours: number;
  hours: number;
  distance_km: number;
  charges: { label: string; amount: number }[];
  taxable_value: number;
  gst: {
    sac: string; description: string; rate: number; supply_type: string;
    cgst_rate: number; sgst_rate: number; igst_rate: number;
    cgst: number; sgst: number; igst: number; total: number;
  };
  place_of_supply: string;
  round_off: number;
  grand_total: number;
  amount_in_words: string;
  commission_rate: number;
  platform_commission: number;
  partner_payout: number;
};

export type OrderStatus = "pending_payment" | "paid" | "assigned" | "picked_up" | "in_transit" | "delivered" | "cancelled";

export type Order = {
  order_id: string;
  customer_id: string;
  customer_name: string;
  customer_email: string;
  customer_phone?: string | null;
  customer_gstin?: string | null;
  pickup_address: string;
  drop_address: string;
  pickup_state: string;
  drop_state: string;
  pickup_floor: number;
  drop_floor: number;
  lift_available: boolean;
  move_date?: string | null;
  quote: Quote;
  status: OrderStatus;
  partner_id?: string | null;
  partner_name?: string | null;
  partner_phone?: string | null;
  partner_vehicle?: string | null;
  invoice_no?: string | null;
  invoice_date?: string | null;
  payment?: { payment_id: string; method?: string; paid_at: string } | null;
  refund_note?: string | null;
  refund_amount?: number;
  cancellation_fee?: number;
  pickup_otp?: string | null;
  time_slot?: string | null;
  extra_stops?: string[];
  service_category?: string;
  rating?: { stars: number; comment?: string | null; at: string } | null;
  settlement?: {
    status: "pending" | "settled"; account_holder?: string | null; account_number_masked?: string | null; ifsc?: string | null;
    bank_name?: string | null; upi_id?: string | null; utr?: string | null; settled_at?: string | null; amount?: number;
  } | null;
  timeline: { status: OrderStatus; at: string }[];
  created_at: string;
};
