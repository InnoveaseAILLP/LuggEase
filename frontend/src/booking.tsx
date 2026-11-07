import { createContext, ReactNode, useContext, useState } from "react";

export type Draft = {
  pickup_address: string;
  drop_address: string;
  pickup_state: string;
  drop_state: string;
  distance_km: string;
  items: Record<string, number>;
  service_type: "shift_only" | "pack_and_shift";
  service_category: string;
  vehicle_key: string | null;
  helpers: number | null;
  extra_stops: string[];
  coupon_code: string;
  tip: number;
  time_slot: string;
  hours: number | null;
  pickup_floor: number;
  drop_floor: number;
  lift_available: boolean;
  move_date: string;
  customer_gstin: string;
};

const initial: Draft = {
  pickup_address: "",
  drop_address: "",
  pickup_state: "Karnataka",
  drop_state: "Karnataka",
  distance_km: "",
  items: {},
  service_type: "shift_only",
  service_category: "home_shifting",
  vehicle_key: null,
  helpers: null,
  extra_stops: [],
  coupon_code: "",
  tip: 0,
  time_slot: "Now",
  hours: null,
  pickup_floor: 0,
  drop_floor: 0,
  lift_available: true,
  move_date: "",
  customer_gstin: "",
};

type Ctx = { draft: Draft; update: (p: Partial<Draft>) => void; reset: (p?: Partial<Draft>) => void };
const BookingCtx = createContext<Ctx | null>(null);

export function BookingProvider({ children }: { children: ReactNode }) {
  const [draft, setDraft] = useState<Draft>(initial);
  const update = (p: Partial<Draft>) => setDraft((d) => ({ ...d, ...p }));
  const reset = (p: Partial<Draft> = {}) => setDraft({ ...initial, ...p });
  return <BookingCtx.Provider value={{ draft, update, reset }}>{children}</BookingCtx.Provider>;
}

export function useBooking() {
  const v = useContext(BookingCtx);
  if (!v) throw new Error("useBooking outside provider");
  return v;
}

export function toPayload(d: Draft) {
  return {
    pickup_address: d.pickup_address.trim(),
    drop_address: d.drop_address.trim(),
    pickup_state: d.pickup_state,
    drop_state: d.drop_state,
    distance_km: parseFloat(d.distance_km) || 0,
    items: Object.entries(d.items).filter(([, q]) => q > 0).map(([key, qty]) => ({ key, qty })),
    service_type: d.service_type,
    service_category: d.service_category,
    vehicle_key: d.vehicle_key,
    helpers: d.helpers,
    extra_stops: d.extra_stops.map((x) => x.trim()).filter(Boolean),
    coupon_code: d.coupon_code.trim() || null,
    tip: d.tip,
    time_slot: d.time_slot || null,
    hours: d.hours,
    pickup_floor: d.pickup_floor,
    drop_floor: d.drop_floor,
    lift_available: d.lift_available,
    move_date: d.move_date || null,
    customer_gstin: d.customer_gstin.trim() || null,
  };
}
