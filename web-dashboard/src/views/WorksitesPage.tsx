// Trackable NZ - Dashboard Worksites Page
// Worksite management (add/edit/archive) + hours-per-site analytics with pie chart

import React, { useState, useMemo } from 'react';
import { Theme, Shift, Worksite } from '../shared/types';

interface WorksitesPageProps {
  theme: Theme;
  worksites: Worksite[];
  activeWorksites: Worksite[];
  archivedWorksites: Worksite[];
  shifts: Shift[];
  loading: boolean;
  error: string;
  onAddWorksite: (name: string, address?: string) => Promise<boolean>;
  onUpdateWorksite: (id: string, data: { name?: string; address?: string }) => Promise<boolean>;
  onArchiveWorksite: (id: string) => Promise<boolean>;
  onRestoreWorksite: (id: string) => Promise<boolean>;
}

// Pie chart colors
const CHART_COLORS = [
  '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6',
  '#ec4899', '#06b6d4', '#84cc16', '#f97316', '#6366f1'
];

const WorksitesPage: React.FC<WorksitesPageProps> = ({
  theme,
  worksites,
  activeWorksites,
  archivedWorksites,
  shifts,
  loading,
  error,
  onAddWorksite,
  onUpdateWorksite,
  onArchiveWorksite,
  onRestoreWorksite
}) => {
  const [newName, setNewName] = useState('');
  const [newAddress, setNewAddress] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editAddress, setEditAddress] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Calculate hours per worksite from shifts
  const worksiteHours = useMemo(() => {
    const hoursMap: Record<string, { name: string; hours: number; shiftCount: number }> = {};
    let unassignedHours = 0;
    let unassignedCount = 0;

    shifts.filter(s => s.status === 'completed' && s.clockOut).forEach(shift => {
      const clockIn = shift.clockIn?.toDate?.() || new Date(shift.clockIn);
      const clockOut = shift.clockOut?.toDate?.() || new Date(shift.clockOut);
      const hours = (clockOut.getTime() - clockIn.getTime()) / 3600000;

      if (shift.worksiteId && shift.worksiteName) {
        if (!hoursMap[shift.worksiteId]) {
          hoursMap[shift.worksiteId] = { name: shift.worksiteName, hours: 0, shiftCount: 0 };
        }
        hoursMap[shift.worksiteId].hours += hours;
        hoursMap[shift.worksiteId].shiftCount += 1;
      } else {
        unassignedHours += hours;
        unassignedCount += 1;
      }
    });

    const result = Object.entries(hoursMap).map(([id, data]) => ({
      id,
      name: data.name,
      hours: Math.round(data.hours * 10) / 10,
      shiftCount: data.shiftCount
    }));

    // Add unassigned if any
    if (unassignedHours > 0) {
      result.push({
        id: 'unassigned',
        name: 'No Worksite',
        hours: Math.round(unassignedHours * 10) / 10,
        shiftCount: unassignedCount
      });
    }

    return result.sort((a, b) => b.hours - a.hours);
  }, [shifts]);

  const totalHours = worksiteHours.reduce((sum, w) => sum + w.hours, 0);

  // Handle add
  const handleAdd = async () => {
    if (!newName.trim()) return;
    setSubmitting(true);
    const success = await onAddWorksite(newName, newAddress);
    if (success) {
      setNewName('');
      setNewAddress('');
    }
    setSubmitting(false);
  };

  // Handle edit save
  const handleEditSave = async (id: string) => {
    if (!editName.trim()) return;
    setSubmitting(true);
    const success = await onUpdateWorksite(id, { name: editName, address: editAddress });
    if (success) setEditingId(null);
    setSubmitting(false);
  };

  // Start editing
  const startEdit = (site: Worksite) => {
    setEditingId(site.id);
    setEditName(site.name);
    setEditAddress(site.address || '');
  };

  // Simple SVG Pie Chart
  const renderPieChart = () => {
    if (worksiteHours.length === 0) return null;

    const size = 200;
    const cx = size / 2;
    const cy = size / 2;
    const radius = 80;
    let startAngle = -90;

    const slices = worksiteHours.map((item, i) => {
      const percentage = totalHours > 0 ? item.hours / totalHours : 0;
      const angle = percentage * 360;
      const endAngle = startAngle + angle;

      const startRad = (startAngle * Math.PI) / 180;
      const endRad = (endAngle * Math.PI) / 180;

      const x1 = cx + radius * Math.cos(startRad);
      const y1 = cy + radius * Math.sin(startRad);
      const x2 = cx + radius * Math.cos(endRad);
      const y2 = cy + radius * Math.sin(endRad);

      const largeArc = angle > 180 ? 1 : 0;

      const path = `M ${cx} ${cy} L ${x1} ${y1} A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2} Z`;

      startAngle = endAngle;

      return (
        <path
          key={item.id}
          d={path}
          fill={CHART_COLORS[i % CHART_COLORS.length]}
          stroke={theme.card}
          strokeWidth="2"
        />
      );
    });

    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 24, flexWrap: 'wrap' }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          {slices}
        </svg>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {worksiteHours.map((item, i) => (
            <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{
                width: 12,
                height: 12,
                borderRadius: 2,
                background: CHART_COLORS[i % CHART_COLORS.length],
                flexShrink: 0
              }} />
              <span style={{ color: theme.text, fontSize: 13 }}>
                {item.name}: {item.hours}h ({item.shiftCount} shifts)
              </span>
            </div>
          ))}
        </div>
      </div>
    );
  };

  const inputStyle: React.CSSProperties = {
    background: theme.input,
    border: `1px solid ${theme.inputBorder}`,
    borderRadius: 6,
    color: theme.text,
    fontSize: 14,
    padding: '8px 12px',
    width: '100%'
  };

  const btnPrimary: React.CSSProperties = {
    background: theme.primary,
    color: '#fff',
    border: 'none',
    borderRadius: 6,
    padding: '8px 16px',
    fontSize: 14,
    cursor: 'pointer',
    fontWeight: 500
  };

  const btnSecondary: React.CSSProperties = {
    background: 'transparent',
    color: theme.textMuted,
    border: `1px solid ${theme.inputBorder}`,
    borderRadius: 6,
    padding: '8px 16px',
    fontSize: 14,
    cursor: 'pointer'
  };

  if (loading) {
    return <div style={{ color: theme.textMuted, padding: 24 }}>Loading worksites...</div>;
  }

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h2 style={{ color: theme.text, margin: 0, fontSize: 22, fontWeight: 600 }}>Worksites</h2>
        <span style={{ color: theme.textMuted, fontSize: 14 }}>
          {activeWorksites.length} active{archivedWorksites.length > 0 ? `, ${archivedWorksites.length} archived` : ''}
        </span>
      </div>

      {error && (
        <div style={{
          background: theme.dangerBg,
          color: theme.danger,
          padding: '10px 14px',
          borderRadius: 6,
          marginBottom: 16,
          fontSize: 14
        }}>
          {error}
        </div>
      )}

      {/* Add New Worksite */}
      <div style={{
        background: theme.card,
        border: `1px solid ${theme.cardBorder}`,
        borderRadius: 8,
        padding: 16,
        marginBottom: 24
      }}>
        <h3 style={{ color: theme.text, margin: '0 0 12px 0', fontSize: 15, fontWeight: 600 }}>
          Add New Worksite
        </h3>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <input
            type="text"
            placeholder="Worksite name *"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            style={{ ...inputStyle, flex: '1 1 200px' }}
            onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
          />
          <input
            type="text"
            placeholder="Address (optional)"
            value={newAddress}
            onChange={(e) => setNewAddress(e.target.value)}
            style={{ ...inputStyle, flex: '1 1 250px' }}
            onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
          />
          <button
            onClick={handleAdd}
            disabled={submitting || !newName.trim()}
            style={{
              ...btnPrimary,
              opacity: submitting || !newName.trim() ? 0.5 : 1
            }}
          >
            {submitting ? 'Adding...' : 'Add Worksite'}
          </button>
        </div>
      </div>

      {/* Analytics - Hours per Worksite */}
      {worksiteHours.length > 0 && (
        <div style={{
          background: theme.card,
          border: `1px solid ${theme.cardBorder}`,
          borderRadius: 8,
          padding: 16,
          marginBottom: 24
        }}>
          <h3 style={{ color: theme.text, margin: '0 0 16px 0', fontSize: 15, fontWeight: 600 }}>
            Hours by Worksite
          </h3>
          {renderPieChart()}
          <div style={{ color: theme.textMuted, fontSize: 13, marginTop: 12 }}>
            Total: {Math.round(totalHours * 10) / 10} hours across {shifts.filter(s => s.status === 'completed').length} shifts
          </div>
        </div>
      )}

      {/* Active Worksites List */}
      <div style={{
        background: theme.card,
        border: `1px solid ${theme.cardBorder}`,
        borderRadius: 8,
        padding: 16,
        marginBottom: 24
      }}>
        <h3 style={{ color: theme.text, margin: '0 0 12px 0', fontSize: 15, fontWeight: 600 }}>
          Active Worksites
        </h3>
        {activeWorksites.length === 0 ? (
          <div style={{ color: theme.textMuted, fontSize: 14 }}>
            No worksites yet. Add one above to get started.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {activeWorksites.map(site => (
              <div
                key={site.id}
                style={{
                  background: theme.cardAlt,
                  border: `1px solid ${theme.cardBorder}`,
                  borderRadius: 6,
                  padding: '10px 14px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  gap: 8
                }}
              >
                {editingId === site.id ? (
                  <div style={{ display: 'flex', gap: 8, flex: 1, flexWrap: 'wrap' }}>
                    <input
                      type="text"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      style={{ ...inputStyle, flex: '1 1 180px' }}
                      autoFocus
                    />
                    <input
                      type="text"
                      value={editAddress}
                      onChange={(e) => setEditAddress(e.target.value)}
                      placeholder="Address"
                      style={{ ...inputStyle, flex: '1 1 220px' }}
                    />
                    <button onClick={() => handleEditSave(site.id)} style={btnPrimary} disabled={submitting}>
                      Save
                    </button>
                    <button onClick={() => setEditingId(null)} style={btnSecondary}>
                      Cancel
                    </button>
                  </div>
                ) : (
                  <>
                    <div>
                      <div style={{ color: theme.text, fontSize: 14, fontWeight: 500 }}>{site.name}</div>
                      {site.address && (
                        <div style={{ color: theme.textMuted, fontSize: 12, marginTop: 2 }}>{site.address}</div>
                      )}
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button onClick={() => startEdit(site)} style={btnSecondary}>
                        Edit
                      </button>
                      <button
                        onClick={() => {
                          if (window.confirm(`Archive "${site.name}"? It will no longer appear in the clock-in picker.`)) {
                            onArchiveWorksite(site.id);
                          }
                        }}
                        style={{ ...btnSecondary, color: theme.warning }}
                      >
                        Archive
                      </button>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Archived Worksites */}
      {archivedWorksites.length > 0 && (
        <div style={{
          background: theme.card,
          border: `1px solid ${theme.cardBorder}`,
          borderRadius: 8,
          padding: 16
        }}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              cursor: 'pointer',
              marginBottom: showArchived ? 12 : 0
            }}
            onClick={() => setShowArchived(!showArchived)}
          >
            <h3 style={{ color: theme.textMuted, margin: 0, fontSize: 15, fontWeight: 600 }}>
              Archived ({archivedWorksites.length})
            </h3>
            <span style={{ color: theme.textMuted, fontSize: 13 }}>
              {showArchived ? '▲ Hide' : '▼ Show'}
            </span>
          </div>
          {showArchived && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {archivedWorksites.map(site => (
                <div
                  key={site.id}
                  style={{
                    background: theme.cardAlt,
                    border: `1px solid ${theme.cardBorder}`,
                    borderRadius: 6,
                    padding: '10px 14px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    opacity: 0.7
                  }}
                >
                  <div>
                    <div style={{ color: theme.text, fontSize: 14 }}>{site.name}</div>
                    {site.address && (
                      <div style={{ color: theme.textMuted, fontSize: 12, marginTop: 2 }}>{site.address}</div>
                    )}
                  </div>
                  <button
                    onClick={() => onRestoreWorksite(site.id)}
                    style={{ ...btnSecondary, color: theme.success }}
                  >
                    Restore
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default WorksitesPage;
