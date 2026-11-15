import React from 'react';
import {renderHook, act, waitFor} from '@testing-library/react-native';
import {AuthProvider, useAuth} from '../src/auth';
import {identity} from '../src/firebase';
import {api} from '../src/api';
import {queryClient} from '../src/query-client';
jest.mock('../src/firebase', () => ({identity:{current:jest.fn(),subscribe:jest.fn(),login:jest.fn(),register:jest.fn(),google:jest.fn(),token:jest.fn(),verify:jest.fn(),refresh:jest.fn(),reset:jest.fn(),logout:jest.fn()}}));
jest.mock('../src/api', () => ({api:jest.fn(),setTokenProvider:jest.fn(),setUnauthorizedHandler:jest.fn()}));
jest.mock('../src/query-client', () => ({queryClient:{clear:jest.fn()}}));
jest.mock('../src/env', () => ({loadEnv:jest.fn()}));
let callback: () => Promise<void>;
const profile={user_id:'one',name:'Alice',email:'alice@example.com',role:'customer'};
const mocked=identity as jest.Mocked<typeof identity>;
beforeEach(() => {
  jest.clearAllMocks();
  mocked.current.mockReturnValue(null);
  mocked.subscribe.mockImplementation((fn) => {callback=fn as () => Promise<void>; return jest.fn();});
  (api as jest.Mock).mockResolvedValue(profile);
});
const wrapper=({children}: {children: React.ReactNode}) => <AuthProvider>{children}</AuthProvider>;
async function setup() {
  const hook=renderHook(useAuth,{wrapper});
  await act(async () => {await callback();});
  return hook;
}
test('registration sends normalized identity and does not create a backend profile before verification', async () => {
  const {result}=await setup();
  await act(async () => {await result.current.registerEmail(' Alice ',' Alice@Example.com ','password123');});
  expect(mocked.register).toHaveBeenCalledWith('Alice','alice@example.com','password123');
  expect(api).not.toHaveBeenCalled();
  expect(result.current.user).toBeNull();
});
test('unverified login cannot enter protected screens', async () => {
  const {result}=await setup();
  mocked.current.mockReturnValue({emailVerified:false} as any);
  await act(async () => {await expect(result.current.loginEmail('alice@example.com','password123')).rejects.toThrow('verify');});
  expect(api).not.toHaveBeenCalled();expect(result.current.user).toBeNull();
});
test('verification reloads Firebase identity and obtains a fresh token before creating profile', async () => {
  const {result}=await setup();mocked.current.mockReturnValue({emailVerified:true,uid:'one'} as any);
  await act(async () => {await result.current.completeVerification();});
  expect(mocked.refresh).toHaveBeenCalled();expect(mocked.token).toHaveBeenCalledWith(true);
  expect(api).toHaveBeenCalledWith('/auth/firebase/session',{method:'POST'});
  expect(result.current.user).toEqual(profile);
});
test('logout clears identity and role-specific cached data', async () => {
  const {result}=await setup();
  await act(async () => {result.current.setUser(profile as any);});
  await act(async () => {await result.current.logout();});
  expect(mocked.logout).toHaveBeenCalled();expect(queryClient.clear).toHaveBeenCalled();expect(result.current.user).toBeNull();
});
test('a failed session restore finishes loading with no protected user', async () => {
  mocked.current.mockReturnValue({emailVerified:true,uid:'one'} as any);(api as jest.Mock).mockRejectedValue(new Error('offline'));
  const {result}=await setup();await waitFor(() => expect(result.current.loading).toBe(false));expect(result.current.user).toBeNull();
});
test('password reset hides unknown-account errors', async () => {
  const {result}=await setup();mocked.reset.mockRejectedValue({code:'auth/user-not-found'});
  await act(async () => {await expect(result.current.resetPassword('alice@example.com')).resolves.toBeUndefined();});
});

test('a profile response from an old account cannot replace the new account', async () => {
  const {result}=await setup();
  mocked.current.mockReturnValue({emailVerified:true,uid:'alice'} as any);
  let resolveProfile: (value:any) => void = () => {};
  (api as jest.Mock).mockReturnValue(new Promise(resolve => {resolveProfile=resolve;}));
  let pending: Promise<void>;
  act(() => {pending=result.current.refresh();});
  mocked.current.mockReturnValue({emailVerified:true,uid:'bob'} as any);
  const bob={...profile,user_id:'bob',email:'bob@example.com'};
  await act(async () => {result.current.setUser(bob as any);resolveProfile(profile);await pending;});
  expect(result.current.user).toEqual(bob);
});
