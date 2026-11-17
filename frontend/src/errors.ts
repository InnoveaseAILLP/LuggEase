/** Public messages are separate from SDK exceptions and server diagnostics. */
export const DEFAULT_ERROR='We couldn’t complete that action. Please try again. If it keeps happening, contact support.';
export const CONNECTION_ERROR='Unable to connect. Check your internet connection and try again.';
export const SESSION_ERROR='Your session has expired. Please sign in again.';
export const PAYMENT_REVIEW='Your payment status could not be confirmed. Refresh payment status before trying to pay again. Contact support if money was deducted.';
export class UserFacingError extends Error {
  constructor(message:string,public readonly code?:string){super(message);this.name='UserFacingError';}
}
const credentials='The email or password is incorrect. Try again or reset your password.';
const signInUnavailable='Sign-in is temporarily unavailable. Please try again later or contact support.';
const expiredLink='This link is invalid or has expired. Request a new email and use the most recent link.';
const authMessages:Record<string,string>={
  'auth/invalid-credential':credentials,'auth/invalid-login-credentials':credentials,
  'auth/wrong-password':credentials,'auth/user-not-found':credentials,'auth/missing-email':'Enter your email address.',
  'auth/invalid-email':'Enter a valid email address.','auth/missing-password':'Enter your password.',
  'auth/email-already-in-use':'An account already exists for this email. Sign in or reset your password.',
  'auth/weak-password':'Use a stronger password with at least 8 characters.',
  'auth/password-does-not-meet-requirements':'Choose a stronger password that meets the password requirements.',
  'auth/user-disabled':'This account is disabled. Please contact support.',
  'auth/too-many-requests':'Too many attempts. Please wait a few minutes before trying again.',
  'auth/quota-exceeded':'Too many attempts. Please wait a few minutes before trying again.',
  'auth/network-request-failed':CONNECTION_ERROR,
  'auth/user-token-expired':SESSION_ERROR,'auth/invalid-user-token':SESSION_ERROR,
  'auth/id-token-expired':SESSION_ERROR,'auth/invalid-id-token':SESSION_ERROR,'auth/id-token-revoked':SESSION_ERROR,
  'auth/requires-recent-login':'Please sign in again before making this change.',
  'auth/user-mismatch':'Use the same account to complete this action.',
  'auth/email-not-verified':'Please verify your email before signing in.',
  'auth/account-exists-with-different-credential':'This email uses a different sign-in method. Try the method you used before or contact support.',
  'auth/credential-already-in-use':'This sign-in method belongs to another account. Use its original sign-in method or contact support.',
  'auth/popup-blocked':'Allow pop-ups for this website, then try Google sign-in again.',
  'auth/popup-closed-by-user':'Google sign-in was cancelled. Please try again.',
  'auth/cancelled-popup-request':'Another sign-in attempt is open. Finish or close it before trying again.',
  'auth/unauthorized-domain':'Google sign-in is temporarily unavailable on this website. Use email sign-in or contact support.',
  'auth/operation-not-allowed':'This sign-in option is unavailable. Try another sign-in method or contact support.',
  'auth/invalid-api-key':signInUnavailable,'auth/app-not-authorized':signInUnavailable,
  'auth/invalid-app-credential':signInUnavailable,'auth/configuration-not-found':signInUnavailable,
  'auth/internal-error':signInUnavailable,'auth/web-storage-unsupported':'Allow site storage in your browser, then try signing in again.',
  'auth/unsupported-persistence-type':'Allow site storage in your browser, then try signing in again.',
  'auth/expired-action-code':expiredLink,'auth/invalid-action-code':expiredLink,'auth/missing-action-code':expiredLink,
  'auth/invalid-continue-uri':'The email link could not be prepared. Please contact support.',
  'auth/unauthorized-continue-uri':'The email link could not be prepared. Please contact support.',
};
const googleMessages:Record<string,string>={
  SIGN_IN_CANCELLED:'Google sign-in was cancelled. Please try again.','12501':'Google sign-in was cancelled. Please try again.',
  IN_PROGRESS:'A sign-in attempt is already in progress. Please wait.',
  PLAY_SERVICES_NOT_AVAILABLE:'Update Google Play services on your phone, then try Google sign-in again.',
  DEVELOPER_ERROR:'Google sign-in is temporarily unavailable. Use email sign-in or contact support.',
  '10':'Google sign-in is temporarily unavailable. Use email sign-in or contact support.',
  NETWORK_ERROR:CONNECTION_ERROR,'7':CONNECTION_ERROR,
};
export function errorCode(error:unknown):string {
  if(error&&typeof error==='object'&&'code' in error&&typeof error.code!=='undefined')return String(error.code);
  const message=error instanceof Error?error.message:typeof error==='string'?error:'';
  return message.match(/auth\/[a-z][a-z0-9-]+/i)?.[0].toLowerCase()??'';
}
const technical=/firebase|auth\/|\b(?:SDK|JWT|JSON|HTTPException|TypeError|ReferenceError|SyntaxError|Traceback|Exception|SQLSTATE|MongoDB|PyMongo|ENOENT|EACCES|ECONN\w*|DEVELOPER_ERROR|undefined|null)\b|api[_ -]?key|client[_ -]?id|identity token|password\s*[=:]|secret\s*[=:]|token\s*[=:]|https?:\/\/|<\/?(?:html|script)|\bat\s+\S+\s*\([^)]*:\d+/i;
function safeMessage(message:string):boolean{return !!message.trim()&&message.length<=600&&!/[\r\n]/.test(message)&&!technical.test(message);}
export function getErrorMessage(error:unknown,fallback=DEFAULT_ERROR):string {
  if(error instanceof UserFacingError)return safeMessage(error.message)?error.message:fallback;
  const code=errorCode(error);
  if(authMessages[code])return authMessages[code];
  if(googleMessages[code])return googleMessages[code];
  const message=error instanceof Error?error.message:typeof error==='string'?error:'';
  if(/network(?: request)? (?:failed|unavailable)|failed to fetch|load failed|internet|offline/i.test(message))return CONNECTION_ERROR;
  if(error&&typeof error==='object'&&'name' in error&&error.name==='AbortError')return 'The request timed out. Please try again.';
  return fallback;
}
export function asUserFacingError(error:unknown,fallback=DEFAULT_ERROR):UserFacingError {
  return new UserFacingError(getErrorMessage(error,fallback),errorCode(error)||undefined);
}
export function locationErrorMessage(error:unknown):string {
  const code=Number(errorCode(error));
  if(code===1)return 'Location access is blocked. Allow location permission in your device or browser settings, then try again.';
  if(code===2)return 'Your location is unavailable. Turn on location services and try again.';
  if(code===3)return 'Finding your location took too long. Check that device Location Services and precise location for this app or browser are enabled, and Wi-Fi or mobile data is on. Move to an open area, then tap Retry location.';
  return getErrorMessage(error,'Unable to share your location. Check location permissions and try again.');
}
const fields:Record<string,string>={
  email:'email address',password:'password',role:'account type',phone:'mobile number',full_name:'full name',name:'name',
  bank_ifsc:'IFSC code',bank_account_number:'bank account number',bank_account_holder:'account holder name',
  pickup_address:'pickup address',drop_address:'destination address',pickup_city:'pickup city',drop_city:'destination city',
  pickup_state:'pickup state',drop_state:'destination state',vehicle_number:'vehicle registration number',vehicle_type:'vehicle type',
  license_number:'driving licence number',id_proof:'identity document reference',gstin:'GSTIN',upi_id:'UPI ID',
  items:'item list',qty:'item quantity',distance_km:'route distance',amount:'amount',stars:'star rating',comment:'feedback comment',
  pickup_otp:'pickup code',otp:'pickup code',signature:'handwritten signature',invoice_signature:'invoice signature',
  agreement_signature:'agreement signature',reason:'reason',start_date:'start date',end_date:'end date',utr:'transfer reference',
  expected_delivery_at:'delivery date and time',move_date:'pickup date',time_slot:'pickup time',
};
function validationMessage(detail:unknown[]):string {
  const first=detail.find(value=>value&&typeof value==='object') as {loc?:unknown[];type?:string}|undefined;
  const key=first?.loc?.filter(value=>typeof value==='string'&&!['body','query','path'].includes(value)).at(-1);
  if(key==='bank_ifsc')return 'Enter a valid 11-character IFSC code.';
  if(key==='phone')return 'Enter a valid 10-digit Indian mobile number.';
  if(key==='role')return 'Select Customer or Delivery Partner to continue.';
  if(key==='email')return 'Enter a valid email address.';
  const label=typeof key==='string'?fields[key]:undefined;
  if(!label)return 'Please check the information you entered and try again.';
  return first?.type==='missing'?`Enter the ${label} to continue.`:`Please check the ${label} and try again.`;
}
export function apiError(status:number,data:unknown,path:string,signedIn:boolean):UserFacingError {
  const detail=data&&typeof data==='object'&&'detail' in data?data.detail:undefined;
  let message:string;
  if(status===401)message=signedIn?SESSION_ERROR:'Please sign in to continue.';
  else if(status===429)message='Too many requests. Please wait a minute and try again.';
  else if(status>=500){
    message=path.startsWith('/payments')?PAYMENT_REVIEW:path.startsWith('/places')?'Address search is unavailable. Try again shortly or enter the address manually.':
      path==='/geo/distance'||path==='/quote'?'We couldn’t calculate this route. Check the addresses and try again shortly.':'The service is temporarily unavailable. Please try again shortly.';
    if(path.startsWith('/payments/create'))message='Online payments are temporarily unavailable. Please try again later or contact support.';
  }else if(Array.isArray(detail))message=validationMessage(detail);
  else if(typeof detail==='string'&&safeMessage(detail))message=detail;
  else if(status===403)message='Your account does not have permission to do this.';
  else if(status===404)message='The requested information could not be found. Refresh and try again.';
  else if(status===409)message='This information has changed. Refresh the page and try again.';
  else if(status===410)message='This option is no longer available. Refresh the app or contact support.';
  else message='Please check your details and try again.';
  return new UserFacingError(message,`request/${status}`);
}
