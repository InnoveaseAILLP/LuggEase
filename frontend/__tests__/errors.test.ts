import {apiError, asUserFacingError, DEFAULT_ERROR, getErrorMessage, locationErrorMessage, PAYMENT_REVIEW, UserFacingError} from '../src/errors';
const credentials='The email or password is incorrect. Try again or reset your password.';
test.each(['invalid-credential','invalid-login-credentials','wrong-password','user-not-found'])('friendly credentials for auth/%s without exposing whether an account exists',code=>{
 expect(getErrorMessage(Object.assign(new Error(`Firebase: Error (auth/${code}).`),{code:`auth/${code}`}))).toBe(credentials);
});
test('recognizes the screenshot error even without a separate code',()=>expect(getErrorMessage(new Error('Firebase: Error (auth/invalid-credential).'))).toBe(credentials));
test.each([
 ['auth/email-already-in-use','account already exists'],['auth/too-many-requests','wait a few minutes'],
 ['auth/network-request-failed','internet connection'],['auth/weak-password','8 characters'],
 ['auth/user-disabled','disabled'],['auth/user-token-expired','sign in again'],
 ['auth/popup-blocked','Allow pop-ups'],['auth/popup-closed-by-user','cancelled'],
 ['auth/unauthorized-domain','email sign-in'],['auth/expired-action-code','Request a new email'],
 ['auth/operation-not-allowed','another sign-in method'],['DEVELOPER_ERROR','email sign-in'],
 ['PLAY_SERVICES_NOT_AVAILABLE','Update Google Play services'],['SIGN_IN_CANCELLED','cancelled'],
])('explains %s with an actionable message',(code,expected)=>{
 const message=getErrorMessage({code});expect(message).toContain(expected);expect(message).not.toMatch(/firebase|auth\//i);
});
test.each([new Error('Firebase: unknown failure secret=private'),new Error('Internal host https://internal.invalid stack'),undefined,null,{},'raw server failure'])('unexpected errors never leak diagnostics (%p)',error=>expect(getErrorMessage(error)).toBe(DEFAULT_ERROR));
test('intentional business guidance survives repeated boundaries, diagnostics do not',()=>{
 expect(getErrorMessage(asUserFacingError(new UserFacingError('Capture the customer signature first.')))).toBe('Capture the customer signature first.');
 expect(getErrorMessage(new UserFacingError('Firebase: secret=private'))).toBe(DEFAULT_ERROR);
});
test('validation details never echo submitted values or schema internals',()=>{
 const error=apiError(422,{detail:[{loc:['body','bank_ifsc'],msg:'regex mismatch',input:'PRIVATE_VALUE'}]},'/partner',true);
 expect(error.message).toBe('Enter a valid 11-character IFSC code.');
 expect(apiError(422,{detail:[{loc:['body','unknown'],msg:'Firebase token=private'}]},'/partner',true).message).not.toMatch(/private|firebase/i);
});
test('HTTP failures keep workflow guidance but hide internal and provider details',()=>{
 expect(apiError(409,{detail:'Capture customer signatures before leaving pickup.'},'/order',true).message).toContain('signatures');
 expect(apiError(500,{detail:'Firebase credentials secret=private'},'/order',true).message).toContain('temporarily unavailable');
 expect(apiError(400,{detail:'Firebase auth/unknown'},'/order',true).message).not.toMatch(/firebase|auth\//i);
 expect(apiError(502,{},'/payments/verify',true).message).toBe(PAYMENT_REVIEW);
});
test.each([[1,'Allow location permission'],[2,'Turn on location services'],[3,'open area']])('location error %s is actionable',(code,text)=>expect(locationErrorMessage({code,message:'raw native error'})).toContain(text));
