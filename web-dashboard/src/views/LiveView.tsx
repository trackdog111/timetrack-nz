import { Shift, Theme, CompanySettings, Location } from '../shared/types';
import { getHours, calcBreaks, calcTravel, fmtDur, fmtTime } from '../shared/utils';
import { LocationMap } from '../components/MapModal';

interface LiveViewProps {
  theme: Theme;
  isMobile: boolean;
  activeShifts: Shift[];
  companySettings: CompanySettings;
  getEmployeeName: (userId?: string, userEmail?: string) => string;
  setMapModal: (modal: { locations: Location[], title: string, clockInLocation?: Location, clockOutLocation?: Location } | null) => void;
}

export function LiveView({ theme, isMobile, activeShifts, companySettings, getEmployeeName, setMapModal }: LiveViewProps) {
  const hasActiveTravel = (shift: Shift): boolean => {
    return (shift.travelSegments || []).some(t => !t.endTime);
  };

  // Get all locations for a shift (including clockInLocation if not in history)
  const getShiftLocations = (shift: Shift): Location[] => {
    const locations: Location[] = [];
    
    // Add clock-in location first if it exists and is valid
    if (shift.clockInLocation && (shift.clockInLocation.latitude || (shift.clockInLocation as any).lat)) {
      locations.push(shift.clockInLocation);
    }
    
    // Add location history
    if (shift.locationHistory?.length > 0) {
      shift.locationHistory.forEach(loc => {
        // Get coordinates (handle both formats)
        const locLat = loc.latitude || (loc as any).lat;
        const locLng = loc.longitude || (loc as any).lng;
        const clockInLat = shift.clockInLocation?.latitude || (shift.clockInLocation as any)?.lat;
        const clockInLng = shift.clockInLocation?.longitude || (shift.clockInLocation as any)?.lng;
        
        // Avoid duplicates with clockInLocation
        if (!shift.clockInLocation || locLat !== clockInLat || locLng !== clockInLng) {
          locations.push(loc);
        }
      });
    }
    
    return locations;
  };

  const styles = {
    card: { background: theme.card, borderRadius: '12px', padding: '20px', border: `1px solid ${theme.cardBorder}` }
  };

  return (
    <div>
      <h1 style={{ color: theme.text, marginBottom: '24px', fontSize: isMobile ? '22px' : '28px' }}>Live View</h1>
      
      {activeShifts.length === 0 ? (
        <div style={styles.card}>
          <p style={{ color: theme.textMuted, textAlign: 'center' }}>No active shifts</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill, minmax(350px, 1fr))', gap: '16px' }}>
          {activeShifts.map(sh => {
            const h = getHours(sh.clockIn);
            const b = calcBreaks(sh.breaks || [], h, companySettings.paidRestMinutes);
            const ab = sh.breaks?.find(br => !br.endTime && !br.manualEntry);
            const t = calcTravel(sh.travelSegments || []);
            const isTraveling = hasActiveTravel(sh);
            const name = getEmployeeName(sh.userId, sh.userEmail);
            const shiftLocations = getShiftLocations(sh);
            const hasLocation = shiftLocations.length > 0;
            
            return (
              <div key={sh.id} style={styles.card}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
                  <div>
                    <p style={{ color: theme.text, fontWeight: '600' }}>{name}</p>
                    <p style={{ color: theme.textMuted, fontSize: '13px' }}>In: {fmtTime(sh.clockIn)}</p>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
                    <span style={{ background: theme.successBg, color: theme.success, padding: '4px 10px', borderRadius: '12px', fontSize: '12px', fontWeight: '600' }}>Active</span>
                    {ab && <span style={{ background: theme.warningBg, color: theme.warning, padding: '4px 10px', borderRadius: '12px', fontSize: '12px', fontWeight: '600' }}>On Break</span>}
                    {isTraveling && <span style={{ background: theme.travelBg, color: theme.travel, padding: '4px 10px', borderRadius: '12px', fontSize: '12px', fontWeight: '600' }}>🚗 Traveling</span>}
                  </div>
                </div>
                
                <div style={{ display: 'grid', gridTemplateColumns: t > 0 ? 'repeat(4, 1fr)' : 'repeat(3, 1fr)', gap: '8px', marginBottom: '12px' }}>
                  <div style={{ background: theme.cardAlt, padding: '10px', borderRadius: '8px', textAlign: 'center' }}>
                    <p style={{ color: theme.textMuted, fontSize: '11px' }}>Worked</p>
                    <p style={{ color: theme.text, fontWeight: '600' }}>{fmtDur(h * 60)}</p>
                  </div>
                  <div style={{ background: theme.cardAlt, padding: '10px', borderRadius: '8px', textAlign: 'center' }}>
                    <p style={{ color: theme.success, fontSize: '11px' }}>Paid</p>
                    <p style={{ color: theme.success, fontWeight: '600' }}>{b.paid}m</p>
                  </div>
                  <div style={{ background: theme.cardAlt, padding: '10px', borderRadius: '8px', textAlign: 'center' }}>
                    <p style={{ color: theme.warning, fontSize: '11px' }}>Unpaid</p>
                    <p style={{ color: theme.warning, fontWeight: '600' }}>{b.unpaid}m</p>
                  </div>
                  {t > 0 && (
                    <div style={{ background: theme.travelBg, padding: '10px', borderRadius: '8px', textAlign: 'center' }}>
                      <p style={{ color: theme.travel, fontSize: '11px' }}>Travel</p>
                      <p style={{ color: theme.travel, fontWeight: '600' }}>{t}m</p>
                    </div>
                  )}
                </div>
                
                {hasLocation && (
                  <div>
                    <LocationMap locations={shiftLocations} height="150px" />
                    <button 
                      onClick={() => setMapModal({ locations: shiftLocations, title: name, clockInLocation: sh.clockInLocation })} 
                      style={{ marginTop: '8px', padding: '8px', borderRadius: '6px', border: `1px solid ${theme.cardBorder}`, background: theme.cardAlt, color: theme.text, cursor: 'pointer', fontSize: '12px', width: '100%' }}
                    >
                      View Map ({shiftLocations.length} {shiftLocations.length === 1 ? 'pt' : 'pts'})
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}