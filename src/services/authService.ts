import {
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  updateProfile,
  sendPasswordResetEmail,
  User as FirebaseUser,
  onAuthStateChanged,
  OAuthProvider
} from 'firebase/auth';
import { auth, googleProvider } from './firebase';

export class AuthService {
  public static async loginWithGoogle(): Promise<FirebaseUser> {
    const result = await signInWithPopup(auth, googleProvider);
    return result.user;
  }

  public static async loginWithApple(): Promise<FirebaseUser> {
    const appleProvider = new OAuthProvider('apple.com');
    appleProvider.addScope('email');
    appleProvider.addScope('name');
    appleProvider.setCustomParameters({ locale: 'pt_BR' });
    const result = await signInWithPopup(auth, appleProvider);
    return result.user;
  }

  public static async loginWithEmail(email: string, pass: string): Promise<FirebaseUser> {
    const result = await signInWithEmailAndPassword(auth, email.trim(), pass);
    return result.user;
  }

  public static async registerWithEmail(email: string, pass: string, name: string): Promise<FirebaseUser> {
    const result = await createUserWithEmailAndPassword(auth, email.trim(), pass);
    if (name.trim()) {
      await updateProfile(result.user, { displayName: name.trim() });
    }
    return result.user;
  }

  public static async sendPasswordReset(email: string): Promise<void> {
    await sendPasswordResetEmail(auth, email.trim());
  }

  public static async logout(): Promise<void> {
    await signOut(auth);
  }

  public static getCurrentUser(): FirebaseUser | null {
    return auth.currentUser;
  }

  public static onAuthChanged(callback: (user: FirebaseUser | null) => void) {
    return onAuthStateChanged(auth, callback);
  }
}
