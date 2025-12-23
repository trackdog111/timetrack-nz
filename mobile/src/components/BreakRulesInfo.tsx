// Trackable NZ - Break Rules Info Component

import { Theme } from '../theme';

interface BreakRulesInfoProps {
  isOpen: boolean;
  onToggle: () => void;
  theme: Theme;
  paidRestMinutes?: number; // Custom paid rest duration from company settings
}

export function BreakRulesInfo({ isOpen, onToggle, theme, paidRestMinutes = 10 }: BreakRulesInfoProps) {
  // Check if employer offers more than minimum
  const isEnhanced = paidRestMinutes > 10;
  
  // Generate table data based on company's paid rest duration
  const breakRules = [
    { hours: '2-4h', paidBreaks: 1, unpaidBreaks: 0 },
    { hours: '4-6h', paidBreaks: 1, unpaidBreaks: 1 },
    { hours: '6-10h', paidBreaks: 2, unpaidBreaks: 1 },
    { hours: '10-12h', paidBreaks: 3, unpaidBreaks: 1 },
    { hours: '12-14h', paidBreaks: 4, unpaidBreaks: 2 },
    { hours: '14h+', paidBreaks: 5, unpaidBreaks: 2 }
  ];

  return (
    <div style={{ background: theme.card, borderRadius: '16px', overflow: 'hidden', border: `1px solid ${theme.cardBorder}` }}>
      <button
        onClick={onToggle}
        style={{
          width: '100%',
          padding: '16px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          background: 'none',
          border: 'none',
          cursor: 'pointer'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span>ℹ️</span>
          <span style={{ color: theme.text, fontWeight: '600' }}>NZ Break Rules</span>
          {isEnhanced && (
            <span style={{ 
              background: theme.successBg, 
              color: theme.success, 
              padding: '2px 8px', 
              borderRadius: '12px', 
              fontSize: '11px',
              fontWeight: '600'
            }}>
              Enhanced
            </span>
          )}
        </div>
        <span style={{
          color: theme.textMuted,
          transform: isOpen ? 'rotate(180deg)' : 'none',
          transition: 'transform 0.2s'
        }}>▼</span>
      </button>
      
      {isOpen && (
        <div style={{ padding: '0 16px 16px' }}>
          <p style={{ color: theme.textMuted, fontSize: '13px', marginBottom: '12px' }}>
            Under the Employment Relations Act 2000, you're entitled to rest and meal breaks based on your shift length:
          </p>
          
          {/* Show enhanced policy notice if applicable */}
          {isEnhanced && (
            <div style={{ 
              background: theme.successBg, 
              padding: '10px 12px', 
              borderRadius: '8px', 
              marginBottom: '12px',
              border: `1px solid ${theme.success}30`
            }}>
              <p style={{ color: theme.success, fontSize: '13px', margin: 0 }}>
                ✨ Your employer offers <strong>{paidRestMinutes}-minute</strong> paid rest breaks (NZ law minimum is 10 minutes)
              </p>
            </div>
          )}
          
          <div style={{ background: theme.cardAlt, borderRadius: '8px', overflow: 'hidden' }}>
            <table style={{ width: '100%', fontSize: '13px', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: theme.card }}>
                  <th style={{ padding: '10px', textAlign: 'left', color: theme.textMuted, fontWeight: '500' }}>Hours</th>
                  <th style={{ padding: '10px', textAlign: 'left', color: theme.success, fontWeight: '500' }}>Paid Rest</th>
                  <th style={{ padding: '10px', textAlign: 'left', color: theme.warning, fontWeight: '500' }}>Unpaid Meal</th>
                </tr>
              </thead>
              <tbody>
                {breakRules.map((rule, i) => (
                  <tr key={i} style={{ borderTop: `1px solid ${theme.cardBorder}` }}>
                    <td style={{ padding: '10px', color: theme.text }}>{rule.hours}</td>
                    <td style={{ padding: '10px', color: theme.success }}>
                      {rule.paidBreaks > 0 
                        ? `${rule.paidBreaks} × ${paidRestMinutes}min` 
                        : '—'}
                    </td>
                    <td style={{ padding: '10px', color: theme.textLight }}>
                      {rule.unpaidBreaks > 0 
                        ? `${rule.unpaidBreaks} × 30min` 
                        : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          
          <div style={{ marginTop: '12px', fontSize: '12px', color: theme.textMuted }}>
            <p style={{ marginBottom: '4px' }}>
              <span style={{ color: theme.success }}>● Paid rest breaks</span> — you stay on the clock
            </p>
            <p style={{ marginBottom: '8px' }}>
              <span style={{ color: theme.warning }}>● Unpaid meal breaks</span> — deducted from worked hours
            </p>
            <p style={{ paddingTop: '8px', borderTop: `1px solid ${theme.cardBorder}` }}>
              This app auto-calculates: your first breaks count as paid (up to your entitlement), any extra break time is unpaid.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}