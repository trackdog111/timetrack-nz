import { useState, useEffect, useRef, Suspense, lazy } from 'react';
import { signInWithEmailAndPassword, signOut, onAuthStateChanged, User, createUserWithEmailAndPassword, deleteUser, sendPasswordResetEmail } from 'firebase/auth';
import { collection, addDoc, updateDoc, deleteDoc, doc, getDoc, getDocs, setDoc, query, where, orderBy, onSnapshot, Timestamp, writeBatch, arrayUnion } from 'firebase/firestore';
import { auth, db, MOBILE_APP_URL } from './shared/firebase';
import { Location, Break, TravelSegment, Shift, Employee, EmployeeSettings, EmployeeCosting, ChatMessage, CompanySettings, Invite, Theme, Company, Expense, Worksite } from './shared/types';
import { lightTheme, darkTheme } from './shared/theme';
import { defaultSettings, defaultCompanySettings, getHours, calcBreaks, calcTravel, fmtDur, fmtTime, fmtDate, fmtDateShort, getWeekEndingDate, getWeekEndingKey } from './shared/utils';
import { MapModal, LocationMap } from './components/MapModal';
import { EditShiftModal } from './components/EditShiftModal';

// Lazy load views for code splitting
const LiveView = lazy(() => import('./views/LiveView').then(m => ({ default: m.LiveView })));
const MyTimesheetView = lazy(() => import('./views/MyTimesheetView').then(m => ({ default: m.MyTimesheetView })));
const EmployeesView = lazy(() => import('./views/EmployeesView').then(m => ({ default: m.EmployeesView })));
const TimesheetsView = lazy(() => import('./views/TimesheetsView').then(m => ({ default: m.TimesheetsView })));
const ReportsView = lazy(() => import('./views/ReportsView').then(m => ({ default: m.ReportsView })));
const ChatView = lazy(() => import('./views/ChatView').then(m => ({ default: m.ChatView })));
const SettingsView = lazy(() => import('./views/SettingsView').then(m => ({ default: m.SettingsView })));
const ExpensesView = lazy(() => import('./views/ExpensesView').then(m => ({ default: m.ExpensesView })));
const WorksitesPage = lazy(() => import('./views/WorksitesPage'));

// Stripe Price IDs (Sandbox)
const STRIPE_PRICES: Record<string, string> = {
  starter: 'price_1SgOk9GhfEWT71HcsjwPtwLl',
  team: 'price_1SgOlCGhfEWT71HcePBlIBnX',
  business: 'price_1SgOmmGhfEWT71HcwAGqz1QA'
};

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [dark, setDark] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authMode, setAuthMode] = useState<'signin' | 'signup' | 'reset'>('signin');
  const [signupName, setSignupName] = useState('');
  const [companyName, setCompanyName] = useState('');  // NEW: For signup
  const [selectedPlan, setSelectedPlan] = useState('starter');  // From URL ?plan=oh hopefully i havent fucked something should i send this too you to make sure
  
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [view, setView] = useState('live');
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [activeShifts, setActiveShifts] = useState<Shift[]>([]);
  const [allShifts, setAllShifts] = useState<Shift[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [worksites, setWorksites] = useState<Worksite[]>([]);
  const [approvingExpense, setApprovingExpense] = useState<string | null>(null);
  const [deletingExpense, setDeletingExpense] = useState<string | null>(null);
  const [mapModal, setMapModal] = useState<{ locations: Location[], title: string, clockInLocation?: Location, clockOutLocation?: Location } | null>(null);
  const [editShiftModal, setEditShiftModal] = useState<Shift | null>(null);
  const [newEmpEmail, setNewEmpEmail] = useState('');
  const [newEmpName, setNewEmpName] = useState('');
  const [reportStart, setReportStart] = useState('');
  const [reportEnd, setReportEnd] = useState('');
  const [reportEmp, setReportEmp] = useState('all');
  const [reportData, setReportData] = useState<Shift[]>([]);
  const [newMsg, setNewMsg] = useState('');
  const [chatTab, setChatTab] = useState('team');
  const [cleanupStart, setCleanupStart] = useState('');
  const [cleanupEnd, setCleanupEnd] = useState('');
  const [cleanupConfirm, setCleanupConfirm] = useState(false);
  const [removeConfirm, setRemoveConfirm] = useState<string | null>(null);
  const [removeDeleteShifts, setRemoveDeleteShifts] = useState(false);
  const [myShift, setMyShift] = useState<Shift | null>(null);
  const [myShiftHistory, setMyShiftHistory] = useState<Shift[]>([]);
  const [clockingIn, setClockingIn] = useState(false);
  const [clockingOut, setClockingOut] = useState(false);
  const [onBreak, setOnBreak] = useState(false);
  const [breakStart, setBreakStart] = useState<Date | null>(null);
  const [myField1, setMyField1] = useState('');
  const [myField2, setMyField2] = useState('');
  const [myField3, setMyField3] = useState('');
  const [sendingEmail, setSendingEmail] = useState<string | null>(null);
  const [companySettings, setCompanySettings] = useState<CompanySettings>(defaultCompanySettings);
  const [myCurrentLocation, setMyCurrentLocation] = useState<Location | null>(null);
  const [myTraveling, setMyTraveling] = useState(false);
  const [myTravelStart, setMyTravelStart] = useState<Date | null>(null);
  const gpsIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const [showAddManualShift, setShowAddManualShift] = useState(false);
  const [manualDate, setManualDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [manualStartHour, setManualStartHour] = useState('7');
  const [manualStartMinute, setManualStartMinute] = useState('00');
  const [manualStartAmPm, setManualStartAmPm] = useState<'AM' | 'PM'>('AM');
  const [manualEndHour, setManualEndHour] = useState('5');
  const [manualEndMinute, setManualEndMinute] = useState('00');
  const [manualEndAmPm, setManualEndAmPm] = useState<'AM' | 'PM'>('PM');
  const [manualBreaks, setManualBreaks] = useState<number[]>([]);
  const [manualTravel, setManualTravel] = useState<number[]>([]);
  const [manualNotes, setManualNotes] = useState('');
  const [addingManualShift, setAddingManualShift] = useState(false);
  const [expandedMyShifts, setExpandedMyShifts] = useState<Set<string>>(new Set());
  const [editingMyShift, setEditingMyShift] = useState<string | null>(null);
  const [myEditMode, setMyEditMode] = useState<'breaks' | 'travel' | 'times' | null>(null);
  const [addTravelStartHour, setAddTravelStartHour] = useState('7');
  const [addTravelStartMinute, setAddTravelStartMinute] = useState('00');
  const [addTravelStartAmPm, setAddTravelStartAmPm] = useState<'AM' | 'PM'>('AM');
  const [addTravelEndHour, setAddTravelEndHour] = useState('8');
  const [addTravelEndMinute, setAddTravelEndMinute] = useState('00');
  const [addTravelEndAmPm, setAddTravelEndAmPm] = useState<'AM' | 'PM'>('AM');
  const [addingTravelToShift, setAddingTravelToShift] = useState(false);
  const [addingBreakToShift, setAddingBreakToShift] = useState(false);
  const [editingCompanySettings, setEditingCompanySettings] = useState<CompanySettings>(defaultCompanySettings);
  const [savingCompanySettings, setSavingCompanySettings] = useState(false);
  const [expandedEmployees, setExpandedEmployees] = useState<Set<string>>(new Set());
  const [expandedWeeks, setExpandedWeeks] = useState<Set<string>>(new Set());
  const [timesheetFilterStart, setTimesheetFilterStart] = useState('');
  const [timesheetFilterEnd, setTimesheetFilterEnd] = useState('');
  const [finalizingWeek, setFinalizingWeek] = useState<string | null>(null);
  const [timesheetEditingShiftId, setTimesheetEditingShiftId] = useState<string | null>(null);
  const [timesheetEditMode, setTimesheetEditMode] = useState<'breaks' | 'travel' | null>(null);
  const [timesheetDeleteConfirmId, setTimesheetDeleteConfirmId] = useState<string | null>(null);
  const [deletingTimesheetShift, setDeletingTimesheetShift] = useState(false);

  // Multi-tenant state
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [loadingCompany, setLoadingCompany] = useState(false);
  
  // NEW: Subscription state
  const [subscriptionStatus, setSubscriptionStatus] = useState<'trial' | 'active' | 'past_due' | 'canceled'>('trial');
  const [trialEndsAt, setTrialEndsAt] = useState<Date | null>(null);
  const [companyPlan, setCompanyPlan] = useState<string>('starter');
  const [redirectingToStripe, setRedirectingToStripe] = useState(false);

  const theme = dark ? darkTheme : lightTheme;
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

  useEffect(() => { const handleResize = () => setIsMobile(window.innerWidth < 768); window.addEventListener('resize', handleResize); return () => window.removeEventListener('resize', handleResize); }, []);
  
  // Read plan from URL ?plan=starter|team|business
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const plan = params.get('plan');
    if (plan && ['starter', 'team', 'business'].includes(plan)) {
      setSelectedPlan(plan);
      setAuthMode('signup');  // Auto-switch to signup if coming from landing page
    }
    // Check for Stripe success/cancel
    const stripeStatus = params.get('stripe');
    if (stripeStatus === 'success') {
      setSuccess('Payment successful! Your account is now active.');
      window.history.replaceState({}, '', window.location.pathname);
    } else if (stripeStatus === 'cancel') {
      setError('Payment cancelled. Your trial continues.');
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);

  // Auth state listener
  useEffect(() => { return onAuthStateChanged(auth, (u) => { setUser(u); setLoading(false); }); }, []);

  // Load companyId - check both companies (owner) and employees
  useEffect(() => {
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
        console.error('Error loading company:', err);
        setCompanyId(null);
      } finally {
        setLoadingCompany(false);
      }
    };
    loadCompanyId();
  }, [user]);

  // All Firestore listeners now filter by companyId
  useEffect(() => { 
    if (!user || !companyId) return; 
    return onSnapshot(
      query(collection(db, 'employees'), where('companyId', '==', companyId)), 
      (snap) => { setEmployees(snap.docs.map(d => ({ id: d.id, ...d.data() } as Employee))); }
    ); 
  }, [user, companyId]);

  useEffect(() => { 
    if (!user || !companyId) return; 
    return onSnapshot(
      query(collection(db, 'invites'), where('companyId', '==', companyId)), 
      (snap) => { setInvites(snap.docs.map(d => ({ id: d.id, ...d.data() } as Invite))); }
    ); 
  }, [user, companyId]);

  useEffect(() => { 
    if (!user || !companyId) return; 
    return onSnapshot(
      query(collection(db, 'shifts'), where('companyId', '==', companyId), where('status', '==', 'active')), 
      (snap) => { setActiveShifts(snap.docs.map(d => ({ id: d.id, ...d.data() } as Shift))); }
    ); 
  }, [user, companyId]);

  useEffect(() => { 
    if (!user || !companyId) return; 
    return onSnapshot(
      query(collection(db, 'shifts'), where('companyId', '==', companyId), orderBy('clockIn', 'desc')), 
      (snap) => { setAllShifts(snap.docs.map(d => ({ id: d.id, ...d.data() } as Shift))); }
    ); 
  }, [user, companyId]);

  useEffect(() => { 
    if (!user || !companyId) return; 
    return onSnapshot(
      query(collection(db, 'messages'), where('companyId', '==', companyId), orderBy('timestamp', 'desc')), 
      (snap) => { setMessages(snap.docs.map(d => ({ id: d.id, ...d.data() } as ChatMessage)).reverse()); }
    ); 
  }, [user, companyId]);

  // Expenses listener
  useEffect(() => { 
    if (!user || !companyId) return; 
    return onSnapshot(
      query(collection(db, 'expenses'), where('companyId', '==', companyId), orderBy('createdAt', 'desc')), 
      (snap) => { setExpenses(snap.docs.map(d => ({ id: d.id, ...d.data() } as Expense))); }
    ); 
  }, [user, companyId]);

  // Worksites listener
  useEffect(() => { 
    if (!user || !companyId) return; 
    return onSnapshot(
      query(collection(db, 'worksites'), where('companyId', '==', companyId), orderBy('name', 'asc')), 
      (snap) => { setWorksites(snap.docs.map(d => ({ id: d.id, ...d.data() } as Worksite))); }
    ); 
  }, [user, companyId]);

  // UPDATED: Company settings + subscription status listener
  useEffect(() => { 
    if (!user || !companyId) return; 
    return onSnapshot(doc(db, 'companies', companyId), (snap) => { 
      if (snap.exists()) { 
        const data = snap.data();
        const settings = data.settings as CompanySettings || defaultCompanySettings;
        setCompanySettings({ ...defaultCompanySettings, ...settings }); 
        setEditingCompanySettings({ ...defaultCompanySettings, ...settings }); 
        
        // Load subscription data
        setSubscriptionStatus(data.status || 'trial');
        setCompanyPlan(data.plan || 'starter');
        if (data.trialEndsAt?.toDate) {
          setTrialEndsAt(data.trialEndsAt.toDate());
        }
      } 
    }); 
  }, [user, companyId]);

  useEffect(() => { if (!user) return; const myActive = activeShifts.find(s => s.userId === user.uid); setMyShift(myActive || null); if (myActive) { const ab = myActive.breaks?.find(b => !b.endTime && !b.manualEntry); setOnBreak(!!ab); setBreakStart(ab ? ab.startTime.toDate() : null); setMyField1(myActive.jobLog?.field1 || ''); setMyField2(myActive.jobLog?.field2 || ''); setMyField3(myActive.jobLog?.field3 || ''); } else { setOnBreak(false); setBreakStart(null); } }, [user, activeShifts]);
  useEffect(() => { if (!user) return; const hist = allShifts.filter(s => s.userId === user.uid && s.status === 'completed').slice(0, 20); setMyShiftHistory(hist); }, [user, allShifts]);
  useEffect(() => { if (myShift) { const activeTravel = myShift.travelSegments?.find(t => !t.endTime); setMyTraveling(!!activeTravel); setMyTravelStart(activeTravel ? activeTravel.startTime.toDate() : null); } else { setMyTraveling(false); setMyTravelStart(null); } }, [myShift]);

  // GPS tracking
  useEffect(() => {
    if (!user || !myShift) { if (gpsIntervalRef.current) { clearInterval(gpsIntervalRef.current); gpsIntervalRef.current = null; } return; }
    const trackLocation = async () => { const location = await getMyCurrentLocation(); if (location && myShift) { try { await updateDoc(doc(db, 'shifts', myShift.id), { locationHistory: arrayUnion(location) }); } catch (err) { console.error('Error updating location:', err); } } };
    trackLocation();
    gpsIntervalRef.current = setInterval(trackLocation, 10 * 60 * 1000);
    return () => { if (gpsIntervalRef.current) { clearInterval(gpsIntervalRef.current); gpsIntervalRef.current = null; } };
  }, [user, myShift?.id]);

  // Calculate trial days remaining
  const getTrialDaysRemaining = (): number => {
    if (!trialEndsAt) return 0;
    const now = new Date();
    const diff = trialEndsAt.getTime() - now.getTime();
    return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
  };

  // Check if trial is expired
  const isTrialExpired = (): boolean => {
    if (subscriptionStatus !== 'trial') return false;
    if (!trialEndsAt) return false;
    return new Date() > trialEndsAt;
  };

  // Redirect to Stripe Checkout
  const handleAddPayment = async () => {
    if (!companyId || !user) return;
    setRedirectingToStripe(true);
    
    try {
      const priceId = STRIPE_PRICES[companyPlan] || STRIPE_PRICES.starter;
      
      // Call Firebase Function to create Stripe Checkout session
      const response = await fetch('https://australia-southeast1-timetrack-nz.cloudfunctions.net/stripeCreateCheckout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          priceId,
          companyId,
          customerEmail: user.email,
          successUrl: `${window.location.origin}?stripe=success`,
          cancelUrl: `${window.location.origin}?stripe=cancel`
        })
      });
      
      const data = await response.json();
      
      if (data.url) {
        window.location.href = data.url;
      } else {
        setError('Failed to create checkout session');
        setRedirectingToStripe(false);
      }
    } catch (err: any) {
      console.error('Stripe redirect error:', err);
      setError('Failed to redirect to payment');
      setRedirectingToStripe(false);
    }
  };

  const getMyCurrentLocation = (): Promise<Location | null> => {
    return new Promise((resolve) => {
      if (!navigator.geolocation) { resolve(null); return; }
      navigator.geolocation.getCurrentPosition(
        (position) => { const loc: Location = { latitude: position.coords.latitude, longitude: position.coords.longitude, accuracy: position.coords.accuracy, timestamp: Date.now() }; setMyCurrentLocation(loc); resolve(loc); },
        () => resolve(null),
        { enableHighAccuracy: true, timeout: 10000 }
      );
    });
  };

  const getEmployeeInfo = (userId?: string, userEmail?: string): { name: string, email: string, exists: boolean } => {
    if (userId) { const emp = employees.find(e => e.id === userId); if (emp) return { name: emp.name || emp.email.split('@')[0], email: emp.email, exists: true }; }
    if (userEmail) { const emp = employees.find(e => e.email === userEmail); if (emp) return { name: emp.name || emp.email.split('@')[0], email: emp.email, exists: true }; return { name: userEmail.split('@')[0], email: userEmail, exists: false }; }
    return { name: 'Unknown', email: '', exists: false };
  };
  const getEmployeeName = (userId?: string, userEmail?: string): string => getEmployeeInfo(userId, userEmail).name;

  const handleLogin = async (e: React.FormEvent) => { e.preventDefault(); try { await signInWithEmailAndPassword(auth, email, password); } catch (err: any) { setError(err.message); } };
  
  // Signup now creates a company first, then employee with companyId
  const handleSignUp = async (e: React.FormEvent) => { 
    e.preventDefault(); 
    if (!companyName.trim()) {
      setError('Please enter your company/business name');
      return;
    }
    try { 
      const cred = await createUserWithEmailAndPassword(auth, email, password); 
      
      // Calculate trial end date (30 days from now)
      const trialEndsAt = new Date();
      trialEndsAt.setDate(trialEndsAt.getDate() + 30);
      
      // Create company document first
      const companyRef = await addDoc(collection(db, 'companies'), {
        name: companyName.trim(),
        ownerId: cred.user.uid,
        ownerEmail: email,
        createdAt: Timestamp.now(),
        plan: selectedPlan,  // starter, team, or business
        status: 'trial',
        trialEndsAt: Timestamp.fromDate(trialEndsAt),
        settings: defaultCompanySettings
      });
      
      // Create employee with companyId
      await setDoc(doc(db, 'employees', cred.user.uid), { 
        companyId: companyRef.id,
        email, 
        name: signupName, 
        role: 'manager', 
        settings: defaultSettings, 
        createdAt: Timestamp.now() 
      }); 

      // Set local state
      setCompanyId(companyRef.id);
      
      // Clear URL params
      window.history.replaceState({}, '', window.location.pathname);
    } catch (err: any) { setError(err.message); } 
  };

  const handleResetPassword = async (e: React.FormEvent) => { e.preventDefault(); try { await sendPasswordResetEmail(auth, email); setSuccess('Password reset email sent!'); setAuthMode('signin'); } catch (err: any) { setError(err.message); } };
  const navigateTo = (v: string) => { setView(v); setSidebarOpen(false); };

  const updateSettings = async (empId: string, updates: Partial<EmployeeSettings>) => { const ref = doc(db, 'employees', empId); const snap = await getDoc(ref); await updateDoc(ref, { settings: { ...(snap.data()?.settings || defaultSettings), ...updates } }); setSuccess('Updated!'); setTimeout(() => setSuccess(''), 2000); };
  
  const updateCosting = async (empId: string, costing: EmployeeCosting) => { try { await updateDoc(doc(db, 'employees', empId), { costing }); setSuccess('Costing updated!'); setTimeout(() => setSuccess(''), 2000); } catch (err: any) { setError(err.message || 'Failed to update costing'); } };
  
  // Save to companies/{companyId} instead of company/settings
  const saveCompanySettings = async () => { 
    if (!companyId) return;
    setSavingCompanySettings(true); 
    try { 
      await updateDoc(doc(db, 'companies', companyId), { settings: editingCompanySettings }); 
      setSuccess('Saved!'); 
      setTimeout(() => setSuccess(''), 2000); 
    } catch (err: any) { setError(err.message); } 
    finally { setSavingCompanySettings(false); } 
  };

  // Include companyId in invite
  const inviteEmployee = async (e: React.FormEvent) => { 
    e.preventDefault(); 
    if (!newEmpEmail || !companyId) return; 
    await addDoc(collection(db, 'invites'), { 
      companyId,
      email: newEmpEmail.toLowerCase(), 
      name: newEmpName, 
      status: 'pending', 
      createdAt: Timestamp.now() 
    }); 
    setNewEmpEmail(''); 
    setNewEmpName(''); 
    setSuccess('Invite created!'); 
  };

  const cancelInvite = async (id: string) => { await deleteDoc(doc(db, 'invites', id)); };
  const sendInviteEmail = async (inv: Invite) => { setSendingEmail(inv.id); try { const res = await fetch(`${MOBILE_APP_URL}/api/send-invite`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: inv.email, inviteId: inv.id, name: inv.name }) }); if (res.ok) { await updateDoc(doc(db, 'invites', inv.id), { emailSent: true }); setSuccess('Email sent!'); } else { setError('Failed to send'); } } catch (err) { setError('Failed to send'); } setSendingEmail(null); };
  const copyInviteLink = (inv: Invite) => { navigator.clipboard.writeText(`${MOBILE_APP_URL}/join?invite=${inv.id}`); setSuccess('Link copied!'); };
  const removeEmployee = async (empId: string) => { if (removeDeleteShifts) { const batch = writeBatch(db); allShifts.filter(s => s.userId === empId).forEach(s => batch.delete(doc(db, 'shifts', s.id))); await batch.commit(); } const emp = employees.find(e => e.id === empId); if (emp) { try { await deleteUser(auth.currentUser!); } catch {} } await deleteDoc(doc(db, 'employees', empId)); setRemoveConfirm(null); setRemoveDeleteShifts(false); };

  const finalizeWeek = async (empEmail: string, weekKey: string, shifts: Shift[]) => { if (!user) return; setFinalizingWeek(`${empEmail}-${weekKey}`); try { const batch = writeBatch(db); shifts.forEach(shift => { batch.update(doc(db, 'shifts', shift.id), { finalized: true, finalizedAt: Timestamp.now(), finalizedBy: user.uid, finalizedByEmail: user.email }); }); await batch.commit(); setSuccess('Week finalized ✓'); setTimeout(() => setSuccess(''), 2000); } catch (err: any) { setError(err.message || 'Failed to finalize'); } setFinalizingWeek(null); };

  const handleTimesheetAddBreak = async (shiftId: string, minutes: number) => { setAddingBreakToShift(true); try { const shiftRef = doc(db, 'shifts', shiftId); const now = Timestamp.now(); await updateDoc(shiftRef, { breaks: arrayUnion({ startTime: now, endTime: now, durationMinutes: minutes, manualEntry: true }), editedAt: now, editedBy: user?.uid, editedByEmail: user?.email }); setSuccess(`${minutes}m break added`); setTimeout(() => setSuccess(''), 2000); } catch (err: any) { setError(err.message || 'Failed to add break'); } setAddingBreakToShift(false); };
  const handleTimesheetAddTravel = async (shiftId: string, minutes: number) => { setAddingTravelToShift(true); try { const shiftRef = doc(db, 'shifts', shiftId); const now = Timestamp.now(); await updateDoc(shiftRef, { travelSegments: arrayUnion({ startTime: now, endTime: now, durationMinutes: minutes }), editedAt: now, editedBy: user?.uid, editedByEmail: user?.email }); setSuccess(`${minutes}m travel added`); setTimeout(() => setSuccess(''), 2000); } catch (err: any) { setError(err.message || 'Failed to add travel'); } setAddingTravelToShift(false); };
  const handleTimesheetDeleteShift = async (shiftId: string) => { setDeletingTimesheetShift(true); try { await deleteDoc(doc(db, 'shifts', shiftId)); setSuccess('Shift deleted'); setTimeout(() => setSuccess(''), 2000); setTimesheetDeleteConfirmId(null); } catch (err: any) { setError(err.message || 'Failed to delete shift'); } setDeletingTimesheetShift(false); };
  const closeTimesheetEditPanel = () => { setTimesheetEditingShiftId(null); setTimesheetEditMode(null); };

  const genReport = () => { if (!reportStart || !reportEnd) { setError('Select dates'); return; } const s = new Date(reportStart); s.setHours(0,0,0,0); const e = new Date(reportEnd); e.setHours(23,59,59,999); let data = allShifts.filter(sh => { if (!sh.clockIn?.toDate) return false; const d = sh.clockIn.toDate(); return d >= s && d <= e && sh.status === 'completed'; }); if (reportEmp !== 'all') data = data.filter(sh => sh.userId === reportEmp); setReportData(data); };
  const exportCSV = () => { if (!reportData.length) return; const rows = [['Date','Employee','In','Out','Worked','Paid','Unpaid','Travel']]; reportData.forEach(sh => { const h = getHours(sh.clockIn, sh.clockOut); const b = calcBreaks(sh.breaks || [], h, companySettings.paidRestMinutes); const t = calcTravel(sh.travelSegments || []); rows.push([fmtDateShort(sh.clockIn), getEmployeeName(sh.userId, sh.userEmail), fmtTime(sh.clockIn), sh.clockOut ? fmtTime(sh.clockOut) : '-', fmtDur((h*60)-b.unpaid), b.paid+'m', b.unpaid+'m', t+'m']); }); const csv = rows.map(r => r.join(',')).join('\n'); const blob = new Blob([csv], { type: 'text/csv' }); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `timetrack-${reportStart}-${reportEnd}.csv`; a.click(); };
  const exportPDF = () => { if (!reportData.length) return; let total = 0, tPaid = 0, tUnpaid = 0; const rows = reportData.map(sh => { const h = getHours(sh.clockIn, sh.clockOut); const b = calcBreaks(sh.breaks || [], h, companySettings.paidRestMinutes); const worked = (h*60) - b.unpaid; total += worked; tPaid += b.paid; tUnpaid += b.unpaid; return `<tr><td>${fmtDateShort(sh.clockIn)}</td><td>${getEmployeeName(sh.userId, sh.userEmail)}</td><td>${fmtTime(sh.clockIn)}</td><td>${sh.clockOut ? fmtTime(sh.clockOut) : '-'}</td><td>${fmtDur(worked)}</td><td>${b.paid}m</td><td>${b.unpaid}m</td></tr>`; }).join(''); const html = `<!DOCTYPE html><html><head><style>body{font-family:Arial;padding:20px}table{width:100%;border-collapse:collapse}th,td{border:1px solid #ddd;padding:8px}th{background:#1e40af;color:white}</style></head><body><h1>TimeTrack Report</h1><p>${reportStart} to ${reportEnd}</p><table><tr><th>Date</th><th>Employee</th><th>In</th><th>Out</th><th>Worked</th><th>Paid</th><th>Unpaid</th></tr>${rows}</table><h3>Total: ${fmtDur(total)}, ${tPaid}m paid, ${tUnpaid}m unpaid</h3></body></html>`; const w = window.open('', '_blank'); if (w) { w.document.write(html); w.document.close(); w.print(); } };

  // Expense functions
  const approveExpense = async (expenseId: string) => {
    if (!user) return;
    setApprovingExpense(expenseId);
    try {
      await updateDoc(doc(db, 'expenses', expenseId), {
        status: 'approved',
        approvedAt: Timestamp.now(),
        approvedBy: user.email
      });
      setSuccess('Expense approved!');
      setTimeout(() => setSuccess(''), 2000);
    } catch (err: any) {
      setError(err.message || 'Failed to approve expense');
    }
    setApprovingExpense(null);
  };

  const deleteExpense = async (expenseId: string) => {
    setDeletingExpense(expenseId);
    try {
      await deleteDoc(doc(db, 'expenses', expenseId));
      setSuccess('Expense deleted');
      setTimeout(() => setSuccess(''), 2000);
    } catch (err: any) {
      setError(err.message || 'Failed to delete expense');
    }
    setDeletingExpense(null);
  };

  const exportExpensesCSV = () => {
    const approvedExpenses = expenses.filter(exp => {
      if (exp.status !== 'approved') return false;
      if (!reportStart || !reportEnd) return true;
      const s = new Date(reportStart); s.setHours(0,0,0,0);
      const e = new Date(reportEnd); e.setHours(23,59,59,999);
      const expDate: Date = exp.date?.toDate ? exp.date.toDate() : new Date(exp.date as any);
      return expDate >= s && expDate <= e;
    });
    if (!approvedExpenses.length) { setError('No approved expenses to export'); return; }
    const rows = [['Date','Employee','Category','Amount','Note','Approved By']];
    approvedExpenses.forEach(exp => {
      const expDate: Date = exp.date?.toDate ? exp.date.toDate() : new Date(exp.date as any);
      rows.push([
        expDate.toLocaleDateString('en-NZ'),
        getEmployeeName(exp.odId, exp.odEmail),
        exp.category,
        exp.amount.toFixed(2),
        exp.note || '',
        exp.approvedBy || ''
      ]);
    });
    const csv = rows.map(r => r.map(c => `"${c}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const a = document.createElement('a'); 
    a.href = URL.createObjectURL(blob); 
    a.download = `expenses-${reportStart || 'all'}-${reportEnd || 'all'}.csv`; 
    a.click();
  };

  // Worksite functions
  const addWorksite = async (name: string, address?: string): Promise<boolean> => {
    if (!companyId || !name.trim()) return false;
    try {
      await addDoc(collection(db, 'worksites'), {
        companyId,
        name: name.trim(),
        address: address?.trim() || '',
        status: 'active',
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now()
      });
      setSuccess('Worksite added!');
      setTimeout(() => setSuccess(''), 2000);
      return true;
    } catch (err: any) {
      setError(err.message || 'Failed to add worksite');
      return false;
    }
  };

  const updateWorksite = async (worksiteId: string, data: { name?: string; address?: string }): Promise<boolean> => {
    try {
      const updateData: any = { updatedAt: Timestamp.now() };
      if (data.name !== undefined) updateData.name = data.name.trim();
      if (data.address !== undefined) updateData.address = data.address.trim();
      await updateDoc(doc(db, 'worksites', worksiteId), updateData);
      setSuccess('Worksite updated!');
      setTimeout(() => setSuccess(''), 2000);
      return true;
    } catch (err: any) {
      setError(err.message || 'Failed to update worksite');
      return false;
    }
  };

  const archiveWorksite = async (worksiteId: string): Promise<boolean> => {
    try {
      await updateDoc(doc(db, 'worksites', worksiteId), { status: 'archived', updatedAt: Timestamp.now() });
      setSuccess('Worksite archived');
      setTimeout(() => setSuccess(''), 2000);
      return true;
    } catch (err: any) {
      setError(err.message || 'Failed to archive worksite');
      return false;
    }
  };

  const restoreWorksite = async (worksiteId: string): Promise<boolean> => {
    try {
      await updateDoc(doc(db, 'worksites', worksiteId), { status: 'active', updatedAt: Timestamp.now() });
      setSuccess('Worksite restored');
      setTimeout(() => setSuccess(''), 2000);
      return true;
    } catch (err: any) {
      setError(err.message || 'Failed to restore worksite');
      return false;
    }
  };

  const deleteWorksite = async (worksiteId: string): Promise<boolean> => {
    try {
      await deleteDoc(doc(db, 'worksites', worksiteId));
      setSuccess('Worksite deleted');
      setTimeout(() => setSuccess(''), 2000);
      return true;
    } catch (err: any) {
      setError(err.message || 'Failed to delete worksite');
      return false;
    }
  };

  const cleanup = async () => { if (!cleanupConfirm) return; const s = new Date(cleanupStart); const e = new Date(cleanupEnd); e.setHours(23,59,59); const toDelete = allShifts.filter(sh => { if (!sh.clockIn?.toDate) return false; const d = sh.clockIn.toDate(); return d >= s && d <= e && sh.status === 'completed'; }); const batch = writeBatch(db); toDelete.forEach(sh => batch.delete(doc(db, 'shifts', sh.id))); await batch.commit(); setCleanupConfirm(false); setCleanupStart(''); setCleanupEnd(''); setSuccess(`Deleted ${toDelete.length} shifts`); };
  const sendMsg = async (e: React.FormEvent) => { e.preventDefault(); if (!newMsg.trim() || !user || !companyId) return; await addDoc(collection(db, 'messages'), { companyId, text: newMsg.trim(), senderId: user.uid, senderEmail: user.email, timestamp: Timestamp.now(), target: chatTab === 'team' ? 'team' : undefined }); setNewMsg(''); };

  const myClockIn = async () => { if (!user || !companyId) return; setClockingIn(true); const location = await getMyCurrentLocation(); try { await addDoc(collection(db, 'shifts'), { companyId, userId: user.uid, userEmail: user.email, clockIn: Timestamp.now(), status: 'active', breaks: [], travelSegments: [], locationHistory: location ? [location] : [], clockInLocation: location || null, jobLog: { field1: '', field2: '', field3: '' } }); setSuccess('Clocked in!'); } catch (err: any) { setError(err.message); } setClockingIn(false); };
  const myClockOut = async () => { if (!myShift) return; setClockingOut(true); const location = await getMyCurrentLocation(); try { const updates: any = { clockOut: Timestamp.now(), status: 'completed' }; if (location) updates.clockOutLocation = location; if (onBreak && breakStart) { const breaks = [...(myShift.breaks || [])]; const idx = breaks.findIndex(b => !b.endTime && !b.manualEntry); if (idx !== -1) { breaks[idx] = { ...breaks[idx], endTime: Timestamp.now() }; updates.breaks = breaks; } } await updateDoc(doc(db, 'shifts', myShift.id), updates); setSuccess('Clocked out!'); } catch (err: any) { setError(err.message); } setClockingOut(false); };
  const myStartBreak = async () => { if (!myShift) return; await updateDoc(doc(db, 'shifts', myShift.id), { breaks: arrayUnion({ startTime: Timestamp.now(), endTime: null }) }); };
  const myEndBreak = async () => { if (!myShift) return; const breaks = [...(myShift.breaks || [])]; const idx = breaks.findIndex(b => !b.endTime && !b.manualEntry); if (idx !== -1) { breaks[idx] = { ...breaks[idx], endTime: Timestamp.now() }; await updateDoc(doc(db, 'shifts', myShift.id), { breaks }); } };
  const myStartTravel = async () => { if (!myShift) return; await updateDoc(doc(db, 'shifts', myShift.id), { travelSegments: arrayUnion({ startTime: Timestamp.now(), endTime: null }) }); };
  const myEndTravel = async () => { if (!myShift) return; const segs = [...(myShift.travelSegments || [])]; const idx = segs.findIndex(t => !t.endTime); if (idx !== -1) { segs[idx] = { ...segs[idx], endTime: Timestamp.now() }; await updateDoc(doc(db, 'shifts', myShift.id), { travelSegments: segs }); } };
  const myAddBreak = async (mins: number) => { if (!myShift) return; const now = Timestamp.now(); await updateDoc(doc(db, 'shifts', myShift.id), { breaks: arrayUnion({ startTime: now, endTime: now, durationMinutes: mins, manualEntry: true }) }); setSuccess(`${mins}m break added`); setTimeout(() => setSuccess(''), 2000); };

  const saveMyField1 = async () => { if (!myShift) return; await updateDoc(doc(db, 'shifts', myShift.id), { 'jobLog.field1': myField1 }); setSuccess('Saved!'); setTimeout(() => setSuccess(''), 1500); };
  const saveMyField2 = async () => { if (!myShift) return; await updateDoc(doc(db, 'shifts', myShift.id), { 'jobLog.field2': myField2 }); setSuccess('Saved!'); setTimeout(() => setSuccess(''), 1500); };
  const saveMyField3 = async () => { if (!myShift) return; await updateDoc(doc(db, 'shifts', myShift.id), { 'jobLog.field3': myField3 }); setSuccess('Saved!'); setTimeout(() => setSuccess(''), 1500); };

  const toggleMyShift = (id: string) => { setExpandedMyShifts(prev => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; }); };
  const toggleEmployee = (email: string) => { setExpandedEmployees(prev => { const next = new Set(prev); if (next.has(email)) next.delete(email); else next.add(email); return next; }); };
  const toggleWeek = (key: string) => { setExpandedWeeks(prev => { const next = new Set(prev); if (next.has(key)) next.delete(key); else next.add(key); return next; }); };
  const closeMyEditPanel = () => { setEditingMyShift(null); setMyEditMode(null); };

  const myAddManualShift = async () => {
    if (!user || !companyId) return;
    setAddingManualShift(true);
    try {
      const startHour24 = manualStartAmPm === 'PM' && manualStartHour !== '12' ? parseInt(manualStartHour) + 12 : (manualStartAmPm === 'AM' && manualStartHour === '12' ? 0 : parseInt(manualStartHour));
      const endHour24 = manualEndAmPm === 'PM' && manualEndHour !== '12' ? parseInt(manualEndHour) + 12 : (manualEndAmPm === 'AM' && manualEndHour === '12' ? 0 : parseInt(manualEndHour));
      const clockIn = new Date(manualDate); clockIn.setHours(startHour24, parseInt(manualStartMinute), 0, 0);
      const clockOut = new Date(manualDate); clockOut.setHours(endHour24, parseInt(manualEndMinute), 0, 0);
      if (clockOut <= clockIn) clockOut.setDate(clockOut.getDate() + 1);
      const breaks = manualBreaks.map(mins => ({ startTime: Timestamp.fromDate(clockIn), endTime: Timestamp.fromDate(clockIn), durationMinutes: mins, manualEntry: true }));
      const travelSegments = manualTravel.map(mins => ({ startTime: Timestamp.fromDate(clockIn), endTime: Timestamp.fromDate(clockIn), durationMinutes: mins }));
      await addDoc(collection(db, 'shifts'), { companyId, userId: user.uid, userEmail: user.email, clockIn: Timestamp.fromDate(clockIn), clockOut: Timestamp.fromDate(clockOut), status: 'completed', breaks, travelSegments, locationHistory: [], manualEntry: true, notes: manualNotes || null, jobLog: { field1: '', field2: '', field3: '' } });
      setShowAddManualShift(false); setManualBreaks([]); setManualTravel([]); setManualNotes(''); setSuccess('Shift added!');
    } catch (err: any) { setError(err.message); }
    setAddingManualShift(false);
  };

  const myAddBreakToShift = async (shiftId: string, mins: number) => { setAddingBreakToShift(true); try { const shiftRef = doc(db, 'shifts', shiftId); const now = Timestamp.now(); await updateDoc(shiftRef, { breaks: arrayUnion({ startTime: now, endTime: now, durationMinutes: mins, manualEntry: true }) }); setSuccess(`${mins}m break added`); setTimeout(() => setSuccess(''), 2000); } catch (err: any) { setError(err.message); } setAddingBreakToShift(false); };
  const myAddTravelToShift = async (shiftId: string) => { setAddingTravelToShift(true); try { const startHour24 = addTravelStartAmPm === 'PM' && addTravelStartHour !== '12' ? parseInt(addTravelStartHour) + 12 : (addTravelStartAmPm === 'AM' && addTravelStartHour === '12' ? 0 : parseInt(addTravelStartHour)); const endHour24 = addTravelEndAmPm === 'PM' && addTravelEndHour !== '12' ? parseInt(addTravelEndHour) + 12 : (addTravelEndAmPm === 'AM' && addTravelEndHour === '12' ? 0 : parseInt(addTravelEndHour)); const startTime = new Date(); startTime.setHours(startHour24, parseInt(addTravelStartMinute), 0, 0); const endTime = new Date(); endTime.setHours(endHour24, parseInt(addTravelEndMinute), 0, 0); if (endTime <= startTime) endTime.setDate(endTime.getDate() + 1); const mins = Math.round((endTime.getTime() - startTime.getTime()) / 60000); const shiftRef = doc(db, 'shifts', shiftId); await updateDoc(shiftRef, { travelSegments: arrayUnion({ startTime: Timestamp.fromDate(startTime), endTime: Timestamp.fromDate(endTime), durationMinutes: mins }) }); setSuccess(`${mins}m travel added`); setTimeout(() => setSuccess(''), 2000); } catch (err: any) { setError(err.message); } setAddingTravelToShift(false); };
  const myDeleteBreakFromShift = async (shiftId: string, breakIndex: number) => { const shift = myShiftHistory.find(s => s.id === shiftId); if (!shift) return; const breaks = [...(shift.breaks || [])]; breaks.splice(breakIndex, 1); await updateDoc(doc(db, 'shifts', shiftId), { breaks }); setSuccess('Break deleted'); setTimeout(() => setSuccess(''), 2000); };
  const myDeleteTravelFromShift = async (shiftId: string, travelIndex: number) => { const shift = myShiftHistory.find(s => s.id === shiftId); if (!shift) return; const segs = [...(shift.travelSegments || [])]; segs.splice(travelIndex, 1); await updateDoc(doc(db, 'shifts', shiftId), { travelSegments: segs }); setSuccess('Travel deleted'); setTimeout(() => setSuccess(''), 2000); };
  const myDeleteShift = async (shiftId: string) => { await deleteDoc(doc(db, 'shifts', shiftId)); setSuccess('Shift deleted'); setTimeout(() => setSuccess(''), 2000); closeMyEditPanel(); };

  const setThisWeek = () => { const now = new Date(); const day = now.getDay(); const diff = now.getDate() - day + (day === 0 ? -6 : 1); const monday = new Date(now.setDate(diff)); monday.setHours(0,0,0,0); const sunday = new Date(monday); sunday.setDate(monday.getDate() + 6); setTimesheetFilterStart(monday.toISOString().split('T')[0]); setTimesheetFilterEnd(sunday.toISOString().split('T')[0]); };
  const setLastWeek = () => { const now = new Date(); const day = now.getDay(); const diff = now.getDate() - day + (day === 0 ? -6 : 1) - 7; const monday = new Date(now.setDate(diff)); monday.setHours(0,0,0,0); const sunday = new Date(monday); sunday.setDate(monday.getDate() + 6); setTimesheetFilterStart(monday.toISOString().split('T')[0]); setTimesheetFilterEnd(sunday.toISOString().split('T')[0]); };
  const setThisMonth = () => { const now = new Date(); const first = new Date(now.getFullYear(), now.getMonth(), 1); const last = new Date(now.getFullYear(), now.getMonth() + 1, 0); setTimesheetFilterStart(first.toISOString().split('T')[0]); setTimesheetFilterEnd(last.toISOString().split('T')[0]); };
  const setLastMonth = () => { const now = new Date(); const first = new Date(now.getFullYear(), now.getMonth() - 1, 1); const last = new Date(now.getFullYear(), now.getMonth(), 0); setTimesheetFilterStart(first.toISOString().split('T')[0]); setTimesheetFilterEnd(last.toISOString().split('T')[0]); };
  const clearTimesheetFilter = () => { setTimesheetFilterStart(''); setTimesheetFilterEnd(''); };

  const getGroupedTimesheets = () => {
    const completedShifts = allShifts.filter(s => s.status === 'completed');
    let filteredShifts = completedShifts;
    if (timesheetFilterStart || timesheetFilterEnd) {
      filteredShifts = completedShifts.filter(s => { if (!s.clockIn?.toDate) return false; const d = s.clockIn.toDate(); if (timesheetFilterStart) { const st = new Date(timesheetFilterStart); st.setHours(0,0,0,0); if (d < st) return false; } if (timesheetFilterEnd) { const en = new Date(timesheetFilterEnd); en.setHours(23,59,59,999); if (d > en) return false; } return true; });
    }
    const grouped: Record<string, { name: string; email: string; exists: boolean; weeks: Record<string, { weekEnd: Date; shifts: Shift[]; totalMinutes: number; finalized: boolean }> }> = {};
    filteredShifts.forEach(shift => {
      const { name, email, exists } = getEmployeeInfo(shift.userId, shift.userEmail);
      if (!grouped[email]) grouped[email] = { name, email, exists, weeks: {} };
      const shiftDate = shift.clockIn?.toDate?.() || new Date();
      const weekKey = getWeekEndingKey(shiftDate, companySettings.payWeekEndDay);
      if (!grouped[email].weeks[weekKey]) grouped[email].weeks[weekKey] = { weekEnd: getWeekEndingDate(shiftDate, companySettings.payWeekEndDay), shifts: [], totalMinutes: 0, finalized: true };
      const h = getHours(shift.clockIn, shift.clockOut);
      const b = calcBreaks(shift.breaks || [], h, companySettings.paidRestMinutes);
      grouped[email].weeks[weekKey].shifts.push(shift);
      grouped[email].weeks[weekKey].totalMinutes += (h * 60) - b.unpaid;
      if (!shift.finalized) grouped[email].weeks[weekKey].finalized = false;
    });
    Object.values(grouped).forEach(emp => { const sorted: typeof emp.weeks = {}; Object.keys(emp.weeks).sort((a, b) => b.localeCompare(a)).forEach(k => { sorted[k] = emp.weeks[k]; }); emp.weeks = sorted; });
    return grouped;
  };

  const styles = {
    input: { padding: '12px', borderRadius: '8px', border: `1px solid ${theme.inputBorder}`, background: theme.input, color: theme.text, fontSize: '14px', width: '100%', boxSizing: 'border-box' as const },
    btn: { padding: '12px 20px', borderRadius: '8px', background: theme.primary, color: 'white', border: 'none', cursor: 'pointer', fontWeight: '600' as const, fontSize: '14px' },
    btnDanger: { padding: '12px 20px', borderRadius: '8px', background: theme.danger, color: 'white', border: 'none', cursor: 'pointer', fontWeight: '600' as const },
    card: { background: theme.card, padding: '20px', borderRadius: '12px', marginBottom: '16px', border: `1px solid ${theme.cardBorder}` },
  };

  // Show loading while getting companyId
  if (loading || loadingCompany) return <main style={{ minHeight: '100vh', background: theme.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><p style={{ color: theme.text }}>Loading...</p></main>;

  // Login screen with company name field for signup
  if (!user) return (
    <main style={{ minHeight: '100vh', background: theme.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
      <div style={{ ...styles.card, width: '100%', maxWidth: '400px' }}>
        <h1 style={{ color: theme.text, textAlign: 'center', marginBottom: '8px' }}>Trackable NZ</h1>
        <p style={{ color: theme.textMuted, textAlign: 'center', marginBottom: '24px' }}>Manager Dashboard</p>
        {authMode !== 'reset' && (<div style={{ display: 'flex', marginBottom: '24px', background: theme.cardAlt, borderRadius: '8px', padding: '4px' }}><button onClick={() => { setAuthMode('signin'); setError(''); }} style={{ flex: 1, padding: '10px', borderRadius: '6px', border: 'none', cursor: 'pointer', fontWeight: '600', background: authMode === 'signin' ? theme.primary : 'transparent', color: authMode === 'signin' ? 'white' : theme.text }}>Sign In</button><button onClick={() => { setAuthMode('signup'); setError(''); }} style={{ flex: 1, padding: '10px', borderRadius: '6px', border: 'none', cursor: 'pointer', fontWeight: '600', background: authMode === 'signup' ? theme.primary : 'transparent', color: authMode === 'signup' ? 'white' : theme.text }}>Sign Up</button></div>)}
        {authMode === 'signup' && <div style={{ background: theme.successBg, color: theme.success, padding: '12px 16px', borderRadius: '8px', marginBottom: '16px', textAlign: 'center' }}>🎉 30-day free trial • No credit card required<br/><span style={{ fontSize: '12px', opacity: 0.8 }}>{selectedPlan.charAt(0).toUpperCase() + selectedPlan.slice(1)} plan selected</span></div>}
        {error && <p style={{ color: theme.danger, marginBottom: '16px', fontSize: '14px' }}>{error}</p>}
        {success && <p style={{ color: theme.success, marginBottom: '16px', fontSize: '14px' }}>{success}</p>}
        <form onSubmit={authMode === 'signin' ? handleLogin : authMode === 'signup' ? handleSignUp : handleResetPassword}>
          {authMode === 'signup' && <input placeholder="Company / Business Name" value={companyName} onChange={e => setCompanyName(e.target.value)} style={{ ...styles.input, marginBottom: '12px' }} />}
          {authMode === 'signup' && <input placeholder="Your Name" value={signupName} onChange={e => setSignupName(e.target.value)} style={{ ...styles.input, marginBottom: '12px' }} />}
          <input placeholder="Email" type="email" value={email} onChange={e => setEmail(e.target.value)} style={{ ...styles.input, marginBottom: '12px' }} />
          {authMode !== 'reset' && <input placeholder="Password" type="password" value={password} onChange={e => setPassword(e.target.value)} style={{ ...styles.input, marginBottom: '16px' }} />}
          <button type="submit" style={{ ...styles.btn, width: '100%' }}>{authMode === 'signin' ? 'Sign In' : authMode === 'signup' ? 'Start Free Trial' : 'Send Reset Email'}</button>
        </form>
        {authMode === 'signin' && <button onClick={() => setAuthMode('reset')} style={{ background: 'none', border: 'none', color: theme.primary, cursor: 'pointer', fontSize: '14px', marginTop: '16px', display: 'block', width: '100%', textAlign: 'center' }}>Forgot password?</button>}
        {authMode === 'reset' && <button onClick={() => setAuthMode('signin')} style={{ background: 'none', border: 'none', color: theme.primary, cursor: 'pointer', fontSize: '14px', marginTop: '16px', display: 'block', width: '100%', textAlign: 'center' }}>← Back</button>}
      </div>
    </main>
  );

  // Show error if user has no company (edge case - shouldn't happen)
  if (!companyId) return (
    <main style={{ minHeight: '100vh', background: theme.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
      <div style={{ ...styles.card, width: '100%', maxWidth: '400px', textAlign: 'center' }}>
        <h2 style={{ color: theme.danger, marginBottom: '16px' }}>Account Error</h2>
        <p style={{ color: theme.text, marginBottom: '24px' }}>Your account is not linked to a company. Please contact support or sign up again.</p>
        <button onClick={() => signOut(auth)} style={{ ...styles.btn }}>Sign Out</button>
      </div>
    </main>
  );

  // PAYWALL: Block access when trial expired
  if (isTrialExpired()) return (
    <main style={{ minHeight: '100vh', background: theme.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
      <div style={{ ...styles.card, width: '100%', maxWidth: '500px', textAlign: 'center' }}>
        <div style={{ fontSize: '48px', marginBottom: '16px' }}>⏰</div>
        <h2 style={{ color: theme.text, marginBottom: '8px' }}>Trial Expired</h2>
        <p style={{ color: theme.textMuted, marginBottom: '24px' }}>
          Your 30-day free trial has ended. Add a payment method to continue using Trackable NZ.
        </p>
        <div style={{ background: theme.cardAlt, padding: '16px', borderRadius: '8px', marginBottom: '24px' }}>
          <p style={{ color: theme.text, margin: 0, fontWeight: '600' }}>
            {companyPlan.charAt(0).toUpperCase() + companyPlan.slice(1)} Plan
          </p>
          <p style={{ color: theme.textMuted, margin: '4px 0 0', fontSize: '14px' }}>
            ${companyPlan === 'starter' ? '14.95' : companyPlan === 'team' ? '29.95' : '49.95'}/month
          </p>
        </div>
        <button 
          onClick={handleAddPayment} 
          disabled={redirectingToStripe}
          style={{ ...styles.btn, width: '100%', marginBottom: '12px', opacity: redirectingToStripe ? 0.7 : 1 }}
        >
          {redirectingToStripe ? 'Redirecting...' : '💳 Add Payment Method'}
        </button>
        <button onClick={() => signOut(auth)} style={{ background: 'none', border: 'none', color: theme.textMuted, cursor: 'pointer', fontSize: '14px' }}>Sign Out</button>
      </div>
    </main>
  );

  // Trial banner component
  const TrialBanner = () => {
    if (subscriptionStatus !== 'trial' || !trialEndsAt) return null;
    const daysRemaining = getTrialDaysRemaining();
    const isUrgent = daysRemaining <= 5;
    
    return (
      <div style={{ 
        background: isUrgent ? theme.dangerBg : theme.warningBg || '#FEF3C7', 
        color: isUrgent ? theme.danger : theme.warning || '#92400E',
        padding: '12px 16px', 
        borderRadius: '8px', 
        marginBottom: '16px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '12px'
      }}>
        <span style={{ fontWeight: '500' }}>
          {isUrgent ? '⚠️' : '🎉'} {daysRemaining === 0 ? 'Trial ends today!' : `${daysRemaining} day${daysRemaining !== 1 ? 's' : ''} left in your free trial`}
        </span>
        <button 
          onClick={handleAddPayment}
          disabled={redirectingToStripe}
          style={{ 
            padding: '8px 16px', 
            borderRadius: '6px', 
            background: isUrgent ? theme.danger : theme.primary, 
            color: 'white', 
            border: 'none', 
            cursor: 'pointer', 
            fontWeight: '600',
            fontSize: '13px',
            opacity: redirectingToStripe ? 0.7 : 1
          }}
        >
          {redirectingToStripe ? 'Redirecting...' : 'Add Payment'}
        </button>
      </div>
    );
  };

  const navItems = [{ id: 'live', label: '🟢 Live View' }, { id: 'mysheet', label: '⏱️ My Timesheet' }, { id: 'employees', label: '👥 Employees' }, { id: 'timesheets', label: '📋 Timesheets' }, { id: 'expenses', label: '🧾 Expenses' }, { id: 'worksites', label: '🏗️ Worksites' }, { id: 'reports', label: '📊 Reports' }, { id: 'chat', label: '💬 Chat' }, { id: 'settings', label: '⚙️ Settings' }];

  return (
    <main style={{ minHeight: '100vh', background: theme.bg }}>
      {isMobile && <div style={{ position: 'fixed', top: 0, left: 0, right: 0, minHeight: '56px', background: theme.sidebar, borderBottom: `1px solid ${theme.sidebarBorder}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 16px', paddingTop: 'max(44px, env(safe-area-inset-top))', zIndex: 100 }}><button onClick={() => setSidebarOpen(true)} style={{ background: 'none', border: 'none', fontSize: '24px', cursor: 'pointer', color: theme.text }}>☰</button><span style={{ fontWeight: '700', color: theme.text }}>Trackable NZ</span><button onClick={() => setDark(!dark)} style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer' }}>{dark ? '☀️' : '🌙'}</button></div>}
      {isMobile && sidebarOpen && <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', zIndex: 200 }} onClick={() => setSidebarOpen(false)} />}
      <div style={{ position: 'fixed', top: 0, left: isMobile ? (sidebarOpen ? 0 : -280) : 0, width: '260px', height: '100vh', background: theme.sidebar, borderRight: `1px solid ${theme.sidebarBorder}`, padding: '20px', zIndex: 300, transition: 'left 0.3s', overflowY: 'auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}><h2 style={{ color: theme.text, fontSize: '18px', margin: 0 }}>Trackable NZ</h2>{isMobile && <button onClick={() => setSidebarOpen(false)} style={{ background: 'none', border: 'none', fontSize: '24px', cursor: 'pointer', color: theme.textMuted }}>×</button>}</div>
        {navItems.map(item => <button key={item.id} onClick={() => navigateTo(item.id)} style={{ display: 'block', width: '100%', padding: '12px 16px', marginBottom: '4px', borderRadius: '8px', border: 'none', cursor: 'pointer', textAlign: 'left', fontWeight: '500', fontSize: '14px', background: view === item.id ? theme.primary : 'transparent', color: view === item.id ? 'white' : theme.textMuted }}>{item.label}</button>)}
        <div style={{ marginTop: '24px', paddingTop: '24px', borderTop: `1px solid ${theme.sidebarBorder}` }}>
          {!isMobile && <button onClick={() => setDark(!dark)} style={{ display: 'block', width: '100%', padding: '12px 16px', marginBottom: '8px', borderRadius: '8px', border: 'none', cursor: 'pointer', textAlign: 'left', background: 'transparent', color: theme.textMuted }}>{dark ? '☀️ Light Mode' : '🌙 Dark Mode'}</button>}
          <button onClick={() => signOut(auth)} style={{ display: 'block', width: '100%', padding: '12px 16px', borderRadius: '8px', border: 'none', cursor: 'pointer', textAlign: 'left', background: 'transparent', color: theme.danger }}>🚪 Sign Out</button>
        </div>
      </div>

      <div style={{ marginLeft: isMobile ? 0 : '260px', padding: isMobile ? '96px 16px max(80px, env(safe-area-inset-bottom))' : '24px 32px' }}>
        <TrialBanner />
        {error && <div style={{ background: theme.dangerBg, color: theme.danger, padding: '12px 16px', borderRadius: '8px', marginBottom: '16px', display: 'flex', justifyContent: 'space-between' }}><span>{error}</span><button onClick={() => setError('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: theme.danger }}>×</button></div>}
        {success && <div style={{ background: theme.successBg, color: theme.success, padding: '12px 16px', borderRadius: '8px', marginBottom: '16px', display: 'flex', justifyContent: 'space-between' }}><span>{success}</span><button onClick={() => setSuccess('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: theme.success }}>×</button></div>}
        {mapModal && <MapModal locations={mapModal.locations} onClose={() => setMapModal(null)} title={mapModal.title} theme={theme} clockInLocation={mapModal.clockInLocation} clockOutLocation={mapModal.clockOutLocation} />}
        {editShiftModal && user && <EditShiftModal shift={editShiftModal} onClose={() => setEditShiftModal(null)} onSave={() => setSuccess('Shift updated!')} theme={theme} user={user} companySettings={companySettings} />}
        {removeConfirm && <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '16px' }} onClick={() => setRemoveConfirm(null)}><div style={{ background: theme.card, borderRadius: '12px', padding: '24px', width: '100%', maxWidth: '400px' }} onClick={e => e.stopPropagation()}><h3 style={{ color: theme.text, marginBottom: '16px' }}>Remove Employee?</h3><label style={{ display: 'flex', alignItems: 'center', gap: '8px', color: theme.text, marginBottom: '20px', cursor: 'pointer' }}><input type="checkbox" checked={removeDeleteShifts} onChange={e => setRemoveDeleteShifts(e.target.checked)} />Also delete their shifts</label><div style={{ display: 'flex', gap: '12px' }}><button onClick={() => setRemoveConfirm(null)} style={{ ...styles.btn, flex: 1, background: theme.cardAlt, color: theme.text }}>Cancel</button><button onClick={() => removeEmployee(removeConfirm)} style={{ ...styles.btnDanger, flex: 1 }}>Remove</button></div></div></div>}

        <Suspense fallback={<div style={{ color: theme.text, textAlign: 'center', padding: '40px' }}>Loading...</div>}>
          {view === 'live' && <LiveView theme={theme} isMobile={isMobile} activeShifts={activeShifts} companySettings={companySettings} getEmployeeName={getEmployeeName} setMapModal={setMapModal} />}
          {view === 'mysheet' && <MyTimesheetView theme={theme} isMobile={isMobile} user={user ? { uid: user.uid } : null} myShift={myShift} myShiftHistory={myShiftHistory} onBreak={onBreak} breakStart={breakStart} myTraveling={myTraveling} myTravelStart={myTravelStart} myField1={myField1} setMyField1={setMyField1} saveMyField1={saveMyField1} myField2={myField2} setMyField2={setMyField2} saveMyField2={saveMyField2} myField3={myField3} setMyField3={setMyField3} saveMyField3={saveMyField3} myCurrentLocation={myCurrentLocation} companySettings={companySettings} employees={employees} myClockIn={myClockIn} myClockOut={myClockOut} clockingIn={clockingIn} clockingOut={clockingOut} myStartBreak={myStartBreak} myEndBreak={myEndBreak} myStartTravel={myStartTravel} myEndTravel={myEndTravel} myAddBreak={myAddBreak} showAddManualShift={showAddManualShift} setShowAddManualShift={setShowAddManualShift} manualDate={manualDate} setManualDate={setManualDate} manualStartHour={manualStartHour} setManualStartHour={setManualStartHour} manualStartMinute={manualStartMinute} setManualStartMinute={setManualStartMinute} manualStartAmPm={manualStartAmPm} setManualStartAmPm={setManualStartAmPm} manualEndHour={manualEndHour} setManualEndHour={setManualEndHour} manualEndMinute={manualEndMinute} setManualEndMinute={setManualEndMinute} manualEndAmPm={manualEndAmPm} setManualEndAmPm={setManualEndAmPm} manualBreaks={manualBreaks} setManualBreaks={setManualBreaks} manualTravel={manualTravel} setManualTravel={setManualTravel} manualNotes={manualNotes} setManualNotes={setManualNotes} addingManualShift={addingManualShift} myAddManualShift={myAddManualShift} expandedMyShifts={expandedMyShifts} toggleMyShift={toggleMyShift} editingMyShift={editingMyShift} setEditingMyShift={setEditingMyShift} myEditMode={myEditMode} setMyEditMode={setMyEditMode} addTravelStartHour={addTravelStartHour} setAddTravelStartHour={setAddTravelStartHour} addTravelStartMinute={addTravelStartMinute} setAddTravelStartMinute={setAddTravelStartMinute} addTravelStartAmPm={addTravelStartAmPm} setAddTravelStartAmPm={setAddTravelStartAmPm} addTravelEndHour={addTravelEndHour} setAddTravelEndHour={setAddTravelEndHour} addTravelEndMinute={addTravelEndMinute} setAddTravelEndMinute={setAddTravelEndMinute} addTravelEndAmPm={addTravelEndAmPm} setAddTravelEndAmPm={setAddTravelEndAmPm} addingTravelToShift={addingTravelToShift} addingBreakToShift={addingBreakToShift} myAddBreakToShift={myAddBreakToShift} myAddTravelToShift={myAddTravelToShift} myDeleteBreakFromShift={myDeleteBreakFromShift} myDeleteTravelFromShift={myDeleteTravelFromShift} myDeleteShift={myDeleteShift} closeMyEditPanel={closeMyEditPanel} updateSettings={updateSettings} setMapModal={setMapModal} />}
          {view === 'employees' && <EmployeesView theme={theme} isMobile={isMobile} user={user ? { uid: user.uid } : null} employees={employees} invites={invites} newEmpEmail={newEmpEmail} setNewEmpEmail={setNewEmpEmail} newEmpName={newEmpName} setNewEmpName={setNewEmpName} inviteEmployee={inviteEmployee} cancelInvite={cancelInvite} sendInviteEmail={sendInviteEmail} copyInviteLink={copyInviteLink} sendingEmail={sendingEmail} updateSettings={updateSettings} updateCosting={updateCosting} setRemoveConfirm={setRemoveConfirm} />}
          {view === 'timesheets' && <TimesheetsView theme={theme} isMobile={isMobile} companySettings={companySettings} companyId={companyId || ''} timesheetFilterStart={timesheetFilterStart} setTimesheetFilterStart={setTimesheetFilterStart} timesheetFilterEnd={timesheetFilterEnd} setTimesheetFilterEnd={setTimesheetFilterEnd} setThisWeek={setThisWeek} setLastWeek={setLastWeek} setThisMonth={setThisMonth} setLastMonth={setLastMonth} clearTimesheetFilter={clearTimesheetFilter} getGroupedTimesheets={getGroupedTimesheets} expandedEmployees={expandedEmployees} toggleEmployee={toggleEmployee} expandedWeeks={expandedWeeks} toggleWeek={toggleWeek} finalizingWeek={finalizingWeek} finalizeWeek={finalizeWeek} timesheetEditingShiftId={timesheetEditingShiftId} setTimesheetEditingShiftId={setTimesheetEditingShiftId} timesheetEditMode={timesheetEditMode} setTimesheetEditMode={setTimesheetEditMode} timesheetDeleteConfirmId={timesheetDeleteConfirmId} setTimesheetDeleteConfirmId={setTimesheetDeleteConfirmId} deletingTimesheetShift={deletingTimesheetShift} addingBreakToShift={addingBreakToShift} addingTravelToShift={addingTravelToShift} handleTimesheetAddBreak={handleTimesheetAddBreak} handleTimesheetAddTravel={handleTimesheetAddTravel} handleTimesheetDeleteShift={handleTimesheetDeleteShift} closeTimesheetEditPanel={closeTimesheetEditPanel} setEditShiftModal={setEditShiftModal} setMapModal={setMapModal} expenses={expenses} />}
          {view === 'expenses' && <ExpensesView theme={theme} isMobile={isMobile} expenses={expenses} employees={employees} getEmployeeName={getEmployeeName} approveExpense={approveExpense} deleteExpense={deleteExpense} approvingExpense={approvingExpense} deletingExpense={deletingExpense} />}
          {view === 'worksites' && <WorksitesPage theme={theme} worksites={worksites} activeWorksites={worksites.filter(w => w.status === 'active')} archivedWorksites={worksites.filter(w => w.status === 'archived')} shifts={allShifts} loading={false} error="" onAddWorksite={addWorksite} onUpdateWorksite={updateWorksite} onArchiveWorksite={archiveWorksite} onRestoreWorksite={restoreWorksite} onDeleteWorksite={deleteWorksite} />}
          {view === 'reports' && <ReportsView theme={theme} isMobile={isMobile} employees={employees} companySettings={companySettings} reportStart={reportStart} setReportStart={setReportStart} reportEnd={reportEnd} setReportEnd={setReportEnd} reportEmp={reportEmp} setReportEmp={setReportEmp} reportData={reportData} genReport={genReport} exportCSV={exportCSV} exportPDF={exportPDF} getEmployeeName={getEmployeeName} expenses={expenses} exportExpensesCSV={exportExpensesCSV} />}
          {view === 'chat' && <ChatView theme={theme} isMobile={isMobile} messages={messages} chatTab={chatTab} setChatTab={setChatTab} newMsg={newMsg} setNewMsg={setNewMsg} sendMsg={sendMsg} getEmployeeName={getEmployeeName} />}
          {view === 'settings' && <SettingsView theme={theme} isMobile={isMobile} allShifts={allShifts} employees={employees} messages={messages} editingCompanySettings={editingCompanySettings} setEditingCompanySettings={setEditingCompanySettings} saveCompanySettings={saveCompanySettings} savingCompanySettings={savingCompanySettings} cleanupStart={cleanupStart} setCleanupStart={setCleanupStart} cleanupEnd={cleanupEnd} setCleanupEnd={setCleanupEnd} cleanupConfirm={cleanupConfirm} setCleanupConfirm={setCleanupConfirm} cleanup={cleanup} companyId={companyId || ''} />}
        </Suspense>
      </div>
    </main>
  );
}