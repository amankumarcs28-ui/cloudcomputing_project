/**
 * Firebase Modular SDK Configuration (v10 ESM)
 * -------------------------------------------------------------
 * HOW TO CONFIGURE FIREBASE:
 * 1. Go to Firebase Console: https://console.firebase.google.com/
 * 2. Create a project (or select an existing one).
 * 3. Add a Web App (</> icon) and copy your Firebase SDK config values.
 * 4. Enable "Authentication" -> "Email/Password" sign-in provider.
 * 5. Enable "Cloud Firestore" database (in production mode or test mode).
 * 6. Replace the placeholder values below with your project credentials.
 */

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

export const firebaseConfig = {
  apiKey: "YOUR_FIREBASE_API_KEY",
  authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT_ID.appspot.com",
  messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
  appId: "YOUR_APP_ID"
};

/**
 * Checks if the developer has entered actual credentials instead of placeholders
 */
export function isFirebaseConfigured() {
  return (
    Boolean(firebaseConfig.apiKey) &&
    firebaseConfig.apiKey !== "YOUR_FIREBASE_API_KEY" &&
    Boolean(firebaseConfig.projectId) &&
    firebaseConfig.projectId !== "YOUR_PROJECT_ID"
  );
}

// Initialize Firebase App
export const app = initializeApp(firebaseConfig);

// Initialize Firebase Auth & Firestore instances
export const auth = getAuth(app);
export const db = getFirestore(app);
