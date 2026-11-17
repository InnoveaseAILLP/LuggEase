import React from 'react';
import {AppState} from 'react-native';
import {fireEvent,render,waitFor} from '@testing-library/react-native';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {ShipmentTracking} from '../src/components/shipment-tracking';
import {api} from '../src/api';
import {watchShipmentLocation} from '../src/location';
import type {Order} from '../src/types';
jest.mock('../src/api',()=>({api:jest.fn()}));
jest.mock('../src/location',()=>({watchShipmentLocation:jest.fn()}));
let mockUser='partner';
jest.mock('../src/auth',()=>({useAuth:()=>({user:{user_id:mockUser}})}));
jest.mock('../src/theme',()=>({useTheme:()=>({colors:{}})}));
jest.mock('../src/components/shipment-map',()=>({ShipmentMap:(p:any)=>{
 // eslint-disable-next-line @typescript-eslint/no-require-imports
 return require('react').createElement(require('react-native').Text,{testID:'received-map'},`${p.points.length} shared locations`);
}}));
jest.mock('../src/components/ui',()=>{
 // eslint-disable-next-line @typescript-eslint/no-require-imports
 const R=require('react'),N=require('react-native');return {Card:N.View,SectionTitle:N.Text,space:{sm:8},useToast:()=>jest.fn(),Button:(p:any)=>R.createElement(N.Pressable,{onPress:p.onPress,disabled:p.disabled||p.loading},R.createElement(N.Text,null,p.title))};
});
test('a newly logged-in customer sees the partner’s first shared point without a Show map click',async()=>{
 const previous=AppState.currentState;AppState.currentState='active';const stored:any[]=[];const stop=jest.fn();
 const partnerClient=new QueryClient({defaultOptions:{queries:{retry:false,gcTime:0}}});const customerClient=new QueryClient({defaultOptions:{queries:{retry:false,gcTime:0}}});
 const o={order_id:'QA-SHARED',partner_id:'partner',customer_id:'customer',status:'in_transit'} as Order;
 (api as jest.Mock).mockImplementation(async(_path,options)=>{if(options?.body){stored.push({...options.body,received_at:new Date().toISOString()});return {received_at:stored[0].received_at};}return {points:[...stored],stale:false,note:'Test'};});
 (watchShipmentLocation as jest.Mock).mockImplementation(send=>{send({latitude:11.01,longitude:77,accuracy:12,captured_at:new Date().toISOString(),mocked:false});return Promise.resolve(stop);});
 try{
  mockUser='partner';const driver=render(<QueryClientProvider client={partnerClient}><ShipmentTracking order={o}/></QueryClientProvider>);
  fireEvent.press(driver.getByText('Share my delivery location'));await waitFor(()=>expect(stored).toHaveLength(1));driver.unmount();expect(stop).toHaveBeenCalledTimes(1);
  mockUser='customer';const customer=render(<QueryClientProvider client={customerClient}><ShipmentTracking order={o}/></QueryClientProvider>);
  await waitFor(()=>expect(customer.getByTestId('received-map')).toBeTruthy());expect(customer.getByText('1 shared locations')).toBeTruthy();expect(customer.getByText('Hide live map')).toBeTruthy();expect(customer.queryByText('Share my delivery location')).toBeNull();customer.unmount();
 }finally{partnerClient.clear();customerClient.clear();AppState.currentState=previous;}
});
