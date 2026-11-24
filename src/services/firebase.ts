import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

export const firebaseConfig = {
  apiKey: "AIzaSyBacbJdf-jB8BTz2idVZ_nQmfACiQpniKE",
  authDomain: "concect-financas.firebaseapp.com",
  projectId: "concect-financas",
  storageBucket: "concect-financas.firebasestorage.app",
  messagingSenderId: "133313797605",
  appId: "1:133313797605:web:2ee211232ce7f7a1b7e30c",
  measurementId: "G-76T5ZM7MZM"
};

// Initialize Firebase App
export const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();

// Firebase Auth & Providers
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

// Cloud Firestore Database
export const db = getFirestore(app);
