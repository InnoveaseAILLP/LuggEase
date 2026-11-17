import {Text} from 'react-native';
import {loadCheckout} from '@/src/razorpay-checkout.web';
import {getErrorMessage, PAYMENT_REVIEW} from '@/src/errors';
import { useEffect, useState } from "react";

import { api } from "@/src/api";
import { Button, useToast } from "@/src/components/ui";

declare global {
  interface Window {
    Razorpay: any;
  }
}

export function PayButton({ orderId, amountLabel, onDone, stage, disabled=false }: { orderId: string; amountLabel: string; onDone: () => void; stage?:"advance"|"balance";disabled?:boolean }) {
  const [checkoutError, setCheckoutError] = useState("");
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  useEffect(() => {
    if(disabled)return;
    let active=true;
    loadCheckout().catch(error=>{if(active)setCheckoutError(getErrorMessage(error));});
    return()=>{active=false;};
  }, [disabled]);

  const start = async () => {
    setBusy(true);setCheckoutError("");
    try {
      await loadCheckout();
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
            toast(getErrorMessage(e, PAYMENT_REVIEW), "error");
          }
          setBusy(false);
          onDone();
        },
        modal: { ondismiss: () => setBusy(false) },
      });
      rzp.on("payment.failed", () => toast("Payment was not completed. Refresh payment status before trying again. Contact support if money was deducted.", "error"));
      rzp.open();
    } catch (e: any) {
      setCheckoutError(getErrorMessage(e));
      toast(getErrorMessage(e), "error");
      setBusy(false);
    }
  };

  return <><Button testID="pay-now-button" title={`${stage==="advance"?"Pay 50% booking advance":stage==="balance"?"Pay 50% pickup balance":"Pay invoice"} · ${amountLabel}`} icon="shield-lock-outline" disabled={disabled} loading={busy} onPress={start} />{checkoutError?<Text accessibilityRole="alert">{checkoutError}</Text>:null}</>;
}
