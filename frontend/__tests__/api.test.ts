import {apiPdf, api, setTokenProvider, setUnauthorizedHandler} from '../src/api';
const fetchMock = jest.fn();
global.fetch = fetchMock;
beforeEach(() => {fetchMock.mockReset();setTokenProvider(async () => 'firebase-token');setUnauthorizedHandler(null);});
test('attaches current Firebase ID token and sends JSON', async () => {
  fetchMock.mockResolvedValue({ok:true,status:200,json:async()=>({ok:true})});
  await expect(api('/quote',{body:{distance:10}})).resolves.toEqual({ok:true});
  expect(fetchMock).toHaveBeenCalledWith('https://test.example/api/quote',expect.objectContaining({method:'POST',headers:expect.objectContaining({Authorization:'Bearer firebase-token'}),body:'{"distance":10}'}));
});
test('a rejected current identity clears protected UI', async () => {
  const unauthorized = jest.fn(); setUnauthorizedHandler(unauthorized);
  fetchMock.mockResolvedValue({ok:false,status:401,json:async()=>({detail:'Expired'})});
  await expect(api('/auth/me')).rejects.toThrow('session has expired');
  expect(unauthorized).toHaveBeenCalledTimes(1);
});
test('a stale unauthorized response cannot clear a newer identity', async () => {
  const unauthorized=jest.fn();setUnauthorizedHandler(unauthorized);
  let calls=0;setTokenProvider(async () => ++calls===1?'old':'new');
  fetchMock.mockResolvedValue({ok:false,status:401,json:async()=>({detail:'Expired'})});
  await expect(api('/auth/me')).rejects.toThrow();
  expect(unauthorized).not.toHaveBeenCalled();
});
test('forbidden responses preserve identity and expose validation error', async () => {
  const unauthorized=jest.fn();setUnauthorizedHandler(unauthorized);
  fetchMock.mockResolvedValue({ok:false,status:422,json:async()=>({detail:[{loc:['body','role'],msg:'Invalid role'}]})});
  await expect(api('/auth/role',{body:{role:'admin'}})).rejects.toThrow('Select Customer or Delivery Partner');
  expect(unauthorized).not.toHaveBeenCalled();
});

test('a successful non-JSON response cannot masquerade as a user profile', async () => {
  fetchMock.mockResolvedValue({ok:true,status:200,json:async()=>{throw new Error('HTML');}});
  await expect(api('/auth/me')).rejects.toThrow('couldn’t load this information');
});

test('downloads a PDF with a Firebase bearer token and rejects other content', async () => {
  const pdf = new Blob(['%PDF-1.7 sample'], {type:'application/pdf'});
  fetchMock.mockResolvedValue({ok:true,status:200,headers:{get:()=> 'application/pdf'},blob:async()=>pdf});
  await expect(apiPdf('/orders/one/invoice.pdf')).resolves.toBe(pdf);
  expect(fetchMock).toHaveBeenCalledWith('https://test.example/api/orders/one/invoice.pdf', expect.objectContaining({headers:expect.objectContaining({Authorization:'Bearer firebase-token'})}));
  fetchMock.mockResolvedValue({ok:true,status:200,headers:{get:()=> 'text/html'}});
  await expect(apiPdf('/orders/one/invoice.pdf')).rejects.toThrow('document could not be downloaded');
});
test('an invoice cannot download after the signed-in identity changes', async () => {
  let calls=0; setTokenProvider(async () => ++calls===1?'old':'new');
  fetchMock.mockResolvedValue({ok:true,status:200});
  await expect(apiPdf('/orders/one/invoice.pdf')).rejects.toThrow('sign-in changed');
});
test('payment network failures warn against paying twice',async()=>{
 fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
 await expect(api('/payments/verify',{body:{}})).rejects.toThrow('Refresh payment status before trying to pay again');
});
test('server diagnostics and SDK errors are not shown to users',async()=>{
 fetchMock.mockResolvedValue({ok:false,status:500,json:async()=>({detail:'Firebase: token=private'})});
 await expect(api('/orders')).rejects.toThrow('service is temporarily unavailable');
 setTokenProvider(async()=>{throw Object.assign(new Error('Firebase: Error (auth/invalid-user-token).'),{code:'auth/invalid-user-token'});});
 await expect(api('/orders')).rejects.toThrow('session has expired');
});
