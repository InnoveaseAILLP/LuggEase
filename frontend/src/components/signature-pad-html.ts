export const signaturePadHTML = `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1"><style>body{margin:0;background:white;font:14px sans-serif}canvas{width:100%;height:140px;touch-action:none;border-bottom:1px solid #bbb}button{margin:5px;padding:6px}small{color:#555}</style></head><body><canvas width="800" height="280" aria-label="Customer handwritten signature"></canvas><button type="button">Clear signature</button><small>Sign by hand inside the box</small><script>
const canvas=document.querySelector('canvas'), ctx=canvas.getContext('2d');let drawing=false,ink=false;
ctx.fillStyle='white';ctx.fillRect(0,0,800,280);ctx.strokeStyle='#222';ctx.lineWidth=3;ctx.lineCap='round';
function point(e){const r=canvas.getBoundingClientRect();return [(e.clientX-r.left)*800/r.width,(e.clientY-r.top)*280/r.height]}
function send(){const data=ink?canvas.toDataURL('image/png'):'';if(window.ReactNativeWebView)window.ReactNativeWebView.postMessage(JSON.stringify({signature:data}));else{const target=(!location.origin||location.origin==='null')?'*':location.origin;parent.postMessage({signature:data},target)}}
canvas.onpointerdown=e=>{drawing=true;canvas.setPointerCapture(e.pointerId);ctx.beginPath();ctx.moveTo(...point(e));e.preventDefault()};
canvas.onpointermove=e=>{if(drawing){ctx.lineTo(...point(e));ctx.stroke();ink=true;e.preventDefault()}};
canvas.onpointerup=()=>{drawing=false;send()};canvas.onpointercancel=()=>{drawing=false;send()};
document.querySelector('button').onclick=()=>{ctx.fillStyle='white';ctx.fillRect(0,0,800,280);ink=false;send()};
</script></body></html>`;
