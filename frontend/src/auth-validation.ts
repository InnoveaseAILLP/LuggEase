import {UserFacingError} from '@/src/errors';
export function validateCredentials(email: string, password: string, name?: string) {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) throw new UserFacingError('Enter a valid email address.');
  if (!password) throw new UserFacingError('Enter your password.');
  if (name !== undefined) {
    if (name.trim().length < 2 || name.trim().length > 80) throw new UserFacingError('Enter your full name (2–80 characters).');
    if (password.length < 8) throw new UserFacingError('Use at least 8 characters for your password.');
  }
}
