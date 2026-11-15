import {apiPdf} from '@/src/api';
export async function downloadInvoice(orderId: string, invoiceNo: string) {
  const blob = await apiPdf(`/orders/${encodeURIComponent(orderId)}/invoice.pdf`);
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `LuggEase-Sales-Invoice-${invoiceNo.replace(/[^A-Za-z0-9_-]/g, '-').slice(0, 80)}.pdf`;
  document.body.appendChild(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return 'Invoice PDF downloaded.';
}
