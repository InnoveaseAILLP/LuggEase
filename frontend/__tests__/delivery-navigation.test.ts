import {deliveryNavigationURL} from '../src/delivery-navigation';
const route={pickup_address:'Coimbatore Railway Station, Tamil Nadu',drop_address:'Coimbatore International Airport, Tamil Nadu',extra_stops:['Test stop & shop']};
test('assigned partner navigates to pickup; transit route includes encoded destination and stops',()=>{
 const pickup=deliveryNavigationURL({...route,status:'assigned'});
 expect(pickup).toContain('destination=Coimbatore%20Railway');expect(pickup).not.toContain('waypoints=');
 const drop=deliveryNavigationURL({...route,status:'in_transit'});
 expect(drop).toContain('destination=Coimbatore%20International');expect(drop).toContain('waypoints=Test%20stop%20%26%20shop');expect(drop).toContain('dir_action=navigate');
});
test('Google Maps URL length is bounded',()=>{
 expect(()=>deliveryNavigationURL({...route,status:'in_transit',drop_address:'Long'.repeat(600)})).toThrow(/too long/);
});
