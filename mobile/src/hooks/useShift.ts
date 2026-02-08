// Trackable NZ - Shift Management Hook
// UPDATED: Added companyId support for multi-tenant

import { useState, useEffect, useRef } from 'react';
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
  const [clockingOut, setClockingOut] = useState(false);

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
      } else {
        setCurrentShift(null);
        setOnBreak(false);
        setCurrentBreakStart(null);
        setTraveling(false);
        setCurrentTravelStart(null);
        setField1('');
        setField2('');
        setField3('');
      }
    });
    return () => unsubscribe();
  }, [user]);

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

  // Long shift warnings - notify at 10h and 12h
  const warned10hRef = useRef(false);
  const warned12hRef = useRef(false);

  useEffect(() => {
    if (!currentShift) {
      warned10hRef.current = false;
      warned12hRef.current = false;
      return;
    }

    const checkShiftDuration = () => {
      if (!currentShift?.clockIn?.toDate) return;
      const clockInTime = currentShift.clockIn.toDate().getTime();
      const hoursElapsed = (Date.now() - clockInTime) / 3600000;

      if (hoursElapsed >= 12 && !warned12hRef.current) {
        warned12hRef.current = true;
        onToast?.('⚠️ 12 hours reached — consider clocking out');
        // Browser notification
        if ('Notification' in window && Notification.permission === 'granted') {
          new Notification('Trackable NZ — 12 Hour Warning', {
            body: 'Your shift has reached 12 hours. Consider clocking out.',
            icon: '/favicon.ico'
          });
        }
      } else if (hoursElapsed >= 10 && !warned10hRef.current) {
        warned10hRef.current = true;
        onToast?.('⏰ 10 hours on shift — 12h warning at 12 hours');
        if ('Notification' in window && Notification.permission === 'granted') {
          new Notification('Trackable NZ — 10 Hour Notice', {
            body: 'You have been clocked in for 10 hours.',
            icon: '/favicon.ico'
          });
        }
      }
    };

    // Check immediately then every minute
    checkShiftDuration();
    const interval = setInterval(checkShiftDuration, 60000);
    return () => clearInterval(interval);
  }, [currentShift, onToast]);

  // Request notification permission on mount
  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }, []);

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

      // Auto-create worksite if custom name was typed (no worksiteId means it's new)
      if (worksiteName && !worksiteId) {
        try {
          const wsRef = await addDoc(collection(db, 'worksites'), {
            companyId,
            name: worksiteName,
            status: 'active',
            createdAt: Timestamp.now(),
            updatedAt: Timestamp.now(),
            createdBy: user.uid,
            autoCreated: true
          });
          // Update shift with the new worksite ID
          await updateDoc(shiftRef, { worksiteId: wsRef.id });
        } catch (wsErr) {
          console.error('Error auto-creating worksite:', wsErr);
          // Non-fatal — shift is already created
        }
      }

      // If photo provided, upload and update shift with URL
      if (photoBase64) {
        const photoUrl = await uploadClockInPhoto(photoBase64, shiftRef.id);
        if (photoUrl) {
          await updateDoc(shiftRef, { clockInPhotoUrl: photoUrl });
        }
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
    if (clockingOut) return false;
    if (requireNotes && !field1.trim()) {
      setError('Please add notes before clocking out');
      return false;
    }

    setClockingOut(true);

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
      setClockingOut(false);
      return true;
    } catch (err: any) {
      setError(err.message);
      setClockingOut(false);
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
    getCurrentLocation
  };
}
