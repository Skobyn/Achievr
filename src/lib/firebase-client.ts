import { initializeApp, getApps, getApp, FirebaseApp } from 'firebase/app';
import { getFirestore, Firestore } from 'firebase/firestore';
import { getAuth, Auth, User, setPersistence, browserLocalPersistence } from 'firebase/auth';
import { getAnalytics, isSupported, Analytics } from 'firebase/analytics';

// Create dummy implementations for all Firebase services
const createDummy = () => {
  const dummy = new Proxy({}, {
    get: () => {
      return typeof window === 'undefined' 
        ? (() => {}) // Return empty function on server
        : createDummy(); // Return another proxy on client
    }
  });
  return dummy;
};

// Firebase configuration
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID
};

// Initialize Firebase in a way that's safe for both client and server
let app: FirebaseApp;
let db: Firestore;
let auth: Auth;
let analytics: Analytics | null = null;

// Skip actual Firebase initialization since we're migrating to Supabase
// This file remains for compatibility with existing code
// Provide dummy implementations that won't throw errors
app = createDummy() as unknown as FirebaseApp;
db = createDummy() as unknown as Firestore;
auth = createDummy() as unknown as Auth;

// Helper functions for common database operations - now returning empty values
export const getCurrentUser = async (): Promise<User | null> => {
  return null;
};

export const getUserProfile = async (userId: string) => {
  return null;
};

// Helper for maintaining a persistent auth cookie that can be read by middleware
export const updateAuthCookie = (user: User | null) => {
  // No-op during migration
};

export { db, auth, analytics }; 