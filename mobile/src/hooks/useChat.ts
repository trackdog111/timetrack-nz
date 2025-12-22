// TimeTrack NZ - Chat Hook
// UPDATED: Added companyId support for multi-tenant

import { useState, useEffect } from 'react';
import { User } from 'firebase/auth';
import {
  collection,
  addDoc,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
  Timestamp
} from 'firebase/firestore';
import { db } from '../firebase';
import { ChatMessage, ChatTabType } from '../types';

// UPDATED: Now accepts companyId parameter
export function useChat(user: User | null, chatEnabled: boolean, companyId: string | null) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [chatTab, setChatTab] = useState<ChatTabType>('team');

  // Subscribe to messages - UPDATED: Filter by companyId
  useEffect(() => {
    if (!user || !chatEnabled || !companyId) return;

    const q = query(
      collection(db, 'messages'),
      where('companyId', '==', companyId),  // NEW: Filter by company
      orderBy('timestamp', 'desc'),
      limit(50)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      setMessages(
        snapshot.docs
          .map(doc => ({ id: doc.id, ...doc.data() }) as ChatMessage)
          .reverse()
      );
    });

    return () => unsubscribe();
  }, [user, chatEnabled, companyId]);

  // Send message - UPDATED: Include companyId
  const sendMessage = async () => {
    if (!user || !newMessage.trim() || !companyId) return;

    try {
      const msgData: any = {
        companyId,  // NEW: Include companyId
        type: chatTab === 'team' ? 'team' : 'dm',
        senderId: user.uid,
        senderEmail: user.email,
        text: newMessage.trim(),
        timestamp: Timestamp.now()
      };

      if (chatTab === 'employer') {
        msgData.participants = [user.uid, 'employer'];
      }

      await addDoc(collection(db, 'messages'), msgData);
      setNewMessage('');
    } catch (err) {
      console.error('Failed to send message:', err);
    }
  };

  // Send job update to chat (for share feature) - UPDATED: Include companyId
  const sendJobUpdate = async (
    text: string,
    destination: 'team' | 'manager'
  ) => {
    if (!user || !companyId) return false;

    try {
      const msgData: any = {
        companyId,  // NEW: Include companyId
        type: destination === 'team' ? 'team' : 'dm',
        senderId: user.uid,
        senderEmail: user.email,
        text: text,
        timestamp: Timestamp.now()
      };

      if (destination === 'manager') {
        msgData.participants = [user.uid, 'employer'];
      }

      await addDoc(collection(db, 'messages'), msgData);
      return true;
    } catch (err) {
      console.error('Failed to send job update:', err);
      return false;
    }
  };

  return {
    messages,
    newMessage,
    setNewMessage,
    chatTab,
    setChatTab,
    sendMessage,
    sendJobUpdate
  };
}