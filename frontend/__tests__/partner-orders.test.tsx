import React from 'react';
import {act,fireEvent,render,waitFor} from '@testing-library/react-native';
import Orders from '../app/(tabs)/orders';
import {api} from '../src/api';
jest.mock('../src/api',()=>({api:jest.fn()}));
const mockPush=jest.fn(),mockInvalidate=jest.fn().mockResolvedValue(undefined),mockProfile=jest.fn().mockResolvedValue(undefined),mockRefetch=jest.fn();
let mockUser:any,mockJobs:any[],mockMine:any[],mockTest:any[],mockFailure=false;
jest.mock('../src/auth',()=>({useAuth:()=>({user:mockUser,refresh:mockProfile})}));
jest.mock('../src/router',()=>({useRouter:()=>({push:mockPush})}));
jest.mock('react-native-safe-area-context',()=>({useSafeAreaInsets:()=>({top:0,bottom:0})}));
jest.mock('../src/theme',()=>({useTheme:()=>({colors:{}}),makeStyles:()=>()=>({})}));
jest.mock('../src/components/brand-icon',()=>({BrandIcon:()=>null}));
jest.mock('../src/components/shipment-tracking',()=>({ShipmentTracking:()=>null}));
jest.mock('@tanstack/react-query',()=>({useQuery:(options:any)=>({data:options.queryKey[0]==='orders'?mockMine:options.queryKey[1]==='test'?mockTest:mockJobs,isLoading:false,isError:mockFailure,refetch:mockRefetch}),useQueryClient:()=>({invalidateQueries:mockInvalidate})}));
jest.mock('../src/components/order-card',()=>({OrderCard:(p:any)=>{
 // eslint-disable-next-line @typescript-eslint/no-require-imports
 const R=require('react'),N=require('react-native');return R.createElement(N.View,null,R.createElement(N.Text,null,p.order.order_id),p.footer);
}}));
jest.mock('../src/components/ui',()=>{
 // eslint-disable-next-line @typescript-eslint/no-require-imports
 const R=require('react'),N=require('react-native');return {Icon:()=>null,useToast:()=>jest.fn(),space:{sm:8,md:12,lg:16,xl:24,xxxl:48},radius:{lg:20},Button:(p:any)=>R.createElement(N.Pressable,{testID:p.testID,onPress:p.onPress,disabled:p.disabled||p.loading},R.createElement(N.Text,null,p.title))};
});
beforeEach(()=>{jest.clearAllMocks();mockFailure=false;mockUser={user_id:'driver',role:'partner',partner_status:'approved'};mockJobs=[{order_id:'OPEN',status:'paid'}];mockMine=[{order_id:'MINE',status:'assigned'}];mockTest=[{order_id:'TEST',status:'paid',is_test:true}];(api as jest.Mock).mockResolvedValue({});});
test('Orders defaults to available jobs and lets the partner accept a movement order',async()=>{
 const v=render(<Orders/>);expect(v.getByText('OPEN')).toBeTruthy();expect(v.queryByText('MINE')).toBeNull();
 await act(async()=>{fireEvent.press(v.getByTestId('orders-accept-OPEN'));});
 expect(api).toHaveBeenCalledWith('/orders/OPEN/accept',{method:'POST'});expect(mockInvalidate).toHaveBeenCalledWith({queryKey:['orders']});expect(mockInvalidate).toHaveBeenCalledWith({queryKey:['jobs']});expect(mockPush).toHaveBeenCalledWith('/order/OPEN');
 expect(v.getByText('MINE')).toBeTruthy();expect(v.queryByTestId('orders-accept-MINE')).toBeNull();
});
test('invited simulations have a separate Test jobs tab and explicit test action',()=>{
 const v=render(<Orders/>);fireEvent.press(v.getByTestId('partner-orders-test'));expect(v.getByText('TEST')).toBeTruthy();expect(v.queryByText('OPEN')).toBeNull();expect(v.getByText('Accept test job')).toBeTruthy();
});
test('pending profiles cannot see real offers even if cached offers exist',()=>{
 mockUser.partner_status='pending';const v=render(<Orders/>);expect(v.queryByText('OPEN')).toBeNull();expect(v.getByText('Your partner profile must be approved before you can accept real jobs.')).toBeTruthy();
});
test('an already accepted or stale offer refreshes the listing instead of claiming success',async()=>{
 (api as jest.Mock).mockRejectedValue(new Error('conflict'));const v=render(<Orders/>);
 await act(async()=>{fireEvent.press(v.getByTestId('orders-accept-OPEN'));});await waitFor(()=>expect(mockRefetch).toHaveBeenCalled());expect(mockPush).not.toHaveBeenCalled();
});
test('customer Orders remains their own bookings without partner offer controls',()=>{
 mockUser={user_id:'customer',role:'customer'};const v=render(<Orders/>);expect(v.getByText('My bookings')).toBeTruthy();expect(v.queryByTestId('partner-orders-available')).toBeNull();expect(v.getByText('MINE')).toBeTruthy();
});
