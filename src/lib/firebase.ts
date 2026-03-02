import { initializeApp } from 'firebase/app';
import { getAnalytics, isSupported as isAnalyticsSupported } from 'firebase/analytics';
import { getAuth } from 'firebase/auth';
import {
  getFirestore,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  persistentSingleTabManager,
  type Firestore,
} from 'firebase/firestore';

// Firebase configuration for FarmVault
// Values are pulled from Vite env vars so we don't hard-code keys in the repo.
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
};

// Initialize Firebase core app (singleton)
export const app = initializeApp(firebaseConfig);

// Secondary app used only for creating new users (e.g. employees) so the current user stays signed in
const appEmployeeCreate = initializeApp(firebaseConfig, 'EmployeeCreate');

// Initialize services
export const auth = getAuth(app);
/** Use this when creating employee accounts so the company admin is not logged out. */
export const authEmployeeCreate = getAuth(appEmployeeCreate);

let dbInstance: Firestore;
try {
  dbInstance = initializeFirestore(app, {
    localCache: persistentLocalCache({
      tabManager: persistentMultipleTabManager(),
    }),
  });
} catch (multiTabError) {
  try {
    dbInstance = initializeFirestore(app, {
      localCache: persistentLocalCache({
        tabManager: persistentSingleTabManager(),
      }),
    });
    console.warn(
      '[firebase] Multi-tab persistence unavailable; falling back to single-tab persistence.',
      multiTabError
    );
  } catch (singleTabError) {
    // Final fallback for unsupported browsers or initialization races.
    console.warn('[firebase] Firestore persistence unavailable; using standard Firestore.', singleTabError);
    dbInstance = getFirestore(app);
  }
}

export const db = dbInstance;

// Lazily enable Analytics only when supported (browser only)
export const analyticsPromise = isAnalyticsSupported().then((supported) =>
  supported ? getAnalytics(app) : null,
);

