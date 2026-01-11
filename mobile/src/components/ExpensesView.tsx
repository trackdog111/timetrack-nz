// Trackable NZ - Expenses View Component
// Allows employees to submit and view expense reimbursement claims

import { useState, useRef, useCallback } from 'react';
import { Theme, createStyles } from '../theme';
import { Expense, ExpenseCategory, EXPENSE_CATEGORIES } from '../types';

interface ExpensesViewProps {
  theme: Theme;
  expenses: Expense[];
  loading: boolean;
  submitting: boolean;
  onSubmitExpense: (
    amount: number,
    category: ExpenseCategory,
    date: Date,
    photoBase64?: string,
    note?: string
  ) => Promise<boolean>;
  onUpdateExpense: (
    expenseId: string,
    amount: number,
    category: ExpenseCategory,
    date: Date,
    note?: string
  ) => Promise<boolean>;
  onDeleteExpense: (expenseId: string) => Promise<boolean>;
  showToast: (message: string) => void;
}

export function ExpensesView({
  theme,
  expenses,
  loading,
  submitting,
  onSubmitExpense,
  onUpdateExpense,
  onDeleteExpense,
  showToast
}: ExpensesViewProps) {
  const styles = createStyles(theme);
  
  // Form state
  const [showForm, setShowForm] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState<ExpenseCategory>('Parking');
  const [date, setDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [note, setNote] = useState('');
  const [photo, setPhoto] = useState<string | null>(null);
  
  // Camera state
  const [showCamera, setShowCamera] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Reset form
  const resetForm = () => {
    setAmount('');
    setCategory('Parking');
    setDate(new Date().toISOString().split('T')[0]);
    setNote('');
    setPhoto(null);
    setEditingExpense(null);
    setShowForm(false);
  };

  // Open form for editing
  const startEdit = (expense: Expense) => {
    setEditingExpense(expense);
    setAmount(expense.amount.toString());
    setCategory(expense.category);
    const expenseDate = expense.date.toDate ? expense.date.toDate() : new Date(expense.date);
    setDate(expenseDate.toISOString().split('T')[0]);
    setNote(expense.note || '');
    setPhoto(null); // Can't edit photo, would need to re-upload
    setShowForm(true);
  };

  // Start camera
  const startCamera = useCallback(async () => {
    setCameraError(null);
    setCameraReady(false);
    setShowCamera(true);
    
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false
      });
      
      streamRef.current = stream;
      
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.onloadedmetadata = () => {
          videoRef.current?.play();
          setCameraReady(true);
        };
      }
    } catch (err: any) {
      console.error('Camera error:', err);
      setCameraError(err.name === 'NotAllowedError' 
        ? 'Camera access denied. Please allow camera permission.'
        : 'Could not access camera.');
    }
  }, []);

  // Stop camera
  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    setShowCamera(false);
    setCameraReady(false);
    setCameraError(null);
  }, []);

  // Capture photo from camera
  const capturePhoto = useCallback(() => {
    if (!videoRef.current || !cameraReady) return;
    
    const video = videoRef.current;
    const canvas = document.createElement('canvas');
    
    // Set canvas size
    const maxSize = 1024;
    const scale = Math.min(maxSize / video.videoWidth, maxSize / video.videoHeight);
    canvas.width = video.videoWidth * scale;
    canvas.height = video.videoHeight * scale;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    
    // Convert to base64 JPEG
    const photoData = canvas.toDataURL('image/jpeg', 0.8);
    setPhoto(photoData);
    stopCamera();
  }, [cameraReady, stopCamera]);

  // Handle file selection from gallery
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const maxSize = 1024;
        const scale = Math.min(maxSize / img.width, maxSize / img.height);
        canvas.width = img.width * scale;
        canvas.height = img.height * scale;
        
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          setPhoto(canvas.toDataURL('image/jpeg', 0.8));
        }
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  // Submit or update expense
  const handleSubmit = async () => {
    const amountNum = parseFloat(amount);
    if (isNaN(amountNum) || amountNum <= 0) {
      showToast('Please enter a valid amount');
      return;
    }
    
    let success: boolean;
    
    if (editingExpense) {
      // Update existing expense
      success = await onUpdateExpense(
        editingExpense.id,
        amountNum,
        category,
        new Date(date),
        note || undefined
      );
      if (success) {
        showToast('Expense updated');
      } else {
        showToast('Failed to update expense');
      }
    } else {
      // Create new expense
      success = await onSubmitExpense(
        amountNum,
        category,
        new Date(date),
        photo || undefined,
        note || undefined
      );
      if (success) {
        showToast('Expense submitted');
      } else {
        showToast('Failed to submit expense');
      }
    }
    
    if (success) {
      resetForm();
    }
  };

  // Delete expense
  const handleDelete = async (expense: Expense) => {
    if (!confirm(`Delete this ${expense.category} expense for $${expense.amount.toFixed(2)}?`)) {
      return;
    }
    
    const success = await onDeleteExpense(expense.id);
    if (success) {
      showToast('Expense deleted');
    } else {
      showToast('Failed to delete expense');
    }
  };

  // Format date for display
  const formatDate = (timestamp: any) => {
    if (!timestamp) return '';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleDateString('en-NZ', { day: 'numeric', month: 'short', year: 'numeric' });
  };

  // Format currency
  const formatCurrency = (amount: number) => {
    return `$${amount.toFixed(2)}`;
  };

  // Camera overlay
  if (showCamera) {
    return (
      <div style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: '#000',
        zIndex: 2000,
        display: 'flex',
        flexDirection: 'column'
      }}>
        <div style={{
          padding: '16px',
          paddingTop: 'max(16px, env(safe-area-inset-top))',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <button
            onClick={stopCamera}
            style={{
              background: 'rgba(255,255,255,0.2)',
              color: 'white',
              padding: '12px 20px',
              borderRadius: '10px',
              border: 'none',
              fontSize: '16px',
              cursor: 'pointer'
            }}
          >
            Cancel
          </button>
          <span style={{ color: 'white', fontSize: '16px', fontWeight: '600' }}>
            Take Photo
          </span>
          <div style={{ width: '80px' }} />
        </div>

        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
          {cameraError ? (
            <p style={{ color: 'white', textAlign: 'center', padding: '20px' }}>{cameraError}</p>
          ) : (
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'cover'
              }}
            />
          )}
        </div>

        <div style={{
          padding: '24px',
          paddingBottom: 'max(24px, env(safe-area-inset-bottom))',
          display: 'flex',
          justifyContent: 'center'
        }}>
          {cameraReady && !cameraError && (
            <button
              onClick={capturePhoto}
              style={{
                width: '72px',
                height: '72px',
                borderRadius: '50%',
                background: 'white',
                border: '4px solid rgba(255,255,255,0.5)',
                cursor: 'pointer'
              }}
            />
          )}
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: '16px', paddingBottom: 'max(100px, env(safe-area-inset-bottom, 100px))' }}>
      {/* Header */}
      <div style={{ marginBottom: '16px' }}>
        <h2 style={{ color: theme.text, fontSize: '20px', fontWeight: '600', margin: 0 }}>
          Expenses
        </h2>
        <p style={{ color: theme.textMuted, fontSize: '14px', marginTop: '4px' }}>
          Submit receipts for reimbursement
        </p>
      </div>

      {/* Add Expense Button / Form */}
      {!showForm ? (
        <button
          onClick={() => setShowForm(true)}
          style={{
            ...styles.btn,
            width: '100%',
            padding: '16px',
            fontSize: '16px',
            background: theme.success,
            marginBottom: '20px'
          }}
        >
          + Add Expense
        </button>
      ) : (
        <div style={styles.card}>
          <h3 style={{ color: theme.text, fontWeight: '600', marginBottom: '16px' }}>
            {editingExpense ? 'Edit Expense' : 'New Expense'}
          </h3>

          {/* Amount */}
          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', color: theme.textMuted, fontSize: '13px', marginBottom: '6px' }}>
              Amount *
            </label>
            <div style={{ position: 'relative' }}>
              <span style={{
                position: 'absolute',
                left: '14px',
                top: '50%',
                transform: 'translateY(-50%)',
                color: theme.textMuted,
                fontSize: '18px',
                fontWeight: '600'
              }}>$</span>
              <input
                type="number"
                inputMode="decimal"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                style={{
                  ...styles.input,
                  paddingLeft: '36px',
                  fontSize: '18px',
                  fontWeight: '600'
                }}
              />
            </div>
          </div>

          {/* Category */}
          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', color: theme.textMuted, fontSize: '13px', marginBottom: '6px' }}>
              Category *
            </label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as ExpenseCategory)}
              style={styles.select}
            >
              {EXPENSE_CATEGORIES.map(cat => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
          </div>

          {/* Date */}
          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', color: theme.textMuted, fontSize: '13px', marginBottom: '6px' }}>
              Date
            </label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              style={styles.input}
            />
          </div>

          {/* Photo - only show for new expenses */}
          {!editingExpense && (
            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', color: theme.textMuted, fontSize: '13px', marginBottom: '6px' }}>
                Receipt Photo (optional)
              </label>
              
              {photo ? (
                <div style={{ position: 'relative', display: 'inline-block' }}>
                  <img
                    src={photo}
                    alt="Receipt"
                    style={{
                      width: '120px',
                      height: '120px',
                      objectFit: 'cover',
                      borderRadius: '12px',
                      border: `2px solid ${theme.cardBorder}`
                    }}
                  />
                  <button
                    onClick={() => setPhoto(null)}
                    style={{
                      position: 'absolute',
                      top: '-8px',
                      right: '-8px',
                      width: '28px',
                      height: '28px',
                      borderRadius: '50%',
                      background: theme.danger,
                      color: 'white',
                      border: 'none',
                      cursor: 'pointer',
                      fontSize: '14px',
                      fontWeight: '600'
                    }}
                  >
                    ✕
                  </button>
                </div>
              ) : (
                <div style={{ display: 'flex', gap: '10px' }}>
                  <button
                    onClick={startCamera}
                    style={{
                      flex: 1,
                      padding: '14px',
                      borderRadius: '10px',
                      background: theme.cardAlt,
                      border: `1px solid ${theme.cardBorder}`,
                      color: theme.text,
                      cursor: 'pointer',
                      fontSize: '14px'
                    }}
                  >
                    📷 Camera
                  </button>
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    style={{
                      flex: 1,
                      padding: '14px',
                      borderRadius: '10px',
                      background: theme.cardAlt,
                      border: `1px solid ${theme.cardBorder}`,
                      color: theme.text,
                      cursor: 'pointer',
                      fontSize: '14px'
                    }}
                  >
                    🖼️ Gallery
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleFileSelect}
                    style={{ display: 'none' }}
                  />
                </div>
              )}
            </div>
          )}

          {/* Note */}
          <div style={{ marginBottom: '20px' }}>
            <label style={{ display: 'block', color: theme.textMuted, fontSize: '13px', marginBottom: '6px' }}>
              Note (optional)
            </label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g., Auckland CBD parking for Smith job"
              style={{
                ...styles.input,
                minHeight: '80px',
                resize: 'vertical',
                fontFamily: 'inherit'
              }}
            />
          </div>

          {/* Submit Button */}
          <button
            onClick={handleSubmit}
            disabled={submitting || !amount}
            style={{
              ...styles.btn,
              width: '100%',
              padding: '16px',
              fontSize: '16px',
              background: submitting || !amount ? theme.textMuted : theme.success,
              opacity: submitting || !amount ? 0.7 : 1,
              cursor: submitting || !amount ? 'not-allowed' : 'pointer'
            }}
          >
            {submitting ? '⏳ Submitting...' : (editingExpense ? 'Update Expense' : 'Submit Expense')}
          </button>

          {/* Close Button */}
          <button
            onClick={resetForm}
            style={{
              width: '100%',
              marginTop: '12px',
              padding: '14px',
              borderRadius: '12px',
              background: 'transparent',
              border: `1px dashed ${theme.cardBorder}`,
              color: theme.textMuted,
              cursor: 'pointer',
              fontSize: '14px'
            }}
          >
            Close
          </button>
        </div>
      )}

      {/* Expenses List */}
      <div style={{ marginTop: '8px' }}>
        <h3 style={{ color: theme.textMuted, fontSize: '12px', fontWeight: '600', marginBottom: '12px', textTransform: 'uppercase' }}>
          Your Expenses
        </h3>

        {loading ? (
          <p style={{ color: theme.textMuted, fontSize: '14px', textAlign: 'center', padding: '20px' }}>
            Loading...
          </p>
        ) : expenses.length === 0 ? (
          <div style={{
            ...styles.card,
            textAlign: 'center',
            padding: '32px 20px'
          }}>
            <p style={{ color: theme.textMuted, fontSize: '14px' }}>
              No expenses submitted yet
            </p>
          </div>
        ) : (
          expenses.map(expense => (
            <div
              key={expense.id}
              style={{
                ...styles.card,
                marginBottom: '12px'
              }}
            >
              <div style={{ display: 'flex', gap: '12px' }}>
                {/* Photo thumbnail */}
                {expense.photoUrl ? (
                  <img
                    src={expense.photoUrl}
                    alt="Receipt"
                    style={{
                      width: '60px',
                      height: '60px',
                      objectFit: 'cover',
                      borderRadius: '8px',
                      flexShrink: 0
                    }}
                  />
                ) : (
                  <div style={{
                    width: '60px',
                    height: '60px',
                    background: theme.cardAlt,
                    borderRadius: '8px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0
                  }}>
                    <span style={{ fontSize: '24px', opacity: 0.5 }}>🧾</span>
                  </div>
                )}

                {/* Details */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '4px' }}>
                    <span style={{ color: theme.text, fontWeight: '600', fontSize: '16px' }}>
                      {formatCurrency(expense.amount)}
                    </span>
                    <span style={{
                      padding: '4px 10px',
                      borderRadius: '12px',
                      fontSize: '11px',
                      fontWeight: '600',
                      background: expense.status === 'approved' ? theme.successBg : theme.warningBg,
                      color: expense.status === 'approved' ? theme.success : theme.warning
                    }}>
                      {expense.status === 'approved' ? '✓ Approved' : '⏳ Pending'}
                    </span>
                  </div>
                  <p style={{ color: theme.textMuted, fontSize: '14px', marginBottom: '2px' }}>
                    {expense.category}
                  </p>
                  {expense.note && (
                    <p style={{ 
                      color: theme.textLight, 
                      fontSize: '13px', 
                      marginBottom: '2px',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap'
                    }}>
                      {expense.note}
                    </p>
                  )}
                  <p style={{ color: theme.textLight, fontSize: '12px' }}>
                    {formatDate(expense.date)}
                  </p>
                </div>
              </div>

              {/* Edit/Delete buttons - only for pending expenses */}
              {expense.status === 'pending' && (
                <div style={{ 
                  display: 'flex', 
                  gap: '8px', 
                  marginTop: '12px',
                  paddingTop: '12px',
                  borderTop: `1px solid ${theme.cardBorder}`
                }}>
                  <button
                    onClick={() => startEdit(expense)}
                    style={{
                      flex: 1,
                      padding: '10px',
                      borderRadius: '8px',
                      background: theme.cardAlt,
                      border: `1px solid ${theme.cardBorder}`,
                      color: theme.text,
                      cursor: 'pointer',
                      fontSize: '14px',
                      fontWeight: '500'
                    }}
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => handleDelete(expense)}
                    style={{
                      flex: 1,
                      padding: '10px',
                      borderRadius: '8px',
                      background: theme.dangerBg,
                      border: `1px solid ${theme.danger}`,
                      color: theme.danger,
                      cursor: 'pointer',
                      fontSize: '14px',
                      fontWeight: '500'
                    }}
                  >
                    Delete
                  </button>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}