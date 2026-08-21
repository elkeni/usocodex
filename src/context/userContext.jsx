import { createContext, useContext, useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { doc, onSnapshot, setDoc, getDoc } from 'firebase/firestore';
import { auth, db } from '../firebase/config';
import { onAuthStateChanged } from 'firebase/auth';

// =============================================================================
// VALIDACIÓN DE TRACKS (obligatoria antes de guardar)
// =============================================================================

/**
 * Normaliza un track asegurando campos obligatorios
 * @param {Object} track - Track a normalizar
 * @returns {Object} Track normalizado
 */
const normalizeTrackForSave = (track) => {
    if (!track) return null;

    const name = track.name || track.title;
    if (!name) return null;

    // Extraer artista (puede ser string u objeto)
    let artist = track.artist || track.artistName;
    if (typeof artist === 'object' && artist !== null) {
        artist = artist.name || artist['#text'] || null;
    }
    artist = artist?.trim() || 'Unknown Artist';

    // Extraer album
    let album = track.album || track.albumName;
    if (typeof album === 'object' && album !== null) {
        album = album.name || album.title || null;
    }
    album = album?.trim() || (track.source === 'youtube' ? 'Single' : 'Unknown Album');

    return {
        name: name.trim(),
        title: name.trim(),
        artist,
        album,
        image: track.image || track.thumbnail || '',
        duration: track.duration || 0,
        addedAt: track.addedAt || Date.now(),
        // Preservar metadata útil
        videoId: track.videoId || null,
        source: track.source || 'unknown'
    };
};

/**
 * Valida que un track tenga los campos obligatorios
 * @param {Object} track - Track a validar
 * @returns {boolean} true si es válido
 */
const isValidTrack = (track) => {
    if (!track) return false;
    const name = track.name || track.title;
    const artist = track.artist;
    const album = track.album;

    return !!(name && artist && album);
};

const UserContext = createContext();

export const useUser = () => useContext(UserContext);

export const UserProvider = ({ children }) => {
    const [user, setUser] = useState(null);
    const [favorites, setFavorites] = useState([]);
    const [playlists, setPlaylists] = useState([]);
    const [savedArtists, setSavedArtists] = useState([]);
    const [savedAlbums, setSavedAlbums] = useState([]);
    const [savedPlaylists, setSavedPlaylists] = useState([]);
    const [onboardingCompleted, setOnboardingCompleted] = useState(true); // Default true para usuarios existentes
    const [loading, setLoading] = useState(true);
    const userDocExists = useRef(false);

    /**
     * Asegura que el documento del usuario exista en Firestore
     * Si no existe, lo crea con valores por defecto
     */
    const ensureUserDocument = async (currentUser) => {
        if (!currentUser) return false;

        const userRef = doc(db, "users", currentUser.uid);
        const docSnap = await getDoc(userRef);

        if (!docSnap.exists()) {
            console.log('[UserContext] Documento de usuario no existe, creando...');
            await setDoc(userRef, {
                uid: currentUser.uid,
                username: currentUser.displayName || 'Usuario',
                email: currentUser.email || '',
                createdAt: new Date(),
                favorites: [],
                playlists: [],
                savedArtists: [],
                savedAlbums: [],
                savedPlaylists: [],
                onboardingCompleted: false // Nuevo usuario necesita completar onboarding
            });
            console.log('[UserContext] ✅ Documento de usuario creado');
            return true;
        }
        return true;
    };

    useEffect(() => {
        let unsubscribeSnapshot = null;

        // Escuchar cambios de autenticación
        const unsubscribeAuth = onAuthStateChanged(auth, async (currentUser) => {
            setUser(currentUser);

            // Limpiar listener anterior si existe (evita memory leaks si cambia el usuario)
            if (unsubscribeSnapshot) {
                unsubscribeSnapshot();
                unsubscribeSnapshot = null;
            }

            if (currentUser) {
                // OPTIMIZACIÓN CRÍTICA: Desbloquear UI inmediatamente
                // No esperar a ensureUserDocument ni ommSnapshot para mostrar la app
                setLoading(false);

                // Asegurar que el documento existe antes de escuchar (Async sin bloquear UI)
                await ensureUserDocument(currentUser);
                userDocExists.current = true;

                // Si hay usuario, escuchar su documento en Firestore EN TIEMPO REAL
                const userRef = doc(db, "users", currentUser.uid);

                unsubscribeSnapshot = onSnapshot(userRef, (docSnap) => {
                    if (docSnap.exists()) {
                        const data = docSnap.data();
                        setFavorites(data.favorites || []);
                        setPlaylists(data.playlists || []);
                        setSavedArtists(data.savedArtists || []);
                        setSavedAlbums(data.savedAlbums || []);
                        setSavedPlaylists(data.savedPlaylists || []);
                        // Si el campo no existe, asumimos que usuarios viejos ya completaron onboarding
                        setOnboardingCompleted(data.onboardingCompleted !== false);
                    }
                    // La carga ya se desactivó arriba para entrada instantánea
                });
            } else {
                userDocExists.current = false;
                setFavorites([]);
                setPlaylists([]);
                setSavedArtists([]);
                setSavedAlbums([]);
                setSavedPlaylists([]);
                setLoading(false);
            }
        });

        return () => {
            if (unsubscribeSnapshot) unsubscribeSnapshot();
            unsubscribeAuth();
        };
    }, []);

    // ==========================================================================
    // HELPER: Actualización segura que crea documento si no existe
    // ==========================================================================
    const safeUpdateDoc = useCallback(async (userRef, data) => {
        try {
            // Usar setDoc con merge: true - funciona tanto si existe como si no
            await setDoc(userRef, data, { merge: true });
        } catch (error) {
            console.error("[UserContext] Error en safeUpdateDoc:", error);
            throw error;
        }
    }, []);

    // ==========================================================================
    // ACCIONES DE FAVORITOS (Canciones)
    // ==========================================================================
    const toggleFavorite = useCallback(async (track) => {
        if (!user) return alert("Inicia sesión para guardar música");

        const userRef = doc(db, "users", user.uid);
        // Normalizar claves para comparación
        const targetName = track.name || track.title;
        const targetArtist = typeof track.artist === 'object' ? (track.artist.name || track.artist['#text']) : track.artist;

        // Get current favorites from state
        setFavorites(currentFavorites => {
            const existingIndex = currentFavorites.findIndex(f =>
                f.name === targetName && f.artist === targetArtist
            );

            let newFavorites = [...currentFavorites];

            if (existingIndex !== -1) {
                newFavorites.splice(existingIndex, 1);
            } else {
                const trackData = {
                    name: targetName,
                    artist: targetArtist,
                    image: track.image || '',
                    album: track.album || '',
                    duration: track.duration || 0,
                    addedAt: Date.now()
                };
                newFavorites.push(trackData);
            }

            // Update Firestore asynchronously con merge (crea si no existe)
            safeUpdateDoc(userRef, { favorites: newFavorites }).catch(error => {
                console.error("Error actualizando favoritos:", error);
            });

            return newFavorites;
        });
    }, [user, safeUpdateDoc]);

    // Helper para verificar si una canción está en favoritos
    const isFavorite = useCallback((track) => {
        if (!track) return false;
        const targetName = track.name || track.title;
        const targetArtist = typeof track.artist === 'object' ? (track.artist.name || track.artist['#text']) : track.artist;
        return favorites.some(f => f.name === targetName && f.artist === targetArtist);
    }, [favorites]);

    // ==========================================================================
    // ACCIONES DE ARTISTAS GUARDADOS
    // ==========================================================================
    const toggleSaveArtist = useCallback(async (artist) => {
        if (!user) return alert("Inicia sesión para seguir artistas");

        const userRef = doc(db, "users", user.uid);
        const artistName = typeof artist === 'string' ? artist : (artist.name || artist.title);

        setSavedArtists(currentArtists => {
            const existingIndex = currentArtists.findIndex(a =>
                a.name.toLowerCase() === artistName.toLowerCase()
            );

            let newArtists = [...currentArtists];

            if (existingIndex !== -1) {
                // Ya está guardado, eliminar
                newArtists.splice(existingIndex, 1);
                console.log(`[Library] ❌ Dejaste de seguir a: ${artistName}`);
            } else {
                // Agregar nuevo artista
                const artistData = {
                    name: artistName,
                    image: typeof artist === 'object' ? (artist.image || artist.picture_xl || '') : '',
                    followers: typeof artist === 'object' ? (artist.nb_fan || artist.listeners || 0) : 0,
                    addedAt: Date.now()
                };
                newArtists.push(artistData);
                console.log(`[Library] ✅ Ahora sigues a: ${artistName}`);
            }

            // Update Firestore asynchronously con merge (crea si no existe)
            safeUpdateDoc(userRef, { savedArtists: newArtists }).catch(error => {
                console.error("Error actualizando artistas:", error);
            });

            return newArtists;
        });
    }, [user, safeUpdateDoc]);

    // Helper para verificar si un artista está guardado
    const isArtistSaved = useCallback((artistName) => {
        if (!artistName) return false;
        const name = typeof artistName === 'string' ? artistName : (artistName.name || '');
        return savedArtists.some(a => a.name.toLowerCase() === name.toLowerCase());
    }, [savedArtists]);

    // ==========================================================================
    // ACCIONES DE ÁLBUMES GUARDADOS
    // ==========================================================================
    const toggleSaveAlbum = useCallback(async (album) => {
        if (!user) return alert("Inicia sesión para guardar álbumes");

        const userRef = doc(db, "users", user.uid);
        const albumName = album.name || album.title;
        const albumArtist = typeof album.artist === 'object' ? (album.artist.name || album.artist['#text']) : album.artist;

        setSavedAlbums(currentAlbums => {
            const existingIndex = currentAlbums.findIndex(a =>
                a.name.toLowerCase() === albumName.toLowerCase() &&
                a.artist.toLowerCase() === albumArtist.toLowerCase()
            );

            let newAlbums = [...currentAlbums];

            if (existingIndex !== -1) {
                // Ya está guardado, eliminar
                newAlbums.splice(existingIndex, 1);
                console.log(`[Library] ❌ Eliminaste el álbum: ${albumName}`);
            } else {
                // Agregar nuevo álbum
                const albumData = {
                    name: albumName,
                    artist: albumArtist,
                    image: album.image || album.cover_xl || '',
                    trackCount: album.nb_tracks || album.tracks?.length || 0,
                    addedAt: Date.now()
                };
                newAlbums.push(albumData);
                console.log(`[Library] ✅ Guardaste el álbum: ${albumName}`);
            }

            // Update Firestore asynchronously con merge (crea si no existe)
            safeUpdateDoc(userRef, { savedAlbums: newAlbums }).catch(error => {
                console.error("Error actualizando álbumes:", error);
            });

            return newAlbums;
        });
    }, [user, safeUpdateDoc]);

    // Helper para verificar si un álbum está guardado
    const isAlbumSaved = useCallback((albumName, artistName) => {
        if (!albumName) return false;
        return savedAlbums.some(a =>
            a.name.toLowerCase() === albumName.toLowerCase() &&
            a.artist.toLowerCase() === (artistName || '').toLowerCase()
        );
    }, [savedAlbums]);

    // ==========================================================================
    // ACCIONES DE PLAYLISTS EXTERNAS GUARDADAS
    // ==========================================================================
    const toggleSavePlaylist = useCallback(async (playlist) => {
        if (!user) return alert("Inicia sesión para guardar playlists");

        const userRef = doc(db, "users", user.uid);
        const playlistId = playlist.id?.toString();

        setSavedPlaylists(currentPlaylists => {
            const existingIndex = currentPlaylists.findIndex(p =>
                p.id === playlistId
            );

            let newPlaylists = [...currentPlaylists];

            if (existingIndex !== -1) {
                // Ya está guardada, eliminar
                newPlaylists.splice(existingIndex, 1);
                console.log(`[Library] ❌ Eliminaste la playlist: ${playlist.title || playlist.name}`);
            } else {
                // Agregar nueva playlist
                const playlistData = {
                    id: playlistId,
                    name: playlist.title || playlist.name,
                    image: playlist.picture_xl || playlist.picture_big || playlist.image || '',
                    creator: playlist.creator?.name || playlist.creator || 'Deezer',
                    trackCount: playlist.nb_tracks || playlist.tracks?.length || 0,
                    isExternal: true, // Marca que es una playlist externa (no creada por el usuario)
                    addedAt: Date.now()
                };
                newPlaylists.push(playlistData);
                console.log(`[Library] ✅ Guardaste la playlist: ${playlist.title || playlist.name}`);
            }

            // Update Firestore asynchronously con merge (crea si no existe)
            safeUpdateDoc(userRef, { savedPlaylists: newPlaylists }).catch(error => {
                console.error("Error actualizando playlists:", error);
            });

            return newPlaylists;
        });
    }, [user, safeUpdateDoc]);

    // Helper para verificar si una playlist está guardada
    const isPlaylistSaved = useCallback((playlistId) => {
        if (!playlistId) return false;
        return savedPlaylists.some(p => p.id === playlistId?.toString());
    }, [savedPlaylists]);

    // ==========================================================================
    // ACCIONES DE PLAYLISTS NATIVAS (Creadas por el usuario)
    // ==========================================================================

    /**
     * Crea una nueva playlist nativa con confirmación de Firebase
     * IMPORTANTE: Este método espera confirmación de Firebase antes de retornar
     * 
     * @param {string|Object} nameOrPlaylist - Nombre o objeto playlist completo
     * @param {string} description - Descripción (solo si nameOrPlaylist es string)
     * @returns {Promise<{id: string, playlist: Object}>} ID y playlist creada CONFIRMADA
     */
    const createPlaylist = useCallback(async (nameOrPlaylist, description = '') => {
        if (!user) {
            throw new Error('Usuario no autenticado');
        }

        // Generar ID único basado en timestamp + random para evitar colisiones
        const playlistId = `playlist_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;

        let newPlaylist;

        // Soportar ambos formatos: string simple o objeto completo
        if (typeof nameOrPlaylist === 'object' && nameOrPlaylist !== null) {
            newPlaylist = {
                ...nameOrPlaylist,
                id: playlistId, // SIEMPRE usar ID nuevo generado
                userId: user.uid,
                ownerId: user.uid, // Para compatibilidad con Social
                isNative: true,
                tracks: nameOrPlaylist.tracks || [],
                isPublic: nameOrPlaylist.isPublic !== undefined ? nameOrPlaylist.isPublic : false,
                likesCount: nameOrPlaylist.likesCount || 0,
                createdAt: Date.now(),
                updatedAt: Date.now()
            };
        } else {
            newPlaylist = {
                id: playlistId,
                userId: user.uid,
                ownerId: user.uid, // Para compatibilidad con Social
                name: nameOrPlaylist,
                title: nameOrPlaylist,
                description,
                vibe: null,
                tags: [],
                cover: {
                    type: 'gradient',
                    colors: [102, 126, 234]
                },
                image: null,
                tracks: [],
                isNative: true,
                isPublic: false, // Por defecto privada
                likesCount: 0,
                createdAt: Date.now(),
                updatedAt: Date.now()
            };
        }

        const userRef = doc(db, "users", user.uid);

        try {
            // Obtener playlists actuales de Firebase (no del estado local)
            const userDoc = await getDoc(userRef);
            const currentPlaylists = userDoc.exists() ? (userDoc.data().playlists || []) : [];

            // Añadir la nueva playlist
            const updatedPlaylists = [...currentPlaylists, newPlaylist];

            // Guardar en Firebase y ESPERAR confirmación
            await setDoc(userRef, { playlists: updatedPlaylists }, { merge: true });

            // Actualizar estado local DESPUÉS de confirmar Firebase
            setPlaylists(updatedPlaylists);

            console.log(`[Library] ✅ Playlist creada y confirmada: ${newPlaylist.name} (ID: ${playlistId})`);

            // Retornar ID y playlist para uso inmediato
            return { id: playlistId, playlist: newPlaylist };

        } catch (error) {
            console.error('[Library] ❌ Error creando playlist:', error);
            throw new Error(`No se pudo crear la playlist: ${error.message}`, { cause: error });
        }
    }, [user]);

    const deletePlaylist = useCallback(async (playlistId) => {
        if (!user) return;
        const userRef = doc(db, "users", user.uid);

        setPlaylists(currentPlaylists => {
            const updatedPlaylists = currentPlaylists.filter(p => p.id !== playlistId);
            safeUpdateDoc(userRef, { playlists: updatedPlaylists }).catch(console.error);
            return updatedPlaylists;
        });
    }, [user, safeUpdateDoc]);

    // --- AÑADIR CANCIÓN A PLAYLIST ---
    const addTrackToPlaylist = useCallback(async (playlistId, track) => {
        if (!user) return alert("Inicia sesión para añadir canciones a playlists");

        const userRef = doc(db, "users", user.uid);

        setPlaylists(currentPlaylists => {
            const playlist = currentPlaylists.find(p => p.id === playlistId);

            if (!playlist) {
                alert("Playlist no encontrada");
                return currentPlaylists;
            }

            // Formato track nativo
            const trackData = {
                id: track.id || `track-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                title: track.name || track.title,
                name: track.name || track.title, // Alias para compatibilidad
                artist: typeof track.artist === 'object' ? (track.artist.name || track.artist['#text']) : track.artist,
                image: track.image || '',
                album: track.album || '',
                duration: track.duration || 0,
                addedAt: Date.now(),
                resolved: null // Se resuelve lazy
            };

            const exists = playlist.tracks?.some(t =>
                (t.name === trackData.name || t.title === trackData.title) && t.artist === trackData.artist
            );

            if (exists) {
                alert("Esta canción ya está en la playlist");
                return currentPlaylists;
            }

            const updatedPlaylists = currentPlaylists.map(p => {
                if (p.id === playlistId) {
                    return {
                        ...p,
                        tracks: [...(p.tracks || []), trackData],
                        updatedAt: Date.now()
                    };
                }
                return p;
            });

            safeUpdateDoc(userRef, { playlists: updatedPlaylists }).catch(console.error);
            console.log(`[Library] ✅ Track añadido a playlist: ${trackData.title}`);
            return updatedPlaylists;
        });
    }, [user, safeUpdateDoc]);

    // --- QUITAR CANCIÓN DE PLAYLIST ---
    const removeTrackFromPlaylist = useCallback(async (playlistId, trackId) => {
        if (!user) return;

        const userRef = doc(db, "users", user.uid);

        setPlaylists(currentPlaylists => {
            const updatedPlaylists = currentPlaylists.map(p => {
                if (p.id === playlistId) {
                    return {
                        ...p,
                        tracks: (p.tracks || []).filter(t => t.id !== trackId),
                        updatedAt: Date.now()
                    };
                }
                return p;
            });

            safeUpdateDoc(userRef, { playlists: updatedPlaylists }).catch(console.error);
            console.log(`[Library] ❌ Track eliminado de playlist`);
            return updatedPlaylists;
        });
    }, [user, safeUpdateDoc]);

    // --- ACTUALIZAR PLAYLIST COMPLETA ---
    const updatePlaylist = useCallback(async (playlistId, updates) => {
        if (!user) return;

        const userRef = doc(db, "users", user.uid);

        setPlaylists(currentPlaylists => {
            const updatedPlaylists = currentPlaylists.map(p => {
                if (p.id === playlistId) {
                    return {
                        ...p,
                        ...updates,
                        // Mantener campos críticos
                        id: p.id,
                        userId: p.userId || user.uid,
                        isNative: true,
                        createdAt: p.createdAt,
                        updatedAt: Date.now()
                    };
                }
                return p;
            });

            safeUpdateDoc(userRef, { playlists: updatedPlaylists }).catch(console.error);
            return updatedPlaylists;
        });
    }, [user, safeUpdateDoc]);

    // --- REORDENAR TRACKS EN PLAYLIST ---
    const reorderPlaylistTracks = useCallback(async (playlistId, fromIndex, toIndex) => {
        if (!user) return;

        const userRef = doc(db, "users", user.uid);

        setPlaylists(currentPlaylists => {
            const updatedPlaylists = currentPlaylists.map(p => {
                if (p.id === playlistId) {
                    const tracks = [...(p.tracks || [])];
                    const [removed] = tracks.splice(fromIndex, 1);
                    tracks.splice(toIndex, 0, removed);
                    return {
                        ...p,
                        tracks,
                        updatedAt: Date.now()
                    };
                }
                return p;
            });

            safeUpdateDoc(userRef, { playlists: updatedPlaylists }).catch(console.error);
            return updatedPlaylists;
        });
    }, [user, safeUpdateDoc]);

    // --- OBTENER PLAYLIST POR ID ---
    const getPlaylistById = useCallback((playlistId) => {
        return playlists.find(p => p.id === playlistId) || null;
    }, [playlists]);

    // --- DATOS PARA VIBE MATCHING ---
    const getVibeMatchingData = useCallback(() => {
        // Obtener historial del playerContext si está disponible
        const listeningHistory = JSON.parse(localStorage.getItem('paradox_listening_history') || '[]');
        const tasteEngagement = JSON.parse(localStorage.getItem('paradox_taste_engagement') || '{"likedArtists":{},"skippedArtists":{}}');

        return {
            favorites,
            listeningHistory,
            savedArtists,
            savedAlbums,
            playlists,
            tasteEngagement
        };
    }, [favorites, savedArtists, savedAlbums, playlists]);

    // ==========================================================================
    // COMPUTED: Total de items en biblioteca
    // ==========================================================================
    const libraryStats = useMemo(() => ({
        totalSongs: favorites.length,
        totalArtists: savedArtists.length,
        totalAlbums: savedAlbums.length,
        totalPlaylists: playlists.length + savedPlaylists.length,
        totalItems: favorites.length + savedArtists.length + savedAlbums.length + playlists.length + savedPlaylists.length
    }), [favorites, savedArtists, savedAlbums, playlists, savedPlaylists]);

    // ==========================================================================
    // BULK IMPORT FUNCTIONS (Optimized for mass imports - no alerts, skip duplicates)
    // ==========================================================================

    /**
     * Add multiple favorites at once - ROBUSTO + VALIDACIÓN
     * Lee de Firebase, normaliza tracks, valida antes de guardar
     * 
     * @param {Array} tracks - Tracks a añadir como favoritos
     * @param {Object} options - Opciones
     * @returns {Promise<{added: number, skipped: number, invalid: number, success: boolean}>}
     */
    const bulkAddFavorites = useCallback(async (tracks, options = {}) => {
        if (!user) {
            throw new Error('Usuario no autenticado');
        }

        if (!tracks?.length) {
            return { added: 0, skipped: 0, invalid: 0, success: true };
        }

        const userRef = doc(db, "users", user.uid);
        let added = 0;
        let skipped = 0;
        let invalid = 0;

        try {
            // Leer directamente de Firebase para evitar inconsistencias
            const userDoc = await getDoc(userRef);
            const currentFavorites = userDoc.exists() ? (userDoc.data().favorites || []) : [];

            // Filtrar duplicados, normalizar y validar
            const tracksToAdd = [];
            for (const track of tracks) {
                // OBLIGATORIO: Normalizar track
                const normalized = normalizeTrackForSave(track);

                // VALIDACIÓN: Rechazar tracks inválidos
                if (!normalized || !isValidTrack(normalized)) {
                    console.warn('[BulkFavorites] Track inválido descartado:', track?.name || track?.title);
                    invalid++;
                    continue;
                }

                // Check duplicados
                const exists = currentFavorites.some(f =>
                    f.name === normalized.name && f.artist === normalized.artist
                );

                if (exists) {
                    skipped++;
                } else {
                    tracksToAdd.push(normalized);
                    added++;
                }
            }

            if (tracksToAdd.length === 0) {
                console.log(`[BulkImport] Favoritos: 0 añadidos, ${skipped} duplicados, ${invalid} inválidos`);
                return { added: 0, skipped, invalid, success: true };
            }

            // Combinar y guardar
            const updatedFavorites = [...currentFavorites, ...tracksToAdd];

            // Guardar en Firebase y ESPERAR confirmación
            await setDoc(userRef, { favorites: updatedFavorites }, { merge: true });

            // Actualizar estado local DESPUÉS de confirmar
            setFavorites(updatedFavorites);

            console.log(`[BulkImport] ✅ Favoritos: ${added} añadidos, ${skipped} duplicados, ${invalid} inválidos`);

            return { added, skipped, invalid, success: true };

        } catch (error) {
            console.error("[BulkImport] ❌ Error añadiendo favoritos:", error);
            throw error;
        }
    }, [user]);

    /**
     * NUEVO: Crear playlist con tracks en una sola operación atómica
     * Evita el problema de race conditions entre crear y añadir tracks
     * INCLUYE: Normalización y validación obligatoria
     * 
     * @param {string} name - Nombre de la playlist
     * @param {string} description - Descripción
     * @param {Array} tracks - Tracks a añadir
     * @returns {Promise<{id: string, added: number, invalid: number, success: boolean}>}
     */
    const createPlaylistWithTracks = useCallback(async (name, description, tracks) => {
        if (!user) {
            throw new Error('Usuario no autenticado');
        }

        const playlistId = `playlist_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;

        // OBLIGATORIO: Normalizar y validar TODOS los tracks
        const validTracks = [];
        let invalidCount = 0;

        for (let i = 0; i < (tracks || []).length; i++) {
            const track = tracks[i];
            const normalized = normalizeTrackForSave(track);

            if (normalized && isValidTrack(normalized)) {
                validTracks.push({
                    ...normalized,
                    id: `track_${Date.now()}_${i}_${Math.random().toString(36).substring(2, 9)}`
                });
            } else {
                console.warn(`[CreatePlaylist] Track ${i} inválido descartado:`, track?.name || track?.title);
                invalidCount++;
            }
        }

        const newPlaylist = {
            id: playlistId,
            userId: user.uid,
            ownerId: user.uid, // Para compatibilidad con Social
            name,
            title: name,
            description: description || '',
            vibe: null,
            tags: [],
            cover: {
                type: 'gradient',
                colors: [102, 126, 234]
            },
            image: null,
            tracks: validTracks,
            isNative: true,
            isPublic: false, // Por defecto privada
            likesCount: 0,
            createdAt: Date.now(),
            updatedAt: Date.now()
        };

        const userRef = doc(db, "users", user.uid);

        try {
            // Leer playlists actuales
            const userDoc = await getDoc(userRef);
            const currentPlaylists = userDoc.exists() ? (userDoc.data().playlists || []) : [];

            // Añadir nueva playlist con tracks
            const updatedPlaylists = [...currentPlaylists, newPlaylist];

            // Guardar en Firebase atómicamente
            await setDoc(userRef, { playlists: updatedPlaylists }, { merge: true });

            // Actualizar estado local
            setPlaylists(updatedPlaylists);

            console.log(`[Library] ✅ Playlist "${name}" creada con ${validTracks.length} tracks (${invalidCount} inválidos)`);

            return {
                id: playlistId,
                added: validTracks.length,
                invalid: invalidCount,
                success: true
            };

        } catch (error) {
            console.error('[Library] ❌ Error creando playlist con tracks:', error);
            throw new Error(`No se pudo crear la playlist: ${error.message}`, { cause: error });
        }
    }, [user]);

    /**
     * Add multiple tracks to a playlist - ROBUSTO
     * Lee directamente de Firebase, no depende del estado local
     * 
     * @param {string} playlistId - ID de la playlist
     * @param {Array} tracks - Tracks a añadir
     * @param {Object} options - Opciones
     * @returns {Promise<{added: number, skipped: number, success: boolean}>}
     */
    const bulkAddTracksToPlaylist = useCallback(async (playlistId, tracks, options = {}) => {
        if (!user) {
            throw new Error('Usuario no autenticado');
        }

        if (!tracks?.length) {
            return { added: 0, skipped: 0, success: true };
        }

        const userRef = doc(db, "users", user.uid);
        let added = 0;
        let skipped = 0;

        try {
            // IMPORTANTE: Leer directamente de Firebase, NO del estado local
            const userDoc = await getDoc(userRef);
            if (!userDoc.exists()) {
                throw new Error('Documento de usuario no existe');
            }

            const currentPlaylists = userDoc.data().playlists || [];
            const playlistIndex = currentPlaylists.findIndex(p => p.id === playlistId);

            if (playlistIndex === -1) {
                throw new Error(`Playlist no encontrada en Firebase: ${playlistId}`);
            }

            const playlist = currentPlaylists[playlistIndex];
            const existingTracks = playlist.tracks || [];

            // Filtrar duplicados
            const tracksToAdd = [];
            for (const track of tracks) {
                const trackName = track.name || track.title;
                const trackArtist = typeof track.artist === 'object'
                    ? (track.artist.name || track.artist['#text'])
                    : track.artist;

                const exists = existingTracks.some(t =>
                    (t.name === trackName || t.title === trackName) && t.artist === trackArtist
                );

                if (exists) {
                    skipped++;
                } else {
                    tracksToAdd.push({
                        id: `track_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`,
                        name: trackName,
                        title: trackName,
                        artist: trackArtist,
                        image: track.image || '',
                        album: track.album || '',
                        duration: track.duration || 0,
                        addedAt: Date.now()
                    });
                    added++;
                }
            }

            if (tracksToAdd.length === 0) {
                console.log(`[BulkImport] Playlist "${playlist.name}": 0 añadidos, ${skipped} duplicados`);
                return { added: 0, skipped, success: true };
            }

            // Actualizar la playlist con los nuevos tracks
            const updatedPlaylist = {
                ...playlist,
                tracks: [...existingTracks, ...tracksToAdd],
                updatedAt: Date.now()
            };

            // Reemplazar la playlist en el array
            const updatedPlaylists = currentPlaylists.map((p, i) =>
                i === playlistIndex ? updatedPlaylist : p
            );

            // Guardar en Firebase y ESPERAR confirmación
            await setDoc(userRef, { playlists: updatedPlaylists }, { merge: true });

            // Actualizar estado local DESPUÉS de confirmar Firebase
            setPlaylists(updatedPlaylists);

            console.log(`[BulkImport] ✅ Playlist "${playlist.name}": ${added} añadidos, ${skipped} duplicados`);

            return { added, skipped, success: true };

        } catch (error) {
            console.error("[BulkImport] ❌ Error añadiendo tracks a playlist:", error);
            throw error;
        }
    }, [user]);

    /**
     * Add multiple albums at once - ROBUSTO
     */
    const bulkAddAlbums = useCallback(async (albums, options = {}) => {
        if (!user) throw new Error('Usuario no autenticado');
        if (!albums?.length) return { added: 0, skipped: 0, success: true };

        const userRef = doc(db, "users", user.uid);
        let added = 0;
        let skipped = 0;

        try {
            const userDoc = await getDoc(userRef);
            const currentAlbums = userDoc.exists() ? (userDoc.data().savedAlbums || []) : [];

            const albumsToAdd = [];
            for (const album of albums) {
                const albumName = album.name || album.title;
                const albumArtist = typeof album.artist === 'object'
                    ? (album.artist.name || album.artist['#text'])
                    : (album.artist || album.artistName || 'Unknown');

                const exists = currentAlbums.some(a =>
                    a.name?.toLowerCase() === albumName?.toLowerCase() &&
                    a.artist?.toLowerCase() === albumArtist?.toLowerCase()
                );

                if (exists) {
                    skipped++;
                } else {
                    albumsToAdd.push({
                        name: albumName,
                        artist: albumArtist,
                        image: album.image || album.cover_xl || '',
                        trackCount: album.nb_tracks || album.trackCount || album.totalTracks || 0,
                        addedAt: Date.now()
                    });
                    added++;
                }
            }

            if (albumsToAdd.length === 0) {
                return { added: 0, skipped, success: true };
            }

            const updatedAlbums = [...currentAlbums, ...albumsToAdd];
            await setDoc(userRef, { savedAlbums: updatedAlbums }, { merge: true });
            setSavedAlbums(updatedAlbums);

            console.log(`[BulkImport] ✅ Álbumes: ${added} añadidos, ${skipped} duplicados`);
            return { added, skipped, success: true };

        } catch (error) {
            console.error("[BulkImport] ❌ Error añadiendo álbumes:", error);
            throw error;
        }
    }, [user]);

    /**
     * Add multiple artists at once - ROBUSTO
     */
    const bulkAddArtists = useCallback(async (artists, options = {}) => {
        if (!user) throw new Error('Usuario no autenticado');
        if (!artists?.length) return { added: 0, skipped: 0, success: true };

        const userRef = doc(db, "users", user.uid);
        let added = 0;
        let skipped = 0;

        try {
            const userDoc = await getDoc(userRef);
            const currentArtists = userDoc.exists() ? (userDoc.data().savedArtists || []) : [];

            const artistsToAdd = [];
            for (const artist of artists) {
                const artistName = typeof artist === 'string' ? artist : (artist.name || artist.title);

                const exists = currentArtists.some(a =>
                    a.name?.toLowerCase() === artistName?.toLowerCase()
                );

                if (exists) {
                    skipped++;
                } else {
                    artistsToAdd.push({
                        name: artistName,
                        image: typeof artist === 'object' ? (artist.image || artist.picture_xl || '') : '',
                        followers: typeof artist === 'object' ? (artist.nb_fan || artist.followers || 0) : 0,
                        addedAt: Date.now()
                    });
                    added++;
                }
            }

            if (artistsToAdd.length === 0) {
                return { added: 0, skipped, success: true };
            }

            const updatedArtists = [...currentArtists, ...artistsToAdd];
            await setDoc(userRef, { savedArtists: updatedArtists }, { merge: true });
            setSavedArtists(updatedArtists);

            console.log(`[BulkImport] ✅ Artistas: ${added} añadidos, ${skipped} duplicados`);
            return { added, skipped, success: true };

        } catch (error) {
            console.error("[BulkImport] ❌ Error añadiendo artistas:", error);
            throw error;
        }
    }, [user]);

    // ==========================================================================
    // ONBOARDING FUNCTIONS
    // ==========================================================================

    /**
     * Marca el onboarding como completado para el usuario actual
     * @returns {Promise<boolean>} true si se guardó correctamente
     */
    const completeOnboarding = useCallback(async () => {
        if (!user) return false;

        const userRef = doc(db, "users", user.uid);

        try {
            await setDoc(userRef, { onboardingCompleted: true }, { merge: true });
            setOnboardingCompleted(true);
            console.log('[UserContext] ✅ Onboarding completado');
            return true;
        } catch (error) {
            console.error('[UserContext] ❌ Error completando onboarding:', error);
            return false;
        }
    }, [user]);

    /**
     * Función combinada para guardar artistas del onboarding
     * Wrapper de bulkAddArtists con mejor formato para el onboarding
     * @param {Array} artists - Lista de artistas seleccionados en el onboarding
     * @returns {Promise<Object>} Resultado de la operación
     */
    const bulkSaveArtists = useCallback(async (artists) => {
        if (!user) throw new Error('Usuario no autenticado');
        if (!artists?.length) return { added: 0, skipped: 0, success: true };

        // Formatear artistas para el formato esperado por bulkAddArtists
        const formattedArtists = artists.map(artist => ({
            name: artist.name,
            image: artist.image || '',
            followers: artist.fans || artist.followers || 0
        }));

        return await bulkAddArtists(formattedArtists);
    }, [user, bulkAddArtists]);



    // Memoize the context value to prevent unnecessary re-renders
    const value = useMemo(() => ({
        user,
        loading,
        // Canciones favoritas
        favorites,
        toggleFavorite,
        isFavorite,
        // Artistas guardados
        savedArtists,
        toggleSaveArtist,
        isArtistSaved,
        // Álbumes guardados
        savedAlbums,
        toggleSaveAlbum,
        isAlbumSaved,
        // Playlists externas guardadas
        savedPlaylists,
        toggleSavePlaylist,
        isPlaylistSaved,
        // Playlists creadas por el usuario
        playlists,
        createPlaylist,
        createPlaylistWithTracks,
        deletePlaylist,
        addTrackToPlaylist,
        removeTrackFromPlaylist,
        updatePlaylist,
        reorderPlaylistTracks,
        getPlaylistById,
        getVibeMatchingData,
        // Stats
        libraryStats,
        // Bulk import functions
        bulkAddFavorites,
        bulkAddTracksToPlaylist,
        bulkAddAlbums,
        bulkAddArtists,
        // Onboarding
        onboardingCompleted,
        completeOnboarding,
        bulkSaveArtists
    }), [
        user, loading,
        favorites, toggleFavorite, isFavorite,
        savedArtists, toggleSaveArtist, isArtistSaved,
        savedAlbums, toggleSaveAlbum, isAlbumSaved,
        savedPlaylists, toggleSavePlaylist, isPlaylistSaved,
        playlists, createPlaylist, createPlaylistWithTracks, deletePlaylist, addTrackToPlaylist, removeTrackFromPlaylist, updatePlaylist, reorderPlaylistTracks, getPlaylistById, getVibeMatchingData,
        libraryStats,
        bulkAddFavorites, bulkAddTracksToPlaylist, bulkAddAlbums, bulkAddArtists,
        onboardingCompleted, completeOnboarding, bulkSaveArtists
    ]);

    return <UserContext.Provider value={value}>{children}</UserContext.Provider>;
};

