import {api} from '@/src/api';
import {UserFacingError} from '@/src/errors';
import type {Position} from '@/src/location-watch';
const unconfirmed=()=>new UserFacingError('Your location upload could not be confirmed. Tap Retry location.');
/** Only acknowledge a report after the same order can read it back from storage. */
export async function shareShipmentPosition(orderId:string,point:Position):Promise<string>{
 const path=`/orders/${encodeURIComponent(orderId)}/tracking`;
 const receipt=await api<{received_at?:string}>(path,{body:point});
 if(!receipt?.received_at||!Number.isFinite(Date.parse(receipt.received_at)))throw unconfirmed();
 const stored=await api<{points?:Array<Position&{received_at:string}>;stale?:boolean}>(path);
 if(!Array.isArray(stored?.points)||stored.stale!==false||!stored.points.some(p=>p&&p.received_at===receipt.received_at&&p.latitude===point.latitude&&p.longitude===point.longitude&&Date.parse(p.captured_at)===Date.parse(point.captured_at)))throw unconfirmed();
 return receipt.received_at;
}
