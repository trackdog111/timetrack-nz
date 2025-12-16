// TimeTrack NZ - Break Rules Info Component

import { Theme } from '../theme';

interface BreakRulesInfoProps {
  isOpen: boolean;
  onToggle: () => void;
  theme: Theme;
}

export function BreakRulesInfo({ isOpen, onToggle, theme }: BreakRulesInfoProps) {
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
                {[
                  ['2-4h', '1 × 10min', '—'],
                  ['4-6h', '1 × 10min', '1 × 30min'],
                  ['6-10h', '2 × 10min', '1 × 30min'],
                  ['10-12h', '3 × 10min', '1 × 30min'],
                  ['12-14h', '4 × 10min', '2 × 30min'],
                  ['14h+', '5 × 10min', '2 × 30min']
                ].map(([hours, paid, unpaid], i) => (
                  <tr key={i} style={{ borderTop: `1px solid ${theme.cardBorder}` }}>
                    <td style={{ padding: '10px', color: theme.text }}>{hours}</td>
                    <td style={{ padding: '10px', color: theme.success }}>{paid}</td>
                    <td style={{ padding: '10px', color: theme.textLight }}>{unpaid}</td>
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
