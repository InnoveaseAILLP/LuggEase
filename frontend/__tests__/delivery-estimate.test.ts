import {deliveryInputs,revisedDelivery} from '../src/delivery-estimate';
const now=Date.parse('2026-11-17T10:00:00Z');
test('24-hour India time is converted precisely and Test is accepted for a simulation',()=>{
 expect(revisedDelivery('17-11-2026','17:31',' Test ',true,now)).toEqual({expected_delivery_at:'2026-11-17T12:01:00.000Z',reason:'Test'});
});
test('real revisions require a useful reason with the exact minimum explained',()=>{
 expect(()=>revisedDelivery('17-11-2026','17:31','Test',false,now)).toThrow('at least 10 characters');
 expect(revisedDelivery('17-11-2026','17:31','Traffic congestion',false,now).reason).toBe('Traffic congestion');
});
test.each([
 ['31-11-2026','17:31','calendar date'],['17-11-2026','24:00','24-hour'],['17-11-2026','17:65','24-hour'],
 ['17-11-2026','15:29','already passed'],['19-12-2026','17:31','next 30 days'],['2026-11-17','17:31','DD-MM-YYYY'],
])('explains an invalid date/time %s %s',(date,time,message)=>expect(()=>revisedDelivery(date,time,'Test',true,now)).toThrow(message));
test('prefill replaces a past estimate with a future India-time suggestion',()=>{
 expect(deliveryInputs('2026-11-17T10:31:00+05:30',now)).toEqual({date:'17-11-2026',time:'16:00'});
 expect(deliveryInputs('2026-11-18T17:31:00+05:30',now)).toEqual({date:'18-11-2026',time:'17:31'});
});
test('input whitespace and a single-digit hour are accepted without changing timezone',()=>expect(revisedDelivery(' 18-11-2026 ',' 7:05 ','Test',true,now).expected_delivery_at).toBe('2026-11-18T01:35:00.000Z'));
