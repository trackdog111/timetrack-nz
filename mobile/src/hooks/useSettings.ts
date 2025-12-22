// TimeTrack NZ - Settings Hook

import { useState, useEffect } from 'react';
import { User } from 'firebase/auth';
import { doc, getDoc, setDoc, onSnapshot, Timestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { EmployeeSettings, CompanyLabels, defaultLabels } from '../types';
import { defaultSettings } from '../utils';

export function useSettings(user: User | null) {
  const [settings, setSettings] = useState<EmployeeSettings>(defaultSettings);
  const [labels, setLabels] = useState<CompanyLabels>(defaultLabels);

  useEffect(() => {
    if (!user) return;

    const loadSettings = async () => {
      try {
        // Load employee settings
        const docRef = doc(db, 'employees', user.uid);
        const docSnap = await getDoc(docRef);
        
        if (docSnap.exists() && docSnap.data().settings) {
          const empSettings = { ...defaultSettings, ...docSnap.data().settings };
          setSettings(empSettings);
          
          // If company labels exist in employee settings, use them
          if (empSettings.companyLabels) {
            setLabels({ ...defaultLabels, ...empSettings.companyLabels });
          }
        } else {
          // Create default employee document
          await setDoc(docRef, {
            email: user.email,
            name: user.email?.split('@')[0] || 'Employee',
            role: 'employee',
            settings: defaultSettings,
            createdAt: Timestamp.now()
          }, { merge: true });
        }

        // Try to load company-wide settings (for labels)
        const companyRef = doc(db, 'company', 'settings');
        const companySnap = await getDoc(companyRef);
        if (companySnap.exists()) {
          const companyData = companySnap.data();
          setLabels({
            field1Label: companyData.field1Label || defaultLabels.field1Label,
            field2Label: companyData.field2Label || defaultLabels.field2Label,
            field3Label: companyData.field3Label || defaultLabels.field3Label,
            managerDisplayName: companyData.managerDisplayName || defaultLabels.managerDisplayName,
            paidRestMinutes: companyData.paidRestMinutes || defaultLabels.paidRestMinutes,
            payWeekEndDay: companyData.payWeekEndDay ?? defaultLabels.payWeekEndDay
          });
          setSettings(prev => ({
            ...prev,
            photoVerification: companyData.photoVerification || false,
            field1Enabled: companyData.field1Enabled !== false,  // defaults to true
            field2Enabled: companyData.field2Enabled === true,   // defaults to false
            field3Enabled: companyData.field3Enabled === true    // defaults to false
          }));
        }
      } catch (err) {
        console.error('Error loading settings:', err);
      }
    };

    loadSettings();

    // Also subscribe to company settings changes
    const companyRef = doc(db, 'company', 'settings');
    const unsubscribe = onSnapshot(companyRef, (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        setLabels({
          field1Label: data.field1Label || defaultLabels.field1Label,
          field2Label: data.field2Label || defaultLabels.field2Label,
          field3Label: data.field3Label || defaultLabels.field3Label,
          managerDisplayName: data.managerDisplayName || defaultLabels.managerDisplayName,
          paidRestMinutes: data.paidRestMinutes || defaultLabels.paidRestMinutes,
          payWeekEndDay: data.payWeekEndDay ?? defaultLabels.payWeekEndDay
        });
        setSettings(prev => ({ 
          ...prev, 
          photoVerification: data.photoVerification || false,
          field1Enabled: data.field1Enabled !== false,  // defaults to true
          field2Enabled: data.field2Enabled === true,   // defaults to false
          field3Enabled: data.field3Enabled === true    // defaults to false
        }));
      }
    });

    return () => unsubscribe();
  }, [user]);

  return { settings, labels };
}