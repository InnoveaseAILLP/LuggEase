import {advance,points} from './data';
export async function watchShipmentLocation(send:(p:unknown)=>void){
 const id=setInterval(()=>{advance();send(points().at(-1));},5000);
 return()=>clearInterval(id);
}
