import { useState, useEffect, useRef } from 'react';
import { Location, Theme } from '../shared/types';

interface MapModalProps {
  locations: Location[];
  onClose: () => void;
  title: string;
  theme: Theme;
  clockInLocation?: Location;
  clockOutLocation?: Location;
}

// Helper to get lat/lng from location (handles both formats)
const getLat = (loc: any): number | null => {
  if (typeof loc?.lat === 'number') return loc.lat;
  if (typeof loc?.latitude === 'number') return loc.latitude;
  return null;
};

const getLng = (loc: any): number | null => {
  if (typeof loc?.lng === 'number') return loc.lng;
  if (typeof loc?.longitude === 'number') return loc.longitude;
  return null;
};

const isValidLocation = (loc: any): boolean => {
  return getLat(loc) !== null && getLng(loc) !== null;
};

export function MapModal({ locations, onClose, title, theme, clockInLocation, clockOutLocation }: MapModalProps) {
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [leafletLoaded, setLeafletLoaded] = useState(false);
  const [showList, setShowList] = useState(false);
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  
  const markerColors: Record<string, string> = { 
    clockIn: '#16a34a', 
    clockOut: '#dc2626', 
    tracking: '#2563eb',
    travelStart: '#8b5cf6',
    travelEnd: '#8b5cf6',
    breakStart: '#f59e0b',
    breakEnd: '#f59e0b'
  };
  const markerLabels: Record<string, string> = { 
    clockIn: 'Clock In', 
    clockOut: 'Clock Out', 
    tracking: 'Tracking',
    travelStart: 'Travel Start',
    travelEnd: 'Travel End',
    breakStart: 'Break Start',
    breakEnd: 'Break End'
  };
  
  const allPoints: { loc: Location, type: string, displayLat: number, displayLng: number, actualLat: number, actualLng: number }[] = [];
  
  if (clockInLocation && isValidLocation(clockInLocation)) {
    const lat = getLat(clockInLocation)!;
    const lng = getLng(clockInLocation)!;
    allPoints.push({ loc: clockInLocation, type: 'clockIn', displayLat: lat, displayLng: lng, actualLat: lat, actualLng: lng });
  }
  
  (locations || []).forEach(loc => {
    if (!isValidLocation(loc)) return;
    const lat = getLat(loc)!;
    const lng = getLng(loc)!;
    const type = loc.source || 'tracking';
    allPoints.push({ loc, type, displayLat: lat, displayLng: lng, actualLat: lat, actualLng: lng });
  });
  
  if (clockOutLocation && isValidLocation(clockOutLocation)) {
    const lat = getLat(clockOutLocation)!;
    const lng = getLng(clockOutLocation)!;
    allPoints.push({ loc: clockOutLocation, type: 'clockOut', displayLat: lat, displayLng: lng, actualLat: lat, actualLng: lng });
  }
  
  allPoints.sort((a, b) => (a.loc.timestamp || 0) - (b.loc.timestamp || 0));
  
  const offsetAmount = 0.00002;
  for (let i = 1; i < allPoints.length; i++) {
    for (let j = 0; j < i; j++) {
      const dist = Math.sqrt(
        Math.pow(allPoints[i].displayLat - allPoints[j].displayLat, 2) +
        Math.pow(allPoints[i].displayLng - allPoints[j].displayLng, 2)
      );
      if (dist < 0.00005) {
        const angle = (i * 60) * (Math.PI / 180);
        allPoints[i].displayLat += offsetAmount * Math.cos(angle);
        allPoints[i].displayLng += offsetAmount * Math.sin(angle);
      }
    }
  }
  
  useEffect(() => {
    const injectCustomCSS = () => {
      if (!document.getElementById('custom-marker-css')) {
        const style = document.createElement('style');
        style.id = 'custom-marker-css';
        style.textContent = `
          .leaflet-div-icon { background: transparent !important; border: none !important; box-shadow: none !important; }
          .custom-marker { background: transparent !important; border: none !important; }
        `;
        document.head.appendChild(style);
      }
    };
    
    if ((window as any).L) {
      injectCustomCSS();
      setLeafletLoaded(true);
      return;
    }
    
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
    document.head.appendChild(link);
    
    const script = document.createElement('script');
    script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
    script.onload = () => {
      injectCustomCSS();
      setLeafletLoaded(true);
    };
    document.head.appendChild(script);
  }, []);
  
  useEffect(() => {
    if (!leafletLoaded || !mapRef.current || allPoints.length === 0) return;
    
    const L = (window as any).L;
    if (!L) return;
    
    if (mapInstanceRef.current) {
      mapInstanceRef.current.remove();
    }
    
    const lats = allPoints.map(p => p.displayLat);
    const lngs = allPoints.map(p => p.displayLng);
    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);
    const minLng = Math.min(...lngs);
    const maxLng = Math.max(...lngs);
    
    const map = L.map(mapRef.current).fitBounds([
      [minLat - 0.002, minLng - 0.002],
      [maxLat + 0.002, maxLng + 0.002]
    ]);
    
    mapInstanceRef.current = map;
    
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors'
    }).addTo(map);
    
    if (allPoints.length > 1) {
      const pathCoords = allPoints.map(p => [p.actualLat, p.actualLng]);
      L.polyline(pathCoords, { 
        color: '#6366f1', 
        weight: 3, 
        opacity: 0.7,
        dashArray: '10, 10'
      }).addTo(map);
    }
    
    allPoints.forEach((point, index) => {
      const color = markerColors[point.type] || markerColors.tracking;
      const label = markerLabels[point.type] || 'Location';
      const time = new Date(point.loc.timestamp).toLocaleTimeString('en-NZ', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      
      const icon = L.divIcon({
        className: 'custom-marker',
        html: `<div style="width:28px;height:28px;background:${color};border:3px solid white;border-radius:50%;box-shadow:0 2px 6px rgba(0,0,0,0.3);display:flex;align-items:center;justify-content:center;color:white;font-size:11px;font-weight:bold;">${index + 1}</div>`,
        iconSize: [28, 28],
        iconAnchor: [14, 14]
      });
      
      L.marker([point.displayLat, point.displayLng], { icon })
        .addTo(map)
        .bindPopup(`<b>${label}</b><br>${time}`);
    });
    
    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, [leafletLoaded, allPoints.length]);
  
  if (allPoints.length === 0) return null;
  
  const uniqueTypes = [...new Set(allPoints.map(p => p.type))];
  const lastPoint = allPoints[allPoints.length - 1];
  
  return (
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: theme.bg, zIndex: 1000, display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div style={{ padding: '12px 20px', borderBottom: `1px solid ${theme.cardBorder}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: theme.card }}>
        <div>
          <h2 style={{ color: theme.text, margin: 0, fontSize: '16px', fontWeight: '600' }}>GPS Track</h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px' }}>
            <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#16a34a' }}></span>
            <span style={{ color: theme.textMuted, fontSize: '13px' }}>{title || 'Clock In'}</span>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span style={{ color: theme.textMuted, fontSize: '12px' }}>
            📍 {lastPoint.actualLat.toFixed(5)}, {lastPoint.actualLng.toFixed(5)}
          </span>
          <button
            onClick={() => setShowList(!showList)}
            style={{
              background: showList ? theme.primary : theme.cardAlt,
              color: showList ? 'white' : theme.text,
              border: showList ? 'none' : `1px solid ${theme.cardBorder}`,
              padding: '6px 12px',
              borderRadius: '6px',
              fontSize: '12px',
              fontWeight: '600',
              cursor: 'pointer'
            }}
          >
            {showList ? 'Hide List' : 'Show List'}
          </button>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '14px', cursor: 'pointer', color: theme.primary, fontWeight: '600' }}>Close</button>
        </div>
      </div>
      
      {/* Map */}
      <div 
        ref={mapRef} 
        style={{ flex: 1, minHeight: '300px', background: '#e5e7eb' }} 
      >
        {!leafletLoaded && (
          <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: theme.textMuted }}>
            Loading map...
          </div>
        )}
      </div>
      
      {/* Location List */}
      {showList && (
        <div style={{ maxHeight: '40vh', overflowY: 'auto', background: theme.card, borderTop: `1px solid ${theme.cardBorder}` }}>
          {allPoints.map((point, i) => (
            <div 
              key={i} 
              onClick={() => setSelectedIndex(selectedIndex === i ? null : i)} 
              style={{ 
                display: 'flex', 
                justifyContent: 'space-between', 
                alignItems: 'center',
                padding: '12px 20px', 
                background: selectedIndex === i ? theme.primary + '20' : (i % 2 === 0 ? theme.cardAlt : theme.card), 
                cursor: 'pointer',
                borderBottom: `1px solid ${theme.cardBorder}`
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <span style={{ 
                  width: '24px', 
                  height: '24px', 
                  borderRadius: '50%', 
                  background: markerColors[point.type] || markerColors.tracking, 
                  color: 'white', 
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'center', 
                  fontSize: '11px',
                  fontWeight: '600'
                }}>{i + 1}</span>
                <span style={{ color: theme.text, fontSize: '14px', fontWeight: '500' }}>{markerLabels[point.type] || 'Location'}</span>
              </div>
              <span style={{ color: theme.textMuted, fontSize: '13px' }}>
                {new Date(point.loc.timestamp).toLocaleTimeString('en-NZ', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

interface LocationMapProps {
  locations: Location[];
  height?: string;
}

export function LocationMap({ locations, height = '200px' }: LocationMapProps) {
  if (!locations || locations.length === 0) {
    return (
      <div style={{ height, background: '#f3f4f6', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#6b7280' }}>
        No location data
      </div>
    );
  }
  
  // Find valid locations with lat/lng (handles both formats)
  const validLocations = locations.filter(loc => isValidLocation(loc));
  if (validLocations.length === 0) {
    return (
      <div style={{ height, background: '#f3f4f6', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#6b7280' }}>
        No valid location data
      </div>
    );
  }
  
  const lastLoc = validLocations[validLocations.length - 1];
  const lat = getLat(lastLoc)!;
  const lng = getLng(lastLoc)!;
  
  // Use static map image from OpenStreetMap tile server
  const zoom = 15;
  
  // Calculate tile coordinates
  const n = Math.pow(2, zoom);
  const xtile = Math.floor((lng + 180) / 360 * n);
  const ytile = Math.floor((1 - Math.log(Math.tan(lat * Math.PI / 180) + 1 / Math.cos(lat * Math.PI / 180)) / Math.PI) / 2 * n);
  
  return (
    <div style={{ height, borderRadius: '8px', overflow: 'hidden', position: 'relative', background: '#e5e7eb' }}>
      <img 
        src={`https://tile.openstreetmap.org/${zoom}/${xtile}/${ytile}.png`}
        alt="Map"
        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
        onError={(e) => {
          // Fallback to embed if tile fails
          const target = e.target as HTMLImageElement;
          target.style.display = 'none';
          const parent = target.parentElement;
          if (parent) {
            const iframe = document.createElement('iframe');
            iframe.src = `https://www.openstreetmap.org/export/embed.html?bbox=${lng - 0.005},${lat - 0.005},${lng + 0.005},${lat + 0.005}&layer=mapnik&marker=${lat},${lng}`;
            iframe.style.cssText = 'width:100%;height:100%;border:none;position:absolute;top:0;left:0;';
            iframe.title = 'Map';
            parent.appendChild(iframe);
          }
        }}
      />
      {/* Location marker overlay */}
      <div style={{
        position: 'absolute',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        width: '20px',
        height: '20px',
        background: '#2563eb',
        border: '3px solid white',
        borderRadius: '50%',
        boxShadow: '0 2px 6px rgba(0,0,0,0.3)'
      }} />
      {/* Point count badge */}
      <div style={{
        position: 'absolute',
        bottom: '8px',
        right: '8px',
        background: 'rgba(0,0,0,0.6)',
        color: 'white',
        padding: '4px 8px',
        borderRadius: '4px',
        fontSize: '11px',
        fontWeight: '500'
      }}>
        {validLocations.length} {validLocations.length === 1 ? 'pt' : 'pts'}
      </div>
    </div>
  );
}