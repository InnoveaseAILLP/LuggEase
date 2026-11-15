import {getApp, getApps, initializeApp} from 'firebase/app';
import {getAuth, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, updateProfile, sendEmailVerification, sendPasswordResetEmail, signOut, reload, getIdToken, GoogleAuthProvider, signInWithPopup, setPersistence, browserSessionPersistence} from 'firebase/auth';
import Config from 'react-native-config';
const app = getApps().length ? getApp() : initializeApp({apiKey:Config.FIREBASE_API_KEY, authDomain:Config.FIREBASE_AUTH_DOMAIN, projectId:Config.FIREBASE_PROJECT_ID, appId:Config.FIREBASE_APP_ID});
const auth = getAuth(app);
const ready = setPersistence(auth, browserSessionPersistence);
export const identity = {
  current: () => auth.currentUser,
  subscribe: (callback: () => void) => onAuthStateChanged(auth, callback),
  async login(email: string, password: string) { await ready; await signInWithEmailAndPassword(auth, email, password); },
  async register(name: string, email: string, password: string) { await ready; const {user} = await createUserWithEmailAndPassword(auth, email, password); await updateProfile(user, {displayName:name}); await sendEmailVerification(user); },
  async google() { await ready; await signInWithPopup(auth, new GoogleAuthProvider()); },
  async token(force = false) { return auth.currentUser ? getIdToken(auth.currentUser, force) : null; },
  async verify() { if (auth.currentUser) await sendEmailVerification(auth.currentUser); },
  async refresh() { if (auth.currentUser) await reload(auth.currentUser); },
  async reset(email: string) { await sendPasswordResetEmail(auth, email); },
  async logout() { await signOut(auth); },
};
