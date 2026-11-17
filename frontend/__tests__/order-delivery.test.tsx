import React from 'react';
import {fireEvent,render,waitFor} from '@testing-library/react-native';
import OrderDetail from '../app/order/[id]';
import {api} from '../src/api';
jest.mock('../src/api',()=>({api:jest.fn()}));
jest.mock('../src/router',()=>({useLocalSearchParams:()=>({id:'QA-ORDER'}),useRouter:()=>({back:jest.fn(),canGoBack:()=>true})}));
jest.mock('react-native-safe-area-context',()=>({useSafeAreaInsets:()=>({bottom:0})}));
jest.mock('react-native-keyboard-controller',()=>{
 // eslint-disable-next-line @typescript-eslint/no-require-imports
 const N=require('react-native');return {KeyboardAwareScrollView:N.ScrollView,KeyboardStickyView:N.View};
});
jest.mock('../src/theme',()=>({useTheme:()=>({colors:{}}),makeStyles:()=>()=>({})}));
let mockRole='partner';
jest.mock('../src/auth',()=>({useAuth:()=>({user:{user_id:mockRole==='partner'?'driver':'customer',role:mockRole}})}));
let mockOrder:any;
const mockRefresh=jest.fn();
jest.mock('@tanstack/react-query',()=>({useQuery:(options:any)=>options.queryKey[0]==='order'?{data:mockOrder,refetch:mockRefresh}:{data:[]},useQueryClient:()=>({invalidateQueries:jest.fn()})}));
jest.mock('../src/components/shipment-workflow',()=>({ShipmentWorkflow:()=>null}));
jest.mock('../src/components/invoice-card',()=>({InvoiceCard:()=>null,useCatalog:()=>({data:{payment_configuration:{enabled:false}}})}));
jest.mock('../src/components/pay-button',()=>({PayButton:()=>null}));
jest.mock('../src/components/ui',()=>{
 // eslint-disable-next-line @typescript-eslint/no-require-imports
 const R=require('react'),N=require('react-native');
 return {Card:N.View,SectionTitle:N.Text,ScreenHeader:()=>null,Icon:()=>null,StatusBadge:()=>null,Row:()=>null,inr:String,useToast:()=>jest.fn(),space:{sm:8,md:16,lg:24,xl:32},radius:{pill:100},STATUS_LABEL:{},Input:(p:any)=>R.createElement(N.TextInput,p),Button:(p:any)=>R.createElement(N.Pressable,{testID:p.testID,onPress:p.onPress,disabled:p.disabled||p.loading,accessibilityState:{disabled:!!(p.disabled||p.loading)}},R.createElement(N.Text,null,p.title))};
});
beforeEach(()=>{jest.clearAllMocks();(api as jest.Mock).mockResolvedValue({});mockRole='partner';mockOrder={order_id:'QA-ORDER',customer_id:'customer',partner_id:'driver',status:'in_transit',requires_delivery_signature:true,created_at:'2026-11-16',pickup_address:'Public Pickup',drop_address:'Public Drop',pickup_state:'Tamil Nadu',drop_state:'Tamil Nadu',timeline:[],quote:{items:[],service_type:'shift_only',vehicle:{name:'Mini Truck'},distance_km:10,total_weight_kg:70,hours:1}};});
test('partner cannot mark Delivered before the final customer signature',async()=>{
 const view=render(<OrderDetail/>);fireEvent.press(view.getByTestId('order-next-status-button'));expect(api).not.toHaveBeenCalled();
 mockOrder={...mockOrder,delivery_signature_completed_at:'2026-11-16T12:00:00Z'};view.rerender(<OrderDetail/>);
 fireEvent.press(view.getByTestId('order-next-status-button'));
 await waitFor(()=>expect(api).toHaveBeenCalledWith('/orders/QA-ORDER/status',{method:'POST',body:{status:'delivered',otp:undefined}}));
});
test('partner pickup requires the customer OTP and then starts the trip',async()=>{
 mockOrder={...mockOrder,status:'assigned'};const view=render(<OrderDetail/>);
 fireEvent.changeText(view.getByTestId('pickup-otp-input'),'1234');fireEvent.press(view.getByTestId('order-next-status-button'));
 await waitFor(()=>expect(api).toHaveBeenCalledWith('/orders/QA-ORDER/status',{method:'POST',body:{status:'picked_up',otp:'1234'}}));
 mockOrder={...mockOrder,status:'picked_up'};view.rerender(<OrderDetail/>);
 fireEvent.press(view.getByTestId('order-next-status-button'));
 await waitFor(()=>expect(api).toHaveBeenCalledWith('/orders/QA-ORDER/status',{method:'POST',body:{status:'in_transit',otp:undefined}}));
});
test('delivered customer can submit five stars with overall delivery comments',async()=>{
 mockRole='customer';mockOrder={...mockOrder,status:'delivered'};const view=render(<OrderDetail/>);
 expect(view.getByText('Rate your delivery experience')).toBeTruthy();fireEvent.press(view.getByTestId('rating-star-5'));
 fireEvent.changeText(view.getByTestId('rating-comment-input'),'TEST - careful handling, useful tracking and timely delivery.');
 fireEvent.press(view.getByTestId('rating-submit-button'));
 await waitFor(()=>expect(api).toHaveBeenCalledWith('/orders/QA-ORDER/rate',{method:'POST',body:{stars:5,comment:'TEST - careful handling, useful tracking and timely delivery.'}}));
});
test('assigned partner must capture signatures before pickup and collect balance before transit',async()=>{
 mockOrder={...mockOrder,status:'assigned',requires_pickup_signatures:true,payment_plan:{total_paise:191600,advance_paise:95800,balance_paise:95800,paid_paise:95800,balance_paid_paise:0}};
 const v=render(<OrderDetail/>);
 fireEvent.changeText(v.getByTestId('pickup-otp-input'),'1234');
 fireEvent.press(v.getByTestId('order-next-status-button'));expect(api).not.toHaveBeenCalled();
 mockOrder={...mockOrder,pickup_signatures_completed_at:'2026-11-17T10:00:00Z'};v.rerender(<OrderDetail/>);
 fireEvent.press(v.getByTestId('order-next-status-button'));
 await waitFor(()=>expect(api).toHaveBeenCalledWith('/orders/QA-ORDER/status',expect.objectContaining({body:{status:'picked_up',otp:'1234'}})));
 (api as jest.Mock).mockClear();mockOrder={...mockOrder,status:'picked_up'};v.rerender(<OrderDetail/>);
 fireEvent.press(v.getByTestId('order-next-status-button'));expect(api).not.toHaveBeenCalled();
 mockOrder={...mockOrder,payment_plan:{...mockOrder.payment_plan,paid_paise:191600,balance_paid_paise:95800}};v.rerender(<OrderDetail/>);
 fireEvent.press(v.getByTestId('order-next-status-button'));
 await waitFor(()=>expect(api).toHaveBeenCalledWith('/orders/QA-ORDER/status',expect.objectContaining({body:{status:'in_transit',otp:undefined}})));
});
test.each(['customer','admin'])('%s cannot advance assigned delivery statuses',role=>{
 mockRole=role;mockOrder={...mockOrder,status:'assigned'};
 const v=render(<OrderDetail/>);expect(v.queryByTestId('order-next-status-button')).toBeNull();
});

test('test pickup balance is explicit, records no money and unlocks Start trip after refresh',async()=>{
 mockOrder={...mockOrder,is_test:true,status:'picked_up',pickup_signatures_completed_at:'2026-11-17T10:00:00Z',payment_plan:{total_paise:191600,balance_paise:95800,paid_paise:95800}};
 const v=render(<OrderDetail/>);
 expect(v.getByTestId('order-next-status-button').props.accessibilityState.disabled).toBe(true);
 fireEvent.press(v.getByTestId('simulate-pickup-balance-button'));
 await waitFor(()=>expect(api).toHaveBeenCalledWith('/orders/QA-ORDER/simulate-pickup-balance',{method:'POST',body:{confirm_no_money_received:true}}));
 mockOrder={...mockOrder,payment_plan:{...mockOrder.payment_plan,paid_paise:191600,balance_paid_paise:95800}};v.rerender(<OrderDetail/>);
 expect(v.getByTestId('order-next-status-button').props.accessibilityState.disabled).toBe(false);
});
test('real orders never show a simulated balance action',()=>{
 mockOrder={...mockOrder,status:'picked_up',pickup_signatures_completed_at:'2026-11-17T10:00:00Z',payment_plan:{total_paise:191600,balance_paise:95800,paid_paise:95800}};
 const v=render(<OrderDetail/>);expect(v.queryByTestId('simulate-pickup-balance-button')).toBeNull();
});
