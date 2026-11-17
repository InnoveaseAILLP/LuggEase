import {errorCode,locationErrorMessage} from '@/src/errors';
export type Position={latitude:number;longitude:number;accuracy:number;captured_at:string;mocked:boolean};
type Success=(point:Position)=>void;
type Failure=(error:unknown)=>void;
export type LocationDriver={subscribe:(success:Success,error:Failure)=>(()=>void);request:(success:Success,error:Failure)=>void};
/** Fresh foreground fixes keep stationary deliveries from appearing stale. Cleanup stops both sources. */
export function startLocationWatch(driver:LocationDriver,send:Success,error:(message:string,fatal?:boolean)=>void):()=>void{
 let lastUsable:number|null=null;
 let active=true,pending=false,cancel:(()=>void)|null=null,timer:ReturnType<typeof setInterval>|null=null;
 const stop=()=>{if(!active)return;active=false;if(timer)clearInterval(timer);cancel?.();};
 const success:Success=point=>{if(active){if(Number.isFinite(point.accuracy)&&point.accuracy>=0&&point.accuracy<=250)lastUsable=Date.now();send(point);}};
 const failure:Failure=failure=>{
  if(!active)return;
  const fatal=Number(errorCode(failure))===1;
  if(fatal||lastUsable===null||Date.now()-lastUsable>40000)error(locationErrorMessage(failure),fatal);
  if(fatal)stop();
 };
 cancel=driver.subscribe(success,failure);
 if(!active){cancel();return()=>{};}
 const request=()=>{
  if(!active||pending)return;
  pending=true;
  try{driver.request(point=>{pending=false;success(point);},failureValue=>{pending=false;failure(failureValue);});}
  catch(failureValue){pending=false;failure(failureValue);}
 };
 // Ask immediately as well as watching: the watch may wait for a satellite fix.
 request();
 if(active)timer=setInterval(request,20000);
 return stop;
}
