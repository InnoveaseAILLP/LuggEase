import {useEffect,useRef} from 'react';
const origin='https://luggease.innovease-ai.in';
export function ShipmentMap({points}:{points:{latitude:number;longitude:number}[]}){
 const ref=useRef<HTMLIFrameElement>(null);
 const send=()=>ref.current?.contentWindow?.postMessage({type:'shipment-points',points},origin);
 useEffect(send,[points]);
 return <iframe ref={ref} title="Live shipment location map" src={origin+'/tracking-map.html'} onLoad={send} style={{height:270,width:'100%',border:0}}/>;
}
