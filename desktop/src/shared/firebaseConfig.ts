/**
 * Firebase web app configuration (Firebase console > Project settings > Your apps).
 * These values identify the project and are meant to be shipped inside the
 * app; they are not secrets. Data is protected by v2/firebase/firestore.rules.
 */
export const FIREBASE_CONFIG = {
  apiKey: "AIzaSyDWM67-8DtMbIejYISC2gJEYnhSS6eV8-k",
  authDomain: "min-task-timer.firebaseapp.com",
  projectId: "min-task-timer",
  storageBucket: "min-task-timer.firebasestorage.app",
  messagingSenderId: "816429211579",
  appId: "1:816429211579:web:651a4f74c69a57f050ae9e",
} as const;

/** Project ID used with the local Firebase emulators (tests, E2E). */
export const EMULATOR_PROJECT_ID = "demo-30min-task-timer";
