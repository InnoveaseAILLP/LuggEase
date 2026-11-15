import {getApp} from '@react-native-firebase/app';
import {getAuth, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, updateProfile, sendEmailVerification, sendPasswordResetEmail, signOut, reload, getIdToken, GoogleAuthProvider, signInWithCredential} from '@react-native-firebase/auth';
import {GoogleSignin} from '@react-native-google-signin/google-signin';
import Config from 'react-native-config';
const auth = () => getAuth(getApp());
export const identity = {
  current: () => auth().currentUser,
  subscribe: (callback: () => void) => onAuthStateChanged(auth(), callback),
  async login(email: string, password: string) { await signInWithEmailAndPassword(auth(), email, password); },
  async register(name: string, email: string, password: string) {
    const {user} = await createUserWithEmailAndPassword(auth(), email, password);
    await updateProfile(user, {displayName:name});
    await sendEmailVerification(user);
  },
  async google() {
    if (!Config.GOOGLE_WEB_CLIENT_ID) throw new Error('Google sign-in is not configured.');
    GoogleSignin.configure({webClientId: Config.GOOGLE_WEB_CLIENT_ID});
    await GoogleSignin.hasPlayServices({showPlayServicesUpdateDialog: true});
    const result = await GoogleSignin.signIn();
    if (result.type !== 'success') throw new Error('Google sign-in cancelled.');
    if (!result.data.idToken) throw new Error('Google did not return an identity token.');
    await signInWithCredential(auth(), GoogleAuthProvider.credential(result.data.idToken));
  },
  async token(force = false) { const user = auth().currentUser; return user ? getIdToken(user, force) : null; },
  async verify() { const user = auth().currentUser; if (user) await sendEmailVerification(user); },
  async refresh() { const user = auth().currentUser; if (user) await reload(user); },
  async reset(email: string) { await sendPasswordResetEmail(auth(), email); },
  async logout() { await signOut(auth()); },
};
