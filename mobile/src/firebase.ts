// Trackable NZ - Firebase Configuration
import { initializeApp } from 'firebase/app';
import { getAuth, indexedDBLocalPersistence, initializeAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { Capacitor } from '@capacitor/core';

const firebaseConfig = {
  apiKey: "AIzaSyBcyz4DyzExGFRmjQ41W3SvQ3xgvYszzUE",
  authDomain: "timetrack-nz.firebaseapp.com",
  projectId: "timetrack-nz",
  storageBucket: "timetrack-nz.firebasestorage.app",
  messagingSenderId: "600938431502",
  appId: "1:600938431502:web:b661556289a2634c8d285f"
};

const app = initializeApp(firebaseConfig);

// Use indexedDB persistence for native apps (fixes iOS webview issues)
export const auth = Capacitor.isNativePlatform()
  ? initializeAuth(app, { persistence: indexedDBLocalPersistence })
  : getAuth(app);

export const db = getFirestore(app);
export default app;