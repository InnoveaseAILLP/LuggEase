import React from 'react';
import {act,fireEvent,render,waitFor} from '@testing-library/react-native';
import Login from '../app/login';
import Onboarding from '../app/onboarding';
import {AccountRole} from '../src/components/account-role';
import {LoginRoleSelector} from '../src/components/login-role-selector';
import {useAuth} from '../src/auth';
jest.mock('../src/auth',()=>({useAuth:jest.fn()}));
jest.mock('react-native-safe-area-context',()=>({useSafeAreaInsets:()=>({top:0,bottom:0})}));
jest.mock('react-native-keyboard-controller',()=>{
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return {KeyboardAwareScrollView:require('react-native').ScrollView};
});
jest.mock('../src/components/linear-gradient',()=>{
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return {LinearGradient:require('react-native').View};
});
jest.mock('../src/components/brand-icon',()=>({BrandIcon:()=>null}));
jest.mock('../src/components/ui',()=>{
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const R=require('react'),N=require('react-native');
  return {Icon:()=>null,radius:{md:12,lg:16,pill:999},space:{xs:4,sm:8,md:12,lg:16,xl:24},useToast:()=>jest.fn(),
    Button:(p:any)=>R.createElement(N.Pressable,{testID:p.testID||p.title,onPress:p.onPress,disabled:p.disabled||p.loading},R.createElement(N.Text,null,p.title)),
    Input:(p:any)=>R.createElement(N.TextInput,{...p,accessibilityLabel:p.label})};
});
let auth:any;
beforeEach(()=>{
  auth={entryRole:null,setEntryRole:jest.fn(),setRole:jest.fn().mockResolvedValue(undefined),
    loginGoogle:jest.fn().mockResolvedValue(undefined),loginEmail:jest.fn().mockResolvedValue(undefined),
    resetPassword:jest.fn().mockResolvedValue(undefined),user:null};
  (useAuth as jest.Mock).mockImplementation(()=>auth);
});
test('login presents accessible Customer, Delivery Partner and Admin choices',()=>{
  const change=jest.fn();const v=render(<LoginRoleSelector role="customer" onChange={change} disabled={false}/>);
  expect(v.getAllByRole('radio')).toHaveLength(3);
  fireEvent.press(v.getByTestId('login-role-partner'));expect(change).toHaveBeenCalledWith('partner');
  v.rerender(<LoginRoleSelector role="partner" onChange={change} disabled/>);
  fireEvent.press(v.getByTestId('login-role-admin'));expect(change).toHaveBeenCalledTimes(1);
});
test('Google sign-in retains the preferred role without granting it',async()=>{
  auth.entryRole='partner';const v=render(<Login/>);
  await act(async()=>{fireEvent.press(v.getByTestId('google-login-button'));});
  expect(auth.loginGoogle).toHaveBeenCalledTimes(1);expect(auth.setEntryRole).toHaveBeenCalledWith('partner');expect(auth.setRole).not.toHaveBeenCalled();
});
test('Admin entry prefills the nominated account, disables signup and offers private password setup',async()=>{
  auth.entryRole='admin';const v=render(<Login/>);
  fireEvent.press(v.getByTestId('login-role-admin'));
  expect(v.getByTestId('auth-email-input').props.value).toBe('rmanojananth@innovease-ai.in');
  expect(v.getByTestId('auth-mode-register').props.accessibilityState.disabled).toBe(true);
  fireEvent.press(v.getByTestId('auth-mode-register'));
  expect(v.queryByTestId('register-name-input')).toBeNull();
  await act(async()=>{fireEvent.press(v.getByText('Set / reset admin password'));});
  expect(auth.resetPassword).toHaveBeenCalledWith('rmanojananth@innovease-ai.in');expect(auth.setRole).not.toHaveBeenCalled();
});
test('new partners confirm their preferred role after authentication; Admin cannot be self-selected',async()=>{
  auth.entryRole='partner';auth.user={name:'Test',role:null};const v=render(<Onboarding/>);
  expect(v.getByTestId('role-option-partner').props.accessibilityState.checked).toBe(true);
  expect(v.queryByTestId('role-option-admin')).toBeNull();
  await act(async()=>{fireEvent.press(v.getByTestId('onboarding-continue-button'));});
  await waitFor(()=>expect(auth.setRole).toHaveBeenCalledWith('partner',undefined));
});
test('saved account role wins over a requested login role and is explained',()=>{
  auth.entryRole='admin';auth.user={role:'partner'};const v=render(<AccountRole/>);
  expect(v.getByText('Signed in as Delivery Partner')).toBeTruthy();
  expect(v.getByTestId('account-role-explanation')).toBeTruthy();
});
