// Trackable NZ - Shift Management Hook
// UPDATED: Added companyId support for multi-tenant

import { useState, useEffect, useRef, useCallback } from 'react';
import { User } from 'firebase/auth';
import {
  collection,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  getDoc,
  query,
  where,
  onSnapshot,
  Timestamp,
  arrayUnion
} from 'firebase/firestore';
import { getStorage, ref, uploadString, getDownloadURL } from 'firebase/storage';
import { db } from '../firebase';
import { Shift, Location } from '../types';
import { EmployeeSettings } from '../types';
import { Geolocation } from '@capacitor/geolocation';
import { Capacitor } from '@capacitor/core';

// Haversine formula to calculate distance between two GPS points in meters
function calculateDistance(loc1: Location, loc2: Location): number {
  const R = 6371000; // Earth's radius in meters
  const lat1 = loc1.latitude * Math.PI / 180;
  const lat2 = loc2.latitude * Math.PI / 180;
  const deltaLat = (loc2.latitude - loc1.latitude) * Math.PI / 180;
  const deltaLon = (loc2.longitude - loc1.longitude) * Math.PI / 180;
  
  const a = Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
            Math.cos(lat1) * Math.cos(lat2) *
            Math.sin(deltaLon / 2) * Math.sin(deltaLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  
  return R * c;
}

// UPDATED: Added companyId parameter for multi-tenant support
export function useShift(user: User | null, settings: EmployeeSettings, companyId: string | null, onToast?: (message: string) => void) {
  const [currentShift, setCurrentShift] = useState<Shift | null>(null);
  const [shiftHistory, setShiftHistory] = useState<Shift[]>([]);
  const [currentLocation, setCurrentLocation] = useState<Location | null>(null);
  const [onBreak, setOnBreak] = useState(false);
  const [currentBreakStart, setCurrentBreakStart] = useState<Date | null>(null);
  const [traveling, setTraveling] = useState(false);
  const [currentTravelStart, setCurrentTravelStart] = useState<Date | null>(null);
  const [field1, setField1] = useState('');
  const [field2, setField2] = useState('');
  const [field3, setField3] = useState('');
  const [error, setError] = useState('');
  const [clockingIn, setClockingIn] = useState(false);
  
  // Auto-travel detection state
  const [anchorLocation, setAnchorLocation] = useState<Location | null>(null);
  const [autoTravelActive, setAutoTravelActive] = useState(false);
  const [stationaryStartTime, setStationaryStartTime] = useState<Date | null>(null);
  const [lastKnownLocation, setLastKnownLocation] = useState<Location | null>(null);
  
  // Use ref for lastRecordedLocation to avoid stale closures in interval callback
  const lastRecordedLocationRef = useRef<Location | null>(null);
  const lastSaveTimestampRef = useRef<number>(0);

  // GPS filtering constants - TIGHT settings to prevent drift
  const GPS_MAX_ACCURACY = 15; // meters - reject readings with worse accuracy
  const GPS_MIN_DISTANCE = 30; // meters - must move at least this far to record
  const GPS_MIN_SAVE_INTERVAL = 30000; // ms - minimum 30 seconds between saves to prevent duplicates

  const gpsIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const storage = getStorage();

  // Get current GPS location - uses Capacitor on native, browser API on web
  // Added timeout to prevent hanging on iOS
  const getCurrentLocation = async (): Promise<Location | null> => {
    const timeoutPromise = new Promise<null>((resolve) => {
      setTimeout(() => resolve(null), 5000);
    });

    const locationPromise = (async (): Promise<Location | null> => {
      try {
        if (Capacitor.isNativePlatform()) {
          const permission = await Geolocation.checkPermissions();
          if (permission.location !== 'granted') {
            const request = await Geolocation.requestPermissions();
            if (request.location !== 'granted') {
              return null;
            }
          }
          const position = await Geolocation.getCurrentPosition({
            enableHighAccuracy: true,
            timeout: 4000
          });
          const loc: Location = {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracy: position.coords.accuracy,
            timestamp: Date.now()
          };
          setCurrentLocation(loc);
          return loc;
        } else {
          return new Promise((resolve) => {
            if (!navigator.geolocation) { resolve(null); return; }
            navigator.geolocation.getCurrentPosition(
              (position) => {
                const loc: Location = {
                  latitude: position.coords.latitude,
                  longitude: position.coords.longitude,
                  accuracy: position.coords.accuracy,
                  timestamp: Date.now()
                };
                setCurrentLocation(loc);
                resolve(loc);
              },
              () => resolve(null),
              { enableHighAccuracy: true, timeout: 4000 }
            );
          });
        }
      } catch (error) {
        console.error('Geolocation error:', error);
        return null;
      }
    })();

    return Promise.race([locationPromise, timeoutPromise]);
  };

  // NOTE: Removed initial location fetch to avoid geolocation prompt on page load
  // Location is fetched when user clicks Clock In instead

  // Auto-travel detection logic
  const processAutoTravelDetection = useCallback(async (location: Location) => {
    if (!currentShift || !settings.autoTravel || !anchorLocation) return;
    
    const detectionDistance = settings.detectionDistance || 200;
    const distanceFromAnchor = calculateDistance(location, anchorLocation);
    
    // Check if we're stationary (within 50m of last known location)
    const isStationary = lastKnownLocation 
      ? calculateDistance(location, lastKnownLocation) < 50 
      : false;
    
    if (!traveling) {
      // Not currently traveling - check if we've moved beyond threshold
      if (distanceFromAnchor > detectionDistance) {
        // Auto-start travel
        try {
          const updateData: any = {
            travelSegments: [...(currentShift.travelSegments || []), {
              startTime: Timestamp.now(),
              startLocation: location,
              autoStarted: true
            }]
          };
          updateData.locationHistory = arrayUnion({ ...location, source: 'travelStart' });
          await updateDoc(doc(db, 'shifts', currentShift.id), updateData);
          setTraveling(true);
          setCurrentTravelStart(new Date());
          setAutoTravelActive(true);
          setStationaryStartTime(null);
          onToast?.('🚗 Auto-travel started');
        } catch (err) {
          console.error('Auto-travel start error:', err);
        }
      }
    } else {
      // Currently traveling - check for end conditions
      
      // Condition 1: Returned to anchor location
      if (distanceFromAnchor <= detectionDistance) {
        // Back at anchor - end travel
        try {
          const durationMinutes = currentTravelStart 
            ? Math.round((Date.now() - currentTravelStart.getTime()) / 60000) 
            : 0;
          const updatedTravel = (currentShift.travelSegments || []).map((t, i) =>
            i === (currentShift.travelSegments || []).length - 1 && !t.endTime
              ? { ...t, endTime: Timestamp.now(), endLocation: location, durationMinutes, autoEnded: true }
              : t
          );
          const updateData: any = { travelSegments: updatedTravel };
          updateData.locationHistory = arrayUnion({ ...location, source: 'travelEnd' });
          await updateDoc(doc(db, 'shifts', currentShift.id), updateData);
          setTraveling(false);
          setCurrentTravelStart(null);
          setAutoTravelActive(false);
          setStationaryStartTime(null);
          onToast?.('📍 Returned - travel ended');
        } catch (err) {
          console.error('Auto-travel end error:', err);
        }
        return;
      }
      
      // Condition 2: Stationary for 5 minutes at a new location
      if (isStationary) {
        if (!stationaryStartTime) {
          setStationaryStartTime(new Date());
        } else {
          const stationaryMinutes = (Date.now() - stationaryStartTime.getTime()) / 60000;
          if (stationaryMinutes >= 5) {
            // Stationary for 5+ minutes - end travel and update anchor
            try {
              const durationMinutes = currentTravelStart 
                ? Math.round((Date.now() - currentTravelStart.getTime()) / 60000) 
                : 0;
              const updatedTravel = (currentShift.travelSegments || []).map((t, i) =>
                i === (currentShift.travelSegments || []).length - 1 && !t.endTime
                  ? { ...t, endTime: Timestamp.now(), endLocation: location, durationMinutes, autoEnded: true }
                  : t
              );
              const updateData: any = { travelSegments: updatedTravel };
              updateData.locationHistory = arrayUnion({ ...location, source: 'travelEnd' });
              await updateDoc(doc(db, 'shifts', currentShift.id), updateData);
              setTraveling(false);
              setCurrentTravelStart(null);
              setAutoTravelActive(false);
              setAnchorLocation(location); // New anchor at arrived location
              setStationaryStartTime(null);
              onToast?.('📍 Arrived - travel ended');
            } catch (err) {
              console.error('Auto-travel arrival end error:', err);
            }
          }
        }
      } else {
        // Still moving - reset stationary timer
        setStationaryStartTime(null);
      }
    }
    
    setLastKnownLocation(location);
  }, [currentShift, settings.autoTravel, settings.detectionDistance, anchorLocation, traveling, currentTravelStart, lastKnownLocation, stationaryStartTime, onToast]);


  // Subscribe to active shift
  useEffect(() => {
    if (!user) return;

    const q = query(collection(db, 'shifts'), where('userId', '==', user.uid));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const activeShift = snapshot.docs.find(d => d.data().status === 'active');
      if (activeShift) {
        const shift = { id: activeShift.id, ...activeShift.data() } as Shift;
        setCurrentShift(shift);
        setField1(shift.jobLog?.field1 || '');
        setField2(shift.jobLog?.field2 || '');
        setField3(shift.jobLog?.field3 || '');
        
        const activeBreak = shift.breaks?.find(b => !b.endTime && !b.manualEntry);
        setOnBreak(!!activeBreak);
        setCurrentBreakStart(activeBreak ? activeBreak.startTime.toDate() : null);
        
        const activeTravel = shift.travelSegments?.find(t => !t.endTime);
        setTraveling(!!activeTravel);
        setCurrentTravelStart(activeTravel ? activeTravel.startTime.toDate() : null);
        
        // Restore anchor location for auto-travel (use clock-in location or last travel end location)
        if (settings.autoTravel && shift.clockInLocation) {
          // Check if there's an existing anchor from travel end
          const completedTravels = (shift.travelSegments || []).filter(t => t.endTime && t.endLocation);
          if (completedTravels.length > 0) {
            // Use the last travel end location as anchor
            const lastTravel = completedTravels[completedTravels.length - 1];
            setAnchorLocation(lastTravel.endLocation!);
          } else {
            // Use clock-in location as anchor
            setAnchorLocation(shift.clockInLocation);
          }
        }
      } else {
        setCurrentShift(null);
        setOnBreak(false);
        setCurrentBreakStart(null);
        setTraveling(false);
        setCurrentTravelStart(null);
        setField1('');
        setField2('');
        setField3('');
        // Clear auto-travel state
        setAnchorLocation(null);
        setAutoTravelActive(false);
        setStationaryStartTime(null);
        setLastKnownLocation(null);
        lastRecordedLocationRef.current = null;
        lastSaveTimestampRef.current = 0;
      }
    });
    return () => unsubscribe();
  }, [user, settings.autoTravel]);

  // Subscribe to shift history
  useEffect(() => {
    if (!user) return;

    const q = query(collection(db, 'shifts'), where('userId', '==', user.uid));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const shifts = snapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data() }) as Shift)
        .filter(s => s.status === 'completed')
        .sort((a, b) => (b.clockIn?.toDate?.()?.getTime() || 0) - (a.clockIn?.toDate?.()?.getTime() || 0))
        .slice(0, 50);
      setShiftHistory(shifts);
    });
    return () => unsubscribe();
  }, [user]);

  // Upload photo to Firebase Storage
  const uploadClockInPhoto = async (photoBase64: string, shiftId: string): Promise<string | null> => {
    if (!user) return null;
    
    try {
      // Create a unique path: clock-in-photos/{userId}/{shiftId}.jpg
      const photoRef = ref(storage, `clock-in-photos/${user.uid}/${shiftId}.jpg`);
      
      // Upload the base64 string (remove data URL prefix if present)
      const base64Data = photoBase64.replace(/^data:image\/\w+;base64,/, '');
      await uploadString(photoRef, base64Data, 'base64', {
        contentType: 'image/jpeg'
      });
      
      // Get the download URL
      const downloadUrl = await getDownloadURL(photoRef);
      return downloadUrl;
    } catch (err) {
      console.error('Error uploading photo:', err);
      return null;
    }
  };

  // Clock in - NOW WITH OPTIONAL PHOTO AND AUTO-TRAVEL ANCHOR
  // UPDATED: Include companyId for multi-tenant
  const clockIn = async (photoBase64?: string, worksiteId?: string, worksiteName?: string) => {
    if (!user) {
      setError('Not logged in');
      return false;
    }
    if (!companyId) {
      setError('Loading company data... please try again');
      return false;
    }
    if (clockingIn) return false; // Prevent double-clicks
    
    setClockingIn(true);
    setError('');
    
    try {
      const location = await getCurrentLocation();
      
      // Create shift first
      const shiftRef = await addDoc(collection(db, 'shifts'), {
        companyId,  // NEW: Include companyId
        userId: user.uid,
        userEmail: user.email,
        clockIn: Timestamp.now(),
        clockInLocation: location,
        locationHistory: [],  // Don't duplicate clock-in location - it's already in clockInLocation
        breaks: [],
        travelSegments: [],
        jobLog: { field1: '', field2: '', field3: '' },
        status: 'active',
        ...(worksiteId ? { worksiteId } : {}),
        ...(worksiteName ? { worksiteName } : {})
      });

      // If photo provided, upload and update shift with URL
      if (photoBase64) {
        const photoUrl = await uploadClockInPhoto(photoBase64, shiftRef.id);
        if (photoUrl) {
          await updateDoc(shiftRef, { clockInPhotoUrl: photoUrl });
        }
      }
      
      // Set anchor location for auto-travel detection
      if (location && settings.autoTravel) {
        setAnchorLocation(location);
        setLastKnownLocation(location);
        lastRecordedLocationRef.current = location;
        setAutoTravelActive(false);
        setStationaryStartTime(null);
      }
      
      // Set last recorded location even without auto-travel (for GPS filtering)
      if (location) {
        lastRecordedLocationRef.current = location;
        lastSaveTimestampRef.current = Date.now(); // Prevent GPS from saving again immediately
      }
      
      setClockingIn(false);
      return true;
    } catch (err: any) {
      setError(err.message);
      setClockingIn(false);
      return false;
    }
  };

  // Clock out
  const clockOut = async (requireNotes: boolean) => {
    if (!currentShift) return;
    if (requireNotes && !field1.trim()) {
      setError('Please add notes before clocking out');
      return false;
    }

    try {
      const location = await getCurrentLocation();
      let updatedBreaks = [...(currentShift.breaks || [])];
      let updatedTravel = [...(currentShift.travelSegments || [])];

      // End any active break
      const activeBreakIndex = updatedBreaks.findIndex(b => !b.endTime && !b.manualEntry);
      if (activeBreakIndex !== -1) {
        const durationMinutes = Math.round(
          (new Date().getTime() - updatedBreaks[activeBreakIndex].startTime.toDate().getTime()) / 60000
        );
        updatedBreaks[activeBreakIndex] = {
          ...updatedBreaks[activeBreakIndex],
          endTime: Timestamp.now(),
          durationMinutes
        };
      }

      // End any active travel
      const activeTravelIndex = updatedTravel.findIndex(t => !t.endTime);
      if (activeTravelIndex !== -1) {
        const durationMinutes = Math.round(
          (new Date().getTime() - updatedTravel[activeTravelIndex].startTime.toDate().getTime()) / 60000
        );
        const travelUpdate: any = {
          ...updatedTravel[activeTravelIndex],
          endTime: Timestamp.now(),
          durationMinutes
        };
        if (location) {
          travelUpdate.endLocation = location;
        }
        updatedTravel[activeTravelIndex] = travelUpdate;
      }

      const updateData: any = {
        clockOut: Timestamp.now(),
        clockOutLocation: location,
        breaks: updatedBreaks,
        travelSegments: updatedTravel,
        'jobLog.field1': field1,
        'jobLog.field2': field2,
        'jobLog.field3': field3,
        status: 'completed'
      };

      // Add GPS to locationHistory for map tracking
      if (location) {
        updateData.locationHistory = arrayUnion({ ...location, source: 'clockOut' });
      }

      await updateDoc(doc(db, 'shifts', currentShift.id), updateData);

      setOnBreak(false);
      setCurrentBreakStart(null);
      setTraveling(false);
      setCurrentTravelStart(null);
      return true;
    } catch (err: any) {
      setError(err.message);
      return false;
    }
  };

  // Start break - NOW WITH GPS CAPTURE
  const startBreak = async () => {
    if (!currentShift) return;
    try {
      const location = await getCurrentLocation();
      const newBreak: any = { 
        startTime: Timestamp.now(), 
        manualEntry: false
      };
      if (location) {
        newBreak.startLocation = location;
      }
      const updateData: any = {
        breaks: [...(currentShift.breaks || []), newBreak]
      };
      // Add GPS to locationHistory for map tracking with source label
      if (location) {
        updateData.locationHistory = arrayUnion({ ...location, source: 'breakStart' });
      }
      await updateDoc(doc(db, 'shifts', currentShift.id), updateData);
      setOnBreak(true);
      setCurrentBreakStart(new Date());
    } catch (err: any) {
      setError(err.message);
    }
  };

  // End break - NOW WITH GPS CAPTURE
  const endBreak = async () => {
    if (!currentShift || !currentBreakStart) return;
    try {
      const location = await getCurrentLocation();
      const durationMinutes = Math.round((new Date().getTime() - currentBreakStart.getTime()) / 60000);
      const updatedBreaks = currentShift.breaks.map((b, i) => {
        if (i === currentShift.breaks.length - 1 && !b.endTime && !b.manualEntry) {
          const updated: any = { ...b, endTime: Timestamp.now(), durationMinutes };
          if (location) {
            updated.endLocation = location;
          }
          return updated;
        }
        return b;
      });
      const updateData: any = { breaks: updatedBreaks };
      // Add GPS to locationHistory for map tracking with source label
      if (location) {
        updateData.locationHistory = arrayUnion({ ...location, source: 'breakEnd' });
      }
      await updateDoc(doc(db, 'shifts', currentShift.id), updateData);
      setOnBreak(false);
      setCurrentBreakStart(null);
    } catch (err: any) {
      setError(err.message);
    }
  };

  // Add preset break
  const addPresetBreak = async (minutes: number): Promise<boolean> => {
    if (!currentShift) return false;
    try {
      const now = Timestamp.now();
      await updateDoc(doc(db, 'shifts', currentShift.id), {
        breaks: [...(currentShift.breaks || []), {
          startTime: now,
          endTime: now,
          durationMinutes: minutes,
          manualEntry: true
        }]
      });
      return true;
    } catch (err: any) {
      setError(err.message);
      return false;
    }
  };

  // Delete break
  const deleteBreak = async (breakIndex: number): Promise<boolean> => {
    if (!currentShift) return false;
    try {
      const updatedBreaks = currentShift.breaks.filter((_, i) => i !== breakIndex);
      await updateDoc(doc(db, 'shifts', currentShift.id), { breaks: updatedBreaks });
      return true;
    } catch (err: any) {
      setError(err.message);
      return false;
    }
  };

  // Add break to historical shift
  const addBreakToShift = async (shiftId: string, minutes: number): Promise<boolean> => {
    try {
      const shiftRef = doc(db, 'shifts', shiftId);
      const shiftSnap = await getDoc(shiftRef);
      if (!shiftSnap.exists()) {
        setError('Shift not found');
        return false;
      }
      
      const shiftData = shiftSnap.data();
      const now = Timestamp.now();
      const newBreak = {
        startTime: now,
        endTime: now,
        durationMinutes: minutes,
        manualEntry: true
      };
      
      await updateDoc(shiftRef, {
        breaks: [...(shiftData.breaks || []), newBreak],
        editedAt: Timestamp.now(),
        editedBy: user?.uid,
        editedByEmail: user?.email
      });
      
      return true;
    } catch (err: any) {
      setError(err.message || 'Failed to add break');
      return false;
    }
  };

  // Delete break from historical shift
  const deleteBreakFromShift = async (shiftId: string, breakIndex: number): Promise<boolean> => {
    try {
      const shiftRef = doc(db, 'shifts', shiftId);
      const shiftSnap = await getDoc(shiftRef);
      if (!shiftSnap.exists()) {
        setError('Shift not found');
        return false;
      }
      
      const shiftData = shiftSnap.data();
      const updatedBreaks = (shiftData.breaks || []).filter((_: any, i: number) => i !== breakIndex);
      
      await updateDoc(shiftRef, { 
        breaks: updatedBreaks,
        editedAt: Timestamp.now(),
        editedBy: user?.uid,
        editedByEmail: user?.email
      });
      
      return true;
    } catch (err: any) {
      setError(err.message || 'Failed to delete break');
      return false;
    }
  };

  // Start travel - NOW WITH GPS ADDED TO LOCATION HISTORY
  const startTravel = async () => {
    if (!currentShift) return;
    try {
      const location = await getCurrentLocation();
      const newTravelSegment: any = {
        startTime: Timestamp.now()
      };
      if (location) {
        newTravelSegment.startLocation = location;
      }
      const updateData: any = {
        travelSegments: [...(currentShift.travelSegments || []), newTravelSegment]
      };
      // Add GPS to locationHistory for map tracking with source label
      if (location) {
        updateData.locationHistory = arrayUnion({ ...location, source: 'travelStart' });
      }
      await updateDoc(doc(db, 'shifts', currentShift.id), updateData);
      setTraveling(true);
      setCurrentTravelStart(new Date());
    } catch (err: any) {
      setError(err.message);
    }
  };

  // End travel - NOW WITH GPS ADDED TO LOCATION HISTORY
  const endTravel = async () => {
    if (!currentShift || !currentTravelStart) return;
    try {
      const location = await getCurrentLocation();
      const durationMinutes = Math.round((new Date().getTime() - currentTravelStart.getTime()) / 60000);
      const updatedTravel = (currentShift.travelSegments || []).map((t, i) => {
        if (i === (currentShift.travelSegments || []).length - 1 && !t.endTime) {
          const updated: any = { ...t, endTime: Timestamp.now(), durationMinutes };
          if (location) {
            updated.endLocation = location;
          }
          return updated;
        }
        return t;
      });
      const updateData: any = { travelSegments: updatedTravel };
      // Add GPS to locationHistory for map tracking with source label
      if (location) {
        updateData.locationHistory = arrayUnion({ ...location, source: 'travelEnd' });
      }
      await updateDoc(doc(db, 'shifts', currentShift.id), updateData);
      setTraveling(false);
      setCurrentTravelStart(null);
    } catch (err: any) {
      setError(err.message);
    }
  };

  // Save job log fields
  const saveFields = async () => {
    if (!currentShift) return;
    try {
      await updateDoc(doc(db, 'shifts', currentShift.id), {
        'jobLog.field1': field1,
        'jobLog.field2': field2,
        'jobLog.field3': field3
      });
    } catch (err: any) {
      setError(err.message);
    }
  };

  // Add travel to historical shift
  const addTravelToShift = async (
    shiftId: string,
    shiftDate: Date,
    startHour: string,
    startMinute: string,
    startAmPm: 'AM' | 'PM',
    endHour: string,
    endMinute: string,
    endAmPm: 'AM' | 'PM'
  ) => {
    try {
      let sHour = parseInt(startHour);
      if (startAmPm === 'PM' && sHour !== 12) sHour += 12;
      if (startAmPm === 'AM' && sHour === 12) sHour = 0;

      let eHour = parseInt(endHour);
      if (endAmPm === 'PM' && eHour !== 12) eHour += 12;
      if (endAmPm === 'AM' && eHour === 12) eHour = 0;

      const travelStart = new Date(shiftDate);
      travelStart.setHours(sHour, parseInt(startMinute), 0, 0);

      const travelEnd = new Date(shiftDate);
      travelEnd.setHours(eHour, parseInt(endMinute), 0, 0);

      if (travelEnd <= travelStart) travelEnd.setDate(travelEnd.getDate() + 1);

      const durationMinutes = Math.round((travelEnd.getTime() - travelStart.getTime()) / 60000);
      if (durationMinutes <= 0 || durationMinutes > 480) {
        setError('Invalid travel duration');
        return false;
      }

      const shiftRef = doc(db, 'shifts', shiftId);
      const shiftSnap = await getDoc(shiftRef);
      if (shiftSnap.exists()) {
        await updateDoc(shiftRef, {
          travelSegments: [...(shiftSnap.data().travelSegments || []), {
            startTime: Timestamp.fromDate(travelStart),
            endTime: Timestamp.fromDate(travelEnd),
            durationMinutes
          }],
          editedAt: Timestamp.now(),
          editedBy: user?.uid,
          editedByEmail: user?.email
        });
      }
      return true;
    } catch (err: any) {
      setError(err.message || 'Failed to add travel');
      return false;
    }
  };

  // Delete travel from historical shift
  const deleteTravelFromShift = async (shiftId: string, travelIndex: number): Promise<boolean> => {
    try {
      const shiftRef = doc(db, 'shifts', shiftId);
      const shiftSnap = await getDoc(shiftRef);
      if (!shiftSnap.exists()) {
        setError('Shift not found');
        return false;
      }
      
      const shiftData = shiftSnap.data();
      const updatedTravel = (shiftData.travelSegments || []).filter((_: any, i: number) => i !== travelIndex);
      
      await updateDoc(shiftRef, { 
        travelSegments: updatedTravel,
        editedAt: Timestamp.now(),
        editedBy: user?.uid,
        editedByEmail: user?.email
      });
      
      return true;
    } catch (err: any) {
      setError(err.message || 'Failed to delete travel');
      return false;
    }
  };

  // Edit shift times (clock in/out) and notes
  const editShift = async (
    shiftId: string,
    clockInDate: Date,
    clockOutDate: Date,
    notes?: string
  ): Promise<boolean> => {
    if (!user) return false;
    
    try {
      const shiftRef = doc(db, 'shifts', shiftId);
      const shiftSnap = await getDoc(shiftRef);
      
      if (!shiftSnap.exists()) {
        setError('Shift not found');
        return false;
      }

      // Validate times
      if (clockOutDate <= clockInDate) {
        setError('Clock out must be after clock in');
        return false;
      }

      const durationHours = (clockOutDate.getTime() - clockInDate.getTime()) / 3600000;
      if (durationHours > 24) {
        setError('Shift cannot exceed 24 hours');
        return false;
      }

      const updateData: any = {
        clockIn: Timestamp.fromDate(clockInDate),
        clockOut: Timestamp.fromDate(clockOutDate),
        editedAt: Timestamp.now(),
        editedBy: user.uid,
        editedByEmail: user.email
      };

      if (notes !== undefined) {
        updateData['jobLog.field1'] = notes;
      }

      await updateDoc(shiftRef, updateData);
      return true;
    } catch (err: any) {
      setError(err.message || 'Failed to edit shift');
      return false;
    }
  };

  // Add manual shift
  // UPDATED: Include companyId for multi-tenant
  const addManualShift = async (
    date: string,
    startHour: string,
    startMinute: string,
    startAmPm: 'AM' | 'PM',
    endHour: string,
    endMinute: string,
    endAmPm: 'AM' | 'PM',
    breaks: number[],
    travel: number[],
    notes: string
  ) => {
    if (!user || !companyId) return false;  // UPDATED: Require companyId

    try {
      let sHour = parseInt(startHour);
      if (startAmPm === 'PM' && sHour !== 12) sHour += 12;
      if (startAmPm === 'AM' && sHour === 12) sHour = 0;

      let eHour = parseInt(endHour);
      if (endAmPm === 'PM' && eHour !== 12) eHour += 12;
      if (endAmPm === 'AM' && eHour === 12) eHour = 0;

      const clockIn = new Date(date);
      clockIn.setHours(sHour, parseInt(startMinute), 0, 0);

      const clockOut = new Date(date);
      clockOut.setHours(eHour, parseInt(endMinute), 0, 0);

      if (clockOut <= clockIn) clockOut.setDate(clockOut.getDate() + 1);

      const shiftBreaks = breaks.map(() => {
        const now = Timestamp.fromDate(clockIn);
        return { startTime: now, endTime: now, durationMinutes: 0, manualEntry: true };
      });
      breaks.forEach((mins, i) => { shiftBreaks[i].durationMinutes = mins; });

      const travelSegments = travel.map((mins) => {
        const now = Timestamp.fromDate(clockIn);
        return { startTime: now, endTime: now, durationMinutes: mins };
      });

      await addDoc(collection(db, 'shifts'), {
        companyId,  // NEW: Include companyId
        userId: user.uid,
        userEmail: user.email,
        clockIn: Timestamp.fromDate(clockIn),
        clockOut: Timestamp.fromDate(clockOut),
        locationHistory: [],
        breaks: shiftBreaks,
        travelSegments,
        jobLog: { field1: notes, field2: '', field3: '' },
        status: 'completed',
        manualEntry: true
      });

      return true;
    } catch (err: any) {
      setError(err.message || 'Failed to add shift');
      return false;
    }
  };

  // Delete a completed shift
  const deleteShift = async (shiftId: string): Promise<boolean> => {
    try {
      await deleteDoc(doc(db, 'shifts', shiftId));
      return true;
    } catch (err: any) {
      setError(err.message || 'Failed to delete shift');
      return false;
    }
  };

  return {
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
    error,
    setError,
    clockIn,
    clockingIn,
    clockOut,
    startBreak,
    endBreak,
    addPresetBreak,
    deleteBreak,
    addBreakToShift,
    deleteBreakFromShift,
    startTravel,
    endTravel,
    saveFields,
    addTravelToShift,
    deleteTravelFromShift,
    editShift,
    addManualShift,
    deleteShift,
    getCurrentLocation,
    // Auto-travel state
    autoTravelActive,
    anchorLocation
  };
}
