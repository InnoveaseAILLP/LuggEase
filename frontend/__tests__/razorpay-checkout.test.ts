let scripts:any[];
beforeEach(()=>{
 jest.resetModules();jest.useFakeTimers();scripts=[];
 (global as any).window={};(global as any).document={createElement:()=>({remove:jest.fn()}),body:{appendChild:(script:any)=>scripts.push(script)}};
});
afterEach(()=>{jest.useRealTimers();delete (global as any).window;delete (global as any).document;});
test('shares checkout loading across buttons and reuses a successful download',async()=>{
 const {loadCheckout}=jest.requireActual('../src/razorpay-checkout.web');
 const a=loadCheckout(),b=loadCheckout();expect(a).toBe(b);expect(scripts).toHaveLength(1);
 (global as any).window.Razorpay=()=>{};scripts[0].onload();await expect(a).resolves.toBeUndefined();
 await loadCheckout();expect(scripts).toHaveLength(1);
});
test('failed checkout downloads can be retried instead of disabling payment forever',async()=>{
 const {loadCheckout}=jest.requireActual('../src/razorpay-checkout.web');
 const first=loadCheckout();scripts[0].onerror();await expect(first).rejects.toThrow('try the payment button again');
 expect(scripts[0].remove).toHaveBeenCalled();
 const retry=loadCheckout();expect(scripts).toHaveLength(2);
 (global as any).window.Razorpay=()=>{};scripts[1].onload();await expect(retry).resolves.toBeUndefined();
});
test('a stalled download times out and allows another attempt',async()=>{
 const {loadCheckout}=jest.requireActual('../src/razorpay-checkout.web');
 const pending=loadCheckout();const rejected=expect(pending).rejects.toThrow('Secure checkout could not load');
 jest.advanceTimersByTime(20000);await rejected;
 const retry=loadCheckout();scripts[1].onerror();await expect(retry).rejects.toThrow();
});
