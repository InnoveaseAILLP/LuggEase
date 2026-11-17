import {UserFacingError} from '@/src/errors';
import Geolocation from '@react-native-community/geolocation';
import {PermissionsAndroid,Platform} from 'react-native';
import {startLocationWatch,type Position} from '@/src/location-watch';
export type {Position} from '@/src/location-watch';
export async function watchShipmentLocation(send:(p:Position)=>void,error:(message:string,fatal?:boolean)=>void):Promise<()=>void>{
 if(Platform.OS==='android'){
  const result=await PermissionsAndroid.requestMultiple([PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION]);
  if(result[PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION]!==PermissionsAndroid.RESULTS.GRANTED)throw new UserFacingError('Precise location permission is needed to share this delivery location.');
 }
 Geolocation.setRNConfiguration({skipPermissionRequests:Platform.OS==='android',authorizationLevel:'whenInUse',enableBackgroundLocationUpdates:false});
 type NativePosition=Parameters<Parameters<typeof Geolocation.getCurrentPosition>[0]>[0];
 const point=(p:NativePosition):Position=>({latitude:p.coords.latitude,longitude:p.coords.longitude,accuracy:p.coords.accuracy,captured_at:new Date(p.timestamp).toISOString(),mocked:'mocked' in p&&p.mocked===true});
 const options={enableHighAccuracy:true,maximumAge:10000,timeout:60000};
 return startLocationWatch({subscribe:(success,failure)=>{const id=Geolocation.watchPosition(p=>success(point(p)),failure,{...options,distanceFilter:0,interval:15000,fastestInterval:15000});return()=>Geolocation.clearWatch(id);},request:(success,failure)=>Geolocation.getCurrentPosition(p=>success(point(p)),failure,{...options,enableHighAccuracy:false,maximumAge:0,timeout:20000})},send,error);
}
