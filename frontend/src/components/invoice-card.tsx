import { useQuery } from "@tanstack/react-query";
import { Text, View } from "react-native";

import { api } from "@/src/api";
import { Card, inr, Row, space } from "@/src/components/ui";
import { useTheme } from "@/src/theme";
import type { Catalog, Order, Quote } from "@/src/types";

export function useCatalog() {
  return useQuery({ queryKey: ["catalog"], queryFn: () => api<Catalog>("/catalog"), staleTime: Infinity });
}

export function InvoiceCard({ quote, order, billTo }: { quote: Quote; order?: Order; billTo?: { name: string; email: string; gstin?: string | null } }) {
  const { colors } = useTheme();
  const { data: cat } = useCatalog();
  const g = quote.gst;
  const isTax = !!order?.invoice_no;
  const to = order ? { name: order.customer_name, email: order.customer_email, gstin: order.customer_gstin } : billTo;
  const small = { fontSize: 12, color: colors.muted, lineHeight: 17 } as const;
  return (
    <Card testID="invoice-card">
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
        <View style={{ flex: 1 }}>
          <Text testID="invoice-title" style={{ fontSize: 16, fontWeight: "800", color: colors.onSurface }}>{isTax ? "TAX INVOICE" : "QUOTATION (Proforma)"}</Text>
          {cat ? (
            <>
              <Text style={[small, { color: colors.onSurfaceTertiary, fontWeight: "700", marginTop: 4 }]}>{cat.supplier.name}</Text>
              <Text style={small}>{cat.supplier.address}</Text>
              <Text style={small}>GSTIN: {cat.supplier.gstin} · PAN: {cat.supplier.pan}</Text>
            </>
          ) : null}
        </View>
        {isTax ? (
          <View style={{ alignItems: "flex-end" }}>
            <Text testID="invoice-number" style={{ fontSize: 12, fontWeight: "700", color: colors.onSurface }}>{order!.invoice_no}</Text>
            <Text style={small}>{new Date(order!.invoice_date!).toLocaleDateString()}</Text>
          </View>
        ) : null}
      </View>

      {to ? (
        <View style={{ marginTop: space.md, padding: space.md, backgroundColor: colors.surfaceTertiary, borderRadius: 12 }}>
          <Text style={[small, { fontWeight: "700", color: colors.onSurfaceTertiary }]}>Bill to</Text>
          <Text style={{ fontSize: 14, color: colors.onSurface, fontWeight: "600" }}>{to.name || to.email}</Text>
          <Text style={small}>{to.email}</Text>
          <Text style={small}>GSTIN: {to.gstin || "Unregistered (B2C)"}</Text>
        </View>
      ) : null}

      <View style={{ marginTop: space.md }}>
        <Text style={small}>SAC {g.sac} · {g.description}</Text>
        <Text style={small}>Place of supply: {quote.place_of_supply} ({g.supply_type})</Text>
      </View>

      <View style={{ height: 1, backgroundColor: colors.divider, marginVertical: space.md }} />
      {quote.charges.map((c, i) => <Row key={c.label} testID={`invoice-charge-${i}`} label={c.label} value={inr(c.amount)} />)}
      <View style={{ height: 1, backgroundColor: colors.divider, marginVertical: space.sm }} />
      <Row label="Taxable value" value={inr(quote.taxable_value)} testID="invoice-taxable-value" />
      {g.igst_rate > 0 ? (
        <Row label={`IGST @ ${g.igst_rate}%`} value={inr(g.igst)} testID="invoice-igst" />
      ) : (
        <>
          <Row label={`CGST @ ${g.cgst_rate}%`} value={inr(g.cgst)} testID="invoice-cgst" />
          <Row label={`SGST @ ${g.sgst_rate}%`} value={inr(g.sgst)} testID="invoice-sgst" />
        </>
      )}
      {quote.round_off !== 0 ? <Row label="Round off" value={inr(quote.round_off)} /> : null}
      <View style={{ height: 1, backgroundColor: colors.divider, marginVertical: space.sm }} />
      <Row label="Invoice total" value={inr(quote.invoice_total ?? quote.grand_total)} bold={!quote.tip} testID="invoice-total" />
      <Text style={[small, { marginTop: 4, fontStyle: "italic" }]}>{quote.amount_in_words}</Text>
      {quote.tip ? (
        <>
          <Row label="Tip to partner (not a taxable supply)" value={inr(quote.tip)} testID="invoice-tip" />
          <Row label="Total payable" value={inr(quote.grand_total)} bold testID="invoice-grand-total" />
        </>
      ) : null}
      <Text style={[small, { marginTop: space.sm }]}>Tax payable under reverse charge: No. This is a computer generated document as per the CGST Act, 2017 and Rule 46 of CGST Rules.</Text>
      {cat && !order?.payment ? (
        <View testID="invoice-bank-details" style={{ marginTop: space.md, padding: space.md, backgroundColor: colors.surfaceTertiary, borderRadius: 12 }}>
          <Text style={[small, { fontWeight: "700", color: colors.onSurfaceTertiary }]}>Bank details for NEFT / RTGS payment</Text>
          <Text style={small}>{cat.supplier.bank.account_name}</Text>
          <Text style={small}>{cat.supplier.bank.bank_name}, {cat.supplier.bank.branch}</Text>
          <Text style={small}>A/c {cat.supplier.bank.account_number} · IFSC {cat.supplier.bank.ifsc}</Text>
        </View>
      ) : null}
    </Card>
  );
}
