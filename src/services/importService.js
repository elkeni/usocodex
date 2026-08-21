/**
 * IMPORT SERVICE v3.0 - PRECISION-FIRST
 * Sistema de importación robusto con metadata completa garantizada
 *
 * PRINCIPIOS:
 * 1. Cada track DEBE tener: title, artist (no vacío), album (no vacío)
 * 2. Spotify = verdad absoluta (no buscar en YouTube para metadata)
 * 3. YouTube = "Single" como álbum por defecto, channelTitle como fallback de artista
 * 4. Preferir "no match" antes que "match incorrecto"
 * 5. Validación estricta antes de cualquier guardado
 *
 * @version 3.0.0
 * @date 2025-12-17
 */

import { BACKEND_URL } from './config';
import { ImportResult, Album, Artist } from '../models/dataModels';
// EntityCollection imported for JSDoc reference only

// =============================================================================
// CONSTANTS
// =============================================================================

// Spotify OAuth Configuration (PKCE Flow - Client-side only)
const SPOTIFY_CONFIG = {
    CLIENT_ID: process.env.REACT_APP_SPOTIFY_CLIENT_ID || '',
    REDIRECT_URI: `${window.location.origin}/import`,
    SCOPES: [
        'user-library-read',
        'playlist-read-private',
        'playlist-read-collaborative',
        'user-follow-read'
    ].join(' '),
    AUTH_URL: 'https://accounts.spotify.com/authorize',
    TOKEN_URL: 'https://accounts.spotify.com/api/token',
    API_BASE: 'https://api.spotify.com/v1'
};

// Match status constants
const MATCH_STATUS = {
    MATCHED: 'matched',       // Exact or high-confidence match
    PARTIAL: 'partial',       // Low-confidence match, needs review
    NOT_FOUND: 'not_found'    // Could not match
};

// Import phases for progress tracking
const IMPORT_PHASES = {
    FETCHING: 'fetching',
    PARSING: 'parsing',
    MATCHING: 'matching',
    PERSISTING: 'persisting',
    COMPLETED: 'completed',
    ERROR: 'error'
};

// =============================================================================
// TRACK NORMALIZATION & VALIDATION (NEW)
// =============================================================================

/**
 * Normaliza un track importado a formato estándar
 * GARANTIZA: title, artist, album siempre presentes
 * 
 * @param {Object} raw - Track crudo de la fuente
 * @param {string} source - 'spotify' | 'youtube'
 * @returns {Object} Track normalizado
 */
function normalizeImportedTrack(raw, source) {
    if (!raw) return null;

    const normalized = {
        // === Identificación ===
        id: raw.id || null,
        originalId: raw.originalId || raw.id || null,
        isrc: raw.isrc || null,
        source: source,

        // === Metadata principal (OBLIGATORIA) ===
        title: _cleanTitle(raw.title || raw.name || 'Unknown Track'),
        artist: _cleanArtist(raw.artist || raw.artistName || raw.artists?.join(', ') || ''),
        album: _cleanAlbum(raw.album || raw.albumName || '', source),

        // === Metadata secundaria ===
        duration: typeof raw.duration === 'number' ? raw.duration : 0,
        image: raw.image || raw.thumbnail || '',

        // === Match info ===
        matchStatus: raw.matchStatus || null,
        matchConfidence: raw.matchConfidence || 0,
        matchedTrack: raw.matchedTrack || null,
        needsReview: false,

        // === Timestamps ===
        importedAt: Date.now(),
        importContext: raw.importContext || 'unknown'
    };

    // === VALIDACIÓN DE ARTISTA ===
    if (!normalized.artist || normalized.artist.trim() === '') {
        if (source === 'youtube') {
            // Para YouTube, usar channelTitle como fallback
            normalized.artist = raw.channelTitle || raw.author?.name || 'Unknown Artist';
            normalized.needsReview = true;
            console.log(`[Normalize] YouTube track sin artista, usando channelTitle: "${normalized.title}" → "${normalized.artist}"`);
        } else {
            normalized.artist = 'Unknown Artist';
            normalized.needsReview = true;
            console.log(`[Normalize] Track sin artista: "${normalized.title}"`);
        }
    }

    // === VALIDACIÓN DE ÁLBUM ===
    if (!normalized.album || normalized.album.trim() === '') {
        if (source === 'youtube') {
            normalized.album = 'Single';
        } else if (source === 'spotify') {
            normalized.album = 'Unknown Album';
            normalized.needsReview = true;
            console.log(`[Normalize] Spotify track sin álbum: "${normalized.title}"`);
        } else {
            normalized.album = 'Unknown Album';
        }
    }

    return normalized;
}

/**
 * Limpia y normaliza el título
 */
function _cleanTitle(title) {
    if (!title) return 'Unknown Track';

    return title
        .replace(/\s*\(Official\s*(Video|Audio|Music Video|Lyric Video|Lyrics|Visualizer)\)/gi, '')
        .replace(/\s*\[(Official\s*(Video|Audio|Music Video|Lyric Video|Lyrics|Visualizer)\])/gi, '')
        .replace(/\s*\|.*$/g, '')
        .replace(/\s*HD\s*$/gi, '')
        .replace(/\s*4K\s*$/gi, '')
        .trim() || 'Unknown Track';
}

/**
 * Limpia y normaliza el artista
 */
function _cleanArtist(artist) {
    if (!artist) return '';

    return artist
        .replace(/\s*-\s*Topic$/gi, '') // YouTube Music channels
        .replace(/VEVO$/gi, '')
        .replace(/Official$/gi, '')
        .trim();
}

/**
 * Limpia y normaliza el álbum
 */
function _cleanAlbum(album, source) {
    if (!album || album.trim() === '') {
        return source === 'youtube' ? 'Single' : '';
    }
    return album.trim();
}

/**
 * Resuelve el track canónico (final) combinando original + matched
 * GARANTIZA: title, artist, album SIEMPRE presentes y válidos
 * 
 * @param {Object} originalTrack - Track original importado
 * @param {Object} matchedTrack - Track matcheado (puede ser null)
 * @param {string} source - Fuente original
 * @returns {Object} Track canónico listo para guardar
 */
function resolveCanonicalTrack(originalTrack, matchedTrack = null, source = 'unknown') {
    const canonical = {
        // === Identificación ===
        id: originalTrack.id || `track_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        originalId: originalTrack.originalId || null,
        isrc: originalTrack.isrc || null,
        source: source || originalTrack.source || 'unknown',

        // === Metadata principal ===
        // REGLA: El original (Spotify) es la verdad. Matched solo complementa.
        title: originalTrack.title || matchedTrack?.title || matchedTrack?.name || 'Unknown Track',
        artist: '', // Se resuelve abajo
        album: '',  // Se resuelve abajo

        // === Metadata secundaria ===
        duration: originalTrack.duration || matchedTrack?.duration || 0,
        image: originalTrack.image || matchedTrack?.image || '',

        // === Match info ===
        matchStatus: originalTrack.matchStatus || MATCH_STATUS.NOT_FOUND,
        matchConfidence: originalTrack.matchConfidence || 0,
        needsReview: originalTrack.needsReview || false,

        // === Timestamps ===
        importedAt: originalTrack.importedAt || Date.now(),
        addedAt: Date.now()
    };

    // === RESOLVER ARTISTA ===
    // Prioridad: original > matched > fallback
    if (originalTrack.artist && originalTrack.artist.trim() !== '' && originalTrack.artist !== 'Unknown Artist') {
        canonical.artist = originalTrack.artist;
    } else if (matchedTrack?.artist && matchedTrack.artist.trim() !== '' && matchedTrack.artist !== 'Unknown Artist') {
        canonical.artist = matchedTrack.artist;
    } else {
        canonical.artist = 'Unknown Artist';
        canonical.needsReview = true;
    }

    // === RESOLVER ÁLBUM ===
    // Prioridad: original > matched > default según source
    if (originalTrack.album && originalTrack.album.trim() !== '' &&
        originalTrack.album !== 'Unknown Album' && originalTrack.album !== 'Single') {
        canonical.album = originalTrack.album;
    } else if (matchedTrack?.album && matchedTrack.album.trim() !== '' &&
        matchedTrack.album !== 'Unknown Album') {
        canonical.album = matchedTrack.album;
    } else if (source === 'youtube' || originalTrack.source === 'youtube') {
        canonical.album = 'Single';
    } else {
        canonical.album = 'Unknown Album';
    }

    // === LOG para debugging ===
    if (canonical.artist === 'Unknown Artist' || canonical.album === 'Unknown Album') {
        console.log(`[Canonical] Track con metadata incompleta: "${canonical.title}" | Artist: "${canonical.artist}" | Album: "${canonical.album}"`);
    }

    return canonical;
}

/**
 * Valida que un track tenga la metadata mínima requerida
 * LANZA ERROR si falta artist o album
 * 
 * @param {Object} track - Track a validar
 * @throws {Error} Si falta metadata crítica
 */
function validateTrackOrThrow(track) {
    const errors = [];

    if (!track.title || track.title.trim() === '') {
        errors.push('falta título');
    }

    if (!track.artist || track.artist.trim() === '') {
        errors.push('falta artista');
    }

    if (!track.album || track.album.trim() === '') {
        errors.push('falta álbum');
    }

    if (errors.length > 0) {
        throw new Error(`Track inválido (${errors.join(', ')}): "${track.title || 'sin título'}"`);
    }

    return true;
}

/**
 * Finaliza un array de tracks para guardado
 * Aplica resolveCanonicalTrack a cada uno y valida
 * 
 * @param {Array} tracks - Array de tracks con originalTrack y matchedTrack
 * @param {string} source - Fuente de los tracks
 * @returns {Object} { validTracks: [], invalidTracks: [], errors: [] }
 */
function finalizeTracksForSave(tracks, source) {
    const result = {
        validTracks: [],
        invalidTracks: [],
        errors: []
    };

    for (const item of tracks) {
        try {
            // Determinar original y matched
            const original = item.originalTrack || item;
            const matched = item.matchedTrack || item.matchedTrack || null;

            // Resolver track canónico
            const canonical = resolveCanonicalTrack(original, matched, source);

            // Validar
            validateTrackOrThrow(canonical);

            result.validTracks.push(canonical);
        } catch (error) {
            result.invalidTracks.push(item);
            result.errors.push({
                track: item.title || item.originalTrack?.title || 'Unknown',
                error: error.message
            });
            console.warn(`[Finalize] Track descartado: ${error.message}`);
        }
    }

    console.log(`[Finalize] ${result.validTracks.length} válidos, ${result.invalidTracks.length} descartados`);

    return result;
}

// =============================================================================
// UTILITIES
// =============================================================================

function generateRandomString(length) {
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    const values = crypto.getRandomValues(new Uint8Array(length));
    return values.reduce((acc, x) => acc + possible[x % possible.length], '');
}

async function sha256(plain) {
    const encoder = new TextEncoder();
    const data = encoder.encode(plain);
    return window.crypto.subtle.digest('SHA-256', data);
}

function base64urlencode(a) {
    return btoa(String.fromCharCode.apply(null, new Uint8Array(a)))
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');
}

function parseDuration(duration) {
    if (!duration) return 0;
    if (typeof duration === 'number') return Math.round(duration / 1000);
    if (typeof duration === 'string') {
        const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
        if (match) {
            const hours = parseInt(match[1] || 0, 10);
            const minutes = parseInt(match[2] || 0, 10);
            const seconds = parseInt(match[3] || 0, 10);
            return hours * 3600 + minutes * 60 + seconds;
        }
    }
    return 0;
}

// =============================================================================
// SPOTIFY CLIENT (MEJORADO)
// =============================================================================

const SpotifyClient = {
    async startAuth() {
        if (!SPOTIFY_CONFIG.CLIENT_ID) {
            throw new Error('SPOTIFY_CLIENT_ID not configured. Add REACT_APP_SPOTIFY_CLIENT_ID to .env');
        }

        const codeVerifier = generateRandomString(64);
        const hashed = await sha256(codeVerifier);
        const codeChallenge = base64urlencode(hashed);

        sessionStorage.setItem('spotify_code_verifier', codeVerifier);

        const params = new URLSearchParams({
            client_id: SPOTIFY_CONFIG.CLIENT_ID,
            response_type: 'code',
            redirect_uri: SPOTIFY_CONFIG.REDIRECT_URI,
            scope: SPOTIFY_CONFIG.SCOPES,
            code_challenge_method: 'S256',
            code_challenge: codeChallenge,
            show_dialog: 'true'
        });

        return `${SPOTIFY_CONFIG.AUTH_URL}?${params.toString()}`;
    },

    async exchangeCode(code) {
        const codeVerifier = sessionStorage.getItem('spotify_code_verifier');

        if (!codeVerifier) {
            throw new Error('No code verifier found. Please restart the import process.');
        }

        const response = await fetch(SPOTIFY_CONFIG.TOKEN_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: new URLSearchParams({
                client_id: SPOTIFY_CONFIG.CLIENT_ID,
                grant_type: 'authorization_code',
                code,
                redirect_uri: SPOTIFY_CONFIG.REDIRECT_URI,
                code_verifier: codeVerifier
            })
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error_description || 'Failed to exchange code for token');
        }

        const data = await response.json();

        sessionStorage.setItem('spotify_access_token', data.access_token);
        sessionStorage.setItem('spotify_token_expires', Date.now() + (data.expires_in * 1000));
        sessionStorage.removeItem('spotify_code_verifier');

        return data.access_token;
    },

    getToken() {
        const token = sessionStorage.getItem('spotify_access_token');
        const expires = parseInt(sessionStorage.getItem('spotify_token_expires') || '0', 10);

        if (!token || Date.now() >= expires) {
            return null;
        }

        return token;
    },

    clearAuth() {
        sessionStorage.removeItem('spotify_access_token');
        sessionStorage.removeItem('spotify_token_expires');
        sessionStorage.removeItem('spotify_code_verifier');
    },

    async _fetch(endpoint, options = {}) {
        const token = this.getToken();

        if (!token) {
            throw new Error('Not authenticated with Spotify');
        }

        const url = endpoint.startsWith('http')
            ? endpoint
            : `${SPOTIFY_CONFIG.API_BASE}${endpoint}`;

        const response = await fetch(url, {
            ...options,
            headers: {
                'Authorization': `Bearer ${token}`,
                ...options.headers
            }
        });

        if (response.status === 401) {
            this.clearAuth();
            throw new Error('Spotify session expired. Please reconnect.');
        }

        if (response.status === 429) {
            const retryAfter = parseInt(response.headers.get('Retry-After') || '5', 10);
            throw new Error(`Rate limited. Retry after ${retryAfter} seconds.`);
        }

        if (!response.ok) {
            throw new Error(`Spotify API error: ${response.status}`);
        }

        return response.json();
    },

    async _fetchAll(endpoint, limit = 50, onProgress = null) {
        const items = [];
        let offset = 0;
        let total = null;

        while (total === null || offset < total) {
            const separator = endpoint.includes('?') ? '&' : '?';
            const data = await this._fetch(`${endpoint}${separator}limit=${limit}&offset=${offset}`);

            const pageItems = data.items || data.artists?.items || [];
            items.push(...pageItems);

            total = data.total || data.artists?.total || pageItems.length;
            offset += limit;

            if (onProgress) {
                onProgress({
                    current: items.length,
                    total,
                    phase: 'fetching'
                });
            }

            if (offset < total) {
                await new Promise(r => setTimeout(r, 100));
            }
        }

        return items;
    },

    async getProfile() {
        return this._fetch('/me');
    },

    async getLikedSongsCount() {
        const data = await this._fetch('/me/tracks?limit=1');
        return data.total;
    },

    /**
     * MEJORADO: Devuelve tracks ya normalizados con metadata completa
     */
    async getLikedSongs(onProgress = null) {
        const items = await this._fetchAll('/me/tracks', 50, onProgress);
        return items.map(item => this._normalizeTrack(item.track, 'liked'));
    },

    async getPlaylists(onProgress = null) {
        const items = await this._fetchAll('/me/playlists', 50, onProgress);
        return items.map(pl => ({
            id: pl.id,
            name: pl.name,
            description: pl.description || '',
            image: pl.images?.[0]?.url || '',
            owner: pl.owner?.display_name || 'Usuario',
            trackCount: pl.tracks?.total || 0,
            isPublic: pl.public,
            source: 'spotify',
            originalId: pl.id
        }));
    },

    async getPlaylistTracks(playlistId, onProgress = null) {
        const items = await this._fetchAll(`/playlists/${playlistId}/tracks`, 100, onProgress);
        return items
            .filter(item => item.track && item.track.type === 'track')
            .map(item => this._normalizeTrack(item.track, 'playlist'));
    },

    async getSavedAlbums(onProgress = null) {
        const items = await this._fetchAll('/me/albums', 50, onProgress);
        return items.map(item => ({
            id: item.album.id,
            name: item.album.name,
            artist: item.album.artists?.[0]?.name || 'Unknown Artist',
            image: item.album.images?.[0]?.url || '',
            trackCount: item.album.total_tracks || 0,
            releaseDate: item.album.release_date,
            source: 'spotify',
            originalId: item.album.id
        }));
    },

    async getFollowedArtists(onProgress = null) {
        const items = [];
        let after = null;
        let hasMore = true;

        while (hasMore) {
            const params = after ? `?type=artist&limit=50&after=${after}` : '?type=artist&limit=50';
            const data = await this._fetch(`/me/following${params}`);

            const artists = data.artists?.items || [];
            items.push(...artists);

            after = data.artists?.cursors?.after;
            hasMore = !!after;

            if (onProgress) {
                onProgress({
                    current: items.length,
                    total: items.length + (hasMore ? 50 : 0),
                    phase: 'fetching'
                });
            }

            if (hasMore) {
                await new Promise(r => setTimeout(r, 100));
            }
        }

        return items.map(artist => ({
            id: artist.id,
            name: artist.name,
            image: artist.images?.[0]?.url || '',
            followers: artist.followers?.total || 0,
            genres: artist.genres || [],
            source: 'spotify',
            originalId: artist.id
        }));
    },

    async getLibrarySummary() {
        const [likedData, playlistsData, albumsData] = await Promise.all([
            this._fetch('/me/tracks?limit=1'),
            this._fetch('/me/playlists?limit=1'),
            this._fetch('/me/albums?limit=1')
        ]);

        let artistCount = 0;
        try {
            const artistsData = await this._fetch('/me/following?type=artist&limit=1');
            artistCount = artistsData.artists?.total || 0;
        } catch (e) {
            console.log('Could not fetch artist count');
        }

        return {
            likedSongs: likedData.total || 0,
            playlists: playlistsData.total || 0,
            albums: albumsData.total || 0,
            artists: artistCount
        };
    },

    async getUserPlaylistsMetadata() {
        const items = await this._fetchAll('/me/playlists');

        return items.map(playlist => ({
            id: playlist.id,
            name: playlist.name,
            description: playlist.description,
            image: playlist.images?.[0]?.url || '',
            trackCount: playlist.tracks?.total || 0,
            owner: playlist.owner?.display_name || 'Unknown'
        }));
    },

    /**
     * MEJORADO: Normaliza track de Spotify con TODOS los campos garantizados
     * Spotify es la fuente de verdad - no necesita matching externo
     */
    _normalizeTrack(track, context = 'unknown') {
        if (!track) return null;

        // Extraer artistas (puede ser múltiples)
        const artists = track.artists?.map(a => a.name).filter(Boolean) || [];
        const artistString = artists.length > 0 ? artists.join(', ') : 'Unknown Artist';

        // Extraer álbum (OBLIGATORIO para Spotify)
        const albumName = track.album?.name || 'Unknown Album';

        // Crear track normalizado con metadata completa
        const normalized = {
            // === Identificación ===
            id: track.id,
            originalId: track.id,
            isrc: track.external_ids?.isrc || null,
            source: 'spotify',

            // === Metadata principal (GARANTIZADA) ===
            title: track.name || 'Unknown Track',
            artist: artistString,
            album: albumName,

            // === Metadata secundaria ===
            duration: Math.round((track.duration_ms || 0) / 1000),
            image: track.album?.images?.[0]?.url || '',

            // === Para Spotify, el match es DIRECTO (confidence = 1.0) ===
            matchStatus: MATCH_STATUS.MATCHED,
            matchConfidence: 1.0,
            matchedTrack: null, // No necesita match externo
            needsReview: false,

            // === Context ===
            importContext: context,
            importedAt: Date.now()
        };

        // Validar que tenemos metadata mínima
        if (normalized.artist === 'Unknown Artist') {
            console.warn(`[Spotify] Track sin artista: "${normalized.title}"`);
            normalized.needsReview = true;
        }
        if (normalized.album === 'Unknown Album') {
            console.warn(`[Spotify] Track sin álbum: "${normalized.title}"`);
            normalized.needsReview = true;
        }

        return normalized;
    }
};

// =============================================================================
// YOUTUBE CLIENT (MEJORADO)
// =============================================================================

const YouTubeClient = {
    parsePlaylistUrl(url) {
        if (!url) return null;

        const patterns = [
            /[?&]list=([a-zA-Z0-9_-]+)/, // Catch-all for list param (works for PL, RD, LL, etc.)
            /^([a-zA-Z0-9_-]{34})$/,
            /^([a-zA-Z0-9_-]+)$/, // Allow raw IDs like RD...
            /youtube\.com\/playlist\?list=([a-zA-Z0-9_-]+)/,
            /youtube\.com\/watch\?.*list=([a-zA-Z0-9_-]+)/
        ];

        for (const pattern of patterns) {
            const match = url.match(pattern);
            if (match) return match[1];
        }

        return null;
    },

    /**
     * MEJORADO: Devuelve tracks con metadata mínima garantizada
     */
    /**
     * MEJORADO: Devuelve tracks con metadata mínima garantizada
     * Incluye FALLBACK a APIs públicas (Invidious) si el backend falla
     */
    async getPlaylistTracks(playlistId, onProgress = null) {
        // 1. INTENTO PRINCIPAL: Backend propio
        try {
            const endpoint = `${BACKEND_URL}/api/youtube-playlist?id=${encodeURIComponent(playlistId)}`;
            const response = await fetch(endpoint);

            if (response.ok) {
                const data = await response.json();
                if (data.success && data.items) {
                    return this._processResponse(data.items, data, playlistId, onProgress, 'backend');
                }
            } else if (response.status !== 404) {
                console.warn(`[YouTube Import] Backend 404, intentando fallback...`);
            }
        } catch (error) {
            console.warn(`[YouTube Import] Backend error (${error.message}), intentando fallback...`);
        }

        // 2. FALLBACK MANUAL: Scrape directo ("importar desde youtube")
        // Como pidió el usuario: obtener la info directamente de la página de YouTube
        try {
            console.log('[YouTube Import] Intentando scrape directo...');
            if (onProgress) onProgress({ phase: 'fetching', info: 'Obteniendo datos de YouTube...' });

            const targetUrl = `https://www.youtube.com/playlist?list=${playlistId}`;

            // Lista de proxies para rotar en caso de fallo (CORS / Bloqueos)
            const PROXIES = [
                { name: 'allorigins', url: (u) => `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}&timestamp=${Date.now()}` },
                { name: 'corsproxy', url: (u) => `https://corsproxy.io/?${encodeURIComponent(u)}` },
                { name: 'codetabs', url: (u) => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(u)}` }
            ];

            let tracks = [];
            let playlistInfo = {};
            let lastError = null;

            // Intentar con cada proxy
            for (const proxy of PROXIES) {
                try {
                    console.log(`[YouTube Import] Probando proxy: ${proxy.name}...`);
                    const proxyUrl = proxy.url(targetUrl);

                    const response = await fetch(proxyUrl);
                    if (!response.ok) throw new Error(`Status ${response.status}`);

                    const html = await response.text();
                    if (!html || !html.includes('ytInitialData')) {
                        throw new Error('HTML inválido o sin datos');
                    }

                    // Intentar parsear ESTE html
                    // Regex más permisiva para capturar el JSON
                    let match = html.match(/ytInitialData\s*=\s*({.+?});/);
                    if (!match) {
                        // Intento alternativo: a veces viene dentro de una función o asignación window
                        match = html.match(/window\["ytInitialData"\]\s*=\s*({.+?});/);
                    }

                    if (!match) {
                        // Último intento: buscar el objeto JSON puro si está en un script tag específico
                        const jsonStart = html.indexOf('var ytInitialData = {');
                        if (jsonStart !== -1) {
                            let jsonEnd = html.indexOf('};', jsonStart);
                            if (jsonEnd !== -1) {
                                match = [null, html.substring(jsonStart + 20, jsonEnd + 1)];
                            }
                        }
                    }

                    if (!match) throw new Error('No se encontró ytInitialData en el HTML');

                    const data = JSON.parse(match[1]);

                    // --- ESTRATEGIA DE EXTRACCIÓN ROBUSTA ---

                    // 1. Metadata (Búsqueda segura)
                    // Intentamos sacar el título de varios lugares posibles
                    let pTitle = 'YouTube Playlist';
                    let pOwner = 'YouTube';
                    let pThumb = '';

                    try {
                        const header = data.header?.playlistHeaderRenderer ||
                            data.sidebar?.playlistSidebarRenderer?.items?.[0]?.playlistSidebarPrimaryInfoRenderer ||
                            data.contents?.twoColumnWatchNextResults?.playlist?.playlist;

                        pTitle = header?.title?.runs?.[0]?.text || header?.title?.simpleText || pTitle;

                        const ownerData = data.sidebar?.playlistSidebarRenderer?.items?.[1]?.playlistSidebarSecondaryInfoRenderer?.videoOwner?.videoOwnerRenderer ||
                            header?.ownerText?.runs?.[0];

                        pOwner = ownerData?.title?.runs?.[0]?.text || ownerData?.text || pOwner;

                        // Thumbnails can be deeply nested
                        const thumbList = header?.thumbnailRenderer?.playlistVideoThumbnailRenderer?.thumbnail?.thumbnails ||
                            header?.playlistHeaderBanner?.thumbnails ||
                            header?.thumbnail?.thumbnails;

                        pThumb = thumbList?.pop()?.url || '';
                    } catch (metaErr) {
                        console.warn('Error extrayendo metadata (usando defaults):', metaErr);
                    }

                    playlistInfo = {
                        title: pTitle,
                        owner: pOwner,
                        thumbnail: pThumb
                    };

                    // 2. Contenidos (Videos)
                    // Buscar recursivamente en las ubicaciones conocidas
                    const candidates = [
                        // Playlist normal (Desktop)
                        data.contents?.twoColumnBrowseResultsRenderer?.tabs?.[0]?.tabRenderer?.content?.sectionListRenderer?.contents?.[0]?.itemSectionRenderer?.contents?.[0]?.playlistVideoListRenderer?.contents,
                        // Playlist (Mobile / Single Column)
                        data.contents?.singleColumnBrowseResultsRenderer?.tabs?.[0]?.tabRenderer?.content?.sectionListRenderer?.contents?.[0]?.itemSectionRenderer?.contents?.[0]?.playlistVideoListRenderer?.contents,

                        // Radio / Mix (Watch Page - Desktop)
                        data.contents?.twoColumnWatchNextResults?.playlist?.playlist?.contents,

                        // Radio / Mix (Panel Lateral)
                        data.contents?.twoColumnWatchNextResults?.playlist?.playlistPanelRenderer?.contents,

                        // Radio (Mobile / Single Column Watch)
                        data.contents?.singleColumnWatchNextResults?.playlist?.playlist?.contents,

                        // Resultados de Autoplay
                        data.contents?.twoColumnWatchNextResults?.autoplay?.autoplay?.sets?.[0]?.autoplaySetRenderer?.items
                    ];

                    let contents = candidates.find(c => c && c.length > 0);

                    if (!contents) {
                        // Debug para saber qué estructura llegó
                        const topLevel = Object.keys(data.contents || {});
                        throw new Error(`Estructura desconocida. Top-level contents: ${topLevel.join(', ')}`);
                    }

                    // Filtrar y mapear
                    const items = contents
                        .filter(item => item.playlistVideoRenderer || item.playlistPanelVideoRenderer)
                        .map(item => {
                            const v = item.playlistVideoRenderer || item.playlistPanelVideoRenderer;
                            const thumbs = v.thumbnail?.thumbnails || [];

                            // Duración
                            let durationMs = 0;
                            if (v.lengthSeconds) {
                                durationMs = parseInt(v.lengthSeconds) * 1000;
                            } else if (v.lengthText?.simpleText) {
                                const parts = v.lengthText.simpleText.split(':').map(Number);
                                if (parts.length === 2) durationMs = (parts[0] * 60 + parts[1]) * 1000;
                                if (parts.length === 3) durationMs = (parts[0] * 3600 + parts[1] * 60 + parts[2]) * 1000;
                            }

                            return {
                                videoId: v.videoId,
                                title: v.title?.runs?.[0]?.text || v.title?.simpleText || 'Unknown',
                                channelTitle: v.shortBylineText?.runs?.[0]?.text || v.longBylineText?.runs?.[0]?.text || pOwner,
                                duration: durationMs,
                                thumbnail: thumbs.length > 0 ? thumbs[thumbs.length - 1].url : ''
                            };
                        });

                    if (items.length > 0) {
                        tracks = items;
                        console.log(`[YouTube Import] ÉXITO con ${proxy.name}: ${tracks.length} tracks`);
                        break; // ¡Éxito total! Salimos del loop
                    } else {
                        throw new Error('Lista de videos vacía tras parseo');
                    }

                } catch (e) {
                    console.warn(`[YouTube Import] Falló proxy ${proxy.name}:`, e.message);
                    lastError = e;
                    // Continuamos al siguiente proxy
                }
            }

            // FALLBACK FINAL: INVIDIOUS ROTATIVO
            if (tracks.length === 0) {
                if (playlistId.startsWith('RD') || playlistId.startsWith('PL')) {
                    console.log('[YouTube Import] Scrape falló, intentando Invidious (Fallback)...');

                    const INV_INSTANCES = [
                        'https://inv.tux.pizza',
                        'https://invidious.io.lol',
                        'https://vid.puffyan.us'
                    ];

                    for (const instance of INV_INSTANCES) {
                        try {
                            const invUrl = `${instance}/api/v1/playlists/${playlistId}`;
                            console.log(`[Import] Probando Invidious: ${instance}`);

                            const r = await fetch(invUrl);
                            if (r.ok) {
                                const d = await r.json();
                                if (d.videos && d.videos.length > 0) {
                                    return this._processResponse(d.videos.map(v => ({
                                        videoId: v.videoId,
                                        title: v.title,
                                        channelTitle: v.author,
                                        duration: v.lengthSeconds * 1000,
                                        thumbnail: v.videoThumbnails?.[0]?.url
                                    })), {
                                        title: d.title || 'YouTube Playlist',
                                        owner: d.author || 'YouTube',
                                        thumbnail: d.playlistThumbnail
                                    }, playlistId, onProgress, 'invidious-api');
                                }
                            }
                        } catch (invErr) {
                            console.warn(`Skip instance ${instance}:`, invErr.message);
                        }
                    }
                }

                throw new Error(lastError ? lastError.message : 'No se pudo importar la playlist (ni scrape ni API)');
            }

            return this._processResponse(tracks, playlistInfo, playlistId, onProgress, 'scrape');


        } catch (scrapeError) {
            console.error('[YouTube Import] Scrape falló:', scrapeError);
            throw new Error(`No se pudo importar: ${scrapeError.message || 'Error desconocido'}`);
        }
    },

    /**
     * Procesa la respuesta cruda (ya sea del backend o fallback) y devuelve el formato esperado
     */
    _processResponse(items, playlistMeta, playlistId, onProgress, sourceName) {
        const tracks = items.map((item, index) => {
            const { title, artist } = this._parseVideoTitle(item.title);

            if (onProgress) {
                onProgress({
                    current: index + 1,
                    total: items.length,
                    phase: 'parsing'
                });
            }

            // === NORMALIZACIÓN YOUTUBE ===
            // Artist: del parse o channelTitle
            const finalArtist = artist || item.channelTitle || 'Unknown Artist';

            // Album: SIEMPRE "Single" para YouTube (no tienen álbum real)
            const finalAlbum = 'Single';

            return {
                // === Identificación ===
                id: item.videoId,
                originalId: item.videoId,
                isrc: null,
                source: 'youtube',

                // === Metadata principal (GARANTIZADA) ===
                title: title || 'Unknown Track',
                artist: finalArtist,
                album: finalAlbum,

                // === Metadata secundaria ===
                duration: parseDuration(item.duration),
                image: item.thumbnail || '',

                // === Match info ===
                matchStatus: null, // Se determina en matching
                matchConfidence: 0,
                matchedTrack: null,
                needsReview: !artist, // Marcar si el artista vino de channelTitle

                // === Context ===
                importContext: 'youtube_playlist',
                importedAt: Date.now(),
                channelTitle: item.channelTitle || ''
            };
        });

        return {
            playlistInfo: {
                id: playlistId,
                name: playlistMeta.title || playlistMeta.name || 'YouTube Playlist',
                description: playlistMeta.description || '',
                image: playlistMeta.thumbnail || playlistMeta.image || '',
                owner: playlistMeta.channelTitle || playlistMeta.owner || 'YouTube',
                trackCount: tracks.length,
                source: 'youtube',
                originalId: playlistId
            },
            tracks
        };
    },


    /**
     * Parse título de YouTube para extraer artista y canción
     */
    _parseVideoTitle(title) {
        if (!title) return { title: 'Unknown', artist: null };

        // Limpiar sufijos comunes
        let cleaned = title
            .replace(/\s*\(Official\s*(Video|Audio|Music Video|Lyric Video|Lyrics|Visualizer)\)/gi, '')
            .replace(/\s*\[(Official\s*(Video|Audio|Music Video|Lyric Video|Lyrics|Visualizer)\])/gi, '')
            .replace(/\s*\(ft\.?\s*[^)]+\)/gi, '')
            .replace(/\s*\[ft\.?\s*[^\]]+\]/gi, '')
            .replace(/\s*\(feat\.?\s*[^)]+\)/gi, '')
            .replace(/\s*\|.*$/g, '')
            .replace(/\s*HD\s*$/gi, '')
            .replace(/\s*4K\s*$/gi, '')
            .trim();

        // Separadores comunes
        const separators = [' - ', ' – ', ' — ', ' | '];

        for (const sep of separators) {
            if (cleaned.includes(sep)) {
                const parts = cleaned.split(sep);
                if (parts.length >= 2) {
                    const artist = parts[0].trim();
                    const song = parts.slice(1).join(sep).trim();
                    return { title: song, artist };
                }
            }
        }

        return { title: cleaned, artist: null };
    }
};

// =============================================================================
// MATCHING ENGINE v3.0 - PRECISION-FIRST
// =============================================================================

const MatchingEngine = {
    _searchCache: new Map(),
    _cacheTimestamps: new Map(),
    CACHE_TTL: 30 * 60 * 1000,

    /**
     * NIVEL 1: Spotify = Verdad absoluta
     * Si el track viene de Spotify con originalId/isrc, NO buscar en YouTube
     */
    _isSpotifyTruth(track) {
        return track.source === 'spotify' && (track.originalId || track.isrc);
    },

    /**
     * Match principal con 3 niveles de precisión
     */
    async matchTrack(track, retryAttempt = 0) {
        const MAX_RETRIES = 2;
        const RETRY_DELAY = 1000;

        if (!track || !track.title) {
            console.warn('[Matching] Track sin título, saltando');
            return track;
        }

        try {
            // ============================================================
            // NIVEL 1: SPOTIFY = VERDAD ABSOLUTA
            // Si viene de Spotify, YA tiene la metadata correcta
            // NO buscar en YouTube para "reemplazar" metadata
            // ============================================================
            if (this._isSpotifyTruth(track)) {
                console.log(`[Matching] NIVEL 1 (Spotify truth): "${track.title}" → Match directo`);

                track.matchStatus = MATCH_STATUS.MATCHED;
                track.matchConfidence = 1.0;
                track.matchedTrack = {
                    title: track.title,
                    artist: track.artist,
                    album: track.album,
                    image: track.image,
                    duration: track.duration,
                    isrc: track.isrc,
                    source: 'spotify_direct'
                };
                return track;
            }

            // ============================================================
            // NIVEL 2: YOUTUBE CON METADATA PARSEADA
            // Si ya tiene artista y álbum válidos, no buscar más
            // ============================================================
            if (track.source === 'youtube' &&
                track.artist && track.artist !== 'Unknown Artist' &&
                track.album) {

                console.log(`[Matching] NIVEL 2 (YouTube parsed): "${track.title}" by "${track.artist}"`);

                // Marcar como PARTIAL si el artista vino de channelTitle
                if (track.needsReview) {
                    track.matchStatus = MATCH_STATUS.PARTIAL;
                    track.matchConfidence = 0.7;
                } else {
                    track.matchStatus = MATCH_STATUS.MATCHED;
                    track.matchConfidence = 0.85;
                }

                track.matchedTrack = {
                    title: track.title,
                    artist: track.artist,
                    album: track.album,
                    image: track.image,
                    duration: track.duration,
                    source: 'youtube_parsed'
                };
                return track;
            }

            // ============================================================
            // NIVEL 3: BÚSQUEDA EXTERNA (solo si es necesario)
            // Pipeline lento pero preciso
            // ============================================================
            console.log(`[Matching] NIVEL 3 (búsqueda externa): "${track.title}"`);

            this._cleanupCache();

            const query = this._buildPreciseQuery(track, retryAttempt);
            const cacheKey = query.toLowerCase();

            let results = this._getCachedResults(cacheKey);
            if (!results) {
                results = await this._performSearch(query);
                if (results) {
                    this._setCachedResults(cacheKey, results);
                }
            }

            if (!results || results.length === 0) {
                console.log(`[Matching] Sin resultados para: "${track.title}"`);
                track.matchStatus = MATCH_STATUS.NOT_FOUND;
                track.matchConfidence = 0;
                track.matchedTrack = null;
                return track;
            }

            // Encontrar mejor match con threshold MUY ALTO
            const bestMatch = this._findBestMatchPrecise(track, results);

            // THRESHOLD ALTO: >= 0.9 para MATCHED, >= 0.7 para PARTIAL
            // Preferimos NO ENCONTRAR antes que match incorrecto
            if (bestMatch.confidence >= 0.90) {
                console.log(`[Matching] Match encontrado (${bestMatch.confidence.toFixed(2)}): "${track.title}" → "${bestMatch.track.title}"`);
                track.matchStatus = MATCH_STATUS.MATCHED;
                track.matchConfidence = bestMatch.confidence;
                track.matchedTrack = bestMatch.track;
            } else if (bestMatch.confidence >= 0.70) {
                console.log(`[Matching] Match parcial (${bestMatch.confidence.toFixed(2)}): "${track.title}" → "${bestMatch.track.title}"`);
                track.matchStatus = MATCH_STATUS.PARTIAL;
                track.matchConfidence = bestMatch.confidence;
                track.matchedTrack = bestMatch.track;
                track.needsReview = true;
            } else {
                console.log(`[Matching] Confianza muy baja (${bestMatch.confidence.toFixed(2)}): "${track.title}" → NOT_FOUND`);
                track.matchStatus = MATCH_STATUS.NOT_FOUND;
                track.matchConfidence = bestMatch.confidence;
                track.matchedTrack = null;
            }

            // Retry si es necesario
            if (track.matchStatus === MATCH_STATUS.NOT_FOUND &&
                retryAttempt < MAX_RETRIES) {
                await new Promise(r => setTimeout(r, RETRY_DELAY * (retryAttempt + 1)));
                return this.matchTrack(track, retryAttempt + 1);
            }

            return track;

        } catch (error) {
            console.error(`[Matching] Error para "${track.title}":`, error.message);

            if (retryAttempt < MAX_RETRIES) {
                await new Promise(r => setTimeout(r, RETRY_DELAY));
                return this.matchTrack(track, retryAttempt + 1);
            }

            track.matchStatus = MATCH_STATUS.NOT_FOUND;
            track.matchConfidence = 0;
            track.matchedTrack = null;
            return track;
        }
    },

    /**
     * Construye query precisa para búsqueda
     */
    _buildPreciseQuery(track, retryAttempt) {
        const artist = track.artist || '';
        const title = track.title || '';

        // Limpiar título de basura
        const cleanTitle = title
            .replace(/\s*\(Official.*?\)/gi, '')
            .replace(/\s*\[Official.*?\]/gi, '')
            .replace(/\s*\(Lyrics\)/gi, '')
            .replace(/\s*\(Audio\)/gi, '')
            .trim();

        switch (retryAttempt) {
            case 0:
                // Intento 1: Artista + Título limpio
                return `${artist} ${cleanTitle}`.trim();
            case 1:
                // Intento 2: Solo título limpio
                return cleanTitle;
            default:
                // Intento 3: Título sin paréntesis
                return cleanTitle.replace(/\s*\([^)]*\)/g, '').trim();
        }
    },

    /**
     * Búsqueda con manejo de rate limits
     */
    async _performSearch(query) {
        const searchUrl = `${BACKEND_URL}/api/youtube-search?q=${encodeURIComponent(query)}&limit=10`;
        const response = await fetch(searchUrl);

        if (response.status === 429) {
            const retryAfter = parseInt(response.headers.get('Retry-After') || '5', 10);
            await new Promise(r => setTimeout(r, retryAfter * 1000));
            return this._performSearch(query);
        }

        if (!response.ok) {
            throw new Error(`Search failed: ${response.status}`);
        }

        const data = await response.json();
        return data.success ? data.results : null;
    },

    /**
     * Encuentra el mejor match con algoritmo PRECISO
     */
    _findBestMatchPrecise(target, results) {
        let bestMatch = { track: null, confidence: 0 };

        for (const result of results) {
            // === FILTROS DUROS (descartar inmediatamente) ===
            if (this._shouldReject(target, result)) {
                continue;
            }

            const confidence = this._calculatePreciseConfidence(target, result);

            if (confidence > bestMatch.confidence) {
                bestMatch = {
                    track: {
                        title: result.title,
                        // IMPORTANTE: preservar artista del original si existe
                        artist: target.artist || result.author?.name || 'Unknown Artist',
                        // IMPORTANTE: preservar álbum del original (YouTube no tiene álbum)
                        album: target.album || (target.source === 'youtube' ? 'Single' : 'Unknown Album'),
                        image: result.thumbnail || target.image || '',
                        duration: result.duration || target.duration || 0,
                        videoId: result.videoId,
                        source: 'youtube_search'
                    },
                    confidence
                };
            }
        }

        return bestMatch;
    },

    /**
     * FILTROS DUROS: rechazar resultados obviamente incorrectos
     */
    _shouldReject(target, result) {
        const title = (result.title || '').toLowerCase();
        const channelName = (result.author?.name || result.channelTitle || '').toLowerCase();
        const targetTitle = (target.title || '').toLowerCase();

        // === RECHAZO ABSOLUTO: Covers, Karaoke, etc. ===
        const rejectPatterns = [
            /\bcover\b/,
            /\bkaraoke\b/,
            /\btribute\b/,
            /\bin the style of\b/,
            /\boriginally performed\b/,
            /\bmade famous\b/
        ];

        for (const pattern of rejectPatterns) {
            if (pattern.test(title) && !pattern.test(targetTitle)) {
                return true;
            }
            if (pattern.test(channelName)) {
                return true;
            }
        }

        // === RECHAZO: Canales sospechosos ===
        const suspiciousChannels = ['karaoke', 'cover', 'tribute', 'various artists'];
        for (const term of suspiciousChannels) {
            if (channelName.includes(term)) {
                return true;
            }
        }

        // === RECHAZO: Duración muy diferente (> 60 segundos) ===
        if (target.duration > 0 && result.duration > 0) {
            const diff = Math.abs(target.duration - result.duration);
            if (diff > 60) {
                return true;
            }
        }

        return false;
    },

    /**
     * Calcula confianza PRECISA del match
     */
    _calculatePreciseConfidence(target, result) {
        let confidence = 0;

        // === 1. TÍTULO (40%) ===
        const titleScore = this._calculateTitleScore(target.title, result.title);
        confidence += titleScore * 0.40;

        // === 2. ARTISTA (40%) ===
        const artistScore = this._calculateArtistScore(target.artist, result.author?.name);
        confidence += artistScore * 0.40;

        // === 3. DURACIÓN (20%) ===
        const durationScore = this._calculateDurationScore(target.duration, result.duration);
        confidence += durationScore * 0.20;

        // === PENALIZACIONES ===
        let penalty = this._calculatePenalties(target, result);
        confidence = Math.max(0, confidence - penalty);

        return Math.min(1, confidence);
    },

    /**
     * Score de título mejorado
     */
    _calculateTitleScore(targetTitle, candidateTitle) {
        if (!targetTitle || !candidateTitle) return 0;

        const target = this._normalizeForComparison(targetTitle);
        const candidate = this._normalizeForComparison(candidateTitle);

        // Exact match
        if (target === candidate) return 1.0;

        // Contains
        if (candidate.includes(target) || target.includes(candidate)) {
            return 0.9;
        }

        // Word overlap
        const targetWords = target.split(/\s+/).filter(w => w.length > 2);
        const candidateWords = candidate.split(/\s+/).filter(w => w.length > 2);

        if (targetWords.length === 0) return 0.3;

        let matchedWords = 0;
        for (const word of targetWords) {
            if (candidateWords.some(cw => cw === word || cw.includes(word) || word.includes(cw))) {
                matchedWords++;
            }
        }

        return matchedWords / targetWords.length;
    },

    /**
     * Score de artista mejorado con normalización
     */
    _calculateArtistScore(targetArtist, candidateArtist) {
        if (!targetArtist || !candidateArtist) return 0.3;

        // Normalizar y separar artistas
        const targetArtists = this._normalizeArtists(targetArtist);
        const candidateArtists = this._normalizeArtists(candidateArtist);

        if (targetArtists.length === 0 || candidateArtists.length === 0) {
            return 0.3;
        }

        // Contar coincidencias
        let matches = 0;
        for (const target of targetArtists) {
            for (const candidate of candidateArtists) {
                if (target === candidate ||
                    target.includes(candidate) ||
                    candidate.includes(target)) {
                    matches++;
                    break;
                }
            }
        }

        return matches / Math.max(targetArtists.length, candidateArtists.length);
    },

    /**
     * Normaliza artistas para comparación
     */
    _normalizeArtists(artistStr) {
        if (!artistStr) return [];

        return artistStr
            .toLowerCase()
            .replace(/\s*-\s*topic$/gi, '')
            .replace(/vevo$/gi, '')
            .replace(/official$/gi, '')
            .split(/[,&]/)
            .map(a => a.trim())
            .filter(a => a.length > 0);
    },

    /**
     * Normaliza texto para comparación
     */
    _normalizeForComparison(text) {
        return (text || '')
            .toLowerCase()
            .replace(/\s*\([^)]*\)/g, '')
            .replace(/\s*\[[^\]]*\]/g, '')
            .replace(/[^\w\s]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
    },

    /**
     * Score de duración
     */
    _calculateDurationScore(targetDuration, candidateDuration) {
        if (!targetDuration || !candidateDuration) return 0.5;

        const diff = Math.abs(targetDuration - candidateDuration);

        if (diff <= 3) return 1.0;
        if (diff <= 5) return 0.9;
        if (diff <= 10) return 0.7;
        if (diff <= 20) return 0.5;
        if (diff <= 30) return 0.3;

        return 0;
    },

    /**
     * Penalizaciones por contenido no deseado
     */
    _calculatePenalties(target, result) {
        let penalty = 0;
        const title = (result.title || '').toLowerCase();
        const targetTitle = (target.title || '').toLowerCase();

        // Penalizar modificaciones no solicitadas
        const modifications = [
            { pattern: /\binstrumental\b/, penalty: 0.3 },
            { pattern: /\bacoustic\b/, penalty: 0.2 },
            { pattern: /\bslowed\b/, penalty: 0.3 },
            { pattern: /\breverb\b/, penalty: 0.3 },
            { pattern: /\bsped up\b/, penalty: 0.3 },
            { pattern: /\b8d audio\b/, penalty: 0.3 },
            { pattern: /\bremix\b/, penalty: 0.25 },
            { pattern: /\blive\b/, penalty: 0.2 },
            { pattern: /\bedit\b/, penalty: 0.2 }
        ];

        for (const mod of modifications) {
            if (mod.pattern.test(title) && !mod.pattern.test(targetTitle)) {
                penalty += mod.penalty;
            }
        }

        return Math.min(0.6, penalty);
    },

    // === CACHE HELPERS ===
    _getCachedResults(key) {
        const timestamp = this._cacheTimestamps.get(key);
        if (!timestamp || Date.now() - timestamp > this.CACHE_TTL) {
            this._searchCache.delete(key);
            this._cacheTimestamps.delete(key);
            return null;
        }
        return this._searchCache.get(key);
    },

    _setCachedResults(key, results) {
        this._searchCache.set(key, results);
        this._cacheTimestamps.set(key, Date.now());
    },

    _cleanupCache() {
        const now = Date.now();
        for (const [key, timestamp] of this._cacheTimestamps) {
            if (now - timestamp > this.CACHE_TTL) {
                this._searchCache.delete(key);
                this._cacheTimestamps.delete(key);
            }
        }
    },

    /**
     * Batch matching con progreso
     */
    async matchBatch(tracks, onProgress = null, concurrency = 3) {
        const validTracks = (tracks || []).filter(t => t && t.title);

        if (validTracks.length === 0) {
            return [];
        }

        const results = [];
        let processed = 0;
        let stats = { matched: 0, partial: 0, notFound: 0 };

        for (let i = 0; i < validTracks.length; i += concurrency) {
            const batch = validTracks.slice(i, i + concurrency);

            const batchResults = await Promise.all(
                batch.map(track => this.matchTrack(track))
            );

            results.push(...batchResults);
            processed += batch.length;

            // Actualizar stats
            batchResults.forEach(result => {
                switch (result.matchStatus) {
                    case MATCH_STATUS.MATCHED: stats.matched++; break;
                    case MATCH_STATUS.PARTIAL: stats.partial++; break;
                    default: stats.notFound++;
                }
            });

            if (onProgress) {
                onProgress({
                    current: processed,
                    total: validTracks.length,
                    phase: IMPORT_PHASES.MATCHING,
                    stats,
                    lastMatched: batchResults[batchResults.length - 1]
                });
            }

            // Pequeña pausa entre batches
            if (i + concurrency < validTracks.length) {
                await new Promise(r => setTimeout(r, 50));
            }
        }

        console.log(`[MatchBatch] Completado: ${stats.matched} matched, ${stats.partial} partial, ${stats.notFound} not found`);

        return results;
    }
};

// =============================================================================
// IMPORT ORCHESTRATOR
// =============================================================================

const ImportService = {
    // Export sub-clients
    Spotify: SpotifyClient,
    YouTube: YouTubeClient,
    Matching: MatchingEngine,

    // Status constants
    STATUS: {
        IDLE: 'idle',
        AUTHENTICATING: 'authenticating',
        FETCHING: 'fetching',
        MATCHING: 'matching',
        SAVING: 'saving',
        COMPLETED: 'completed',
        ERROR: 'error'
    },

    MATCH_STATUS,

    // Export utilities para uso externo
    normalizeImportedTrack,
    resolveCanonicalTrack,
    validateTrackOrThrow,
    finalizeTracksForSave,

    /**
     * Importación desde Spotify - MEJORADO
     */
    async importFromSpotify(options = {}, onProgress = null) {
        const {
            importLikedSongs = true,
            importPlaylists = false,
            importAlbums = false,
            importArtists = false,
            selectedPlaylistIds = []
        } = options;

        const importResult = new ImportResult();
        importResult.source = 'spotify';

        try {
            // ===== FASE 1: FETCH =====
            if (onProgress) onProgress({
                phase: IMPORT_PHASES.FETCHING,
                type: 'initializing'
            });

            // 1. Fetch liked songs
            if (importLikedSongs) {
                const tracks = await SpotifyClient.getLikedSongs((p) => {
                    if (onProgress) onProgress({ ...p, type: 'likedSongs' });
                });

                // Los tracks de Spotify YA vienen normalizados con metadata completa
                // NO necesitan matching externo (son NIVEL 1: Verdad absoluta)
                tracks.forEach(track => importResult.addTrack(track, 'liked'));

                console.log(`[Import] ${tracks.length} liked songs importadas de Spotify`);
            }

            // 2. Fetch playlists
            if (importPlaylists) {
                try {
                    const playlistItems = await SpotifyClient.getUserPlaylistsMetadata();
                    const playlistsToImport = selectedPlaylistIds?.length > 0
                        ? playlistItems.filter(p => selectedPlaylistIds.includes(p.id))
                        : playlistItems;

                    for (const playlistMeta of playlistsToImport) {
                        const tracks = await SpotifyClient.getPlaylistTracks(playlistMeta.id, (p) => {
                            if (onProgress) onProgress({ ...p, type: 'playlists', playlist: playlistMeta.name });
                        });

                        // Tracks de Spotify = metadata completa garantizada
                        importResult.addPlaylist(
                            playlistMeta.name,
                            playlistMeta.description || '',
                            tracks
                        );

                        console.log(`[Import] Playlist "${playlistMeta.name}": ${tracks.length} tracks`);
                    }
                } catch (err) {
                    console.error('Error importing playlists:', err);
                    importResult.addError('playlists', err.message);
                }
            }

            // 3. Fetch albums
            if (importAlbums) {
                const rawAlbums = await SpotifyClient.getSavedAlbums((p) => {
                    if (onProgress) onProgress({ ...p, type: 'albums' });
                });

                rawAlbums.forEach(raw => {
                    const album = new Album({
                        name: raw.name,
                        artist: raw.artist,
                        image: raw.image,
                        trackCount: raw.trackCount,
                        releaseDate: raw.releaseDate,
                        source: 'spotify',
                        originalId: raw.originalId
                    });
                    importResult.addAlbum(album);
                });
            }

            // 4. Fetch artists
            if (importArtists) {
                const rawArtists = await SpotifyClient.getFollowedArtists((p) => {
                    if (onProgress) onProgress({ ...p, type: 'artists' });
                });

                rawArtists.forEach(raw => {
                    const artist = new Artist({
                        name: raw.name,
                        image: raw.image,
                        followers: raw.followers,
                        genres: raw.genres,
                        source: 'spotify',
                        originalId: raw.originalId
                    });
                    importResult.addArtist(artist);
                });
            }

            // ===== FASE 2: MATCHING (solo para tracks sin match directo) =====
            // Para Spotify, los tracks YA tienen matchStatus = MATCHED
            // Solo necesitamos match para playlists si hay tracks de otras fuentes

            if (onProgress) onProgress({
                phase: IMPORT_PHASES.MATCHING,
                type: 'spotify',
                total: importResult.tracks.getAll().length,
                message: 'Spotify tracks ya tienen metadata completa'
            });

            // ===== FASE 3: COMPLETE =====
            importResult.complete();

            if (onProgress) onProgress({
                phase: IMPORT_PHASES.COMPLETED,
                stats: importResult.getFormattedStats()
            });

            // Retornar formato legacy para compatibilidad con UI
            return importResult.toLegacyFormat();

        } catch (error) {
            console.error('[ImportFromSpotify] Error:', error);
            importResult.addError('general', error.message);
            importResult.complete();
            return importResult.toLegacyFormat();
        }
    },

    /**
     * Importación de YouTube - MEJORADO con matching opcional
     */
    async importYouTubePlaylist(url, onProgress = null) {
        const importResult = new ImportResult();
        importResult.source = 'youtube';

        try {
            // ===== FASE 1: FETCH =====
            if (onProgress) onProgress({
                phase: IMPORT_PHASES.FETCHING,
                type: 'youtube'
            });

            const playlistId = YouTubeClient.parsePlaylistUrl(url);
            if (!playlistId) {
                throw new Error('URL de playlist inválida');
            }

            const { playlistInfo, tracks } = await YouTubeClient.getPlaylistTracks(playlistId, (p) => {
                if (onProgress) onProgress({ ...p, type: 'youtube' });
            });

            console.log(`[Import] YouTube playlist "${playlistInfo.name}": ${tracks.length} tracks`);

            // ===== FASE 2: MATCHING =====
            // Para YouTube, ejecutamos matching NIVEL 2/3 para mejorar metadata
            if (onProgress) onProgress({
                phase: IMPORT_PHASES.MATCHING,
                type: 'youtube',
                total: tracks.length
            });

            const matchedTracks = await MatchingEngine.matchBatch(tracks, (p) => {
                if (onProgress) onProgress({ ...p, type: 'youtube' });
            });

            // Agregar playlist con tracks matcheados
            importResult.addYouTubePlaylist(playlistInfo, matchedTracks);

            // ===== FASE 3: COMPLETE =====
            importResult.complete();

            // Log de resultados
            const stats = {
                total: matchedTracks.length,
                matched: matchedTracks.filter(t => t.matchStatus === MATCH_STATUS.MATCHED).length,
                partial: matchedTracks.filter(t => t.matchStatus === MATCH_STATUS.PARTIAL).length,
                notFound: matchedTracks.filter(t => t.matchStatus === MATCH_STATUS.NOT_FOUND).length
            };
            console.log(`[Import] YouTube matching completado:`, stats);

            if (onProgress) onProgress({
                phase: IMPORT_PHASES.COMPLETED,
                stats: importResult.getFormattedStats()
            });

            return importResult.toLegacyFormat();

        } catch (error) {
            console.error('[YouTube Import] Error:', error);
            importResult.addError('general', error.message);
            importResult.complete();
            return importResult.toLegacyFormat();
        }
    },

    /**
     * Calcula tasa de match
     */
    calculateMatchRate(stats) {
        if (stats.total === 0) return 0;
        return Math.round(((stats.matched + stats.partial) / stats.total) * 100);
    },

    /**
     * Formatea stats para display
     */
    formatStats(stats) {
        return {
            matchRate: this.calculateMatchRate(stats),
            successMessage: stats.matched > 0
                ? `${stats.matched} canciones encontradas`
                : 'No se encontraron canciones',
            partialMessage: stats.partial > 0
                ? `${stats.partial} coincidencias parciales`
                : null,
            failedMessage: stats.failed > 0
                ? `${stats.failed} no encontradas`
                : null
        };
    }
};

export default ImportService;
export {
    SpotifyClient,
    YouTubeClient,
    MatchingEngine,
    MATCH_STATUS,
    // Export utilities
    normalizeImportedTrack,
    resolveCanonicalTrack,
    validateTrackOrThrow,
    finalizeTracksForSave
};
