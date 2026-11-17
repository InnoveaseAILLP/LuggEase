import {api} from '../src/api';
import {shareShipmentPosition} from '../src/shipment-location';
import type {Position} from '../src/location-watch';
jest.mock('../src/api',()=>({api:jest.fn()}));
const point:Position={latitude:11,longitude:77,accuracy:15,captured_at:'2026-11-17T14:00:00Z',mocked:false};
const received_at='2026-11-17T14:00:01Z';
beforeEach(()=>jest.resetAllMocks());
test('confirms only a receipt that can be read back from the same order',async()=>{
 (api as jest.Mock).mockResolvedValueOnce({received_at}).mockResolvedValueOnce({points:[{...point,received_at}],stale:false});
 await expect(shareShipmentPosition('TEST-ORDER',point)).resolves.toBe(received_at);
 expect((api as jest.Mock).mock.calls).toEqual([['/orders/TEST-ORDER/tracking',{body:point}],['/orders/TEST-ORDER/tracking']]);
});
test.each([undefined,{}, {received_at:'invalid'}])('does not treat an empty or invalid acknowledgement as success (%p)',async receipt=>{
 (api as jest.Mock).mockResolvedValueOnce(receipt);await expect(shareShipmentPosition('TEST',point)).rejects.toThrow('could not be confirmed');expect(api).toHaveBeenCalledTimes(1);
});
test.each([
 {points:[],stale:false},
 {points:[{...point,received_at}],stale:true},
 {points:[{...point,received_at:'other'}],stale:false},
 {points:[{...point,latitude:12,received_at}],stale:false},
 {points:[{...point,captured_at:'other',received_at}],stale:false},
 {points:[null],stale:false},
])('never confirms missing, stale or mismatched stored reports (%p)',async stored=>{
 (api as jest.Mock).mockResolvedValueOnce({received_at}).mockResolvedValueOnce(stored);await expect(shareShipmentPosition('TEST',point)).rejects.toThrow('could not be confirmed');
});
test('a failed read-back cannot become a successful upload confirmation',async()=>{
 (api as jest.Mock).mockResolvedValueOnce({received_at}).mockRejectedValueOnce(new Error('Network unavailable'));
 await expect(shareShipmentPosition('TEST',point)).rejects.toThrow('Network unavailable');
});

test('accepts equivalent timestamps after API date serialization',async()=>{
 const sent={...point,captured_at:'2026-11-17T14:00:00.123Z'};
 (api as jest.Mock).mockResolvedValueOnce({received_at}).mockResolvedValueOnce({points:[{...sent,captured_at:'2026-11-17T14:00:00.123000Z',received_at}],stale:false});
 await expect(shareShipmentPosition('TEST',sent)).resolves.toBe(received_at);
});
