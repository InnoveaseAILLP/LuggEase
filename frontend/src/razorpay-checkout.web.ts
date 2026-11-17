import {UserFacingError} from '@/src/errors';
let pending:Promise<void>|null=null;
const unavailable='Secure checkout could not load. Check your connection and try the payment button again.';
/** Share one download across buttons; failed downloads are removed so the next click can retry. */
export function loadCheckout():Promise<void>{
  if(typeof window.Razorpay==='function')return Promise.resolve();
  if(pending)return pending;
  const attempt=new Promise<void>((resolve,reject)=>{
    const script=document.createElement('script');
    const finish=(error?:UserFacingError)=>{
      clearTimeout(timeout);script.onload=null;script.onerror=null;
      if(error){script.remove();reject(error);}else resolve();
    };
    const timeout=setTimeout(()=>finish(new UserFacingError(unavailable)),20000);
    script.src='https://checkout.razorpay.com/v1/checkout.js';script.async=true;
    script.onload=()=>finish(typeof window.Razorpay==='function'?undefined:new UserFacingError(unavailable));
    script.onerror=()=>finish(new UserFacingError(unavailable));
    document.body.appendChild(script);
  });
  pending=attempt.catch(error=>{pending=null;throw error;});
  return pending;
}
