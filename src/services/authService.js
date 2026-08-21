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
                favorites: [],
                playlists: [],
                savedArtists: [],
                savedAlbums: [],
                savedPlaylists: [],
                onboardingCompleted: false
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
        await signOut(auth);
    }
};

// Función auxiliar para traducir errores de Firebase al español
const translateError = (error) => {
    let message;
    switch (error.code) {
        case 'auth/email-already-in-use':
            message = 'Este correo ya está registrado.';
            break;
        case 'auth/invalid-email':
            message = 'El correo no es válido.';
            break;
        case 'auth/user-not-found':
        case 'auth/wrong-password':
        case 'auth/invalid-credential':
            message = 'Credenciales inválidas. Verifica tu correo y contraseña.';
            break;
        case 'auth/weak-password':
            message = 'La contraseña es muy débil (mínimo 6 caracteres).';
            break;
        case 'auth/too-many-requests':
            message = 'Demasiados intentos. Espera unos minutos antes de volver a intentarlo.';
            break;
        default:
            message = 'Ocurrió un error inesperado. Intenta de nuevo.';
    }

    const translated = new Error(message);
    translated.code = error.code;
    return translated;
};
