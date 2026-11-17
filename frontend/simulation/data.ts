import type {Order} from '../src/types';
export const route=[{latitude:11.0015,longitude:76.9668},{latitude:11.005,longitude:76.978},{latitude:11.010,longitude:76.990},{latitude:11.016,longitude:77.005},{latitude:11.022,longitude:77.020},{latitude:11.0268,longitude:77.0435}];
let count=3;
export const order={order_id:'SIM-MAP-IPHONE',is_test:true,customer_id:'SIM-CUSTOMER',partner_id:'SIM-PARTNER',status:'in_transit',pickup_address:'SIMULATION · Coimbatore Railway Station',drop_address:'SIMULATION · Coimbatore Airport',created_at:new Date().toISOString(),timeline:[],quote:{items:[{qty:1}],vehicle:{key:'mini_truck',name:'Tata Ace',icon:'truck'},distance_km:11,total_weight_kg:70,service_type:'shift_only',grand_total:1916,partner_payout:1734},delivery_estimate:{expected_delivery_at:new Date(Date.now()+25*60000).toISOString()}} as unknown as Order;
export function advance(){count=count>=route.length?3:count+1;}
export function points(){return route.slice(0,count).map((p,i)=>({...p,received_at:new Date(Date.now()-(count-1-i)*15000).toISOString(),accuracy:15}));}
export async function api(path:string,_opts?:{body?:unknown}){
 if(path==='/orders')return [order];
 if(path.startsWith('/partner/jobs'))return [];
 if(path.includes('/tracking'))return {points:points(),stale:false,note:'Synthetic route simulation only'};
 throw new Error('Simulation blocks all non-fixture requests');
}
export function setTokenProvider(){}
export function setUnauthorizedHandler(){}
