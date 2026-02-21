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
// Consider moving these values into environment variables for production.
const firebaseConfig = {
  apiKey: 'AIzaSyCl4yKhukewEypX-YZNg1WuPvSw-dKFrgk',
  authDomain: 'farmvault-dabfe.firebaseapp.com',
  projectId: 'farmvault-dabfe',
  storageBucket: 'farmvault-dabfe.firebasestorage.app',
  messagingSenderId: '945657601146',
  appId: '1:945657601146:web:b620f2dc4b05dbbf9d2fc3',
  measurementId: 'G-PYRECCDET1',
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

