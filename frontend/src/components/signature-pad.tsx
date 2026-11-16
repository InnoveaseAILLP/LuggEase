import {WebView} from 'react-native-webview';
import {signaturePadHTML} from './signature-pad-html';
export function SignaturePad({onChange}: {onChange:(png:string)=>void}) {
  return <WebView source={{html:signaturePadHTML}} originWhitelist={['about:blank']} scrollEnabled={false}
    style={{height:190,backgroundColor:'white'}} onMessage={e=>{
      try {const data=JSON.parse(e.nativeEvent.data);if(typeof data.signature==='string'&&data.signature.length<165000)onChange(data.signature);}catch{}
    }}/>;
}
