import { useEffect, useState } from "react";

import { api } from "@/src/api";
import { Button, useToast } from "@/src/components/ui";

declare global {
  interface Window {
    Razorpay: any;
  }
}

export function PayButton({ orderId, amountLabel, onDone, stage, disabled=false }: { orderId: string; amountLabel: string; onDone: () => void; stage?:"advance"|"balance";disabled?:boolean }) {
  const [ready, setReady] = useState(typeof window !== "undefined" && !!window.Razorpay);
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  useEffect(() => {
    if (window.Razorpay) return;
    const s = document.createElement("script");
    s.src = "https://checkout.razorpay.com/v1/checkout.js";
    s.onload = () => setReady(true);
    document.body.appendChild(s);
  }, []);

  const start = async () => {
    setBusy(true);
    try {
      const o = await api<any>("/payments/create", { body: { order_id: orderId,stage } });
      const rzp = new window.Razorpay({
        key: o.key_id, amount: o.amount, currency: "INR", name: "LuggEase", description: `${o.stage??"Order"} payment · ${o.order_id}`,
        order_id: o.razorpay_order_id, prefill: { name: o.name, email: o.email, contact: o.contact },
        theme: { color: "#CC5500" },
        handler: async (resp: any) => {
          try {
            await api("/payments/verify", { body: resp });
            toast("Payment successful", "success");
          } catch (e: any) {
            toast(e.message, "error");
          }
          setBusy(false);
          onDone();
        },
        modal: { ondismiss: () => setBusy(false) },
      });
      rzp.on("payment.failed", () => toast("Payment failed. Please try again.", "error"));
      rzp.open();
    } catch (e: any) {
      toast(e.message, "error");
      setBusy(false);
    }
  };

  return <Button testID="pay-now-button" title={`${stage==="advance"?"Pay 50% booking advance":stage==="balance"?"Pay 50% pickup balance":"Pay invoice"} · ${amountLabel}`} icon="shield-lock-outline" disabled={!ready||disabled} loading={busy} onPress={start} />;
}
