// src/services/authService.js
import {
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    signOut,
    updateProfile
} from "firebase/auth";
import { doc, setDoc, getDoc } from "firebase/firestore";
import { auth, db } from "../firebase/config";

export const AuthService = {
    // 1. Registro: Crea cuenta de Auth Y documento en Base de Datos
    register: async (username, email, password) => {
        try {
            // A. Crear usuario en Firebase Authentication
            const userCredential = await createUserWithEmailAndPassword(auth, email, password);
            const user = userCredential.user;

            // B. Actualizar el nombre visible (display name)
            await updateProfile(user, { displayName: username });

            // C. Crear el documento del usuario en la Base de Datos (Firestore)
            // Esto es crucial para guardar sus playlists y favoritos luego.
            await setDoc(doc(db, "users", user.uid), {
                uid: user.uid,
                username: username,
                email: email,
                createdAt: new Date(),
                favorites: [], // Array vacío para futuras canciones favoritas
                playlists: []  // Array vacío para playlists
            });

            return user;
        } catch (error) {
            console.error("Error en registro:", error);
            throw translateError(error);
        }
    },

    // 2. Login
    login: async (email, password) => {
        try {
            const userCredential = await signInWithEmailAndPassword(auth, email, password);

            // Opcional: Obtener datos extra del usuario desde la BD
            const userDoc = await getDoc(doc(db, "users", userCredential.user.uid));

            // Guardamos sesión básica en localStorage para persistencia rápida
            localStorage.setItem('user_uid', userCredential.user.uid);

            return {
                ...userCredential.user,
                ...userDoc.data() // Combina datos de Auth con datos de la BD
            };
        } catch (error) {
            console.error("Error en login:", error);
            throw translateError(error);
        }
    },

    // 3. Cerrar Sesión
    logout: async () => {
        localStorage.removeItem('user_uid');
        localStorage.removeItem('lastfm_session'); // Limpiamos lo de tu callback anterior
        await signOut(auth);
    }
};

// Función auxiliar para traducir errores de Firebase al español
const translateError = (error) => {
    switch (error.code) {
        case 'auth/email-already-in-use':
            return { message: 'Este correo ya está registrado.' };
        case 'auth/invalid-email':
            return { message: 'El correo no es válido.' };
        case 'auth/user-not-found':
            return { message: 'Usuario no encontrado.' };
        case 'auth/wrong-password':
            return { message: 'Contraseña incorrecta.' };
        case 'auth/weak-password':
            return { message: 'La contraseña es muy débil (mínimo 6 caracteres).' };
        default:
            return { message: 'Ocurrió un error inesperado. Intenta de nuevo.' };
    }
};