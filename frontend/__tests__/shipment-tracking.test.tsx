import React from 'react';
import {AppState,type AppStateStatus} from 'react-native';
import {act,fireEvent,render,waitFor} from '@testing-library/react-native';
import {ShipmentTracking} from '../src/components/shipment-tracking';
import {api} from '../src/api';
import {watchShipmentLocation} from '../src/location';
import type {Order,OrderStatus} from '../src/types';
jest.mock('../src/api',()=>({api:jest.fn()}));
jest.mock('../src/location',()=>({watchShipmentLocation:jest.fn()}));
let mockTrackingUser='partner-test';
jest.mock('../src/auth',()=>({useAuth:()=>({user:{user_id:mockTrackingUser}})}));
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
beforeEach(()=>{jest.clearAllMocks();AppState.currentState='active';mockTrackingUser='partner-test';(api as jest.Mock).mockResolvedValue({});});
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

const fix={latitude:11.01,longitude:77.00,accuracy:15,captured_at:new Date().toISOString(),mocked:false};
test('the first synchronous GPS fix is posted before watcher setup finishes',async()=>{
 (watchShipmentLocation as jest.Mock).mockImplementationOnce(send=>{send(fix);return Promise.resolve(jest.fn());});
 const view=render(<ShipmentTracking order={order('in_transit')}/>);fireEvent.press(view.getByText('Share my delivery location'));
 await waitFor(()=>expect(api).toHaveBeenCalledWith('/orders/QA-TRACK/tracking',{body:fix}));
 await waitFor(()=>expect(view.getByText('Your location was sent to the customer. Keep this screen open for live updates.')).toBeTruthy());
});
test('the owning customer opens and fetches the map automatically',()=>{
 mockTrackingUser='customer';const view=render(<ShipmentTracking order={{...order('in_transit'),customer_id:'customer'}}/>);
 expect(view.getByText('Hide live map')).toBeTruthy();expect(mockTrackingQuery.mock.calls.at(-1)[0].enabled).toBe(true);expect(view.queryByText('Share my delivery location')).toBeNull();
});
test('imprecise positions never show successful sharing',async()=>{
 (watchShipmentLocation as jest.Mock).mockImplementationOnce(send=>{send({...fix,accuracy:5000});return Promise.resolve(jest.fn());});
 const view=render(<ShipmentTracking order={order('in_transit')}/>);fireEvent.press(view.getByText('Share my delivery location'));
 await waitFor(()=>expect(view.getByText(/Your location is too approximate/)).toBeTruthy());expect(api).not.toHaveBeenCalled();expect(view.queryByText(/Your location was sent/)).toBeNull();
});
test('a fix during an inactive permission prompt is deferred until active, never lost or sent in background',async()=>{
 let listener:(state:AppStateStatus)=>void=()=>{},send:(p:typeof fix)=>void=()=>{};
 jest.spyOn(AppState,'addEventListener').mockImplementation((_type,fn)=>{listener=fn;return {remove:jest.fn()};});
 (watchShipmentLocation as jest.Mock).mockImplementationOnce(callback=>{send=callback;return Promise.resolve(jest.fn());});
 const view=render(<ShipmentTracking order={order('in_transit')}/>);fireEvent.press(view.getByText('Share my delivery location'));
 await waitFor(()=>expect(view.getByText('Stop sharing my delivery location')).toBeTruthy());
 act(()=>{listener('inactive');send(fix);});expect(api).not.toHaveBeenCalled();
 act(()=>listener('active'));await waitFor(()=>expect(api).toHaveBeenCalledWith('/orders/QA-TRACK/tracking',{body:fix}));
});

test('retry cancels the failed watcher before starting a fresh source',async()=>{
 const cancel=jest.fn();
 (watchShipmentLocation as jest.Mock).mockImplementationOnce((_send,failure)=>{failure('GPS timeout',false);return Promise.resolve(cancel);}).mockResolvedValueOnce(jest.fn());
 const view=render(<ShipmentTracking order={order('in_transit')}/>);fireEvent.press(view.getByText('Share my delivery location'));
 await waitFor(()=>expect(view.getByText('Retry location')).toBeTruthy());fireEvent.press(view.getByText('Retry location'));
 await waitFor(()=>expect(watchShipmentLocation).toHaveBeenCalledTimes(2));expect(cancel).toHaveBeenCalledTimes(1);expect(view.queryByText('GPS timeout')).toBeNull();
});
