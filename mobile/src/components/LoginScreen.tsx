// TimeTrack NZ - Login Screen Component

import { useState } from 'react';
import { Theme, createStyles } from '../theme';
import { Invite, AuthMode, InviteStep } from '../types';

interface LoginScreenProps {
  theme: Theme;
  onSignIn: (email: string, password: string) => Promise<void>;
  onCheckInvite: (email: string) => Promise<Invite | null>;
  onAcceptInvite: (email: string, password: string, invite: Invite) => Promise<void>;
  onResetPassword: (email: string) => Promise<void>;
  error: string;
  setError: (error: string) => void;
  initialEmail?: string;
  initialAuthMode?: AuthMode;
}

export function LoginScreen({
  theme,
  onSignIn,
  onCheckInvite,
  onAcceptInvite,
  onResetPassword,
  error,
  setError,
  initialEmail = '',
  initialAuthMode = 'signin'
}: LoginScreenProps) {
  const [email, setEmail] = useState(initialEmail);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [authMode, setAuthMode] = useState<AuthMode>(initialAuthMode);
  const [inviteStep, setInviteStep] = useState<InviteStep>('email');
  const [foundInvite, setFoundInvite] = useState<Invite | null>(null);
  const [checkingInvite, setCheckingInvite] = useState(false);
  const [creatingAccount, setCreatingAccount] = useState(false);
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [sendingReset, setSendingReset] = useState(false);
  const [resetSent, setResetSent] = useState(false);

  const styles = createStyles(theme);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      await onSignIn(email, password);
    } catch (err) {
      // Error handled by parent
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSendingReset(true);
    try {
      await onResetPassword(forgotEmail);
      setResetSent(true);
    } catch (err) {
      // Error handled by parent
    }
    setSendingReset(false);
  };

  const handleCheckInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setCheckingInvite(true);
    try {
      const invite = await onCheckInvite(email);
      if (invite) {
        setFoundInvite(invite);
        setInviteStep('password');
      }
    } catch (err) {
      // Error handled by parent
    }
    setCheckingInvite(false);
  };

  const handleAcceptInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    
    if (password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    if (!foundInvite) {
      setError('No invite found');
      return;
    }

    setCreatingAccount(true);
    try {
      await onAcceptInvite(email, password, foundInvite);
    } catch (err) {
      setCreatingAccount(false);
    }
  };

  // Forgot Password Modal
  if (showForgotPassword) {
    return (
      <div style={{ minHeight: '100vh', background: theme.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
        <div style={{ background: theme.card, borderRadius: '24px', padding: '32px', width: '100%', maxWidth: '400px', border: `1px solid ${theme.cardBorder}` }}>
          <h1 style={{ color: theme.text, fontSize: '24px', fontWeight: '700', marginBottom: '8px', textAlign: 'center' }}>Reset Password</h1>
          {resetSent ? (
            <>
              <div style={{ background: theme.successBg, borderRadius: '12px', padding: '16px', marginBottom: '24px' }}>
                <p style={{ color: theme.successText, textAlign: 'center', margin: 0 }}>✓ Reset link sent! Check your email.</p>
              </div>
              <button onClick={() => { setShowForgotPassword(false); setResetSent(false); setForgotEmail(''); }} style={{ ...styles.btn, width: '100%' }}>Back to Sign In</button>
            </>
          ) : (
            <form onSubmit={handleForgotPassword}>
              <p style={{ color: theme.textMuted, textAlign: 'center', marginBottom: '24px' }}>Enter your email and we'll send you a reset link</p>
              {error && <div style={{ background: theme.dangerBg, border: `1px solid ${theme.danger}`, borderRadius: '12px', padding: '12px', marginBottom: '16px' }}><p style={{ color: theme.danger, margin: 0, fontSize: '14px' }}>{error}</p></div>}
              <input type="email" placeholder="Email" value={forgotEmail} onChange={(e) => setForgotEmail(e.target.value)} style={{ ...styles.input, marginBottom: '16px' }} required />
              <button type="submit" disabled={sendingReset} style={{ ...styles.btn, width: '100%', opacity: sendingReset ? 0.7 : 1, marginBottom: '12px' }}>{sendingReset ? 'Sending...' : 'Send Reset Link'}</button>
              <button type="button" onClick={() => { setShowForgotPassword(false); setError(''); }} style={{ width: '100%', padding: '14px', background: 'transparent', border: 'none', color: theme.textMuted, cursor: 'pointer' }}>Back to Sign In</button>
            </form>
          )}
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: theme.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
      <div style={{ background: theme.card, borderRadius: '24px', padding: '32px', width: '100%', maxWidth: '400px', border: `1px solid ${theme.cardBorder}` }}>
        <h1 style={{ color: theme.text, fontSize: '24px', fontWeight: '700', marginBottom: '8px', textAlign: 'center' }}>TimeTrack NZ</h1>
        <p style={{ color: theme.textMuted, textAlign: 'center', marginBottom: '24px' }}>Employee Time Tracking</p>

        {/* Auth Mode Toggle */}
        <div style={{ display: 'flex', background: theme.cardAlt, borderRadius: '12px', padding: '4px', marginBottom: '24px' }}>
          <button
            onClick={() => { setAuthMode('signin'); setError(''); }}
            style={{ flex: 1, padding: '10px', borderRadius: '10px', border: 'none', background: authMode === 'signin' ? theme.primary : 'transparent', color: authMode === 'signin' ? 'white' : theme.textMuted, fontWeight: '600', cursor: 'pointer' }}
          >Sign In</button>
          <button
            onClick={() => { setAuthMode('invite'); setError(''); setInviteStep('email'); setFoundInvite(null); }}
            style={{ flex: 1, padding: '10px', borderRadius: '10px', border: 'none', background: authMode === 'invite' ? theme.primary : 'transparent', color: authMode === 'invite' ? 'white' : theme.textMuted, fontWeight: '600', cursor: 'pointer' }}
          >New Employee</button>
        </div>

        {error && <div style={{ background: theme.dangerBg, border: `1px solid ${theme.danger}`, borderRadius: '12px', padding: '12px', marginBottom: '16px' }}><p style={{ color: theme.danger, margin: 0, fontSize: '14px' }}>{error}</p></div>}

        {authMode === 'signin' ? (
          <form onSubmit={handleLogin}>
            <input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} style={{ ...styles.input, marginBottom: '12px' }} required />
            <input type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} style={{ ...styles.input, marginBottom: '8px' }} required />
            <button type="button" onClick={() => { setShowForgotPassword(true); setError(''); }} style={{ background: 'none', border: 'none', color: theme.primary, fontSize: '14px', cursor: 'pointer', marginBottom: '16px', padding: 0 }}>Forgot password?</button>
            <button type="submit" style={{ ...styles.btn, width: '100%' }}>Sign In</button>
          </form>
        ) : inviteStep === 'email' ? (
          <form onSubmit={handleCheckInvite}>
            <p style={{ color: theme.textMuted, fontSize: '14px', marginBottom: '16px' }}>Enter the email your employer used to invite you:</p>
            <input type="email" placeholder="Email from invite" value={email} onChange={(e) => setEmail(e.target.value)} style={{ ...styles.input, marginBottom: '16px' }} required />
            <button type="submit" disabled={checkingInvite} style={{ ...styles.btn, width: '100%', opacity: checkingInvite ? 0.7 : 1 }}>{checkingInvite ? 'Checking...' : 'Find My Invite'}</button>
          </form>
        ) : (
          <form onSubmit={handleAcceptInvite}>
            <div style={{ background: theme.successBg, borderRadius: '12px', padding: '12px', marginBottom: '16px' }}>
              <p style={{ color: theme.successText, margin: 0, fontSize: '14px' }}>✓ Invite found! Welcome, {foundInvite?.name || email}</p>
            </div>
            <p style={{ color: theme.textMuted, fontSize: '14px', marginBottom: '16px' }}>Create a password to complete your account:</p>
            <input type="password" placeholder="Create password (min 6 chars)" value={password} onChange={(e) => setPassword(e.target.value)} style={{ ...styles.input, marginBottom: '12px' }} required minLength={6} />
            <input type="password" placeholder="Confirm password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} style={{ ...styles.input, marginBottom: '16px' }} required />
            <button type="submit" disabled={creatingAccount} style={{ ...styles.btn, width: '100%', background: theme.success, opacity: creatingAccount ? 0.7 : 1 }}>{creatingAccount ? 'Creating Account...' : 'Create Account & Sign In'}</button>
          </form>
        )}
      </div>
    </div>
  );
}
