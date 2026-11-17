import {ADMIN_LOGIN_PATH,isAdminLoginPath} from '../src/admin-entry-config';
import {isAdminLoginEntry} from '../src/login-entry';
test('only the dedicated pathname and its trailing slash select the administrator portal',()=>{
  expect(isAdminLoginPath(ADMIN_LOGIN_PATH)).toBe(true);
  expect(isAdminLoginPath(ADMIN_LOGIN_PATH+'/')).toBe(true);
  for(const path of ['/','/login','/admin','/?admin=true',ADMIN_LOGIN_PATH+'-other',ADMIN_LOGIN_PATH+'/reports'])expect(isAdminLoginPath(path)).toBe(false);
});
test('native public login never selects the web administrator entry',()=>{
  expect(isAdminLoginEntry()).toBe(false);
});
