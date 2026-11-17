import {watchShipmentLocation} from '../src/location.web';
const oldNavigator=Object.getOwnPropertyDescriptor(globalThis,'navigator');
afterEach(()=>{if(oldNavigator)Object.defineProperty(globalThis,'navigator',oldNavigator);else Reflect.deleteProperty(globalThis,'navigator');jest.useRealTimers();});
test('requests a fresh device fix immediately while allowing the high accuracy watcher more time',async()=>{
 jest.useFakeTimers();const send=jest.fn(),error=jest.fn(),clearWatch=jest.fn();
 const watchPosition=jest.fn((_success:unknown,_failure:unknown,_options:unknown)=>42),getCurrentPosition=jest.fn((success:(point:unknown)=>void,_failure:unknown,_options:unknown)=>success({coords:{latitude:11,longitude:77,accuracy:25},timestamp:Date.now()}));
 Object.defineProperty(globalThis,'navigator',{configurable:true,value:{geolocation:{watchPosition,getCurrentPosition,clearWatch}}});
 const stop=await watchShipmentLocation(send,error);
 expect(watchPosition.mock.calls[0][2]).toMatchObject({enableHighAccuracy:true,timeout:60000});
 expect(getCurrentPosition.mock.calls[0][2]).toMatchObject({enableHighAccuracy:false,maximumAge:0,timeout:20000});
 expect(send).toHaveBeenCalledWith(expect.objectContaining({accuracy:25,mocked:false}));
 stop();expect(clearWatch).toHaveBeenCalledWith(42);jest.advanceTimersByTime(60000);expect(getCurrentPosition).toHaveBeenCalledTimes(1);
});
