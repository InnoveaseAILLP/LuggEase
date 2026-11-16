import {useEffect,useRef} from 'react';
import {signaturePadHTML} from './signature-pad-html';
export function SignaturePad({onChange}: {onChange:(png:string)=>void}) {
  const frame=useRef<HTMLIFrameElement>(null);
  useEffect(()=>{const receive=(e:MessageEvent)=>{
    if(e.source===frame.current?.contentWindow&&e.origin===window.location.origin&&typeof e.data?.signature==='string'&&e.data.signature.length<165000)onChange(e.data.signature);
  };window.addEventListener('message',receive);return()=>window.removeEventListener('message',receive);},[onChange]);
  return <iframe title="Customer handwritten signature" ref={frame} srcDoc={signaturePadHTML} style={{height:190,width:'100%',border:'1px solid #ddd',background:'white'}}/>;
}
