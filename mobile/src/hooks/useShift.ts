// TimeTrack NZ - Shift Management Hook

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
import { db } from '../firebase';
import { Shift, Location } from '../types';
import { EmployeeSettings } from '../types';

export function useShift(user: User | null, settings: EmployeeSettings) {
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

  const gpsIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Get current GPS location
  const getCurrentLocation = (): Promise<Location | null> => {
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
        { enableHighAccuracy: true, timeout: 10000 }
      );
    });
  };

  // Initial location fetch
  useEffect(() => { getCurrentLocation(); }, []);

  // GPS tracking interval
  useEffect(() => {
    if (!user || !currentShift || !settings.gpsTracking) {
      if (gpsIntervalRef.current) {
        clearInterval(gpsIntervalRef.current);
        gpsIntervalRef.current = null;
      }
      return;
    }

    const trackLocation = async () => {
      const location = await getCurrentLocation();
      if (location && currentShift) {
        try {
          await updateDoc(doc(db, 'shifts', currentShift.id), {
            locationHistory: arrayUnion(location)
          });
        } catch (err) {
          console.error('Error updating location:', err);
        }
      }
    };

    trackLocation();
    gpsIntervalRef.current = setInterval(trackLocation, settings.gpsInterval * 60 * 1000);

    return () => {
      if (gpsIntervalRef.current) {
        clearInterval(gpsIntervalRef.current);
        gpsIntervalRef.current = null;
      }
    };
  }, [user, currentShift?.id, settings.gpsTracking, settings.gpsInterval]);

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

  // Clock in
  const clockIn = async () => {
    if (!user) return;
    try {
      const location = await getCurrentLocation();
      await addDoc(collection(db, 'shifts'), {
        userId: user.uid,
        userEmail: user.email,
        clockIn: Timestamp.now(),
        clockInLocation: location,
        locationHistory: location ? [location] : [],
        breaks: [],
        travelSegments: [],
        jobLog: { field1: '', field2: '', field3: '' },
        status: 'active'
      });
    } catch (err: any) {
      setError(err.message);
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
        updatedTravel[activeTravelIndex] = {
          ...updatedTravel[activeTravelIndex],
          endTime: Timestamp.now(),
          endLocation: location || undefined,
          durationMinutes
        };
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
        updateData.locationHistory = arrayUnion(location);
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
      const updateData: any = {
        breaks: [...(currentShift.breaks || []), { 
          startTime: Timestamp.now(), 
          manualEntry: false,
          startLocation: location || undefined
        }]
      };
      // Add GPS to locationHistory for map tracking
      if (location) {
        updateData.locationHistory = arrayUnion(location);
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
      const updatedBreaks = currentShift.breaks.map((b, i) =>
        i === currentShift.breaks.length - 1 && !b.endTime && !b.manualEntry
          ? { ...b, endTime: Timestamp.now(), durationMinutes, endLocation: location || undefined }
          : b
      );
      const updateData: any = { breaks: updatedBreaks };
      // Add GPS to locationHistory for map tracking
      if (location) {
        updateData.locationHistory = arrayUnion(location);
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
      const updateData: any = {
        travelSegments: [...(currentShift.travelSegments || []), {
          startTime: Timestamp.now(),
          startLocation: location || undefined
        }]
      };
      // Add GPS to locationHistory for map tracking
      if (location) {
        updateData.locationHistory = arrayUnion(location);
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
      const updatedTravel = (currentShift.travelSegments || []).map((t, i) =>
        i === (currentShift.travelSegments || []).length - 1 && !t.endTime
          ? { ...t, endTime: Timestamp.now(), endLocation: location || undefined, durationMinutes }
          : t
      );
      const updateData: any = { travelSegments: updatedTravel };
      // Add GPS to locationHistory for map tracking
      if (location) {
        updateData.locationHistory = arrayUnion(location);
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
    if (!user) return false;

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