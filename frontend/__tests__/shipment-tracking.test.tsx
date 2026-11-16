import React from 'react';
import {AppState,type AppStateStatus} from 'react-native';
import {act,fireEvent,render,waitFor} from '@testing-library/react-native';
import {ShipmentTracking} from '../src/components/shipment-tracking';
import {watchShipmentLocation} from '../src/location';
import type {Order,OrderStatus} from '../src/types';
jest.mock('../src/api',()=>({api:jest.fn()}));
jest.mock('../src/location',()=>({watchShipmentLocation:jest.fn()}));
jest.mock('../src/auth',()=>({useAuth:()=>({user:{user_id:'partner-test'}})}));
jest.mock('../src/theme',()=>({useTheme:()=>({colors:{}})}));
jest.mock('../src/components/shipment-map',()=>({ShipmentMap:()=>null}));
const mockTrackingQuery=jest.fn();
jest.mock('@tanstack/react-query',()=>({useQuery:(options:any)=>{mockTrackingQuery(options);return {data:undefined,isError:false};}}));
jest.mock('../src/components/ui',()=>{
 // eslint-disable-next-line @typescript-eslint/no-require-imports
 const R=require('react'),N=require('react-native');
 return {Card:N.View,SectionTitle:N.Text,space:{sm:8},useToast:()=>jest.fn(),Button:(p:any)=>R.createElement(N.Pressable,{onPress:p.onPress,disabled:p.disabled||p.loading},R.createElement(N.Text,null,p.title))};
});
const order=(status:OrderStatus)=>({order_id:'QA-TRACK',partner_id:'partner-test',status}) as Order;
const originalAppState=AppState.currentState;
afterAll(()=>{AppState.currentState=originalAppState;});
beforeEach(()=>{jest.clearAllMocks();AppState.currentState='active';});
afterEach(()=>jest.restoreAllMocks());
test.each(['pending_payment','paid','assigned','picked_up','delivered','cancelled'] as OrderStatus[])('live controls and requests are unavailable for %s',status=>{
 const view=render(<ShipmentTracking order={order(status)}/>);
 expect(view.queryByText('Show live delivery map')).toBeNull();expect(view.queryByText('Share my delivery location')).toBeNull();
 expect(mockTrackingQuery.mock.calls.at(-1)[0].enabled).toBe(false);expect(watchShipmentLocation).not.toHaveBeenCalled();
});
test('live map is enabled only in transit and closes when status changes',()=>{
 const view=render(<ShipmentTracking order={order('in_transit')}/>);
 fireEvent.press(view.getByText('Show live delivery map'));
 expect(mockTrackingQuery.mock.calls.at(-1)[0].enabled).toBe(true);
 view.rerender(<ShipmentTracking order={order('delivered')}/>);
 expect(mockTrackingQuery.mock.calls.at(-1)[0].enabled).toBe(false);expect(view.queryByText('Hide live map')).toBeNull();
});
test('location sharing stops on status change',async()=>{
 const stop=jest.fn();AppState.currentState='active';
 (watchShipmentLocation as jest.Mock).mockResolvedValueOnce(stop);
 const view=render(<ShipmentTracking order={order('in_transit')}/>);
 fireEvent.press(view.getByText('Share my delivery location'));
 await waitFor(()=>expect(view.getByText('Stop sharing my delivery location')).toBeTruthy());
 view.rerender(<ShipmentTracking order={order('delivered')}/>);
 expect(stop).toHaveBeenCalledTimes(1);
});
test('permission result arriving after transit ends cancels the watcher',async()=>{
 const stop=jest.fn();let resolve:(value:()=>void)=>void=()=>{};
 (watchShipmentLocation as jest.Mock).mockReturnValueOnce(new Promise<()=>void>(r=>{resolve=r;}));
 const view=render(<ShipmentTracking order={order('in_transit')}/>);
 fireEvent.press(view.getByText('Share my delivery location'));
 view.rerender(<ShipmentTracking order={order('delivered')}/>);
 await act(async()=>resolve(stop));expect(stop).toHaveBeenCalledTimes(1);
});

test('location sharing stops when the app backgrounds',async()=>{
 const stop=jest.fn();let listener:(state:AppStateStatus)=>void=()=>{};
 jest.spyOn(AppState,'addEventListener').mockImplementation((_type,fn)=>{listener=fn;return {remove:jest.fn()};});
 (watchShipmentLocation as jest.Mock).mockResolvedValueOnce(stop);
 const view=render(<ShipmentTracking order={order('in_transit')}/>);
 fireEvent.press(view.getByText('Share my delivery location'));
 await waitFor(()=>expect(view.getByText('Stop sharing my delivery location')).toBeTruthy());
 act(()=>listener('background'));expect(stop).toHaveBeenCalledTimes(1);
 expect(view.queryByText('Stop sharing my delivery location')).toBeNull();
});
