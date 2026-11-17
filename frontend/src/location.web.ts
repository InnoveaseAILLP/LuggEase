import {UserFacingError} from '@/src/errors';
import {startLocationWatch,type Position} from '@/src/location-watch';
export type {Position} from '@/src/location-watch';
export async function watchShipmentLocation(send:(p:Position)=>void,error:(message:string,fatal?:boolean)=>void):Promise<()=>void>{
 if(!navigator.geolocation)throw new UserFacingError('This browser does not support location sharing.');
 const point=(p:GeolocationPosition):Position=>({latitude:p.coords.latitude,longitude:p.coords.longitude,accuracy:p.coords.accuracy,captured_at:new Date(p.timestamp).toISOString(),mocked:false});
 const options={enableHighAccuracy:true,maximumAge:10000,timeout:60000};
 return startLocationWatch({subscribe:(success,failure)=>{const id=navigator.geolocation.watchPosition(p=>success(point(p)),failure,options);return()=>navigator.geolocation.clearWatch(id);},request:(success,failure)=>navigator.geolocation.getCurrentPosition(p=>success(point(p)),failure,{...options,enableHighAccuracy:false,maximumAge:0,timeout:20000})},send,error);
}
