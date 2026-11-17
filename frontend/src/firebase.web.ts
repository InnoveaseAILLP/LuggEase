import {asUserFacingError} from '@/src/errors';
import {getApp, getApps, initializeApp} from 'firebase/app';
import {initializeAuth, browserPopupRedirectResolver, inMemoryPersistence, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, updateProfile, sendEmailVerification, sendPasswordResetEmail, signOut, reload, getIdToken, GoogleAuthProvider, signInWithPopup, browserSessionPersistence} from 'firebase/auth';
import Config from 'react-native-config';
const app = getApps().length ? getApp() : initializeApp({apiKey:Config.FIREBASE_API_KEY, authDomain:Config.FIREBASE_AUTH_DOMAIN, projectId:Config.FIREBASE_PROJECT_ID, appId:Config.FIREBASE_APP_ID});
const auth = initializeAuth(app, {
  persistence: [browserSessionPersistence, inMemoryPersistence],
  popupRedirectResolver: browserPopupRedirectResolver,
});
export const identity = {
  current: () => auth.currentUser,
  subscribe: (callback: () => void) => onAuthStateChanged(auth, callback),
  async login(email: string, password: string) { await signInWithEmailAndPassword(auth, email, password); },
  async register(name: string, email: string, password: string) { const {user} = await createUserWithEmailAndPassword(auth, email, password); await updateProfile(user, {displayName:name}); await sendEmailVerification(user); },
  google() {
    // Open from the click's user activation; do not await storage or network work first.
    return signInWithPopup(auth, new GoogleAuthProvider()).then(() => undefined).catch((error: {code?: string}) => {
      throw asUserFacingError(error, 'Google sign-in is temporarily unavailable. Use email sign-in or contact support.');
    });
  },
  async token(force = false) { return auth.currentUser ? getIdToken(auth.currentUser, force) : null; },
  async verify() { if (auth.currentUser) await sendEmailVerification(auth.currentUser); },
  async refresh() { if (auth.currentUser) await reload(auth.currentUser); },
  async reset(email: string) { await sendPasswordResetEmail(auth, email); },
  async logout() { await signOut(auth); },
};
