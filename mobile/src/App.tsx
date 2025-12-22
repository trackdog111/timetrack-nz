// TimeTrack NZ - Main App Component
// Refactored from monolithic 800-line file into clean modular structure
// UPDATED: Added companyId support for multi-tenant

import { useState, useEffect, useRef, useCallback } from 'react';
import { signOut } from 'firebase/auth';
import { auth } from './firebase';
import { lightTheme, darkTheme } from './theme';
import { ViewType } from './types';
import { useAuth, useShift, useChat, useSettings } from './hooks';
import { LoginScreen, ClockView, JobLogView, ChatView, HistoryView } from './components';

export default function App() {
  // Auth hook - NOW PROVIDES companyId
  const {
    user,
    loading,
    error: authError,
    setError: setAuthError,
    companyId,        // NEW
    loadingCompany,   // NEW
    signIn,
    resetPassword,
    checkInvite,
    acceptInvite
  } = useAuth();

  // Settings hook - NOW RECEIVES companyId
  const { settings, labels } = useSettings(user, companyId);

  // UI state
  const [dark, setDark] = useState(false);
  const [view, setView] = useState<ViewType>('clock');
  const [toast, setToast] = useState<string | null>(null);
  const toastTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Toast function ref - allows us to pass to useShift without hoisting issues
  const showToastRef = useRef<(message: string) => void>(() => {});
  
  // Update the ref when component mounts
  showToastRef.current = (message: string) => {
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    setToast(message);
    toastTimeoutRef.current = setTimeout(() => setToast(null), 2000);
  };

  // Stable callback that uses the ref
  const showToast = useCallback((message: string) => {
    showToastRef.current(message);
  }, []);

  // Shift hook - NOW RECEIVES companyId
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
  } = useShift(user, settings, companyId, showToast);  // UPDATED: Added companyId

  // Chat hook - NOW RECEIVES companyId
  const {
    messages,
    newMessage,
    setNewMessage,
    chatTab,
    setChatTab,
    sendMessage,
    sendJobUpdate
  } = useChat(user, settings.chatEnabled, companyId);  // UPDATED: Added companyId

  // Invite URL handling
  const [initialEmail, setInitialEmail] = useState('');
  const [initialAuthMode, setInitialAuthMode] = useState<'signin' | 'invite'>('signin');

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const isInvite = urlParams.get('invite');
    const inviteEmail = urlParams.get('email');
    if (isInvite === 'true' && inviteEmail) {
      setInitialEmail(decodeURIComponent(inviteEmail));
      setInitialAuthMode('invite');
      window.history.replaceState({}, document.title, window.location.pathname);
    }
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

  // Loading state - UPDATED: Include loadingCompany
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
        />
      </main>
    );
  }

  // NEW: Show error if user has no company
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

  // Main app
  return (
    <main style={{ minHeight: '100vh', background: theme.bg, paddingBottom: '80px' }}>
      {/* Toast notification */}
      {toast && (
        <div style={{
          position: 'fixed',
          top: '80px',
          left: '50%',
          transform: 'translateX(-50%)',
          background: theme.success,
          color: 'white',
          padding: '12px 24px',
          borderRadius: '12px',
          fontWeight: '600',
          fontSize: '14px',
          zIndex: 1000,
          boxShadow: '0 4px 12px rgba(0,0,0,0.15)'
        }}>
          {toast}
        </div>
      )}

      {/* Header */}
      <div style={{
        background: theme.nav,
        padding: '16px 20px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        borderBottom: `1px solid ${theme.navBorder}`
      }}>
        <h1 style={{ color: theme.text, fontSize: '18px', fontWeight: '600', margin: 0 }}>
          TimeTrack NZ
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
      </div>

      {/* Error banner */}
      {error && (
        <div style={{
          margin: '16px',
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

      {/* Bottom navigation */}
      <div style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        background: theme.nav,
        borderTop: `1px solid ${theme.navBorder}`,
        paddingBottom: 'env(safe-area-inset-bottom)'
      }}>
        <div style={{ display: 'flex' }}>
          {[
            { id: 'clock', label: 'Clock', icon: '⏱️' },
            ...(settings.chatEnabled ? [{ id: 'chat', label: 'Chat', icon: '💬' }] : []),
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
      </div>
    </main>
  );
}