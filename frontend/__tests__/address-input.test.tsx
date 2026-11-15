import React from 'react';
import {act, fireEvent, render, waitFor} from '@testing-library/react-native';
import {AddressInput} from '../src/components/address-input';
import {api} from '../src/api';
jest.mock('../src/api', () => ({api: jest.fn()}));
jest.mock('../src/theme', () => ({useTheme: () => ({colors: {}})}));
// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock('../src/components/ui', () => ({Input: (p: any) => require('react').createElement(require('react-native').TextInput, p), space: {sm: 8}}));
afterEach(() => { jest.useRealTimers(); jest.clearAllMocks(); });
test('debounces input and fills selected address and state using one session', async () => {
  jest.useFakeTimers();
  const change = jest.fn(), select = jest.fn();
  (api as jest.Mock).mockResolvedValueOnce({suggestions:[{place_id:'abc', title:'Nethaji Garden', subtitle:'Coimbatore'}]})
    .mockResolvedValueOnce({address:'Nethaji Garden, Coimbatore, Tamil Nadu, India', state:'Tamil Nadu'});
  const view = render(<AddressInput value="" onChangeText={change} onSelect={select} testID="pickup"/>);
  fireEvent(view.getByTestId('pickup'), 'focus');
  view.rerender(<AddressInput value="Nethaji" onChangeText={change} onSelect={select} testID="pickup"/>);
  expect(api).not.toHaveBeenCalled();
  await act(async () => { jest.advanceTimersByTime(350); });
  expect(view.getByText('Google Maps')).toBeTruthy();
  fireEvent.press(view.getByTestId('pickup-suggestion-abc'));
  await waitFor(() => expect(select).toHaveBeenCalledWith({address:'Nethaji Garden, Coimbatore, Tamil Nadu, India', state:'Tamil Nadu'}));
  const calls = (api as jest.Mock).mock.calls;
  expect(calls[0][0].split('session_token=')[1]).toBe(calls[1][0].split('session_token=')[1]);
});
test('ignores a stale response after the text changes and allows manual input', async () => {
  jest.useFakeTimers();
  let resolve: any;
  (api as jest.Mock).mockReturnValueOnce(new Promise(r => { resolve = r; }));
  const change=jest.fn(), select=jest.fn();
  const view=render(<AddressInput value="" onChangeText={change} onSelect={select} testID="drop"/>);
  fireEvent(view.getByTestId('drop'), 'focus');
  view.rerender(<AddressInput value="Old address" onChangeText={change} onSelect={select} testID="drop"/>);
  await act(async () => { jest.advanceTimersByTime(350); });
  view.rerender(<AddressInput value="New address" onChangeText={change} onSelect={select} testID="drop"/>);
  await act(async () => { resolve({suggestions:[{place_id:'old',title:'Old',subtitle:''}]}); });
  expect(view.queryByText('Old')).toBeNull();
  fireEvent.changeText(view.getByTestId('drop'), 'My flat 22');
  expect(change).toHaveBeenCalledWith('My flat 22');
});
