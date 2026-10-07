/**
 * Firebase web app configuration (Firebase console > Project settings > Your apps).
 * These values identify the project and are meant to be shipped inside the
 * app; they are not secrets. Data is protected by firebase/firestore.rules.
 */
export const FIREBASE_CONFIG = {
  apiKey: "AIzaSyCAic22UZaDvISEfXKQfBfXzxZEZO24BpY",
  authDomain: "shiodoki-e4e8f.firebaseapp.com",
  projectId: "shiodoki-e4e8f",
  storageBucket: "shiodoki-e4e8f.firebasestorage.app",
  messagingSenderId: "536655814128",
  appId: "1:536655814128:web:682efc2ce4ea7037815135",
} as const;

/** Project ID used with the local Firebase emulators (tests, E2E). */
export const EMULATOR_PROJECT_ID = "demo-shiodoki";
