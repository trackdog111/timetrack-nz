// Trackable NZ - Settings Hook
// UPDATED: Changed to read from companies/{companyId} instead of company/settings

import { useState, useEffect } from 'react';
import { User } from 'firebase/auth';
import { doc, getDoc, setDoc, onSnapshot, Timestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { EmployeeSettings, CompanyLabels, defaultLabels } from '../types';
import { defaultSettings } from '../utils';

// UPDATED: Now accepts companyId parameter
export function useSettings(user: User | null, companyId: string | null) {
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

        // UPDATED: Load company settings from companies/{companyId} if available
        if (companyId) {
          const companyRef = doc(db, 'companies', companyId);
          const companySnap = await getDoc(companyRef);
          if (companySnap.exists()) {
            const companyData = companySnap.data();
            const companySettings = companyData.settings || {};
            setLabels({
              field1Label: companySettings.field1Label || defaultLabels.field1Label,
              field2Label: companySettings.field2Label || defaultLabels.field2Label,
              field3Label: companySettings.field3Label || defaultLabels.field3Label,
              managerDisplayName: companySettings.managerDisplayName || defaultLabels.managerDisplayName,
              paidRestMinutes: companySettings.paidRestMinutes || defaultLabels.paidRestMinutes,
              payWeekEndDay: companySettings.payWeekEndDay ?? defaultLabels.payWeekEndDay
            });
            setSettings(prev => ({
              ...prev,
              photoVerification: companySettings.photoVerification || false,
              field1Enabled: companySettings.field1Enabled !== false,  // defaults to true
              field2Enabled: companySettings.field2Enabled === true,   // defaults to false
              field3Enabled: companySettings.field3Enabled === true    // defaults to false
            }));
          }
        }
      } catch (err) {
        console.error('Error loading settings:', err);
      }
    };

    loadSettings();

    // UPDATED: Subscribe to company settings at companies/{companyId}
    if (!companyId) return;
    
    const companyRef = doc(db, 'companies', companyId);
    const unsubscribe = onSnapshot(companyRef, (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        const companySettings = data.settings || {};
        setLabels({
          field1Label: companySettings.field1Label || defaultLabels.field1Label,
          field2Label: companySettings.field2Label || defaultLabels.field2Label,
          field3Label: companySettings.field3Label || defaultLabels.field3Label,
          managerDisplayName: companySettings.managerDisplayName || defaultLabels.managerDisplayName,
          paidRestMinutes: companySettings.paidRestMinutes || defaultLabels.paidRestMinutes,
          payWeekEndDay: companySettings.payWeekEndDay ?? defaultLabels.payWeekEndDay
        });
        setSettings(prev => ({ 
          ...prev, 
          photoVerification: companySettings.photoVerification || false,
          field1Enabled: companySettings.field1Enabled !== false,  // defaults to true
          field2Enabled: companySettings.field2Enabled === true,   // defaults to false
          field3Enabled: companySettings.field3Enabled === true    // defaults to false
        }));
      }
    });

    return () => unsubscribe();
  }, [user, companyId]);

  return { settings, labels };
}