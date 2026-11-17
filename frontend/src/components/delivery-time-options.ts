export const DELIVERY_HOURS=Array.from({length:24},(_,i)=>String(i).padStart(2,'0'));
export const DELIVERY_MINUTES=Array.from({length:60},(_,i)=>String(i).padStart(2,'0'));
export type DeliveryTimeSelectProps={value:string;onChange:(value:string)=>void;disabled?:boolean};
