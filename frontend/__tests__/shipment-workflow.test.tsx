import React from 'react';
import {fireEvent,render,waitFor} from '@testing-library/react-native';
import {ShipmentWorkflow} from '../src/components/shipment-workflow';
import {api} from '../src/api';
import {downloadDocument} from '../src/invoice-download';
import type {Order} from '../src/types';
jest.mock('../src/api',()=>({api:jest.fn()}));
jest.mock('../src/invoice-download',()=>({downloadDocument:jest.fn()}));
let mockWorkflowRole='customer';
jest.mock('../src/auth',()=>({useAuth:()=>({user:{user_id:mockWorkflowRole==='partner'?'driver':'customer',role:mockWorkflowRole}})}));
beforeEach(()=>{jest.clearAllMocks();mockWorkflowRole='customer';});
jest.mock('@tanstack/react-query',()=>({useQuery:()=>({})}));
jest.mock('../src/theme',()=>({useTheme:()=>({colors:{}})}));
jest.mock('../src/components/invoice-card',()=>({useCatalog:()=>({data:{payment_configuration:{enabled:false}}})}));
jest.mock('../src/components/shipment-tracking',()=>({ShipmentTracking:()=>null}));
jest.mock('../src/components/shipment-map',()=>({ShipmentMap:()=>null}));
jest.mock('../src/components/signature-pad',()=>({SignaturePad:()=>null}));
jest.mock('../src/components/ui',()=>{
 // eslint-disable-next-line @typescript-eslint/no-require-imports
 const R=require('react'),N=require('react-native');
 return {Card:N.View,SectionTitle:N.Text,Input:N.TextInput,space:{sm:8,md:16},inr:String,useToast:()=>jest.fn(),Button:(p:any)=>R.createElement(N.Pressable,{onPress:p.onPress,disabled:p.disabled||p.loading,testID:p.testID||p.title,accessibilityState:{disabled:!!(p.disabled||p.loading)}},R.createElement(N.Text,null,p.title))};
});
test('invoice review cannot request an unissued invoice and becomes available after advance',async()=>{
 const order={order_id:'QA-INVOICE',customer_id:'customer',status:'pending_payment',agreement_id:'QA-AGREEMENT',quote:{grand_total:1916},payment_plan:{advance_paise:95800,balance_paise:95800,total_paise:191600,paid_paise:0}} as Order;
 const v=render(<ShipmentWorkflow order={order} onChanged={jest.fn()}/>);
 expect(v.getByTestId('review-pickup-invoice-button').props.accessibilityState.disabled).toBe(true);
 expect(v.getByText('Your sales invoice will be available after the 50% booking advance is confirmed.')).toBeTruthy();
 fireEvent.press(v.getByTestId('review-pickup-invoice-button'));
 expect(downloadDocument).not.toHaveBeenCalled();
 v.rerender(<ShipmentWorkflow order={{...order,status:'paid',invoice_no:'QA-ISSUED'}} onChanged={jest.fn()}/>);
 expect(v.getByTestId('review-pickup-invoice-button').props.accessibilityState.disabled).toBe(false);
 fireEvent.press(v.getByTestId('review-pickup-invoice-button'));
 await waitFor(()=>expect(downloadDocument).toHaveBeenCalledWith('/orders/QA-INVOICE/pickup-invoice.pdf','QA-INVOICE-Pickup-Invoice'));
});
test('simulated orders display no-money-received guidance and cannot reconcile real payments',()=>{
 const o={order_id:'QA-TEST',customer_id:'customer',is_test:true,status:'paid',invoice_no:'TEST-QA',quote:{grand_total:1916},payment_plan:{advance_paise:95800,balance_paise:95800,total_paise:191600,advance_paid_paise:95800,paid_paise:95800}} as Order;
 const v=render(<ShipmentWorkflow order={o} onChanged={jest.fn()}/>);
 expect(v.getByText(/TEST ORDER — booking advance simulated/)).toBeTruthy();
 expect(v.getByText(/Simulated for testing/)).toBeTruthy();
 expect(v.queryByText('Refresh payment status')).toBeNull();
});

test('revision gives inline reason guidance and submits a valid test time',async()=>{
 const clock=jest.spyOn(Date,'now').mockReturnValue(Date.parse('2026-11-17T10:00:00Z'));
 try{
  mockWorkflowRole='partner';(api as jest.Mock).mockResolvedValue({});
  const o={order_id:'QA-ETA',customer_id:'customer',partner_id:'driver',is_test:true,status:'picked_up',quote:{grand_total:1916}} as Order;
  const v=render(<ShipmentWorkflow order={o} onChanged={jest.fn()}/>);
  fireEvent.changeText(v.getByTestId('delivery-revision-date'),'17-11-2026');fireEvent.press(v.getByTestId('delivery-revision-hour'));fireEvent.press(v.getByTestId('delivery-hour-option-17'));fireEvent.press(v.getByTestId('delivery-revision-minute'));
  fireEvent.press(v.getByTestId('delivery-minute-option-05'));
  fireEvent.changeText(v.getByTestId('delivery-revision-reason'),'T');fireEvent.press(v.getByText('Update customer delivery estimate'));
  await waitFor(()=>expect(v.getByText('Enter at least 4 characters for the revision reason.')).toBeTruthy());expect(api).not.toHaveBeenCalled();
  fireEvent.changeText(v.getByTestId('delivery-revision-reason'),'Test');fireEvent.press(v.getByText('Update customer delivery estimate'));
  await waitFor(()=>expect(api).toHaveBeenCalledWith('/orders/QA-ETA/delivery-estimate',{body:{expected_delivery_at:'2026-11-17T11:35:00.000Z',reason:'Test'}}));
 }finally{clock.mockRestore();}
});
