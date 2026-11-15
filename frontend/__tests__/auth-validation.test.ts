import {validateCredentials} from '../src/auth-validation';
test.each(['','invalid','name@','x y@example.com'])('rejects malformed email %s', email => {
  expect(() => validateCredentials(email,'password123')).toThrow('valid email');
});
test('requires a password for sign-in', () => { expect(() => validateCredentials('a@example.com','')).toThrow('password'); });
test('permits existing short passwords at login', () => { expect(() => validateCredentials('a@example.com','old')).not.toThrow(); });
test('registration validates trimmed name and minimum password', () => {
  expect(() => validateCredentials('a@example.com','password','  ')).toThrow('full name');
  expect(() => validateCredentials('a@example.com','short','Alice')).toThrow('8 characters');
  expect(() => validateCredentials(' A@example.com ','password',' Alice ')).not.toThrow();
});
