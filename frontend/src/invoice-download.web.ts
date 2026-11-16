import {apiPdf} from '@/src/api';
export async function downloadDocument(path: string, invoiceNo: string) {
  const documentType = path.includes('agreement') ? 'Transfer-Agreement' : 'Sales-Invoice';
  const blob = await apiPdf(path);
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `LuggEase-${documentType}-${invoiceNo.replace(/[^A-Za-z0-9_-]/g, '-').slice(0, 80)}.pdf`;
  document.body.appendChild(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return 'PDF downloaded.';
}

export function downloadInvoice(orderId: string, invoiceNo: string) {
  return downloadDocument(`/orders/${encodeURIComponent(orderId)}/invoice.pdf`, invoiceNo);
}
