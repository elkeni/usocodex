// src/firebase/config.js
import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY || 'AIzaSyBist-khRNjofRcliaN3W-b9FdiIDv2fvg',
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || 'appmusica-5c872.firebaseapp.com',
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || 'appmusica-5c872',
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || 'appmusica-5c872.firebasestorage.app',
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '134336615838',
    appId: import.meta.env.VITE_FIREBASE_APP_ID || '1:134336615838:web:826064c59849c9c0d9b28f',
    measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || 'G-KT5M6DYJ39'
};

const requiredFirebaseKeys = ['apiKey', 'authDomain', 'projectId', 'appId'];
const missingFirebaseKeys = requiredFirebaseKeys.filter((key) => !firebaseConfig[key]);

if (missingFirebaseKeys.length > 0) {
    throw new Error(
        `Falta configuración de Firebase: ${missingFirebaseKeys.join(', ')}. ` +
        'Copia .env.example a .env.local y completa sus valores.'
    );
}

// Inicializar Firebase
const app = initializeApp(firebaseConfig);

// Exportar servicios
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
