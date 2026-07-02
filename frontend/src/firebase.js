// ============================================================
// SIGNAL — Firebase Configuration
// ============================================================
// Demo mode activates automatically when Firebase isn't configured.
// ============================================================

import { initializeApp } from 'firebase/app'
import { getAuth, GoogleAuthProvider } from 'firebase/auth'
import { getFirestore } from 'firebase/firestore'

const firebaseConfig = {
  apiKey:            import.meta.env.VITE_FIREBASE_API_KEY            || 'YOUR_FIREBASE_API_KEY',
  authDomain:        import.meta.env.VITE_FIREBASE_AUTH_DOMAIN        || 'YOUR_PROJECT.firebaseapp.com',
  projectId:         import.meta.env.VITE_FIREBASE_PROJECT_ID         || 'YOUR_PROJECT_ID',
  storageBucket:     import.meta.env.VITE_FIREBASE_STORAGE_BUCKET     || 'YOUR_PROJECT.appspot.com',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID|| 'YOUR_SENDER_ID',
  appId:             import.meta.env.VITE_FIREBASE_APP_ID             || 'YOUR_APP_ID',
}

// Detect if Firebase is configured with real values
export const isFirebaseConfigured = firebaseConfig.apiKey !== 'YOUR_FIREBASE_API_KEY'
  && firebaseConfig.projectId !== 'YOUR_PROJECT_ID'

let app, auth, db, googleProvider

if (isFirebaseConfigured) {
  app = initializeApp(firebaseConfig)
  auth = getAuth(app)
  db = getFirestore(app)
  googleProvider = new GoogleAuthProvider()
} else {
  // Demo mode — Firebase not initialised, auth is handled entirely in AuthContext
  app = null
  auth = null
  db = null
  googleProvider = null
}

export { app, auth, db, googleProvider }
export default app
