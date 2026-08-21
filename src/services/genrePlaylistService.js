import { doc, getDoc, getDocs, collection, query, where, limit } from "firebase/firestore";
import { db } from "../firebase/config";

const CACHE = new Map();
const CACHE_TTL = 1000 * 60 * 60; // 1 hora

const isCacheValid = (key) => {
    const item = CACHE.get(key);
    return item && (Date.now() - item.timestamp < CACHE_TTL);
};

export const isGenrePlaylistId = (id) => {
    return typeof id === 'string' && (id.startsWith('genre_') || id.includes('genre-'));
};

export const getGenrePlaylist = async (id) => {
    if (!id) return null;

    // Check cache
    if (isCacheValid(id)) {
        return CACHE.get(id).data;
    }

    try {
        // Intentar obtener de Firestore
        // Asumimos que la colección se llama "genre_playlists"
        // Si el ID tiene prefijo "genre_", lo usamos tal cual, o intentamos buscarlo

        // Estrategia 1: Doc directo
        const docRef = doc(db, "genre_playlists", id);
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
            const data = { id: docSnap.id, ...docSnap.data() };
            CACHE.set(id, { timestamp: Date.now(), data });
            return data;
        }

        // Estrategia 2: Buscar por campo 'slug' o similar si el ID no match
        // (Opcional, pero robusto)

        return null;
    } catch (error) {
        console.error(`[GenrePlaylistService] Error fetching playlist ${id}:`, error);
        return null;
    }
};

export const getGenrePlaylistByName = async (name) => {
    if (!name) return null;
    const cacheKey = `name_search_${name.toLowerCase()}`;

    if (isCacheValid(cacheKey)) {
        return CACHE.get(cacheKey).data;
    }

    try {
        const q = query(
            collection(db, "genre_playlists"),
            where("name", "==", name),
            limit(1)
        );
        const querySnapshot = await getDocs(q);

        if (!querySnapshot.empty) {
            const doc = querySnapshot.docs[0];
            const data = { id: doc.id, ...doc.data() };
            CACHE.set(cacheKey, { timestamp: Date.now(), data });
            CACHE.set(data.id, { timestamp: Date.now(), data }); // Cache también por ID
            return data;
        }

        return null;
    } catch (error) {
        console.error(`[GenrePlaylistService] Error searching playlist by name ${name}:`, error);
        return null;
    }
};

export const getAllGenrePlaylists = async () => {
    const cacheKey = 'all_genres';
    if (isCacheValid(cacheKey)) {
        return CACHE.get(cacheKey).data;
    }

    try {
        const q = query(collection(db, "genre_playlists"), limit(50));
        const querySnapshot = await getDocs(q);

        const playlists = querySnapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));

        CACHE.set(cacheKey, { timestamp: Date.now(), data: playlists });
        return playlists;
    } catch (error) {
        console.error("[GenrePlaylistService] Error fetching all genres:", error);
        return [];
    }
};
