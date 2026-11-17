import type {Role} from './types';

export const ROLE_LABELS: Record<Role, string> = {
  customer: 'Customer', partner: 'Delivery Partner', admin: 'Admin',
};
export const ROLE_DESCRIPTIONS: Record<Role, string> = {
  customer: 'Book and track your parcels or moving services.',
  partner: 'Register your vehicle and deliver after your application is approved.',
  admin: 'For assigned LuggEase administrators. Admin signup is unavailable.',
};
