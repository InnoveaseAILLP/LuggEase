import React from 'react';
import {fireEvent,render} from '@testing-library/react-native';
import {DeliveryTimeSelect} from '../src/components/delivery-time-select';
import {DELIVERY_HOURS,DELIVERY_MINUTES} from '../src/components/delivery-time-options';
jest.mock('../src/theme',()=>({useTheme:()=>({colors:{}})}));
test('offers every hour and minute, preserving non-rounded times',()=>{
 expect(DELIVERY_HOURS).toHaveLength(24);expect(DELIVERY_HOURS[0]).toBe('00');expect(DELIVERY_HOURS[23]).toBe('23');
 expect(DELIVERY_MINUTES).toHaveLength(60);expect(DELIVERY_MINUTES[19]).toBe('19');expect(DELIVERY_MINUTES[59]).toBe('59');
 const change=jest.fn();const v=render(<DeliveryTimeSelect value="18:19" onChange={change}/>);
 expect(v.getByText('18')).toBeTruthy();expect(v.getByText('19')).toBeTruthy();
 fireEvent.press(v.getByTestId('delivery-revision-hour'));fireEvent.press(v.getByTestId('delivery-hour-option-20'));
 expect(change).toHaveBeenCalledWith('20:19');
 v.rerender(<DeliveryTimeSelect value="20:19" onChange={change}/>);
 fireEvent.press(v.getByTestId('delivery-revision-minute'));fireEvent.press(v.getByTestId('delivery-minute-option-21'));
 expect(change).toHaveBeenLastCalledWith('20:21');
});
test('disabled controls cannot change time',()=>{
 const change=jest.fn();const v=render(<DeliveryTimeSelect value="18:19" onChange={change} disabled/>);
 fireEvent.press(v.getByTestId('delivery-revision-hour'));expect(v.queryByTestId('delivery-hour-option-18')).toBeNull();expect(change).not.toHaveBeenCalled();
});
test('minute boundary remains selectable without rounding to a fixed interval',()=>{
 const change=jest.fn();const v=render(<DeliveryTimeSelect value="23:58" onChange={change}/>);
 fireEvent.press(v.getByTestId('delivery-revision-minute'));fireEvent.press(v.getByTestId('delivery-minute-option-59'));
 expect(change).toHaveBeenCalledWith('23:59');
});
