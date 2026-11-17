import React from 'react';
import {act,fireEvent,render,waitFor} from '@testing-library/react-native';
import {PayButton} from '../src/components/pay-button.web';
import {loadCheckout} from '../src/razorpay-checkout.web';
import {api} from '../src/api';
import {UserFacingError} from '../src/errors';
jest.mock('../src/razorpay-checkout.web',()=>({loadCheckout:jest.fn()}));
jest.mock('../src/api',()=>({api:jest.fn()}));
jest.mock('../src/components/ui',()=>{
 // eslint-disable-next-line @typescript-eslint/no-require-imports
 const R=require('react'),N=require('react-native');
 return {useToast:()=>jest.fn(),Button:(p:any)=>R.createElement(N.Pressable,{testID:p.testID,onPress:p.onPress,disabled:p.disabled||p.loading,accessibilityState:{disabled:!!(p.disabled||p.loading)}},R.createElement(N.Text,null,p.title))};
});
let open:jest.Mock;
beforeEach(()=>{
 jest.clearAllMocks();open=jest.fn();(global as any).window={Razorpay:jest.fn(()=>({on:jest.fn(),open}))};
 (loadCheckout as jest.Mock).mockResolvedValue(undefined);
 (api as jest.Mock).mockResolvedValue({key_id:'test-placeholder',amount:95800,currency:'INR',order_id:'QA',razorpay_order_id:'rzp_QA'});
});
afterEach(()=>{delete (global as any).window;});
test('merchant-ready checkout stays actionable and opens the correct server-priced advance',async()=>{
 const v=render(<PayButton orderId="QA" amountLabel="₹958.00" stage="advance" onDone={jest.fn()}/>);
 expect(v.getByTestId('pay-now-button').props.accessibilityState.disabled).toBe(false);
 await act(async()=>{fireEvent.press(v.getByTestId('pay-now-button'));});
 expect(api).toHaveBeenCalledWith('/payments/create',{body:{order_id:'QA',stage:'advance'}});
 expect((global as any).window.Razorpay).toHaveBeenCalledWith(expect.objectContaining({amount:95800,order_id:'rzp_QA'}));expect(open).toHaveBeenCalledTimes(1);
});
test('checkout loading failure reports recovery instructions and the next click can retry',async()=>{
 const v=render(<PayButton orderId="QA" amountLabel="₹958.00" stage="advance" onDone={jest.fn()}/>);
 await act(async()=>{});
 (loadCheckout as jest.Mock).mockRejectedValueOnce(new UserFacingError('Secure checkout could not load. Try the payment button again.'));
 await act(async()=>{fireEvent.press(v.getByTestId('pay-now-button'));});
 expect(v.getByText('Secure checkout could not load. Try the payment button again.')).toBeTruthy();
 expect(v.getByTestId('pay-now-button').props.accessibilityState.disabled).toBe(false);expect(api).not.toHaveBeenCalled();
 await act(async()=>{fireEvent.press(v.getByTestId('pay-now-button'));});await waitFor(()=>expect(open).toHaveBeenCalledTimes(1));
});
test('unconfigured merchants cannot start checkout or create a payment',()=>{
 const v=render(<PayButton orderId="QA" amountLabel="₹958.00" stage="advance" disabled onDone={jest.fn()}/>);
 fireEvent.press(v.getByTestId('pay-now-button'));expect(loadCheckout).not.toHaveBeenCalled();expect(api).not.toHaveBeenCalled();
});
