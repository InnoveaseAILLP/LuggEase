export function validateCredentials(email: string, password: string, name?: string) {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) throw new Error('Enter a valid email address.');
  if (!password) throw new Error('Enter your password.');
  if (name !== undefined) {
    if (name.trim().length < 2 || name.trim().length > 80) throw new Error('Enter your full name (2–80 characters).');
    if (password.length < 8) throw new Error('Use at least 8 characters for your password.');
  }
}
