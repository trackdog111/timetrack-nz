// Trackable NZ - Authentication Hook
// UPDATED: Added demo mode for App Store review

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
import { DEMO_COMPANY_ID, DEMO_USER_ID, DEMO_USER_EMAIL, DEMO_USER_NAME } from '../demoData';

// Fake user object for demo mode
const createDemoUser = (): User => ({
  uid: DEMO_USER_ID,
  email: DEMO_USER_EMAIL,
  displayName: DEMO_USER_NAME,
  emailVerified: true,
  isAnonymous: false,
  metadata: {},
  providerData: [],
  refreshToken: '',
  tenantId: null,
  phoneNumber: null,
  photoURL: null,
  providerId: 'demo',
  delete: async () => {},
  getIdToken: async () => 'demo-token',
  getIdTokenResult: async () => ({} as any),
  reload: async () => {},
  toJSON: () => ({})
} as User);

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [loadingCompany, setLoadingCompany] = useState(false);
  const [isDemoMode, setIsDemoMode] = useState(false);  // NEW: Demo mode flag

  useEffect(() => {
    // Skip Firebase auth listener in demo mode
    if (isDemoMode) {
      setLoading(false);
      return;
    }

    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setUser(user);
      setLoading(false);
    });
    return () => unsubscribe();
  }, [isDemoMode]);

  // Load companyId when user changes
  useEffect(() => {
    // Demo mode - use demo company
    if (isDemoMode) {
      setCompanyId(DEMO_COMPANY_ID);
      setLoadingCompany(false);
      return;
    }

    if (!user) {
      setCompanyId(null);
      return;
    }
    
    setLoadingCompany(true);
    const loadCompanyId = async () => {
      try {
        // First: check if user owns a company
        const companiesQuery = query(collection(db, 'companies'), where('ownerId', '==', user.uid));
        const companiesSnap = await getDocs(companiesQuery);
        if (!companiesSnap.empty) {
          setCompanyId(companiesSnap.docs[0].id);
          setLoadingCompany(false);
          return;
        }
        
        // Fallback: check employees collection
        const empDoc = await getDoc(doc(db, 'employees', user.uid));
        if (empDoc.exists()) {
          setCompanyId(empDoc.data().companyId || null);
        } else {
          setCompanyId(null);
        }
      } catch (err) {
        console.error('Error loading companyId:', err);
        setCompanyId(null);
      } finally {
        setLoadingCompany(false);
      }
    };
    loadCompanyId();
  }, [user, isDemoMode]);

  // NEW: Demo mode login - no Firebase, just set fake user
  const loginAsDemo = () => {
    setIsDemoMode(true);
    setUser(createDemoUser());
    setCompanyId(DEMO_COMPANY_ID);
    setLoading(false);
    setLoadingCompany(false);
    setError('');
  };

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
    // Handle demo mode logout
    if (isDemoMode) {
      setIsDemoMode(false);
      setUser(null);
      setCompanyId(null);
      return;
    }
    
    setCompanyId(null);
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
        companyId: invite.companyId,
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

      setCompanyId(invite.companyId);
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
    companyId,
    loadingCompany,
    isDemoMode,      // NEW: Export demo mode flag
    loginAsDemo,     // NEW: Export demo login function
    signIn,
    signOut,
    resetPassword,
    checkInvite,
    acceptInvite
  };
}
