import {baseUrl} from '@/src/env';
let tokenProvider: () => Promise<string | null> = async () => null;
let onUnauthorized: (() => void) | null = null;
export function setTokenProvider(provider: () => Promise<string | null>) { tokenProvider = provider; }
export function setUnauthorizedHandler(handler: (() => void) | null) { onUnauthorized = handler; }
export async function api<T = any>(path: string, opts: {method?: string; body?: unknown} = {}): Promise<T> {
  const sent = await tokenProvider();
  const res = await fetch(`${baseUrl()}/api${path}`, {
    method:opts.method ?? (opts.body !== undefined ? 'POST' : 'GET'),
    headers:{'Content-Type':'application/json', ...(sent ? {Authorization:`Bearer ${sent}`} : {})},
    body:opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  const data: any = await res.json().catch(() => { throw new Error("The booking service returned an invalid response. Please try again."); });
  if (res.status === 401 && sent && sent === await tokenProvider()) onUnauthorized?.();
  if (!res.ok) {
    const detail = data?.detail;
    throw new Error(typeof detail === 'string' ? detail : Array.isArray(detail) ? `${detail[0]?.loc?.slice(-1)[0] ?? ''} ${detail[0]?.msg ?? ''}`.trim() : 'Something went wrong');
  }
  return data as T;
}

/** Protected binary downloads use the same identity and 401 handling as JSON calls. */
export async function apiPdf(path: string): Promise<Blob> {
  const sent = await tokenProvider();
  if (!sent) throw new Error('Please sign in to download your invoice.');
  const res = await fetch(`${baseUrl()}/api${path}`, {headers: {Authorization: `Bearer ${sent}`, Accept: 'application/pdf'}});
  const current = await tokenProvider();
  if (res.status === 401 && sent === current) onUnauthorized?.();
  if (!current || current !== sent) throw new Error('Your sign-in changed. Please try downloading again.');
  if (!res.ok) {
    const error = await res.json().catch(() => ({}));
    throw new Error(typeof error.detail === 'string' ? error.detail : 'Could not download the invoice. Please try again.');
  }
  if (!res.headers.get('content-type')?.includes('application/pdf')) throw new Error('The service did not return a PDF invoice.');
  return res.blob();
}
