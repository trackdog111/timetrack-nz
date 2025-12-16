// TimeTrack NZ - Firebase Configuration

import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyBcyz4DyzExGFRmjQ41W3SvQ3xgvYszzUE",
  authDomain: "timetrack-nz.firebaseapp.com",
  projectId: "timetrack-nz",
  storageBucket: "timetrack-nz.firebasestorage.app",
  messagingSenderId: "600938431502",
  appId: "1:600938431502:web:b661556289a2634c8d285f"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export default app;
