/**
 * UNIFIED MUSIC SERVICE 2025
 * REFACTORIZADO: Frontend ORQUESTA, Backend DECIDE
 * 
 * El frontend NO busca, NO filtra, NO puntúa, NO elige calidad.
 * Solo pide al backend y reproduce lo que el backend decide.
 */

import { AuthService } from './authService';
import { CONFIG } from './config';

// =============================================================================
// UTILIDADES DE LIMPIEZA Y NORMALIZACIÓN (para metadatos UI, NO para decisiones)
// =============================================================================

/**
 * ⚠️ IMPORTANTE:
 * cleanMetadata es SOLO para UI / lyrics / metadata display.
 * NUNCA debe usarse para resolver audio ni construir queries de búsqueda.
 * El backend maneja toda la lógica de matching y limpieza de audio.
 */
const cleanMetadata = (str, aggressive = false) => {
    if (!str) return "";
    let s = str.toString().toLowerCase();

    // FIX: Preservar '&' para nombres como "Joey Bada$$ & ..."
    s = s.replace(/\+/g, " ");

    s = s.replace(/\[.*?\]/g, "")
        .replace(/\((feat|ft|featuring|remaster|mix|version|edit|live|official|video|audio|lyric).*?\)/gi, "")
        .replace(/\b(official|video|audio|lyrics|letra|hd|hq|4k|remastered|remaster)\b/gi, "");

    if (aggressive) {
        s = s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    }

    // FIX: Permitir caracteres especiales (@, &, $, !, ., -) para artistas con nombres estilizados
    return s.replace(/[^a-z0-9áéíóúñü .\-@&$!]/g, " ").replace(/\s+/g, " ").trim();
};

const parseDurationToSeconds = (duration) => {
    if (!duration) return 0;
    if (typeof duration === 'number') return duration;
    if (typeof duration === 'string') {
        if (duration.includes(':')) {
            const parts = duration.split(':').map(Number);
            if (parts.length === 2) return (parts[0] * 60) + parts[1];
            if (parts.length === 3) return (parts[0] * 3600) + (parts[1] * 60) + parts[2];
        }
        return parseInt(duration) || 0;
    }
    return 0;
};

// =============================================================================
// DEEZER CLIENT - Para metadatos UI (charts, búsquedas, artistas, álbumes)
// =============================================================================

const DeezerClient = {
    async _fetch(endpoint) {
        const proxyUrl = `${CONFIG.CORS_PROXIES[0]}${encodeURIComponent(endpoint)}`;
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 10000);
            const res = await fetch(proxyUrl, { signal: controller.signal });
            clearTimeout(timeoutId);
            if (!res.ok) return { data: [] };
            const data = await res.json();
            if (data.error) return { data: [] };
            return data;
        } catch (e) {
            console.warn('[DeezerClient] Proxy error:', e.message);
            return { data: [] };
        }
    },

    _mapTrack(dt) {
        if (!dt) return null;
        return {
            id: dt.id,
            name: dt.title,
            artist: dt.artist?.name || "Desconocido",
            album: dt.album?.title || "Sencillo",
            image: dt.album?.cover_medium || dt.album?.cover_big || dt.artist?.picture_medium,
            duration: dt.duration,
            preview: dt.preview,
            link: dt.link
        };
    },

    _mapPlaylist(pl) {
        if (!pl) return null;
        return {
            id: pl.id,
            name: pl.title,
            creator: pl.user?.name || 'Deezer',
            image: pl.picture_medium || pl.picture_big || pl.picture_medium,
            trackCount: pl.nb_tracks,
            link: pl.link
        };
    },

    async searchGlobal(query, type = 'track', limit = 15) {
        if (!query) return [];
        // [MOD] NO CLEAN: Usar query cruda del usuario. El backend/Deezer sabe buscar.
        const q = query;
        const data = await this._fetch(`/search/${type}?q=${encodeURIComponent(q)}&limit=${limit}`);
        return data?.data || [];
    },

    async getChart(type = 'tracks', limit = 20) {
        const data = await this._fetch(`/chart/0/${type}?limit=${limit}`);
        if (type === 'playlists') return data?.data ? data.data.map(this._mapPlaylist) : [];
        if (type === 'artists') return data?.data ? data.data.map(r => ({ name: r.name, image: r.picture_medium })) : [];
        return data?.data ? data.data.map(this._mapTrack) : [];
    },

    async getPlaylistDetails(playlistId) {
        const data = await this._fetch(`/playlist/${playlistId}`);
        if (!data || data.error) return null;
        return {
            ...this._mapPlaylist(data),
            description: data.description || "",
            tracks: data.tracks?.data ? data.tracks.data.map(this._mapTrack) : []
        };
    },

    async getArtistTop(artistId, limit = 20) {
        let id = artistId;
        if (isNaN(id)) {
            const search = await this.searchGlobal(artistId, 'artist', 1);
            if (!search[0]) return [];
            id = search[0].id;
        }
        const top = await this._fetch(`/artist/${id}/top?limit=${limit}`);
        return top?.data ? top.data.map(this._mapTrack) : [];
    },

    async getArtistInfo(artistName) {
        if (!artistName) return null;

        const searchResults = await this.searchGlobal(artistName, 'artist', 5);
        if (!searchResults || searchResults.length === 0) return null;

        // [MOD] NO VALIDATION: Aceptamos el mejor match que Deezer nos de.
        const bestMatch = searchResults[0];

        const artistData = await this._fetch(`/artist/${bestMatch.id}`);
        if (!artistData || artistData.error) return null;

        return {
            id: artistData.id,
            name: artistData.name,
            image: artistData.picture_medium || artistData.picture_big || artistData.picture_medium,
            fans: artistData.nb_fan,
            albumCount: artistData.nb_album,
            link: artistData.link
        };
    },

    async getRelatedArtists(artistIdOrName, limit = 10) {
        let artistId = artistIdOrName;
        if (isNaN(artistIdOrName)) {
            const artistInfo = await this.getArtistInfo(artistIdOrName);
            if (!artistInfo) return [];
            artistId = artistInfo.id;
        }

        const data = await this._fetch(`/artist/${artistId}/related?limit=${limit}`);
        if (!data?.data) return [];

        return data.data.map(r => ({
            id: r.id,
            name: r.name,
            image: r.picture_medium || r.picture_big || r.picture_medium,
            fans: r.nb_fan
        }));
    },

    async getArtistAlbums(artistIdOrName, limit = 50) {
        let artistId = artistIdOrName;

        if (isNaN(artistIdOrName)) {
            const artistInfo = await this.getArtistInfo(artistIdOrName);
            if (!artistInfo) {
                console.warn(`[DeezerClient] Artist not found: "${artistIdOrName}"`);
                return [];
            }
            artistId = artistInfo.id;
        }

        const data = await this._fetch(`/artist/${artistId}/albums?limit=${limit}`);
        if (!data?.data) return [];

        return data.data.map(album => ({
            id: album.id,
            name: album.title,
            artist: artistIdOrName,
            artistId: artistId,
            image: album.cover_medium || album.cover_big || album.cover_medium,
            releaseDate: album.release_date,
            trackCount: album.nb_tracks || null,
            fans: album.fans,
            recordType: album.record_type || 'album',
            type: album.record_type === 'ep' ? 'EP' :
                album.record_type === 'single' ? 'Single' : 'Álbum',
            explicit: album.explicit_lyrics || false,
            tracklist: album.tracklist
        }));
    },

    async getAlbumDetails(albumIdOrName, artistName = '') {
        let albumId = albumIdOrName;

        if (isNaN(albumIdOrName)) {
            if (artistName) {
                const artistInfo = await this.getArtistInfo(artistName);
                if (artistInfo) {
                    const artistAlbums = await this.getArtistAlbums(artistInfo.id, 100);
                    const normalizedAlbumName = albumIdOrName.toLowerCase().trim();

                    const exactAlbumMatch = artistAlbums.find(a =>
                        a.name.toLowerCase().trim() === normalizedAlbumName
                    );

                    if (exactAlbumMatch) {
                        albumId = exactAlbumMatch.id;
                    }
                }
            }

            if (isNaN(albumId)) {
                const searchQuery = artistName ? `${artistName} ${albumIdOrName}` : albumIdOrName;
                const searchResults = await this.searchGlobal(searchQuery, 'album', 10);

                if (!searchResults || searchResults.length === 0) {
                    console.warn(`[DeezerClient] Album not found: "${albumIdOrName}"`);
                    return null;
                }

                const normalizedAlbumName = albumIdOrName.toLowerCase().trim();
                const normalizedArtistName = artistName.toLowerCase().trim();

                const exactMatch = searchResults.find(a => {
                    const albumNameMatch = a.title.toLowerCase().trim() === normalizedAlbumName;
                    const artistMatch = !artistName ||
                        a.artist?.name?.toLowerCase().trim() === normalizedArtistName ||
                        a.artist?.name?.toLowerCase().includes(normalizedArtistName) ||
                        normalizedArtistName.includes(a.artist?.name?.toLowerCase() || '');
                    return albumNameMatch && artistMatch;
                });

                const bestMatch = exactMatch || searchResults[0];

                if (!exactMatch) {
                    const matchTitle = bestMatch.title.toLowerCase();
                    if (!matchTitle.includes(normalizedAlbumName) && !normalizedAlbumName.includes(matchTitle)) {
                        console.warn(`[DeezerClient] No exact album match for "${albumIdOrName}" by "${artistName}"`);
                        return null;
                    }
                }

                albumId = bestMatch.id;
            }
        }

        const albumData = await this._fetch(`/album/${albumId}`);
        if (!albumData || albumData.error) {
            console.warn(`[DeezerClient] Failed to fetch album ${albumId}`);
            return null;
        }

        const tracks = (albumData.tracks?.data || [])
            .sort((a, b) => (a.track_position || 0) - (b.track_position || 0))
            .map((track, index) => ({
                id: track.id,
                name: track.title || track.title_short,
                artist: track.artist?.name || albumData.artist?.name,
                album: albumData.title,
                albumId: albumData.id,
                image: albumData.cover_medium || albumData.cover_big,
                duration: track.duration,
                trackNumber: track.track_position || (index + 1),
                diskNumber: track.disk_number || 1,
                preview: track.preview,
                explicit: track.explicit_lyrics || false,
                isrc: track.isrc,
                rank: track.rank
            }));

        return {
            id: albumData.id,
            name: albumData.title,
            artist: albumData.artist?.name,
            artistId: albumData.artist?.id,
            image: albumData.cover_medium || albumData.cover_big || albumData.cover_medium,
            releaseDate: albumData.release_date,
            trackCount: albumData.nb_tracks,
            duration: albumData.duration,
            fans: albumData.fans,
            recordType: albumData.record_type || 'album',
            type: albumData.record_type === 'ep' ? 'EP' :
                albumData.record_type === 'single' ? 'Single' : 'Álbum',
            explicit: albumData.explicit_lyrics || false,
            label: albumData.label,
            genres: albumData.genres?.data?.map(g => g.name) || [],
            tracks: tracks
        };
    }
};

// =============================================================================
// AUDIO ENGINE - CONTRATO FINAL: Determinista, Predecible, Sin Throws
// =============================================================================

/**
 * Helper centralizado para errores - UNA sola función
 * Todas las salidas "unavailable" pasan por aquí
 */
function unavailable(trackInfo, reason) {
    return {
        status: "unavailable",
        track: {
            id: trackInfo?.id || null,
            title: trackInfo?.title || trackInfo?.name || '',
            artist: trackInfo?.artist || ''
        },
        reason
    };
}

/**
 * ========================================================================
 * CONTRATO FORMAL: UnifiedService → PlayerContext
 * ========================================================================
 *
 * ✅ CASO ÉXITO:
 * {
 *   status: "ok",
 *   track: { id, title, artist, duration },
 *   audio: { url, bitrate, source },
 *   confidence: number (0-1)
 * }
 *
 * ❌ CASO FALLIDO (definitivo):
 * {
 *   status: "unavailable",
 *   track: { id, title, artist },
 *   reason: "NO_MATCH" | "NO_STREAM" | "LOW_CONFIDENCE" | "BACKEND_ERROR" | "INVALID_TRACK" | "TIMEOUT"
 * }
 *
 * 🔒 GARANTÍAS:
 * - NUNCA throw
 * - NUNCA null
 * - NUNCA undefined
 * - Siempre {status: ...}
 * ========================================================================
 */
const audioUrlCache = new Map();
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hora en memoria RAM

async function fetchAudioUrl(artistOrTrack, title, duration) {
    // Normalizar entrada
    const isTrackObject = typeof artistOrTrack === 'object' && artistOrTrack !== null;
    const track = isTrackObject
        ? artistOrTrack
        : { artist: artistOrTrack, title, duration };

    // Construir objeto track normalizado
    const trackInfo = {
        id: track.id || null,
        title: track.title || track.name || '',
        artist: track.artist || '',
        duration: parseDurationToSeconds(track.duration)
    };

    // 0. CACHÉ EN MEMORIA (Instantánea)
    // Evita round-trips al servidor para tracks recientes
    const cacheKey = `${trackInfo.artist}|${trackInfo.title}|${trackInfo.duration}`.toLowerCase();
    const cached = audioUrlCache.get(cacheKey);
    if (cached) {
        if (Date.now() - cached.timestamp < CACHE_TTL_MS) {
            console.log(`[UnifiedService] ⚡ MEMORY CACHE HIT: ${trackInfo.title}`);
            return cached.data;
        } else {
            audioUrlCache.delete(cacheKey);
        }
    }

    // ═══════════════════════════════════════════════════════════════════
    // 1. VALIDACIÓN - Track inválido
    // ═══════════════════════════════════════════════════════════════════
    if (!trackInfo.artist || !trackInfo.title) {
        console.warn('[UnifiedService] ⚠️ Track inválido:', trackInfo);
        return unavailable(trackInfo, "INVALID_TRACK");
    }

    const BACKEND = CONFIG.MUSIC_API_URL;
    console.log(`[UnifiedService] 🎵 Solicitando: "${trackInfo.artist} - ${trackInfo.title}"`);

    // Detectar modo Ahorro de Datos (Mobile)
    const saveData = (navigator.connection && navigator.connection.saveData === true) ? 'on' : 'off';
    if (saveData === 'on') console.log('[UnifiedService] 📱 Modo Ahorro de Datos detectado');

    // ═══════════════════════════════════════════════════════════════
    // 2. ESTRATEGIA PARALELA (Race) - El primero que responda GANA
    //    Lanza Index e Instant-Play simultáneamente
    // ═══════════════════════════════════════════════════════════════

    // --- Promesa A: ÍNDICE (rápido si está cacheado) ---
    const tryIndex = async () => {
        const indexQuery = `${trackInfo.artist} ${trackInfo.title}`;
        const indexUrl = `${BACKEND}/api/search?q=${encodeURIComponent(indexQuery)}&limit=1`;

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 1500); // 1.5s máximo

        try {
            const res = await fetch(indexUrl, { signal: controller.signal });
            clearTimeout(timeout);

            if (!res.ok) throw new Error('Index failed');

            const data = await res.json();
            if (!data.results?.length) throw new Error('No results');

            const hit = data.results[0];
            const song = hit.canonical ? hit.canonical.song : hit.song;

            if (!song?.sourceId) throw new Error('No sourceId');

            // Obtener stream para el videoId del índice
            const streamUrl = `${BACKEND}/api/youtube-streams?videoId=${song.sourceId}&confidence=1.0`;
            const streamCtrl = new AbortController();
            const streamTimeout = setTimeout(() => streamCtrl.abort(), 2000); // 2s

            const streamRes = await fetch(streamUrl, {
                signal: streamCtrl.signal,
                headers: { 'save-data': saveData }
            });
            clearTimeout(streamTimeout);

            if (!streamRes.ok) throw new Error('Stream failed');

            const streamData = await streamRes.json();
            if (!streamData?.audioStreams?.length) throw new Error('No streams');

            const bestStream = streamData.audioStreams[0];
            const audioUrl = bestStream?.url || (typeof bestStream === 'string' ? bestStream : null);

            if (!audioUrl) throw new Error('No URL');

            console.log(`[UnifiedService] ⚡ INDEX WIN: "${song.title}"`);
            return {
                status: "ok",
                track: trackInfo,
                audio: { url: audioUrl, bitrate: bestStream.bitrate || 128, source: "index" },
                confidence: 1.0
            };
        } catch (e) {
            clearTimeout(timeout);
            throw e; // Propagar para que Promise.any lo ignore
        }
    };

    // --- Promesa B: INSTANT-PLAY (siempre disponible) ---
    const tryInstantPlay = async () => {
        const instantPlayUrl = `${BACKEND}/api/instant-play?artist=${encodeURIComponent(
            trackInfo.artist
        )}&track=${encodeURIComponent(trackInfo.title)}`;

        const controller = new AbortController();
        // TURBO: Solo 4s para instant-play
        const timeout = setTimeout(() => controller.abort(), 4000);

        try {
            const res = await fetch(instantPlayUrl, {
                signal: controller.signal,
                headers: { 'save-data': saveData }
            });
            clearTimeout(timeout);

            if (!res.ok) throw new Error('Instant-play failed');

            const data = await res.json();
            if (!data?.audioUrl) throw new Error('No audioUrl');

            console.log(`[UnifiedService] ⚡ INSTANT-PLAY WIN`);
            return {
                status: "ok",
                track: trackInfo,
                audio: { url: data.audioUrl, bitrate: 128, source: "youtube" },
                confidence: data.confidence ?? 0.8
            };
        } catch (e) {
            clearTimeout(timeout);
            throw e;
        }
    };

    // --- CARRERA: El primero que tenga éxito gana ---
    try {
        const result = await Promise.any([tryIndex(), tryInstantPlay()]);

        // Guardar en caché
        audioUrlCache.set(cacheKey, { timestamp: Date.now(), data: result });

        return result;
    } catch (aggregateError) {
        // Ambos fallaron
        console.warn(`[UnifiedService] ⚠️ NO_MATCH: ${trackInfo.artist} - ${trackInfo.title}`);
        return unavailable(trackInfo, "NO_MATCH");
    }
}

// =============================================================================
// LYRICS & METADATA (Sin cambios - son para UI)
// =============================================================================

const LyricsEngine = {
    async getLyrics(artist, title) {
        try {
            const cleanT = cleanMetadata(title, true);
            const cleanA = cleanMetadata(artist, true);
            const url = `${CONFIG.LYRICS_API_URL}/get?artist_name=${encodeURIComponent(cleanA)}&track_name=${encodeURIComponent(cleanT)}`;
            const res = await fetch(url);
            if (!res.ok) throw new Error("Not found");
            const data = await res.json();
            return { plainLyrics: data.plainLyrics, syncedLyrics: data.syncedLyrics, instrumental: data.instrumental };
        } catch (e) {
            return this.searchLyricsFallback(artist, title);
        }
    },

    async searchLyricsFallback(artist, title) {
        try {
            const q = `${artist} ${title}`;
            const res = await fetch(`${CONFIG.LYRICS_API_URL}/search?q=${encodeURIComponent(q)}`);
            const data = await res.json();
            if (Array.isArray(data) && data.length > 0) {
                return { plainLyrics: data[0].plainLyrics, syncedLyrics: data[0].syncedLyrics };
            }
            return null;
        } catch (e) { return null; }
    }
};

const CanonicalCore = {
    async getCanonicalTrack(artist, title) {
        try {
            const query = `${artist} ${title}`;
            const url = `${CONFIG.ITUNES_API_URL}?term=${encodeURIComponent(query)}&media=music&entity=song&limit=1`;

            // Timeout corto - esto es solo para metadatos, no crítico
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 2000);

            const res = await fetch(url, {
                signal: controller.signal,
                redirect: 'error' // Evitar redirecciones a protocolos inválidos
            });
            clearTimeout(timeout);

            if (!res.ok) return { found: false };

            const data = await res.json();
            if (data.resultCount > 0) {
                const track = data.results[0];
                return {
                    found: true,
                    officialName: track.trackName,
                    officialArtist: track.artistName,
                    officialAlbum: track.collectionName,
                    duration: track.trackTimeMillis / 1000,
                    coverHd: track.artworkUrl100?.replace('100x100bb', '800x800bb') || null,
                    isExplicit: track.trackExplicitness === 'explicit'
                };
            }
        } catch (e) {
            // Silenciar errores de iTunes - no es crítico
        }
        return { found: false };
    }
};

const MetadataCore = {
    async getHighResCover(trackName, artistName) {
        const canonical = await CanonicalCore.getCanonicalTrack(artistName, trackName);
        if (canonical.found && canonical.coverHd) return canonical.coverHd;
        try {
            const query = `artist:"${cleanMetadata(artistName, false)}" AND recording:"${cleanMetadata(trackName, false)}"`;
            const res = await fetch(`${CONFIG.MB_API_URL}/recording?query=${encodeURIComponent(query)}&limit=1&fmt=json`, {
                headers: { 'User-Agent': 'MusicApp/2.0' }
            });
            const data = await res.json();
            const release = data.recordings?.[0]?.releases?.[0];
            if (release?.id) return `${CONFIG.CAA_API_URL}/release/${release.id}/front-500`;
        } catch (e) { }
        return null;
    }
};

// =============================================================================
// API PÚBLICA
// =============================================================================

// ⭐ AUDIO - API única con contrato formal
export { fetchAudioUrl };

// Lyrics
export const fetchLyrics = (artist, title) => LyricsEngine.getLyrics(artist, title);

// Deezer - Imágenes y metadatos
export const getDeezerTrackImage = async (track, artist) => {
    const hdCover = await MetadataCore.getHighResCover(track, artist);
    if (hdCover) return hdCover;
    const results = await DeezerClient.searchGlobal(`${track} ${artist}`, 'track', 1);
    if (results[0]) return results[0].image;
    return null;
};

// Charts
export const chartGetTopTracks = async ({ limit = 50 }) => {
    const tracks = await DeezerClient.getChart('tracks', limit);
    return { tracks: { track: tracks } };
};

export const chartGetTopPlaylists = async ({ limit = 20 }) => {
    // DESACTIVADO POR USUARIO: Solo mostrar playlists nativas de la app
    return { playlists: { playlist: [] } };
};

export const chartGetTopArtists = async ({ limit = 50 }) => {
    const artists = await DeezerClient.getChart('artists', limit);
    return { artists: { artist: artists } };
};

// Búsquedas
export const trackSearch = async ({ track, limit }) => {
    const rawData = await DeezerClient.searchGlobal(track, 'track', limit);
    return { results: { trackmatches: { track: rawData.map(DeezerClient._mapTrack) } } };
};

export const artistSearch = async ({ artist, limit }) => {
    const rawData = await DeezerClient.searchGlobal(artist, 'artist', limit);
    return {
        results: {
            artistmatches: {
                artist: rawData.map(r => ({ name: r.name, image: [{ '#text': r.picture_medium, size: 'extralarge' }] }))
            }
        }
    };
};

export const albumSearch = async ({ album, limit }) => {
    const rawData = await DeezerClient.searchGlobal(album, 'album', limit);
    return {
        results: {
            albummatches: {
                album: rawData.map(r => ({ name: r.title, artist: r.artist?.name, image: [{ '#text': r.cover_medium, size: 'extralarge' }] }))
            }
        }
    };
};

export const playlistSearch = async ({ query, limit }) => {
    // DESACTIVADO POR USUARIO: No buscar playlists de Deezer
    return { results: { playlistmatches: { playlist: [] } } };
};

export const playlistGetInfo = async ({ id }) => await DeezerClient.getPlaylistDetails(id);

export const artistGetTopTracks = async ({ artist, limit = 10 }) => {
    const tracks = await DeezerClient.getArtistTop(artist, limit);
    return { toptracks: { track: tracks } };
};

export const tagGetTopTracks = async ({ tag, limit = 50 }) => {
    const raw = await DeezerClient.searchGlobal(tag, 'track', limit);
    return { tracks: { track: raw.map(DeezerClient._mapTrack) } };
};

// Auth
export const authGetSession = async () => {
    const user = AuthService.getCurrentUser();
    return { session: { key: user?.uid || "guest", name: user?.displayName || user?.email || "Invitado" } };
};

export const userGetInfo = async () => {
    const user = AuthService.getCurrentUser();
    return { user: { name: user?.displayName || "Invitado", image: [{ '#text': user?.photoURL || "" }] } };
};

// API de datos exactos - Para ArtistDetail y AlbumDetail
export const getArtistInfo = (artistName) => DeezerClient.getArtistInfo(artistName);
export const getArtistAlbums = (artistIdOrName, limit) => DeezerClient.getArtistAlbums(artistIdOrName, limit);
export const getRelatedArtists = (artistIdOrName, limit) => DeezerClient.getRelatedArtists(artistIdOrName, limit);
export const getAlbumDetails = (albumIdOrName, artistName) => DeezerClient.getAlbumDetails(albumIdOrName, artistName);

// Búsqueda global - Para playlists nativas y otros usos
export const searchGlobal = (query, type, limit) => DeezerClient.searchGlobal(query, type, limit);
