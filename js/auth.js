/**
 * Authentication Module
 * Handles Teacher Registration, Login, Session Persistence, and Route Protection
 */

import { auth, db, isFirebaseConfigured } from './firebase-config.js';
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  updateProfile,
  setPersistence,
  browserLocalPersistence
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';

import {
  doc,
  setDoc,
  getDoc,
  serverTimestamp
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

import { showToast, initLayout } from './utils.js';

// Ensure browser local session persistence
try {
  setPersistence(auth, browserLocalPersistence);
} catch (e) {
  console.warn('Firebase persistence warning:', e);
}

/**
 * Register a new Teacher account
 * @param {string} email
 * @param {string} password
 * @param {Object} profile - { displayName, schoolName }
 */
export async function registerTeacher(email, password, profile) {
  if (!isFirebaseConfigured()) {
    throw new Error('Firebase credentials are not configured yet! Please update "js/firebase-config.js" with your Firebase Project keys.');
  }

  // 1. Create auth user in Firebase Authentication
  const userCredential = await createUserWithEmailAndPassword(auth, email, password);
  const user = userCredential.user;

  // 2. Set Firebase Auth display name
  if (profile.displayName) {
    await updateProfile(user, { displayName: profile.displayName });
  }

  // 3. Create teacher profile document in Firestore (never store password)
  const teacherDocRef = doc(db, 'users', user.uid);
  await setDoc(teacherDocRef, {
    uid: user.uid,
    displayName: profile.displayName || 'Teacher',
    schoolName: profile.schoolName || 'General Institution',
    email: user.email,
    role: 'teacher',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });

  return user;
}

/**
 * Sign in existing Teacher
 * @param {string} email
 * @param {string} password
 */
export async function loginTeacher(email, password) {
  if (!isFirebaseConfigured()) {
    throw new Error('Firebase credentials are not configured yet! Please update "js/firebase-config.js" with your Firebase Project keys.');
  }

  const userCredential = await signInWithEmailAndPassword(auth, email, password);
  return userCredential.user;
}

/**
 * Sign out current Teacher
 */
export async function logoutTeacher() {
  await signOut(auth);
}

/**
 * Listen for auth state changes
 * @param {Function} callback
 */
export function onAuthStateChange(callback) {
  return onAuthStateChanged(auth, callback);
}

/**
 * Guard function for protected pages (Dashboard, Students, Classes, etc.)
 * Redirects unauthenticated visitors to login.html and binds layout controls
 * @param {Function} onAuthenticatedCallback - Executed when valid teacher session exists
 */
export function requireAuth(onAuthenticatedCallback) {
  // Initialize common UI layout elements (hamburger, date)
  initLayout();

  // If Firebase is not configured at all, display a helpful diagnostic notice
  if (!isFirebaseConfigured()) {
    displayConfigurationWarning();
  }

  onAuthStateChanged(auth, async (user) => {
    if (!user) {
      // User is not signed in, redirect to login page
      window.location.replace('login.html');
      return;
    }

    // Populate Sidebar User Information
    const avatarEl = document.getElementById('sidebar-user-avatar');
    const nameEl = document.getElementById('sidebar-user-name');
    const schoolEl = document.getElementById('sidebar-user-school');

    if (avatarEl) {
      avatarEl.textContent = (user.displayName || user.email || 'T').charAt(0).toUpperCase();
    }
    if (nameEl) {
      nameEl.textContent = user.displayName || user.email.split('@')[0];
    }

    // Try fetching school name from teacher document
    try {
      const docSnap = await getDoc(doc(db, 'users', user.uid));
      if (docSnap.exists() && schoolEl) {
        const data = docSnap.data();
        if (data.schoolName) {
          schoolEl.textContent = data.schoolName;
        }
      }
    } catch (err) {
      console.warn('Could not load user metadata:', err);
    }

    // Setup Sidebar Logout button
    const logoutBtn = document.getElementById('btn-sidebar-logout');
    if (logoutBtn) {
      logoutBtn.onclick = async () => {
        try {
          await logoutTeacher();
          showToast('Signed out successfully', 'info');
          setTimeout(() => window.location.replace('login.html'), 300);
        } catch (e) {
          showToast('Error signing out: ' + e.message, 'error');
        }
      };
    }

    // Invoke page-specific logic
    if (typeof onAuthenticatedCallback === 'function') {
      onAuthenticatedCallback(user);
    }
  });
}

/**
 * Displays a friendly banner when Firebase credentials are still placeholders
 */
function displayConfigurationWarning() {
  const contentArea = document.querySelector('.content-area') || document.body;
  const banner = document.createElement('div');
  banner.style.cssText = `
    background: #fffbeb;
    border: 1px solid #fde68a;
    color: #92400e;
    padding: 16px 20px;
    border-radius: 10px;
    margin-bottom: 24px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    box-shadow: 0 2px 4px rgba(0,0,0,0.05);
  `;
  banner.innerHTML = `
    <div style="display: flex; align-items: center; gap: 12px;">
      <i class="fa-solid fa-triangle-exclamation" style="font-size: 1.5rem; color: #f59e0b;"></i>
      <div>
        <strong style="font-size: 0.95rem;">Firebase Setup Required</strong>
        <p style="margin-top: 2px; font-size: 0.85rem; color: #78350f;">
          Please enter your Firebase Project credentials inside <code>js/firebase-config.js</code> to enable live cloud syncing.
        </p>
      </div>
    </div>
    <a href="settings.html" class="btn btn-secondary btn-sm" style="background: #ffffff; border-color: #fde68a; color: #92400e;">
      Setup Info
    </a>
  `;
  contentArea.insertBefore(banner, contentArea.firstChild);
}
