// This unlisted entry is a UI route. Verified API roles remain the access control.
export const ADMIN_LOGIN_PATH = "/staff-access/le-486fcbf0f847745b0313870027057766";
export const ADMIN_LOGIN_EMAIL = 'rmanojananth@innovease-ai.in';
export function isAdminLoginPath(pathname:string):boolean {
  return pathname.replace(/\/$/,'')===ADMIN_LOGIN_PATH;
}
