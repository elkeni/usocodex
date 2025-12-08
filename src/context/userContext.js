import React, { createContext, useContext, useEffect, useState } from 'react';
import { doc, onSnapshot, updateDoc, arrayUnion, arrayRemove } from 'firebase/firestore';
import { auth, db } from '../firebase/config';
import { onAuthStateChanged } from 'firebase/auth';

const UserContext = createContext();

export const useUser = () => useContext(UserContext);

export const UserProvider = ({ children }) => {
    const [user, setUser] = useState(null);
    const [favorites, setFavorites] = useState([]);
    const [playlists, setPlaylists] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        // Escuchar cambios de autenticación
        const unsubscribeAuth = onAuthStateChanged(auth, (currentUser) => {
            setUser(currentUser);

            if (currentUser) {
                // Si hay usuario, escuchar su documento en Firestore EN TIEMPO REAL
                const userRef = doc(db, "users", currentUser.uid);

                const unsubscribeSnapshot = onSnapshot(userRef, (docSnap) => {
                    if (docSnap.exists()) {
                        const data = docSnap.data();
                        setFavorites(data.favorites || []);
                        setPlaylists(data.playlists || []);
                    }
                    setLoading(false);
                });

                return () => unsubscribeSnapshot();
            } else {
                setFavorites([]);
                setPlaylists([]);
                setLoading(false);
            }
        });

        return () => unsubscribeAuth();
    }, []);

    // --- ACCIONES DE FAVORITOS ---
    const toggleFavorite = async (track) => {
        if (!user) return alert("Inicia sesión para guardar música");

        const userRef = doc(db, "users", user.uid);
        const isLiked = favorites.some(f => f.name === track.name && f.artist === track.artist);

        // Aseguramos que guardamos un objeto limpio
        const trackData = {
            name: track.name,
            artist: typeof track.artist === 'object' ? track.artist.name : track.artist,
            image: track.image || '',
            album: track.album || '',
            duration: track.duration || 0
        };

        try {
            if (isLiked) {
                // Eliminar (truco: debe coincidir exactamente el objeto, o usamos filter en arrays complejos)
                // Para simplificar, aquí usamos arrayRemove, pero en producción es mejor filtrar por ID
                await updateDoc(userRef, { favorites: arrayRemove(trackData) });
            } else {
                await updateDoc(userRef, { favorites: arrayUnion(trackData) });
            }
        } catch (error) {
            console.error("Error actualizando favoritos:", error);
        }
    };

    // --- ACCIONES DE PLAYLISTS ---
    const createPlaylist = async (name, description) => {
        if (!user) return;
        const newPlaylist = {
            id: Date.now().toString(), // ID simple basado en tiempo
            name,
            description,
            image: null,
            tracks: [],
            createdAt: new Date().toISOString()
        };

        const userRef = doc(db, "users", user.uid);
        await updateDoc(userRef, {
            playlists: arrayUnion(newPlaylist)
        });
        return newPlaylist.id;
    };

    const deletePlaylist = async (playlistId) => {
        if (!user) return;
        const userRef = doc(db, "users", user.uid);
        // Filtramos la playlist a borrar
        const updatedPlaylists = playlists.filter(p => p.id !== playlistId);

        await updateDoc(userRef, {
            playlists: updatedPlaylists // Reemplazamos el array completo
        });
    };

    const value = {
        user,
        favorites,
        playlists,
        loading,
        toggleFavorite,
        createPlaylist,
        deletePlaylist
    };

    return <UserContext.Provider value={value}>{children}</UserContext.Provider>;
};