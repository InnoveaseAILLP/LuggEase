import firebase from '../firebase-web-config.json';
export default {
  APP_BACKEND_URL: import.meta.env.VITE_APP_BACKEND_URL || '',
  APP_QA_BACKEND_URL: import.meta.env.VITE_APP_QA_BACKEND_URL || '',
  APP_PROD_BACKEND_URL: import.meta.env.VITE_APP_PROD_BACKEND_URL || '',
  APP_ENV: import.meta.env.VITE_APP_ENV || 'development',
  FIREBASE_API_KEY: firebase.apiKey, FIREBASE_AUTH_DOMAIN: firebase.authDomain,
  FIREBASE_PROJECT_ID: firebase.projectId, FIREBASE_APP_ID: firebase.appId,
};
