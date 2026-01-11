import { useState } from 'react';
import { Theme, Employee, Expense } from '../shared/types';
import { fmtDateShort, fmtTime } from '../shared/utils';

interface ExpensesViewProps {
  theme: Theme;
  isMobile: boolean;
  expenses: Expense[];
  employees: Employee[];
  getEmployeeName: (userId?: string, userEmail?: string) => string;
  approveExpense: (expenseId: string) => Promise<void>;
  deleteExpense: (expenseId: string) => Promise<void>;
  approvingExpense: string | null;
  deletingExpense: string | null;
}

export function ExpensesView({
  theme,
  isMobile,
  expenses,
  employees,
  getEmployeeName,
  approveExpense,
  deleteExpense,
  approvingExpense,
  deletingExpense
}: ExpensesViewProps) {
  const [filterEmployee, setFilterEmployee] = useState('all');
  const [filterStatus, setFilterStatus] = useState<'all' | 'pending' | 'approved'>('all');
  const [filterStart, setFilterStart] = useState('');
  const [filterEnd, setFilterEnd] = useState('');
  const [photoModal, setPhotoModal] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  const styles = {
    card: { background: theme.card, borderRadius: '12px', padding: '20px', marginBottom: '16px', border: `1px solid ${theme.cardBorder}` },
    input: { padding: '10px 12px', borderRadius: '8px', border: `1px solid ${theme.inputBorder}`, background: theme.input, color: theme.text, fontSize: '14px', width: '100%', boxSizing: 'border-box' as const },
    btn: { padding: '8px 16px', borderRadius: '8px', border: 'none', background: theme.primary, color: 'white', cursor: 'pointer', fontWeight: '600' as const, fontSize: '13px' },
    btnSuccess: { padding: '8px 16px', borderRadius: '8px', border: 'none', background: theme.success, color: 'white', cursor: 'pointer', fontWeight: '600' as const, fontSize: '13px' },
    btnDanger: { padding: '8px 16px', borderRadius: '8px', border: 'none', background: theme.danger, color: 'white', cursor: 'pointer', fontWeight: '600' as const, fontSize: '13px' },
    btnOutline: { padding: '8px 16px', borderRadius: '8px', border: `1px solid ${theme.cardBorder}`, background: 'transparent', color: theme.text, cursor: 'pointer', fontWeight: '500' as const, fontSize: '13px' }
  };

  // Filter expenses
  const filteredExpenses = expenses.filter(exp => {
    if (filterEmployee !== 'all' && exp.odId !== filterEmployee) return false;
    if (filterStatus !== 'all' && exp.status !== filterStatus) return false;
    if (filterStart) {
      const startDate = new Date(filterStart);
      startDate.setHours(0, 0, 0, 0);
      const expDate: Date = exp.date?.toDate ? exp.date.toDate() : new Date(exp.date as any);
      if (expDate < startDate) return false;
    }
    if (filterEnd) {
      const endDate = new Date(filterEnd);
      endDate.setHours(23, 59, 59, 999);
      const expDate: Date = exp.date?.toDate ? exp.date.toDate() : new Date(exp.date as any);
      if (expDate > endDate) return false;
    }
    return true;
  });

  // Sort by date descending (newest first)
  const sortedExpenses = [...filteredExpenses].sort((a, b) => {
    const dateA: Date = a.createdAt?.toDate ? a.createdAt.toDate() : new Date(a.createdAt as any);
    const dateB: Date = b.createdAt?.toDate ? b.createdAt.toDate() : new Date(b.createdAt as any);
    return dateB.getTime() - dateA.getTime();
  });

  // Calculate totals
  const pendingTotal = filteredExpenses.filter(e => e.status === 'pending').reduce((sum, e) => sum + e.amount, 0);
  const approvedTotal = filteredExpenses.filter(e => e.status === 'approved').reduce((sum, e) => sum + e.amount, 0);

  const clearFilters = () => {
    setFilterEmployee('all');
    setFilterStatus('all');
    setFilterStart('');
    setFilterEnd('');
  };

  const handleApprove = async (expenseId: string) => {
    await approveExpense(expenseId);
  };

  const handleDelete = async (expenseId: string) => {
    await deleteExpense(expenseId);
    setDeleteConfirm(null);
  };

  return (
    <div>
      <h1 style={{ color: theme.text, marginBottom: '24px', fontSize: isMobile ? '22px' : '28px' }}>Expenses</h1>

      {/* Stats Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, 1fr)', gap: '16px', marginBottom: '20px' }}>
        <div style={styles.card}>
          <p style={{ color: theme.textMuted, fontSize: '13px', marginBottom: '4px' }}>Total Expenses</p>
          <p style={{ color: theme.text, fontSize: '28px', fontWeight: '700' }}>{filteredExpenses.length}</p>
        </div>
        <div style={styles.card}>
          <p style={{ color: theme.textMuted, fontSize: '13px', marginBottom: '4px' }}>Pending</p>
          <p style={{ color: theme.warning, fontSize: '28px', fontWeight: '700' }}>${pendingTotal.toFixed(2)}</p>
        </div>
        <div style={styles.card}>
          <p style={{ color: theme.textMuted, fontSize: '13px', marginBottom: '4px' }}>Approved</p>
          <p style={{ color: theme.success, fontSize: '28px', fontWeight: '700' }}>${approvedTotal.toFixed(2)}</p>
        </div>
      </div>

      {/* Filters */}
      <div style={styles.card}>
        <h3 style={{ color: theme.text, marginBottom: '16px', fontSize: '16px' }}>Filters</h3>
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'end' }}>
          <div style={{ flex: '1', minWidth: '150px' }}>
            <label style={{ color: theme.textMuted, fontSize: '12px', display: 'block', marginBottom: '4px' }}>Employee</label>
            <select value={filterEmployee} onChange={e => setFilterEmployee(e.target.value)} style={styles.input}>
              <option value="all">All Employees</option>
              {employees.map(emp => (
                <option key={emp.id} value={emp.id}>{emp.name || emp.email}</option>
              ))}
            </select>
          </div>
          <div style={{ flex: '1', minWidth: '120px' }}>
            <label style={{ color: theme.textMuted, fontSize: '12px', display: 'block', marginBottom: '4px' }}>Status</label>
            <select value={filterStatus} onChange={e => setFilterStatus(e.target.value as any)} style={styles.input}>
              <option value="all">All</option>
              <option value="pending">Pending</option>
              <option value="approved">Approved</option>
            </select>
          </div>
          <div style={{ flex: '1', minWidth: '140px' }}>
            <label style={{ color: theme.textMuted, fontSize: '12px', display: 'block', marginBottom: '4px' }}>From</label>
            <input type="date" value={filterStart} onChange={e => setFilterStart(e.target.value)} style={styles.input} />
          </div>
          <div style={{ flex: '1', minWidth: '140px' }}>
            <label style={{ color: theme.textMuted, fontSize: '12px', display: 'block', marginBottom: '4px' }}>To</label>
            <input type="date" value={filterEnd} onChange={e => setFilterEnd(e.target.value)} style={styles.input} />
          </div>
          <button onClick={clearFilters} style={styles.btnOutline}>Clear</button>
        </div>
      </div>

      {/* Expenses Table */}
      <div style={styles.card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <h3 style={{ color: theme.text, margin: 0 }}>{sortedExpenses.length} expense{sortedExpenses.length !== 1 ? 's' : ''}</h3>
        </div>

        {sortedExpenses.length === 0 ? (
          <p style={{ color: theme.textMuted, textAlign: 'center', padding: '40px 0' }}>No expenses found</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '800px' }}>
              <thead>
                <tr style={{ borderBottom: `2px solid ${theme.cardBorder}` }}>
                  <th style={{ padding: '12px 8px', textAlign: 'left', color: theme.textMuted, fontSize: '13px' }}>Employee</th>
                  <th style={{ padding: '12px 8px', textAlign: 'left', color: theme.textMuted, fontSize: '13px' }}>Date</th>
                  <th style={{ padding: '12px 8px', textAlign: 'left', color: theme.textMuted, fontSize: '13px' }}>Category</th>
                  <th style={{ padding: '12px 8px', textAlign: 'right', color: theme.textMuted, fontSize: '13px' }}>Amount</th>
                  <th style={{ padding: '12px 8px', textAlign: 'left', color: theme.textMuted, fontSize: '13px' }}>Note</th>
                  <th style={{ padding: '12px 8px', textAlign: 'center', color: theme.textMuted, fontSize: '13px' }}>Receipt</th>
                  <th style={{ padding: '12px 8px', textAlign: 'center', color: theme.textMuted, fontSize: '13px' }}>Status</th>
                  <th style={{ padding: '12px 8px', textAlign: 'center', color: theme.textMuted, fontSize: '13px' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {sortedExpenses.map(exp => {
                  const expDate: Date = exp.date?.toDate ? exp.date.toDate() : new Date(exp.date as any);
                  return (
                    <tr key={exp.id} style={{ borderBottom: `1px solid ${theme.cardBorder}` }}>
                      <td style={{ padding: '12px 8px', color: theme.text, fontSize: '13px' }}>
                        {getEmployeeName(exp.odId, exp.odEmail)}
                      </td>
                      <td style={{ padding: '12px 8px', color: theme.text, fontSize: '13px' }}>
                        {expDate.toLocaleDateString('en-NZ', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </td>
                      <td style={{ padding: '12px 8px', color: theme.text, fontSize: '13px' }}>
                        {exp.category}
                      </td>
                      <td style={{ padding: '12px 8px', color: theme.text, fontSize: '13px', textAlign: 'right', fontWeight: '600' }}>
                        ${exp.amount.toFixed(2)}
                      </td>
                      <td style={{ padding: '12px 8px', color: theme.textMuted, fontSize: '13px', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {exp.note || '-'}
                      </td>
                      <td style={{ padding: '12px 8px', textAlign: 'center' }}>
                        {exp.photoUrl ? (
                          <img 
                            src={exp.photoUrl} 
                            alt="Receipt" 
                            style={{ width: '40px', height: '40px', objectFit: 'cover', borderRadius: '6px', cursor: 'pointer', border: `1px solid ${theme.cardBorder}` }}
                            onClick={() => setPhotoModal(exp.photoUrl!)}
                          />
                        ) : (
                          <span style={{ color: theme.textMuted, fontSize: '12px' }}>-</span>
                        )}
                      </td>
                      <td style={{ padding: '12px 8px', textAlign: 'center' }}>
                        <span style={{
                          display: 'inline-block',
                          padding: '4px 10px',
                          borderRadius: '12px',
                          fontSize: '12px',
                          fontWeight: '600',
                          background: exp.status === 'approved' ? theme.successBg : theme.warningBg,
                          color: exp.status === 'approved' ? theme.success : theme.warning
                        }}>
                          {exp.status === 'approved' ? '✓ Approved' : '⏳ Pending'}
                        </span>
                      </td>
                      <td style={{ padding: '12px 8px', textAlign: 'center' }}>
                        <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
                          {exp.status === 'pending' && (
                            <button 
                              onClick={() => handleApprove(exp.id)}
                              disabled={approvingExpense === exp.id}
                              style={{ ...styles.btnSuccess, opacity: approvingExpense === exp.id ? 0.6 : 1 }}
                            >
                              {approvingExpense === exp.id ? '...' : '✓ Approve'}
                            </button>
                          )}
                          <button 
                            onClick={() => setDeleteConfirm(exp.id)}
                            disabled={deletingExpense === exp.id}
                            style={{ ...styles.btnDanger, opacity: deletingExpense === exp.id ? 0.6 : 1 }}
                          >
                            {deletingExpense === exp.id ? '...' : '🗑️'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Photo Modal */}
      {photoModal && (
        <div 
          style={{ 
            position: 'fixed', 
            top: 0, 
            left: 0, 
            right: 0, 
            bottom: 0, 
            background: 'rgba(0,0,0,0.8)', 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center', 
            zIndex: 1000,
            padding: '20px'
          }} 
          onClick={() => setPhotoModal(null)}
        >
          <div style={{ position: 'relative', maxWidth: '90vw', maxHeight: '90vh' }}>
            <img 
              src={photoModal} 
              alt="Receipt" 
              style={{ maxWidth: '100%', maxHeight: '85vh', borderRadius: '12px', objectFit: 'contain' }}
              onClick={e => e.stopPropagation()}
            />
            <button 
              onClick={() => setPhotoModal(null)}
              style={{ 
                position: 'absolute', 
                top: '-40px', 
                right: '0', 
                background: 'white', 
                border: 'none', 
                borderRadius: '50%', 
                width: '36px', 
                height: '36px', 
                fontSize: '20px', 
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              ×
            </button>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirm && (
        <div 
          style={{ 
            position: 'fixed', 
            top: 0, 
            left: 0, 
            right: 0, 
            bottom: 0, 
            background: 'rgba(0,0,0,0.5)', 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center', 
            zIndex: 1000,
            padding: '16px'
          }} 
          onClick={() => setDeleteConfirm(null)}
        >
          <div 
            style={{ 
              background: theme.card, 
              borderRadius: '12px', 
              padding: '24px', 
              width: '100%', 
              maxWidth: '400px',
              border: `1px solid ${theme.cardBorder}`
            }} 
            onClick={e => e.stopPropagation()}
          >
            <h3 style={{ color: theme.text, marginBottom: '12px' }}>Delete Expense?</h3>
            <p style={{ color: theme.textMuted, marginBottom: '20px', fontSize: '14px' }}>
              This action cannot be undone. The expense will be permanently removed.
            </p>
            <div style={{ display: 'flex', gap: '12px' }}>
              <button 
                onClick={() => setDeleteConfirm(null)} 
                style={{ ...styles.btnOutline, flex: 1 }}
              >
                Cancel
              </button>
              <button 
                onClick={() => handleDelete(deleteConfirm)}
                disabled={deletingExpense === deleteConfirm}
                style={{ ...styles.btnDanger, flex: 1, opacity: deletingExpense === deleteConfirm ? 0.6 : 1 }}
              >
                {deletingExpense === deleteConfirm ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
