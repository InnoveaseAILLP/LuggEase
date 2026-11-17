import {UserFacingError} from '@/src/errors';
import {Platform} from 'react-native';
import {fs, media, open} from 'react-native-blob-util';
import {apiPdf} from '@/src/api';

function base64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new UserFacingError('Could not read the invoice PDF.'));
    reader.onload = () => resolve(String(reader.result).split(',')[1]);
    reader.readAsDataURL(blob);
  });
}
export async function downloadDocument(apiPath: string, invoiceNo: string) {
  const documentType = apiPath.includes('agreement') ? 'Transfer-Agreement' : 'Sales-Invoice';
  const blob = await apiPdf(apiPath);
  const name = `LuggEase-${documentType}-${invoiceNo.replace(/[^A-Za-z0-9_-]/g, '-').slice(0, 80)}-${Date.now()}.pdf`;
  const path = `${fs.dirs.CacheDir}/${name}`;
  await fs.writeFile(path, await base64(blob), 'base64');
  if (Platform.OS === 'android' && Number(Platform.Version) >= 29) {
    try { await media.copyToMediaStore({name, parentFolder: 'LuggEase', mime: 'application/pdf'}, 'Download', path); }
    finally { await fs.unlink(path).catch(() => {}); }
    return 'PDF saved to Downloads / LuggEase.';
  }
  // iOS exposes Save to Files in the native document menu. Older Android uses its PDF viewer.
  try {
    if (Platform.OS === 'ios') await open.optionsMenu(path);
    else await open.file(path, {mime: 'application/pdf'});
  } catch {
    throw new UserFacingError('No PDF viewer is available. Please install a PDF viewer and try again.');
  }
  // The operating system may still be reading the file; clear old invoice cache on the next export.
  const files = await fs.ls(fs.dirs.CacheDir);
  await Promise.all(files.filter(f => (f.startsWith('LuggEase-Sales-Invoice-') || f.startsWith('LuggEase-Transfer-Agreement-')) && f !== name).map(f => fs.unlink(`${fs.dirs.CacheDir}/${f}`).catch(() => {})));
  return Platform.OS === 'ios' ? 'Use Save to Files to save your PDF.' : 'PDF opened. Use your viewer to save or share it.';
}

export function downloadInvoice(orderId: string, invoiceNo: string) {
  return downloadDocument(`/orders/${encodeURIComponent(orderId)}/invoice.pdf`, invoiceNo);
}
