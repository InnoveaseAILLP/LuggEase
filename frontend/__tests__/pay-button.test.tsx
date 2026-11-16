import React from 'react';
import {fireEvent,render,waitFor} from '@testing-library/react-native';
import {PayButton} from '../src/components/pay-button';
import {api} from '../src/api';
jest.mock('../src/api',()=>({api:jest.fn()}));
jest.mock('react-native-safe-area-context',()=>({useSafeAreaInsets:()=>({top:0,bottom:0})}));
jest.mock('../src/theme',()=>({useTheme:()=>({colors:{}})}));
jest.mock('react-native-webview',()=>{
 // eslint-disable-next-line @typescript-eslint/no-require-imports
 const R=require('react'),N=require('react-native');
 return {WebView:(p:any)=>R.createElement(N.View,{...p,testID:'checkout-webview'})};
});
const mockPaymentToast=jest.fn();
jest.mock('../src/components/ui',()=>{
 // eslint-disable-next-line @typescript-eslint/no-require-imports
 const R=require('react'),N=require('react-native');
 return {space:{md:16},radius:{pill:100},Icon:()=>null,useToast:()=>mockPaymentToast,Button:(p:any)=>R.createElement(N.Pressable,{testID:p.testID,onPress:p.onPress,disabled:p.disabled||p.loading,accessibilityState:{disabled:!!(p.disabled||p.loading),busy:!!p.loading}},R.createElement(N.Text,null,p.title))};
});
const checkout={key_id:'rzp_test_synthetic',razorpay_order_id:'order_synthetic',amount:2350,currency:'INR',order_id:'QA-1',stage:'advance',name:'</script><script>unsafe()</script>',email:'sandbox@example.com',contact:''};
beforeEach(()=>{jest.clearAllMocks();});
test('disabled merchant configuration prevents starting checkout',()=>{
 const view=render(<PayButton orderId="QA-1" amountLabel="₹23.50" stage="advance" disabled onDone={jest.fn()}/>);
 fireEvent.press(view.getByTestId('pay-now-button'));expect(api).not.toHaveBeenCalled();
});
test('native receipt is verified before success and customer data is escaped',async()=>{
 const done=jest.fn();(api as jest.Mock).mockResolvedValueOnce(checkout).mockResolvedValueOnce({});
 const view=render(<PayButton orderId="QA-1" amountLabel="₹23.50" stage="advance" onDone={done}/>);
 fireEvent.press(view.getByTestId('pay-now-button'));
 await waitFor(()=>expect(view.getByTestId('checkout-webview')).toBeTruthy());
 expect(api).toHaveBeenCalledWith('/payments/create',{body:{order_id:'QA-1',stage:'advance'}});
 expect(view.getByTestId('checkout-webview').props.source.html).not.toContain(checkout.name);expect(done).not.toHaveBeenCalled();
 const receipt={razorpay_order_id:'order_synthetic',razorpay_payment_id:'pay_synthetic',razorpay_signature:'synthetic'};
 fireEvent(view.getByTestId('checkout-webview'),'message',{nativeEvent:{data:JSON.stringify({type:'receipt',data:receipt})}});
 await waitFor(()=>expect(mockPaymentToast).toHaveBeenCalledWith('Payment verified.','success'));
 expect(api).toHaveBeenCalledWith('/payments/verify',{body:receipt});expect(done).toHaveBeenCalledTimes(1);
});
test('verification failure reports an error and refreshes status',async()=>{
 const done=jest.fn();(api as jest.Mock).mockResolvedValueOnce({...checkout,stage:'balance'}).mockRejectedValueOnce(new Error('Provider receipt mismatch'));
 const view=render(<PayButton orderId="QA-1" amountLabel="₹23.50" stage="balance" onDone={done}/>);
 fireEvent.press(view.getByTestId('pay-now-button'));
 await waitFor(()=>expect(view.getByTestId('checkout-webview')).toBeTruthy());
 fireEvent(view.getByTestId('checkout-webview'),'message',{nativeEvent:{data:JSON.stringify({type:'receipt',data:{}})}});
 await waitFor(()=>expect(mockPaymentToast).toHaveBeenCalledWith('Provider receipt mismatch','error'));
 expect(mockPaymentToast).not.toHaveBeenCalledWith('Payment verified.','success');expect(done).toHaveBeenCalledTimes(1);
 expect(view.getByTestId('pay-now-button').props.accessibilityState.busy).toBe(false);
});
test('checkout creation errors permit a retry',async()=>{
 (api as jest.Mock).mockRejectedValueOnce(new Error('Merchant unavailable'));
 const view=render(<PayButton orderId="QA-1" amountLabel="₹23.50" stage="advance" onDone={jest.fn()}/>);
 fireEvent.press(view.getByTestId('pay-now-button'));
 await waitFor(()=>expect(mockPaymentToast).toHaveBeenCalledWith('Merchant unavailable','error'));
 expect(view.queryByTestId('checkout-webview')).toBeNull();expect(view.getByTestId('pay-now-button').props.accessibilityState.busy).toBe(false);
});
