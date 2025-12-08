// src/firebase/config.js
import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

// Reemplaza esto con la configuración que te da Firebase Console
const firebaseConfig = {
    apiKey: "AIzaSyBist-khRNjofRcliaN3W-b9FdiIDv2fvg",
    authDomain: "appmusica-5c872.firebaseapp.com",
    projectId: "appmusica-5c872",
    storageBucket: "appmusica-5c872.firebasestorage.app",
    messagingSenderId: "134336615838",
    appId: "1:134336615838:web:826064c59849c9c0d9b28f",
    measurementId: "G-KT5M6DYJ39"
};

// Inicializar Firebase
const app = initializeApp(firebaseConfig);

// Exportar servicios
export const auth = getAuth(app);
export const db = getFirestore(app); // Base de datos en tiempo real