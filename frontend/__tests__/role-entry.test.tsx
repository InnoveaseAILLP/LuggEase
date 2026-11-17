import React from 'react';
import {act,fireEvent,render,waitFor} from '@testing-library/react-native';
import Login from '../app/login';
import Onboarding from '../app/onboarding';
import {AccountRole} from '../src/components/account-role';
import {LoginRoleSelector} from '../src/components/login-role-selector';
import {useAuth} from '../src/auth';
import {isAdminLoginEntry} from '../src/login-entry';
import AdminAccountRequired from '../app/admin-account-required';
jest.mock('../src/login-entry',()=>({isAdminLoginEntry:jest.fn()}));
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
  (isAdminLoginEntry as jest.Mock).mockReturnValue(false);
  auth={entryRole:null,setEntryRole:jest.fn(),setRole:jest.fn().mockResolvedValue(undefined),
    loginGoogle:jest.fn().mockResolvedValue(undefined),loginEmail:jest.fn().mockResolvedValue(undefined),
    resetPassword:jest.fn().mockResolvedValue(undefined),logout:jest.fn().mockResolvedValue(undefined),user:null};
  (useAuth as jest.Mock).mockImplementation(()=>auth);
});
test('public login offers only Customer and Delivery Partner',()=>{
  const change=jest.fn();const v=render(<LoginRoleSelector role="customer" onChange={change} disabled={false}/>);
  expect(v.getAllByRole('radio')).toHaveLength(2);
  fireEvent.press(v.getByTestId('login-role-partner'));expect(change).toHaveBeenCalledWith('partner');
  v.rerender(<LoginRoleSelector role="partner" onChange={change} disabled/>);
  expect(v.queryByTestId('login-role-admin')).toBeNull();
  fireEvent.press(v.getByTestId('login-role-customer'));expect(change).toHaveBeenCalledTimes(1);
});
test('Google sign-in retains the preferred role without granting it',async()=>{
  auth.entryRole='partner';const v=render(<Login/>);
  await act(async()=>{fireEvent.press(v.getByTestId('google-login-button'));});
  expect(auth.loginGoogle).toHaveBeenCalledTimes(1);expect(auth.setEntryRole).toHaveBeenCalledWith('partner');expect(auth.setRole).not.toHaveBeenCalled();
});
test('unlisted Admin entry prefills and locks the nominated account and has no signup',async()=>{
  (isAdminLoginEntry as jest.Mock).mockReturnValue(true);const v=render(<Login/>);
  expect(v.getByText('Administrator sign in')).toBeTruthy();
  expect(v.getByTestId('auth-email-input').props.value).toBe('rmanojananth@innovease-ai.in');
  expect(v.getByTestId('auth-email-input').props.editable).toBe(false);
  expect(v.queryByTestId('auth-mode-register')).toBeNull();
  expect(v.queryByTestId('register-name-input')).toBeNull();
  expect(v.queryByTestId('login-role-customer')).toBeNull();
  await act(async()=>{fireEvent.press(v.getByText('Set / reset admin password'));});
  expect(auth.resetPassword).toHaveBeenCalledWith('rmanojananth@innovease-ai.in');expect(auth.setRole).not.toHaveBeenCalled();
});
test('stale admin preference never exposes admin entry or email on public login',()=>{
  auth.entryRole='admin';const v=render(<Login/>);
  expect(v.queryByText('Administrator sign in')).toBeNull();
  expect(v.queryByText('Set / reset admin password')).toBeNull();
  expect(v.getByTestId('auth-email-input').props.value).toBe('');
  expect(v.getByTestId('auth-mode-register')).toBeTruthy();
});
test('a non-admin session sees an account barrier instead of administrator content',async()=>{
  auth.user={email:'customer@example.com',role:'customer'};const v=render(<AdminAccountRequired/>);
  expect(v.getByText('Administrator account required')).toBeTruthy();
  expect(v.queryByText('Reports and account directory')).toBeNull();
  await act(async()=>{fireEvent.press(v.getByText('Use administrator account'));});
  expect(auth.logout).toHaveBeenCalledTimes(1);expect(auth.setRole).not.toHaveBeenCalled();
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
test('login shows friendly credential guidance instead of the raw SDK error',async()=>{
 auth.loginEmail.mockRejectedValue(Object.assign(new Error('Firebase: Error (auth/invalid-credential).'),{code:'auth/invalid-credential'}));
 const v=render(<Login/>);
 fireEvent.changeText(v.getByTestId('auth-email-input'),'error-check@example.invalid');
 fireEvent.changeText(v.getByTestId('auth-password-input'),'DummyPassword123!');
 await act(async()=>{fireEvent.press(v.getByTestId('auth-submit-button'));});
 expect(v.getByText('The email or password is incorrect. Try again or reset your password.')).toBeTruthy();
 expect(v.queryByText(/Firebase:/)).toBeNull();
});
