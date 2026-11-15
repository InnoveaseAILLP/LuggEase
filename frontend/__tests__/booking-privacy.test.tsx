import React from 'react';
import {renderHook, act} from '@testing-library/react-native';
import {BookingProvider, useBooking} from '../src/booking';
import {useAuth} from '../src/auth';
jest.mock('../src/auth', () => ({useAuth:jest.fn()}));
test('account changes clear the previous customer booking draft', () => {
  (useAuth as jest.Mock).mockReturnValue({user:{user_id:'alice'}});
  const wrapper=({children}: {children:React.ReactNode}) => <BookingProvider>{children}</BookingProvider>;
  const {result,rerender}=renderHook(useBooking,{wrapper});
  act(() => result.current.update({pickup_address:'Private address',items:{sofa:2}}));
  expect(result.current.draft.pickup_address).toBe('Private address');
  (useAuth as jest.Mock).mockReturnValue({user:{user_id:'bob'}});
  rerender({});
  expect(result.current.draft.pickup_address).toBe('');
  expect(result.current.draft.items).toEqual({});
});
