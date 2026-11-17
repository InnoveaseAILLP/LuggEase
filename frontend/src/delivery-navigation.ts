import {UserFacingError} from '@/src/errors';
import type {Order} from './types';
// Google Maps universal URLs: https://developers.google.com/maps/documentation/urls/get-started
export function deliveryNavigationURL(order:Pick<Order,'status'|'pickup_address'|'drop_address'|'extra_stops'>){
 const pickup=order.status==='assigned';
 const params=[['api','1'],['destination',pickup?order.pickup_address:order.drop_address],['travelmode','driving'],['dir_action','navigate']];
 if(!pickup){params.push(['origin',order.pickup_address]);if(order.extra_stops?.length)params.push(['waypoints',order.extra_stops.join('|')]);}
 const url='https://www.google.com/maps/dir/?'+params.map(([key,value])=>`${key}=${encodeURIComponent(value)}`).join('&');
 if(url.length>2048)throw new UserFacingError('The address is too long for Google Maps navigation. Open Maps and enter the destination manually.');
 return url;
}
