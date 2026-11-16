import {useEffect,useRef} from 'react';
import {WebView} from 'react-native-webview';
const url='https://luggease.innovease-ai.in/tracking-map.html';
export function ShipmentMap({points}:{points:{latitude:number;longitude:number}[]}){
  const ref=useRef<WebView<object>>(null);
  const script=`window.setShipmentPoints(${JSON.stringify(points)});true;`;
  useEffect(()=>{ref.current?.injectJavaScript(script);},[script]);
  return <WebView<object> ref={ref} source={{uri:url}} style={{height:270}} originWhitelist={['https://luggease.innovease-ai.in']}
    onLoadEnd={()=>ref.current?.injectJavaScript(script)} injectedJavaScript={script}
    onShouldStartLoadWithRequest={r=>r.url===url||r.url==='about:blank'}/>;
}
