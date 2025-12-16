// TimeTrack NZ - Authentication Hook

import { useState, useEffect } from 'react';
import { 
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  User 
} from 'firebase/auth';
import { 
  doc, 
  getDoc, 
  setDoc, 
  getDocs,
  updateDoc,
  query, 
  where, 
  collection,
  Timestamp 
} from 'firebase/firestore';
import { auth, db } from '../firebase';
import { EmployeeSettings, Invite } from '../types';
import { defaultSettings } from '../utils';

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setUser(user);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const signIn = async (email: string, password: string) => {
    setError('');
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (err: any) {
      setError(err.message || 'Login failed');
      throw err;
    }
  };

  const signOut = async () => {
    await firebaseSignOut(auth);
  };

  const resetPassword = async (email: string) => {
    setError('');
    try {
      await sendPasswordResetEmail(auth, email);
    } catch (err: any) {
      if (err.code === 'auth/user-not-found') {
        setError('No account found with this email');
      } else if (err.code === 'auth/invalid-email') {
        setError('Please enter a valid email address');
      } else {
        setError(err.message || 'Failed to send reset email');
      }
      throw err;
    }
  };

  const checkInvite = async (email: string): Promise<Invite | null> => {
    setError('');
    try {
      const q = query(
        collection(db, 'invites'), 
        where('email', '==', email.toLowerCase()), 
        where('status', '==', 'pending')
      );
      const snapshot = await getDocs(q);
      if (snapshot.empty) {
        setError('No pending invite found for this email. Ask your employer to send you an invite.');
        return null;
      }
      return { id: snapshot.docs[0].id, ...snapshot.docs[0].data() } as Invite;
    } catch (err: any) {
      setError(err.message || 'Failed to check invite');
      throw err;
    }
  };

  const acceptInvite = async (
    email: string, 
    password: string, 
    invite: Invite
  ) => {
    setError('');
    try {
      const cred = await createUserWithEmailAndPassword(auth, email, password);
      await setDoc(doc(db, 'employees', cred.user.uid), {
        email: email.toLowerCase(),
        name: invite.name || email.split('@')[0],
        role: 'employee',
        settings: defaultSettings,
        createdAt: Timestamp.now()
      });
      await updateDoc(doc(db, 'invites', invite.id), {
        status: 'accepted',
        acceptedAt: Timestamp.now(),
        userId: cred.user.uid
      });
    } catch (err: any) {
      setError(err.message || 'Failed to create account');
      throw err;
    }
  };

  return {
    user,
    loading,
    error,
    setError,
    signIn,
    signOut,
    resetPassword,
    checkInvite,
    acceptInvite
  };
}
