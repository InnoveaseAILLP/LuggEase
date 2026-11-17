import {isAdminLoginPath} from './admin-entry-config';
export function isAdminLoginEntry():boolean {
  return typeof window!=='undefined'&&isAdminLoginPath(window.location.pathname);
}
