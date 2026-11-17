import {startLocationWatch,type Position} from '../src/location-watch';
const fix:Position={latitude:11.01,longitude:77.00,accuracy:12,captured_at:'2026-11-17T12:00:00Z',mocked:false};
beforeEach(()=>jest.useFakeTimers());afterEach(()=>jest.useRealTimers());
test('preserves an immediate fix and periodically refreshes a stationary location',()=>{
 const send=jest.fn(),error=jest.fn(),cancel=jest.fn();
 const request=jest.fn((success:(p:Position)=>void)=>success({...fix,captured_at:'2026-11-17T12:00:20Z'}));
 const stop=startLocationWatch({subscribe:success=>{success(fix);return cancel;},request},send,error);
 expect(send).toHaveBeenCalledWith(fix);expect(request).toHaveBeenCalledTimes(1);jest.advanceTimersByTime(20000);expect(request).toHaveBeenCalledTimes(2);expect(send).toHaveBeenCalledTimes(3);
 stop();stop();expect(cancel).toHaveBeenCalledTimes(1);jest.advanceTimersByTime(60000);expect(request).toHaveBeenCalledTimes(2);
});
test('permission denial is fatal and cannot leave a heartbeat or watcher running',()=>{
 const cancel=jest.fn(),error=jest.fn(),request=jest.fn();
 startLocationWatch({subscribe:(_success,failure)=>{failure({code:1});return cancel;},request},jest.fn(),error);
 expect(error).toHaveBeenCalledWith(expect.stringContaining('Allow location permission'),true);expect(cancel).toHaveBeenCalledTimes(1);jest.advanceTimersByTime(60000);expect(request).not.toHaveBeenCalled();
});
test('timeout is visible and a later foreground heartbeat retries',()=>{
 const error=jest.fn(),send=jest.fn();let fail:(e:unknown)=>void=()=>{};
 const request=jest.fn().mockImplementationOnce((_success,failure)=>failure({code:3})).mockImplementation((success:(p:Position)=>void)=>success(fix));
 const stop=startLocationWatch({subscribe:(_success,failure)=>{fail=failure;return jest.fn();},request},send,error);
 fail({code:3});expect(error).toHaveBeenCalledWith(expect.stringContaining('too long'),false);jest.advanceTimersByTime(20000);expect(send).toHaveBeenCalledWith(fix);stop();
});
test('late callbacks after stop do not share coordinates',()=>{
 const send=jest.fn();let success:(p:Position)=>void=()=>{};
 const stop=startLocationWatch({subscribe:callback=>{success=callback;return jest.fn();},request:jest.fn()},send,jest.fn());stop();success(fix);expect(send).not.toHaveBeenCalled();
});

test('a stalled request is not duplicated and fresh usable fixes suppress transient source timeouts',()=>{
 const send=jest.fn(),error=jest.fn();let fail:(e:unknown)=>void=()=>{};
 const request=jest.fn();const stop=startLocationWatch({subscribe:(success,failure)=>{fail=failure;success(fix);return jest.fn();},request},send,error);
 expect(request).toHaveBeenCalledTimes(1);jest.advanceTimersByTime(20000);expect(request).toHaveBeenCalledTimes(1);fail({code:3});expect(error).not.toHaveBeenCalled();
 jest.advanceTimersByTime(21000);fail({code:3});expect(error).toHaveBeenCalled();stop();
});
