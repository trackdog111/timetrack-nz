// Trackable NZ - Expenses Hook
// Manages expense submissions for employees

import { useState, useEffect } from 'react';
import { User } from 'firebase/auth';
import { 
  collection, 
  query, 
  where, 
  orderBy, 
  onSnapshot,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  serverTimestamp,
  Timestamp
} from 'firebase/firestore';
import { ref, uploadString, getDownloadURL } from 'firebase/storage';
import { db, storage } from '../firebase';
import { Expense, ExpenseCategory } from '../types';

export function useExpenses(user: User | null, companyId: string | null) {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // Listen to user's expenses
  useEffect(() => {
    if (!user || !companyId) {
      setExpenses([]);
      setLoading(false);
      return;
    }

    const q = query(
      collection(db, 'expenses'),
      where('companyId', '==', companyId),
      where('odId', '==', user.uid),
      orderBy('createdAt', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const expenseList: Expense[] = [];
      snapshot.forEach((doc) => {
        expenseList.push({ id: doc.id, ...doc.data() } as Expense);
      });
      setExpenses(expenseList);
      setLoading(false);
    }, (error) => {
      console.error('Error fetching expenses:', error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [user, companyId]);

  // Submit a new expense
  const submitExpense = async (
    amount: number,
    category: ExpenseCategory,
    date: Date,
    photoBase64?: string,
    note?: string
  ): Promise<boolean> => {
    if (!user || !companyId) return false;

    setSubmitting(true);

    try {
      let photoUrl: string | undefined;

      // Upload photo if provided
      if (photoBase64) {
        const photoRef = ref(storage, `expenses/${companyId}/${user.uid}/${Date.now()}.jpg`);
        await uploadString(photoRef, photoBase64, 'data_url');
        photoUrl = await getDownloadURL(photoRef);
      }

      // Create expense document - only include photoUrl if it exists
      const expenseData: any = {
        companyId,
        odId: user.uid,
        odName: user.displayName || user.email?.split('@')[0] || 'Unknown',
        odEmail: user.email || '',
        amount,
        category,
        note: note || '',
        date: Timestamp.fromDate(date),
        status: 'pending',
        createdAt: serverTimestamp()
      };

      if (photoUrl) {
        expenseData.photoUrl = photoUrl;
      }

      await addDoc(collection(db, 'expenses'), expenseData);

      setSubmitting(false);
      return true;
    } catch (error) {
      console.error('Error submitting expense:', error);
      setSubmitting(false);
      return false;
    }
  };

  // Update an existing expense (only if pending)
  const updateExpense = async (
    expenseId: string,
    amount: number,
    category: ExpenseCategory,
    date: Date,
    note?: string
  ): Promise<boolean> => {
    if (!user || !companyId) return false;

    try {
      await updateDoc(doc(db, 'expenses', expenseId), {
        amount,
        category,
        date: Timestamp.fromDate(date),
        note: note || ''
      });
      return true;
    } catch (error) {
      console.error('Error updating expense:', error);
      return false;
    }
  };

  // Delete an expense (only if pending)
  const deleteExpense = async (expenseId: string): Promise<boolean> => {
    if (!user || !companyId) return false;

    try {
      await deleteDoc(doc(db, 'expenses', expenseId));
      return true;
    } catch (error) {
      console.error('Error deleting expense:', error);
      return false;
    }
  };

  return {
    expenses,
    loading,
    submitting,
    submitExpense,
    updateExpense,
    deleteExpense
  };
}