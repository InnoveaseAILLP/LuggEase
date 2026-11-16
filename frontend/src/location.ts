import Geolocation from '@react-native-community/geolocation';
import {PermissionsAndroid,Platform} from 'react-native';
export type Position={latitude:number;longitude:number;accuracy:number;captured_at:string;mocked:boolean};
export async function watchShipmentLocation(send:(p:Position)=>void,error:(message:string)=>void):Promise<()=>void> {
  if(Platform.OS==='android'){
    const result=await PermissionsAndroid.requestMultiple([PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION]);
    if(result[PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION]!==PermissionsAndroid.RESULTS.GRANTED)throw new Error('Precise location permission is needed to share this delivery location.');
  }
  Geolocation.setRNConfiguration({skipPermissionRequests:Platform.OS==='android',authorizationLevel:'whenInUse',enableBackgroundLocationUpdates:false});
  const id=Geolocation.watchPosition(p=>send({latitude:p.coords.latitude,longitude:p.coords.longitude,accuracy:p.coords.accuracy,captured_at:new Date(p.timestamp).toISOString(),mocked:'mocked' in p&&p.mocked===true}),e=>error(e.message),{enableHighAccuracy:true,distanceFilter:0,interval:15000,fastestInterval:15000,maximumAge:10000});
  return()=>Geolocation.clearWatch(id);
}
