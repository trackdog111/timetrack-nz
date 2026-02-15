// Trackable NZ - Main App Component
// BUILD 36: Added demo mode for App Store review

import { useState, useEffect, useRef, useCallback } from 'react';
import { signOut } from 'firebase/auth';
import { auth } from './firebase';
import { lightTheme, darkTheme } from './theme';
import { ViewType, Invite, Shift } from './types';
import { useAuth, useShift, useChat, useSettings, useExpenses, useWorksites } from './hooks';
import { LoginScreen, ClockView, JobLogView, ChatView, HistoryView, ExpensesView } from './components';
import { DemoProvider, useDemo } from './DemoContext';

// Wrapper component that provides demo context
export default function App() {
  const authHook = useAuth();
  
  return (
    <DemoProvider isDemoMode={authHook.isDemoMode}>
      <AppContent authHook={authHook} />
    </DemoProvider>
  );
}

// Main app content
function AppContent({ authHook }: { authHook: ReturnType<typeof useAuth> }) {
  const {
    user,
    loading,
    error: authError,
    setError: setAuthError,
    companyId,
    loadingCompany,
    isDemoMode,
    loginAsDemo,
    signIn,
    signOut: authSignOut,
    resetPassword,
    checkInvite,
    acceptInvite
  } = authHook;

  // Demo context
  const demo = useDemo();

  // Settings hook - in demo mode, use demo settings
  const { settings, labels } = useSettings(
    isDemoMode ? null : user, 
    isDemoMode ? null : companyId
  );

  // Use demo labels if in demo mode
  const activeLabels = isDemoMode ? demo.getCompanyLabels() : labels;
  const activeSettings = isDemoMode ? {
    gpsTracking: true,
    gpsInterval: 5,
    requireNotes: false,
    chatEnabled: true,
    photoVerification: false,
    field1Enabled: true,
    field2Enabled: true,
    field3Enabled: false,
    autoTravel: false
  } : settings;

  // UI state
  const [dark, setDark] = useState(false);
  const [view, setView] = useState<ViewType>('clock');
  const [toast, setToast] = useState<string | null>(null);
  const toastTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Toast function ref
  const showToastRef = useRef<(message: string) => void>(() => {});
  
  showToastRef.current = (message: string) => {
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    setToast(message);
    toastTimeoutRef.current = setTimeout(() => setToast(null), 2000);
  };

  const showToast = useCallback((message: string) => {
    showToastRef.current(message);
  }, []);

  // Demo-aware toast for restricted actions
  const showDemoToast = useCallback((action: string): boolean => {
    if (isDemoMode) {
      showToast(`Demo Mode: ${action} disabled`);
      return true;
    }
    return false;
  }, [isDemoMode, showToast]);

  // Shift hook - disabled in demo mode (we use static data)
  const shiftHook = useShift(
    isDemoMode ? null : user, 
    activeSettings, 
    isDemoMode ? null : companyId, 
    showToast
  );

  // Get demo data if in demo mode
  const demoShifts = isDemoMode ? demo.getShifts() : [];
  const demoActiveShift = isDemoMode ? demo.getActiveShift() : null;

  // Use demo or real data
  const currentShift = isDemoMode ? demoActiveShift : shiftHook.currentShift;
  const shiftHistory: Shift[] = isDemoMode ? demoShifts.filter((s: Shift) => s.status === 'completed') : shiftHook.shiftHistory;

  // Chat hook
  const {
    messages: realMessages,
    newMessage,
    setNewMessage,
    chatTab,
    setChatTab,
    sendMessage: realSendMessage,
    sendJobUpdate: realSendJobUpdate
  } = useChat(isDemoMode ? null : user, activeSettings.chatEnabled, isDemoMode ? null : companyId);

  // Use demo or real messages
  const messages = isDemoMode ? demo.getChatMessages() : realMessages;
  const sendMessage = isDemoMode 
    ? async () => { showDemoToast('Sending messages'); return false; } 
    : realSendMessage;
  const sendJobUpdate = isDemoMode 
    ? async (_text: string, _destination: 'team' | 'manager') => { showDemoToast('Sharing updates'); return false; } 
    : realSendJobUpdate;

  // Expenses hook
  const expensesHook = useExpenses(isDemoMode ? null : user, isDemoMode ? null : companyId);

  // Worksites hook
  const { worksites } = useWorksites(isDemoMode ? null : companyId);
  
  // Use demo or real expenses
  const expenses = isDemoMode ? demo.getExpenses() : expensesHook.expenses;
  const expensesLoading = isDemoMode ? false : expensesHook.loading;
  const expenseSubmitting = isDemoMode ? false : expensesHook.submitting;
  const submitExpense = isDemoMode 
    ? async (_amount: number, _category: any, _date: Date, _photoBase64?: string, _note?: string) => { showDemoToast('Submitting expenses'); return false; } 
    : expensesHook.submitExpense;
  const updateExpense = isDemoMode
    ? async (_expenseId: string, _amount: number, _category: any, _date: Date, _note?: string) => { showDemoToast('Updating expenses'); return false; }
    : expensesHook.updateExpense;
  const deleteExpense = isDemoMode
    ? async (_expenseId: string) => { showDemoToast('Deleting expenses'); return false; }
    : expensesHook.deleteExpense;

  // Job log fields - use state for demo mode
  const [demoField1, setDemoField1] = useState(demoActiveShift?.jobLog?.field1 || '');
  const [demoField2, setDemoField2] = useState(demoActiveShift?.jobLog?.field2 || '');
  const [demoField3, setDemoField3] = useState(demoActiveShift?.jobLog?.field3 || '');

  const field1 = isDemoMode ? demoField1 : shiftHook.field1;
  const field2 = isDemoMode ? demoField2 : shiftHook.field2;
  const field3 = isDemoMode ? demoField3 : shiftHook.field3;
  const setField1 = isDemoMode ? setDemoField1 : shiftHook.setField1;
  const setField2 = isDemoMode ? setDemoField2 : shiftHook.setField2;
  const setField3 = isDemoMode ? setDemoField3 : shiftHook.setField3;

  // Invite URL handling
  const [initialEmail, setInitialEmail] = useState('');
  const [initialAuthMode, setInitialAuthMode] = useState<'signin' | 'invite'>('signin');
  const [pendingInvite, setPendingInvite] = useState<Invite | null>(null);

  useEffect(() => {
    const checkInviteUrl = async () => {
      const urlParams = new URLSearchParams(window.location.search);
      const inviteId = urlParams.get('invite');
      
      const isJoinPath = window.location.pathname === '/join';
      
      if (inviteId && (isJoinPath || inviteId !== 'true')) {
        try {
          const { getDoc, doc } = await import('firebase/firestore');
          const { db } = await import('./firebase');
          const inviteDoc = await getDoc(doc(db, 'invites', inviteId));
          
          if (inviteDoc.exists()) {
            const inviteData = { id: inviteDoc.id, ...inviteDoc.data() } as Invite;
            setPendingInvite(inviteData);
            setInitialEmail(inviteData.email || '');
            setInitialAuthMode('invite');
          }
        } catch (err) {
          console.error('Error fetching invite:', err);
        }
        window.history.replaceState({}, document.title, '/');
      }
    };
    checkInviteUrl();
  }, []);

  // Theme
  const theme = dark ? darkTheme : lightTheme;

  // Combined error from both hooks
  const error = authError || (isDemoMode ? '' : shiftHook.error);
  const setError = (err: string) => {
    setAuthError(err);
    if (!isDemoMode) shiftHook.setError(err);
  };

  // Handle clock out with notes requirement check
  const handleClockOut = async () => {
    if (isDemoMode) {
      showDemoToast('Clocking out');
      return;
    }
    const success = await shiftHook.clockOut(activeSettings.requireNotes);
    if (!success && activeSettings.requireNotes && !field1.trim()) {
      setView('joblog');
    }
  };

  // Demo-wrapped actions with correct return types
  const clockIn = isDemoMode 
    ? async (_photoBase64?: string, _worksiteId?: string, _worksiteName?: string) => { showDemoToast('Clocking in'); } 
    : shiftHook.clockIn;
  const startBreak = isDemoMode 
    ? async () => { showDemoToast('Starting break'); } 
    : shiftHook.startBreak;
  const endBreak = isDemoMode 
    ? async () => { showDemoToast('Ending break'); } 
    : shiftHook.endBreak;
  const startTravel = isDemoMode 
    ? async () => { showDemoToast('Starting travel'); } 
    : shiftHook.startTravel;
  const endTravel = isDemoMode 
    ? async () => { showDemoToast('Ending travel'); } 
    : shiftHook.endTravel;
  const addPresetBreak = isDemoMode 
    ? async (_minutes: number) => { showDemoToast('Adding break'); return false; } 
    : shiftHook.addPresetBreak;
  const deleteBreak = isDemoMode 
    ? async (_index: number) => { showDemoToast('Deleting break'); return false; } 
    : shiftHook.deleteBreak;
  const saveFields = isDemoMode 
    ? async () => { showToast('Demo: Notes saved (view only)'); } 
    : shiftHook.saveFields;
  const addManualShift = isDemoMode 
    ? async (_date: string, _startHour: string, _startMinute: string, _startAmPm: 'AM' | 'PM', _endHour: string, _endMinute: string, _endAmPm: 'AM' | 'PM', _breaks: number[], _travel: number[], _notes: string, _worksiteId?: string, _worksiteName?: string) => { showDemoToast('Adding shift'); return false; } 
    : shiftHook.addManualShift;
  const addTravelToShift = isDemoMode 
    ? async (_shiftId: string, _shiftDate: Date, _startHour: string, _startMinute: string, _startAmPm: 'AM' | 'PM', _endHour: string, _endMinute: string, _endAmPm: 'AM' | 'PM') => { showDemoToast('Adding travel'); return false; } 
    : shiftHook.addTravelToShift;
  const addBreakToShift = isDemoMode 
    ? async (_shiftId: string, _minutes: number) => { showDemoToast('Adding break'); return false; } 
    : shiftHook.addBreakToShift;
  const deleteBreakFromShift = isDemoMode 
    ? async (_shiftId: string, _breakIndex: number) => { showDemoToast('Deleting break'); return false; } 
    : shiftHook.deleteBreakFromShift;
  const deleteTravelFromShift = isDemoMode 
    ? async (_shiftId: string, _travelIndex: number) => { showDemoToast('Deleting travel'); return false; } 
    : shiftHook.deleteTravelFromShift;
  const editShift = isDemoMode 
    ? async (_shiftId: string, _clockIn: Date, _clockOut: Date, _notes?: string) => { showDemoToast('Editing shift'); return false; } 
    : shiftHook.editShift;
  const deleteShift = isDemoMode 
    ? async (_shiftId: string) => { showDemoToast('Deleting shift'); return false; } 
    : shiftHook.deleteShift;

  // Loading state
  if (loading || loadingCompany) {
    return (
      <main style={{ 
        minHeight: '100vh', 
        background: theme.bg, 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center' 
      }}>
        <p style={{ color: theme.textMuted }}>Loading...</p>
      </main>
    );
  }

  // Login screen
  if (!user) {
    return (
      <main style={{ minHeight: '100vh', background: theme.bg }}>
        <LoginScreen
          theme={theme}
          onSignIn={signIn}
          onCheckInvite={checkInvite}
          onAcceptInvite={acceptInvite}
          onResetPassword={resetPassword}
          onDemoLogin={loginAsDemo}
          error={authError}
          setError={setAuthError}
          initialEmail={initialEmail}
          initialAuthMode={initialAuthMode}
          pendingInvite={pendingInvite}
        />
      </main>
    );
  }

  // Show error if user has no company (skip in demo mode)
  if (!companyId && !isDemoMode) {
    return (
      <main style={{ 
        minHeight: '100vh', 
        background: theme.bg, 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center',
        padding: '20px'
      }}>
        <div style={{
          background: theme.card,
          padding: '24px',
          borderRadius: '12px',
          textAlign: 'center',
          maxWidth: '400px'
        }}>
          <h2 style={{ color: theme.danger, marginBottom: '16px' }}>Account Error</h2>
          <p style={{ color: theme.text, marginBottom: '24px' }}>
            Your account is not linked to a company. Please contact your employer or sign up through an invite link.
          </p>
          <button
            onClick={() => signOut(auth)}
            style={{
              background: theme.primary,
              color: 'white',
              border: 'none',
              padding: '12px 24px',
              borderRadius: '8px',
              fontWeight: '600',
              cursor: 'pointer'
            }}
          >
            Sign Out
          </button>
        </div>
      </main>
    );
  }

  // Main app with flexbox/sticky layout (iOS Capacitor safe)
  return (
    <>
      {/* Global styles for body - prevents rubber banding */}
      <style>{`
        html, body, #root {
          margin: 0;
          padding: 0;
          height: 100%;
          overflow: hidden;
          position: fixed;
          width: 100%;
        }
      `}</style>

      {/* Main container - flexbox column, full viewport height */}
      <div style={{ 
        display: 'flex',
        flexDirection: 'column',
        height: '100dvh',
        width: '100%',
        background: theme.bg,
        overflow: 'hidden'
      }}>
        {/* Demo Mode Banner */}
        {isDemoMode && (
          <div style={{
            background: theme.warning || '#f59e0b',
            color: '#000',
            padding: '8px 16px',
            textAlign: 'center',
            fontSize: '13px',
            fontWeight: '600'
          }}>
            🔍 Demo Mode — Explore with sample data (view only)
          </div>
        )}

        {/* Toast notification - this CAN be position:fixed as it's an overlay */}
        {toast && (
          <div style={{
            position: 'fixed',
            top: isDemoMode ? 'calc(env(safe-area-inset-top, 47px) + 100px)' : 'calc(env(safe-area-inset-top, 47px) + 70px)',
            left: '50%',
            transform: 'translateX(-50%)',
            background: theme.success,
            color: 'white',
            padding: '12px 24px',
            borderRadius: '12px',
            fontWeight: '600',
            fontSize: '14px',
            zIndex: 9999,
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)'
          }}>
            {toast}
          </div>
        )}

        {/* STICKY Header */}
        <header style={{
          position: 'sticky',
          top: 0,
          background: theme.nav,
          zIndex: 100,
          flexShrink: 0,
          paddingTop: 'env(safe-area-inset-top, 47px)'
        }}>
          {/* Header content */}
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            paddingLeft: '16px',
            paddingRight: '16px',
            paddingTop: '8px',
            paddingBottom: '12px',
            borderBottom: `1px solid ${theme.navBorder}`
          }}>
            <h1 style={{ color: theme.text, fontSize: '18px', fontWeight: '600', margin: 0 }}>
              Trackable NZ
            </h1>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <button
                onClick={() => setDark(!dark)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: theme.textMuted,
                  cursor: 'pointer',
                  fontSize: '18px',
                  padding: '4px'
                }}
              >
                {dark ? '☀️' : '🌙'}
              </button>
              <button
                onClick={() => authSignOut()}
                style={{
                  color: theme.textMuted,
                  fontSize: '14px',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer'
                }}
              >
                {isDemoMode ? 'Exit Demo' : 'Sign Out'}
              </button>
            </div>
          </div>
        </header>

        {/* Scrollable content area - flex:1 takes remaining space */}
        <main style={{
          flex: 1,
          overflowY: 'auto',
          overflowX: 'hidden',
          WebkitOverflowScrolling: 'touch',
          background: theme.bg,
          padding: '16px'
        }}>
          {/* Error banner */}
          {error && (
            <div style={{
              marginBottom: '16px',
              padding: '12px 16px',
              background: theme.dangerBg,
              border: `1px solid ${theme.danger}`,
              borderRadius: '12px'
            }}>
              <p style={{ color: theme.danger, fontSize: '14px', margin: 0 }}>{error}</p>
              <button
                onClick={() => setError('')}
                style={{
                  color: theme.danger,
                  fontSize: '12px',
                  background: 'none',
                  border: 'none',
                  textDecoration: 'underline',
                  cursor: 'pointer',
                  marginTop: '4px'
                }}
              >
                Dismiss
              </button>
            </div>
          )}

          {/* Views */}
          {view === 'clock' && (
            <ClockView
              theme={theme}
              currentShift={currentShift}
              currentLocation={isDemoMode ? null : shiftHook.currentLocation}
              locationHistory={currentShift?.locationHistory || []}
              onBreak={isDemoMode ? false : shiftHook.onBreak}
              currentBreakStart={isDemoMode ? null : shiftHook.currentBreakStart}
              traveling={isDemoMode ? false : shiftHook.traveling}
              currentTravelStart={isDemoMode ? null : shiftHook.currentTravelStart}
              settings={activeSettings}
              paidRestMinutes={activeLabels.paidRestMinutes}
              photoVerification={activeSettings.photoVerification || false}
              worksites={worksites}
              requireWorksite={activeSettings.requireWorksite || false}
              onClockIn={clockIn}
              clockingIn={isDemoMode ? false : shiftHook.clockingIn}
              onClockOut={handleClockOut}
              onStartBreak={startBreak}
              onEndBreak={endBreak}
              onStartTravel={startTravel}
              onEndTravel={endTravel}
              onAddPresetBreak={addPresetBreak}
              onDeleteBreak={deleteBreak}
              onAddManualShift={addManualShift}
              showToast={showToast}
              
              field1={field1}
              field2={field2}
              field3={field3}
              setField1={setField1}
              setField2={setField2}
              setField3={setField3}
              onSaveFields={saveFields}
              labels={activeLabels}
            />
          )}

          {view === 'joblog' && (
            <JobLogView
              theme={theme}
              currentShift={currentShift}
              field1={field1}
              field2={field2}
              field3={field3}
              setField1={setField1}
              setField2={setField2}
              setField3={setField3}
              onSave={saveFields}
              onShareToChat={sendJobUpdate}
              labels={activeLabels}
              requireNotes={activeSettings.requireNotes}
              showToast={showToast}
            />
          )}

          {view === 'chat' && (
            <ChatView
              theme={theme}
              messages={messages}
              newMessage={newMessage}
              setNewMessage={setNewMessage}
              chatTab={chatTab}
              setChatTab={setChatTab}
              onSendMessage={sendMessage}
              userId={isDemoMode ? demo.demoUserId : user.uid}
              chatEnabled={activeSettings.chatEnabled}
              labels={activeLabels}
            />
          )}

          {view === 'history' && (
            <HistoryView
              theme={theme}
              shiftHistory={shiftHistory}
              onAddTravelToShift={addTravelToShift}
              onAddBreakToShift={addBreakToShift}
              onDeleteBreakFromShift={deleteBreakFromShift}
              onDeleteTravelFromShift={deleteTravelFromShift}
              onEditShift={editShift}
              onDeleteShift={deleteShift}
              showToast={showToast}
              paidRestMinutes={activeLabels.paidRestMinutes}
              payWeekEndDay={activeLabels.payWeekEndDay}
            />
          )}

          {/* Expenses View */}
          {view === 'expenses' && (
            <ExpensesView
              theme={theme}
              expenses={expenses}
              loading={expensesLoading}
              submitting={expenseSubmitting}
              onSubmitExpense={submitExpense}
              onUpdateExpense={updateExpense}
              onDeleteExpense={deleteExpense}
              showToast={showToast}
            />
          )}
        </main>

        {/* STICKY Bottom navigation - Fixed for Android */}
        <nav style={{
          position: 'sticky',
          bottom: 0,
          background: theme.nav,
          borderTop: `1px solid ${theme.navBorder}`,
          zIndex: 100,
          flexShrink: 0,
          paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 24px)'
        }}>
          {/* Nav buttons */}
          <div style={{ display: 'flex' }}>
            {[
              { id: 'clock', label: 'Clock', icon: '⏱️' },
              ...(activeSettings.chatEnabled ? [{ id: 'chat', label: 'Chat', icon: '💬' }] : []),
              { id: 'expenses', label: 'Expenses', icon: '🧾' },
              { id: 'history', label: 'History', icon: '📋' }
            ].map(item => (
              <button
                key={item.id}
                onClick={() => setView(item.id as ViewType)}
                style={{
                  flex: 1,
                  padding: '8px 0',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '2px'
                }}
              >
                <span style={{ fontSize: '20px' }}>{item.icon}</span>
                <span style={{
                  fontSize: '11px',
                  color: view === item.id ? theme.primary : theme.textMuted,
                  fontWeight: view === item.id ? '600' : '400'
                }}>
                  {item.label}
                </span>
              </button>
            ))}
          </div>
        </nav>
      </div>
    </>
  );
}