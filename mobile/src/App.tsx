// Trackable NZ - Main App Component
// UPDATED: Fixed header/nav position - they stay fixed, only content scrolls

import { useState, useEffect, useRef, useCallback } from 'react';
import { signOut } from 'firebase/auth';
import { auth } from './firebase';
import { lightTheme, darkTheme } from './theme';
import { ViewType, Invite } from './types';
import { useAuth, useShift, useChat, useSettings, useExpenses } from './hooks';
import { LoginScreen, ClockView, JobLogView, ChatView, HistoryView, ExpensesView } from './components';

export default function App() {
  // Auth hook - NOW PROVIDES companyId
  const {
    user,
    loading,
    error: authError,
    setError: setAuthError,
    companyId,
    loadingCompany,
    signIn,
    resetPassword,
    checkInvite,
    acceptInvite
  } = useAuth();

  // Settings hook
  const { settings, labels } = useSettings(user, companyId);

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

  // Shift hook
  const {
    currentShift,
    shiftHistory,
    currentLocation,
    onBreak,
    currentBreakStart,
    traveling,
    currentTravelStart,
    field1,
    field2,
    field3,
    setField1,
    setField2,
    setField3,
    error: shiftError,
    setError: setShiftError,
    clockIn,
    clockingIn,
    clockOut,
    startBreak,
    endBreak,
    addPresetBreak,
    deleteBreak,
    startTravel,
    endTravel,
    saveFields,
    addTravelToShift,
    addBreakToShift,
    deleteBreakFromShift,
    deleteTravelFromShift,
    editShift,
    addManualShift,
    deleteShift,
    autoTravelActive,
    anchorLocation
  } = useShift(user, settings, companyId, showToast);

  // Chat hook
  const {
    messages,
    newMessage,
    setNewMessage,
    chatTab,
    setChatTab,
    sendMessage,
    sendJobUpdate
  } = useChat(user, settings.chatEnabled, companyId);

  // Expenses hook - UPDATED: Added updateExpense and deleteExpense
  const {
    expenses,
    loading: expensesLoading,
    submitting: expenseSubmitting,
    submitExpense,
    updateExpense,
    deleteExpense
  } = useExpenses(user, companyId);

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
  const error = authError || shiftError;
  const setError = (err: string) => {
    setAuthError(err);
    setShiftError(err);
  };

  // Handle clock out with notes requirement check
  const handleClockOut = async () => {
    const success = await clockOut(settings.requireNotes);
    if (!success && settings.requireNotes && !field1.trim()) {
      setView('joblog');
    }
  };

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
          error={authError}
          setError={setAuthError}
          initialEmail={initialEmail}
          initialAuthMode={initialAuthMode}
          pendingInvite={pendingInvite}
        />
      </main>
    );
  }

  // Show error if user has no company
  if (!companyId) {
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

  // Calculate header height for content offset
  const headerHeight = 'calc(env(safe-area-inset-top, 16px) + 12px + 24px + 12px)'; // safe area + padding + content + padding
  const navHeight = 'calc(52px + max(20px, env(safe-area-inset-bottom)))';

  // Main app with fixed header and nav
  return (
    <div style={{ 
      minHeight: '100vh', 
      background: theme.bg,
      position: 'relative',
      overflow: 'hidden'
    }}>
      {/* Toast notification */}
      {toast && (
        <div style={{
          position: 'fixed',
          top: '120px',
          left: '50%',
          transform: 'translateX(-50%)',
          background: theme.success,
          color: 'white',
          padding: '12px 24px',
          borderRadius: '12px',
          fontWeight: '600',
          fontSize: '14px',
          zIndex: 1001,
          boxShadow: '0 4px 12px rgba(0,0,0,0.15)'
        }}>
          {toast}
        </div>
      )}

      {/* FIXED Header */}
      <header style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        background: theme.nav,
        paddingTop: 'calc(env(safe-area-inset-top, 16px) + 12px)',
        paddingBottom: '12px',
        paddingLeft: 'max(16px, env(safe-area-inset-left))',
        paddingRight: 'max(16px, env(safe-area-inset-right))',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        borderBottom: `1px solid ${theme.navBorder}`,
        zIndex: 1000
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
            onClick={() => signOut(auth)}
            style={{
              color: theme.textMuted,
              fontSize: '14px',
              background: 'none',
              border: 'none',
              cursor: 'pointer'
            }}
          >
            Sign Out
          </button>
        </div>
      </header>

      {/* Scrollable content area */}
      <main style={{
        position: 'fixed',
        top: headerHeight,
        left: 0,
        right: 0,
        bottom: navHeight,
        overflowY: 'auto',
        overflowX: 'hidden',
        WebkitOverflowScrolling: 'touch',
        background: theme.bg,
        paddingLeft: 'max(16px, env(safe-area-inset-left))',
        paddingRight: 'max(16px, env(safe-area-inset-right))',
        paddingTop: '16px',
        paddingBottom: '16px'
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
            currentLocation={currentLocation}
            locationHistory={currentShift?.locationHistory || []}
            onBreak={onBreak}
            currentBreakStart={currentBreakStart}
            traveling={traveling}
            currentTravelStart={currentTravelStart}
            settings={settings}
            paidRestMinutes={labels.paidRestMinutes}
            photoVerification={settings.photoVerification || false}
            onClockIn={clockIn}
            clockingIn={clockingIn}
            onClockOut={handleClockOut}
            onStartBreak={startBreak}
            onEndBreak={endBreak}
            onStartTravel={startTravel}
            onEndTravel={endTravel}
            onAddPresetBreak={addPresetBreak}
            onDeleteBreak={deleteBreak}
            onAddManualShift={addManualShift}
            showToast={showToast}
            autoTravelEnabled={settings.autoTravel || false}
            autoTravelActive={autoTravelActive}
            field1={field1}
            field2={field2}
            field3={field3}
            setField1={setField1}
            setField2={setField2}
            setField3={setField3}
            onSaveFields={saveFields}
            labels={labels}
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
            labels={labels}
            requireNotes={settings.requireNotes}
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
            userId={user.uid}
            chatEnabled={settings.chatEnabled}
            labels={labels}
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
            paidRestMinutes={labels.paidRestMinutes}
            payWeekEndDay={labels.payWeekEndDay}
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

      {/* FIXED Bottom navigation */}
      <nav style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        background: theme.nav,
        borderTop: `1px solid ${theme.navBorder}`,
        paddingBottom: 'max(20px, env(safe-area-inset-bottom))',
        paddingLeft: 'env(safe-area-inset-left)',
        paddingRight: 'env(safe-area-inset-right)',
        zIndex: 1000
      }}>
        <div style={{ display: 'flex' }}>
          {[
            { id: 'clock', label: 'Clock', icon: '⏱️' },
            ...(settings.chatEnabled ? [{ id: 'chat', label: 'Chat', icon: '💬' }] : []),
            { id: 'expenses', label: 'Expenses', icon: '🧾' },
            { id: 'history', label: 'History', icon: '📋' }
          ].map(item => (
            <button
              key={item.id}
              onClick={() => setView(item.id as ViewType)}
              style={{
                flex: 1,
                padding: '12px 0',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '4px'
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
  );
}