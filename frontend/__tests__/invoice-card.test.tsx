import React from 'react';
import {fireEvent, render, waitFor} from '@testing-library/react-native';
import {InvoiceCard} from '../src/components/invoice-card';
import {useAuth} from '../src/auth';
import {downloadInvoice} from '../src/invoice-download';
jest.mock('../src/auth',()=>({useAuth:jest.fn()}));
jest.mock('../src/invoice-download',()=>({downloadInvoice:jest.fn().mockResolvedValue('Downloaded')}));
jest.mock('@tanstack/react-query',()=>({useQuery:()=>({data:undefined})}));
jest.mock('../src/theme',()=>({useTheme:()=>({colors:{}})}));
jest.mock('../src/components/ui',()=>{
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const R=require('react'), N=require('react-native');
  return {Card:N.View,Row:()=>null,inr:String,space:{md:12,sm:8},useToast:()=>jest.fn(),
    Button:(props:any)=>R.createElement(N.Pressable,{onPress:props.onPress,testID:props.testID},R.createElement(N.Text,null,props.title))};
});
const quote:any={gst:{igst_rate:0},charges:[],round_off:0,grand_total:100};
const order:any={order_id:'order1',customer_id:'alice',customer_email:'alice@example.com',invoice_no:'LE/001',invoice_date:'2026-11-15'};
test('paid owner can download invoice; unpaid and other users see no download control', async()=>{
  (useAuth as jest.Mock).mockReturnValue({user:{user_id:'alice',role:'customer'}});
  const view=render(<InvoiceCard quote={quote} order={order}/>);
  fireEvent.press(view.getByTestId('download-sales-invoice'));
  await waitFor(()=>expect(downloadInvoice).toHaveBeenCalledWith('order1','LE/001'));
  view.rerender(<InvoiceCard quote={quote} order={{...order,invoice_no:null}}/>);
  expect(view.queryByTestId('download-sales-invoice')).toBeNull();
  (useAuth as jest.Mock).mockReturnValue({user:{user_id:'bob',role:'customer'}});
  view.rerender(<InvoiceCard quote={quote} order={order}/>);
  expect(view.queryByTestId('download-sales-invoice')).toBeNull();
  (useAuth as jest.Mock).mockReturnValue({user:{user_id:'admin',role:'admin'}});
  view.rerender(<InvoiceCard quote={quote} order={order}/>);
  expect(view.getByTestId('download-sales-invoice')).toBeTruthy();
});
