export type Position={latitude:number;longitude:number;accuracy:number;captured_at:string;mocked:boolean};
export async function watchShipmentLocation(send:(p:Position)=>void,error:(message:string)=>void):Promise<()=>void> {
  if(!navigator.geolocation)throw new Error('This browser does not support location sharing.');
  const id=navigator.geolocation.watchPosition(p=>send({latitude:p.coords.latitude,longitude:p.coords.longitude,accuracy:p.coords.accuracy,captured_at:new Date(p.timestamp).toISOString(),mocked:false}),e=>error(e.message),{enableHighAccuracy:true,maximumAge:10000,timeout:20000});
  return()=>navigator.geolocation.clearWatch(id);
}
