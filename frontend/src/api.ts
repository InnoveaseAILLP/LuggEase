import {baseUrl} from '@/src/env';
import {apiError, asUserFacingError, UserFacingError, PAYMENT_REVIEW} from '@/src/errors';
let tokenProvider: () => Promise<string | null> = async () => null;
let onUnauthorized: (() => void) | null = null;
export function setTokenProvider(provider: () => Promise<string | null>) { tokenProvider = provider; }
export function setUnauthorizedHandler(handler: (() => void) | null) { onUnauthorized = handler; }
async function currentToken() {try{return await tokenProvider();}catch(error){throw asUserFacingError(error);}}
async function request(path:string,init:RequestInit):Promise<Response> {
  try{return await fetch(`${baseUrl()}/api${path}`,init);}
  catch(error){throw path.startsWith('/payments')?new UserFacingError(PAYMENT_REVIEW):asUserFacingError(error);}
}
async function clearRejectedIdentity(status:number,sent:string|null){
  if(status===401&&sent){
    // An old response must never clear a newer signed-in account.
    const current=await tokenProvider().catch(()=>null);
    if(sent===current)onUnauthorized?.();
  }
}
export async function api<T = any>(path: string, opts: {method?: string; body?: unknown} = {}): Promise<T> {
  const sent = await currentToken();
  const res = await request(path, {
    method:opts.method ?? (opts.body !== undefined ? 'POST' : 'GET'),
    headers:{'Content-Type':'application/json', ...(sent ? {Authorization:`Bearer ${sent}`} : {})},
    body:opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  await clearRejectedIdentity(res.status,sent);
  const data:unknown = await res.json().catch(() => {
    throw res.ok?new UserFacingError(path.startsWith('/payments')?PAYMENT_REVIEW:'We couldn’t load this information. Please try again.'):apiError(res.status,null,path,!!sent);
  });
  if (!res.ok) throw apiError(res.status,data,path,!!sent);
  return data as T;
}

/** Protected downloads retain the identity that requested the document. */
export async function apiPdf(path: string): Promise<Blob> {
  const sent = await currentToken();
  if (!sent) throw new UserFacingError('Please sign in to download your document.');
  const res = await request(path, {headers: {Authorization: `Bearer ${sent}`, Accept: 'application/pdf'}});
  await clearRejectedIdentity(res.status,sent);
  const current = await currentToken();
  if (!current || current !== sent) throw new UserFacingError('Your sign-in changed. Please try downloading again.');
  if (!res.ok) throw apiError(res.status,await res.json().catch(()=>null),path,true);
  if (!res.headers.get('content-type')?.includes('application/pdf')) throw new UserFacingError('The document could not be downloaded. Please try again.');
  try{return await res.blob();}catch(error){throw asUserFacingError(error,'The document could not be downloaded. Please try again.');}
}
