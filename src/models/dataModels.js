/**
 * DATA MODELS
 * Definición clara de modelos de datos para imports y biblioteca
 *
 * ESTRUCTURA JERÁRQUICA:
 * Artist ← Album ← Track
 *
 * - Track: unidad básica, pertenece a 1 Album y 1 Artist
 * - Album: contiene múltiples Tracks, pertenece a 1 Artist
 * - Artist: contiene múltiples Albums y Tracks
 *
 * IDS CONSISTENTES:
 * - Usar fingerprints/hash para deduplicación real
 * - IDs únicos basados en contenido, no nombres
 * - Relaciones por ID, no por strings sueltos
 *
 * @version 2.0.0
 * @date 2025-12-17
 */

import { v4 as uuidv4 } from 'uuid';

// =============================================================================
// UTILITIES
// =============================================================================

/**
 * Genera un fingerprint único para deduplicación
 * Basado en contenido, no en nombres que pueden variar
 */
export function generateFingerprint(data) {
    // Crear string consistente con datos clave
    const key = [
        data.title || data.name,
        data.artist,
        data.album,
        data.duration ? Math.round(data.duration) : 0,
        data.isrc || ''
    ].join('|').toLowerCase();

    // Simple hash para consistencia
    let hash = 0;
    for (let i = 0; i < key.length; i++) {
        const char = key.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // Convertir a 32-bit
    }

    return Math.abs(hash).toString(36);
}

/**
 * NORMALIZACIÓN DEFENSIVA PARA IMPORTS
 * Convierte cualquier entrada (instancia de clase o objeto plano) a objeto plano
 * listo para Firestore. NO asume métodos en el objeto de entrada.
 * 
 * @param {Object|Track} input - Track como instancia o como objeto plano
 * @returns {Object} Objeto plano normalizado listo para Firestore
 */
export function normalizeTrackToPlain(input) {
    if (!input) return null;

    // Si ya tiene toLegacyFormat, usarlo (es una instancia de Track)
    if (typeof input.toLegacyFormat === 'function') {
        return input.toLegacyFormat();
    }

    // Es un objeto plano, normalizar manualmente
    return {
        name: input.title || input.name || 'Unknown',
        title: input.title || input.name || 'Unknown',
        artist: input.artistName || input.artist || 'Unknown Artist',
        album: input.albumName || input.album || '',
        image: input.image || input.thumbnail || '',
        duration: input.duration || 0,
        addedAt: input.addedAt || Date.now(),
        // Campos adicionales
        id: input.id || null,
        videoId: input.videoId || input.originalId || null,
        source: input.source || 'unknown',
        matchStatus: input.matchStatus || 'not_found',
        matchConfidence: input.matchConfidence || 0,
        originalId: input.originalId || null
    };
}

/**
 * Normaliza un álbum a formato plano para Firestore
 * @param {Object|Album} input - Album como instancia o objeto plano
 * @returns {Object} Objeto plano normalizado
 */
export function normalizeAlbumToPlain(input) {
    if (!input) return null;

    // Si tiene toFirestore, usarlo
    if (typeof input.toFirestore === 'function') {
        return input.toFirestore();
    }

    // Es un objeto plano, normalizar manualmente
    return {
        id: input.id || null,
        name: input.name || 'Unknown Album',
        artistName: input.artistName || input.artist || 'Unknown Artist',
        image: input.image || '',
        releaseDate: input.releaseDate || null,
        totalTracks: input.totalTracks || input.trackCount || 0,
        source: input.source || 'unknown',
        originalId: input.originalId || null,
        addedAt: input.addedAt || Date.now()
    };
}

/**
 * Normaliza un artista a formato plano para Firestore
 * @param {Object|Artist} input - Artist como instancia o objeto plano
 * @returns {Object} Objeto plano normalizado
 */
export function normalizeArtistToPlain(input) {
    if (!input) return null;

    // Si tiene toFirestore, usarlo
    if (typeof input.toFirestore === 'function') {
        return input.toFirestore();
    }

    // Es un objeto plano, normalizar manualmente
    return {
        id: input.id || null,
        name: input.name || 'Unknown Artist',
        image: input.image || '',
        genres: Array.isArray(input.genres) ? input.genres : [],
        followers: input.followers || 0,
        source: input.source || 'unknown',
        originalId: input.originalId || null,
        addedAt: input.addedAt || Date.now()
    };
}

/**
 * Normaliza texto para comparación consistente
 */
export function normalizeText(text) {
    if (!text || typeof text !== 'string') return '';
    return text
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '') // Remove accents
        .replace(/[^\w\s&/]/g, '')       // Keep & and / for artist names
        .replace(/\s+/g, ' ')
        .trim();
}

/**
 * Compara dos textos normalizados
 */
export function textsEqual(text1, text2) {
    return normalizeText(text1) === normalizeText(text2);
}

// =============================================================================
// ARTIST MODEL
// =============================================================================

export class Artist {
    constructor(data = {}) {
        // ID único basado en fingerprint
        this.id = data.id || `artist_${generateFingerprint({
            name: data.name,
            source: data.source
        })}`;

        // Metadatos básicos
        this.name = data.name || 'Unknown Artist';
        this.normalizedName = normalizeText(this.name);

        // Imagen y datos adicionales
        this.image = data.image || '';
        this.genres = Array.isArray(data.genres) ? data.genres : [];
        this.followers = data.followers || 0;

        // Metadatos de importación
        this.source = data.source || 'unknown'; // 'spotify', 'youtube', 'manual'
        this.originalId = data.originalId || null; // ID en plataforma externa
        this.externalUrls = data.externalUrls || {};

        // Timestamps
        this.createdAt = data.createdAt || Date.now();
        this.updatedAt = data.updatedAt || Date.now();
        this.addedAt = data.addedAt || Date.now(); // Cuando el usuario lo guardó

        // Estadísticas
        this.albumCount = data.albumCount || 0;
        this.trackCount = data.trackCount || 0;
    }

    /**
     * Actualiza estadísticas del artista
     */
    updateStats(albums = [], tracks = []) {
        this.albumCount = albums.filter(a => a.artistId === this.id).length;
        this.trackCount = tracks.filter(t => t.artistId === this.id).length;
        this.updatedAt = Date.now();
    }

    /**
     * Verifica si este artista es el mismo que otro (por contenido)
     */
    isSameAs(other) {
        if (!other) return false;

        // Misma plataforma y mismo ID original
        if (this.source === other.source && this.originalId && other.originalId) {
            return this.originalId === other.originalId;
        }

        // Nombres similares (con tolerancia)
        return textsEqual(this.name, other.name);
    }

    /**
     * Fusiona con otro artista (para resolver duplicados)
     */
    mergeWith(other) {
        if (!this.isSameAs(other)) return this;

        // Mantener el ID más antiguo
        if (other.createdAt < this.createdAt) {
            this.id = other.id;
        }

        // Combinar datos (preferir datos más completos)
        if (!this.image && other.image) this.image = other.image;
        if (this.followers < other.followers) this.followers = other.followers;

        // Combinar géneros únicos
        this.genres = [...new Set([...this.genres, ...other.genres])];

        // Combinar URLs externas
        this.externalUrls = { ...this.externalUrls, ...other.externalUrls };

        this.updatedAt = Date.now();

        return this;
    }

    /**
     * Convierte a formato plano para Firestore
     */
    toFirestore() {
        return {
            id: this.id,
            name: this.name,
            normalizedName: this.normalizedName,
            image: this.image,
            genres: this.genres,
            followers: this.followers,
            source: this.source,
            originalId: this.originalId,
            externalUrls: this.externalUrls,
            createdAt: this.createdAt,
            updatedAt: this.updatedAt,
            addedAt: this.addedAt,
            albumCount: this.albumCount,
            trackCount: this.trackCount
        };
    }

    /**
     * Crea instancia desde datos de Firestore
     */
    static fromFirestore(data) {
        return new Artist(data);
    }
}

// =============================================================================
// ALBUM MODEL
// =============================================================================

export class Album {
    constructor(data = {}) {
        // ID único basado en fingerprint
        this.id = data.id || `album_${generateFingerprint({
            name: data.name,
            artist: data.artist,
            source: data.source
        })}`;

        // Metadatos básicos
        this.name = data.name || 'Unknown Album';
        this.normalizedName = normalizeText(this.name);

        // Relación con artista (requerida)
        this.artistId = data.artistId || null;
        this.artistName = data.artistName || data.artist || 'Unknown Artist';

        // Imagen y datos adicionales
        this.image = data.image || '';
        this.releaseDate = data.releaseDate || null;
        this.totalTracks = data.totalTracks || data.trackCount || 0;
        this.genres = Array.isArray(data.genres) ? data.genres : [];

        // Metadatos de importación
        this.source = data.source || 'unknown';
        this.originalId = data.originalId || null;
        this.externalUrls = data.externalUrls || {};

        // Timestamps
        this.createdAt = data.createdAt || Date.now();
        this.updatedAt = data.updatedAt || Date.now();
        this.addedAt = data.addedAt || Date.now();

        // Estadísticas
        this.trackCount = data.trackCount || 0; // Tracks guardados del álbum
    }

    /**
     * Actualiza estadísticas del álbum
     */
    updateStats(tracks = []) {
        this.trackCount = tracks.filter(t => t.albumId === this.id).length;
        this.updatedAt = Date.now();
    }

    /**
     * Verifica si este álbum es el mismo que otro
     */
    isSameAs(other) {
        if (!other) return false;

        // Misma plataforma y mismo ID original
        if (this.source === other.source && this.originalId && other.originalId) {
            return this.originalId === other.originalId;
        }

        // Mismo nombre y mismo artista
        return textsEqual(this.name, other.name) &&
               textsEqual(this.artistName, other.artistName);
    }

    /**
     * Fusiona con otro álbum
     */
    mergeWith(other) {
        if (!this.isSameAs(other)) return this;

        // Mantener el ID más antiguo
        if (other.createdAt < this.createdAt) {
            this.id = other.id;
        }

        // Combinar datos
        if (!this.image && other.image) this.image = other.image;
        if (!this.releaseDate && other.releaseDate) this.releaseDate = other.releaseDate;
        if (this.totalTracks < other.totalTracks) this.totalTracks = other.totalTracks;

        // Combinar géneros únicos
        this.genres = [...new Set([...this.genres, ...other.genres])];

        // Combinar URLs externas
        this.externalUrls = { ...this.externalUrls, ...other.externalUrls };

        this.updatedAt = Date.now();

        return this;
    }

    /**
     * Convierte a formato plano para Firestore
     */
    toFirestore() {
        return {
            id: this.id,
            name: this.name,
            normalizedName: this.normalizedName,
            artistId: this.artistId,
            artistName: this.artistName,
            image: this.image,
            releaseDate: this.releaseDate,
            totalTracks: this.totalTracks,
            genres: this.genres,
            source: this.source,
            originalId: this.originalId,
            externalUrls: this.externalUrls,
            createdAt: this.createdAt,
            updatedAt: this.updatedAt,
            addedAt: this.addedAt,
            trackCount: this.trackCount
        };
    }

    /**
     * Crea instancia desde datos de Firestore
     */
    static fromFirestore(data) {
        return new Album(data);
    }
}

// =============================================================================
// TRACK MODEL
// =============================================================================

export class Track {
    constructor(data = {}) {
        // ID único basado en fingerprint
        this.id = data.id || `track_${generateFingerprint({
            title: data.title,
            artist: data.artist,
            album: data.album,
            duration: data.duration,
            isrc: data.isrc,
            source: data.source
        })}`;

        // Metadatos básicos
        this.title = data.title || data.name || 'Unknown Track';
        this.normalizedTitle = normalizeText(this.title);

        // Relaciones (requeridas para integridad)
        this.artistId = data.artistId || null;
        this.artistName = data.artistName || data.artist || 'Unknown Artist';

        this.albumId = data.albumId || null;
        this.albumName = data.albumName || data.album || '';

        // Datos técnicos
        this.duration = data.duration || 0; // en segundos
        this.isrc = data.isrc || null;

        // Imagen (normalmente del álbum, pero puede ser propia)
        this.image = data.image || '';

        // Metadatos de importación
        this.source = data.source || 'unknown';
        this.originalId = data.originalId || null;
        this.externalUrls = data.externalUrls || {};

        // Estado de matching
        this.matchStatus = data.matchStatus || 'not_found'; // 'matched', 'partial', 'not_found'
        this.matchConfidence = data.matchConfidence || 0;

        // Timestamps
        this.createdAt = data.createdAt || Date.now();
        this.updatedAt = data.updatedAt || Date.now();
        this.addedAt = data.addedAt || Date.now(); // Cuando el usuario lo guardó
    }

    /**
     * Verifica si este track es el mismo que otro
     */
    isSameAs(other) {
        if (!other) return false;

        // Misma plataforma y mismo ID original
        if (this.source === other.source && this.originalId && other.originalId) {
            return this.originalId === other.originalId;
        }

        // Mismo ISRC
        if (this.isrc && other.isrc) {
            return this.isrc === other.isrc;
        }

        // Mismo título, artista y duración similar (±5 segundos)
        const sameTitle = textsEqual(this.title, other.title);
        const sameArtist = textsEqual(this.artistName, other.artistName);
        const similarDuration = Math.abs(this.duration - other.duration) <= 5;

        return sameTitle && sameArtist && similarDuration;
    }

    /**
     * Fusiona con otro track
     */
    mergeWith(other) {
        if (!this.isSameAs(other)) return this;

        // Mantener el ID más antiguo
        if (other.createdAt < this.createdAt) {
            this.id = other.id;
        }

        // Combinar datos (preferir datos más completos)
        if (!this.image && other.image) this.image = other.image;
        if (!this.albumId && other.albumId) {
            this.albumId = other.albumId;
            this.albumName = other.albumName;
        }
        if (!this.artistId && other.artistId) {
            this.artistId = other.artistId;
            this.artistName = other.artistName;
        }
        if (!this.isrc && other.isrc) this.isrc = other.isrc;

        // Mejorar match si el otro es mejor
        if (other.matchConfidence > this.matchConfidence) {
            this.matchStatus = other.matchStatus;
            this.matchConfidence = other.matchConfidence;
        }

        // Combinar URLs externas
        this.externalUrls = { ...this.externalUrls, ...other.externalUrls };

        this.updatedAt = Date.now();

        return this;
    }

    /**
     * Convierte a formato plano para Firestore
     */
    toFirestore() {
        return {
            id: this.id,
            title: this.title,
            normalizedTitle: this.normalizedTitle,
            artistId: this.artistId,
            artistName: this.artistName,
            albumId: this.albumId,
            albumName: this.albumName,
            duration: this.duration,
            isrc: this.isrc,
            image: this.image,
            source: this.source,
            originalId: this.originalId,
            externalUrls: this.externalUrls,
            matchStatus: this.matchStatus,
            matchConfidence: this.matchConfidence,
            createdAt: this.createdAt,
            updatedAt: this.updatedAt,
            addedAt: this.addedAt
        };
    }

    /**
     * Crea instancia desde datos de Firestore
     */
    static fromFirestore(data) {
        return new Track(data);
    }

    /**
     * Convierte a formato legacy para compatibilidad
     */
    toLegacyFormat() {
        return {
            name: this.title,
            title: this.title,
            artist: this.artistName,
            album: this.albumName,
            image: this.image,
            duration: this.duration,
            addedAt: this.addedAt,
            // Campos adicionales para contexto
            id: this.id,
            source: this.source,
            matchStatus: this.matchStatus,
            matchConfidence: this.matchConfidence
        };
    }
}

// =============================================================================
// COLLECTION HELPERS
// =============================================================================

/**
 * Clase helper para manejar colecciones de entidades con deduplicación
 */
export class EntityCollection {
    constructor(entities = []) {
        this.entities = new Map();
        this.addMany(entities);
    }

    /**
     * Añade una entidad (con deduplicación automática)
     */
    add(entity) {
        if (!entity || !entity.id) return;

        const existing = this.entities.get(entity.id);
        if (existing) {
            existing.mergeWith(entity);
        } else {
            this.entities.set(entity.id, entity);
        }
    }

    /**
     * Añade múltiples entidades
     */
    addMany(entities) {
        entities.forEach(entity => this.add(entity));
    }

    /**
     * Obtiene entidad por ID
     */
    get(id) {
        return this.entities.get(id) || null;
    }

    /**
     * Verifica si existe entidad por ID
     */
    has(id) {
        return this.entities.has(id);
    }

    /**
     * Obtiene todas las entidades como array
     */
    getAll() {
        return Array.from(this.entities.values());
    }

    /**
     * Filtra entidades
     */
    filter(predicate) {
        return this.getAll().filter(predicate);
    }

    /**
     * Número de entidades
     */
    size() {
        return this.entities.size;
    }

    /**
     * Convierte a array para Firestore
     */
    toFirestoreArray() {
        return this.getAll().map(entity => entity.toFirestore());
    }

    /**
     * Busca entidad similar (para deduplicación)
     */
    findSimilar(entity) {
        for (const existing of this.entities.values()) {
            if (existing.isSameAs(entity)) {
                return existing;
            }
        }
        return null;
    }

    /**
     * Limpia la colección
     */
    clear() {
        this.entities.clear();
    }
}

// =============================================================================
// IMPORT RESULT MODEL
// =============================================================================

/**
 * Modelo para resultados de importación con estadísticas detalladas
 */
export class ImportResult {
    constructor() {
        this.success = true;
        this.stats = {
            total: 0,
            matched: 0,
            partial: 0,
            failed: 0,
            duplicates: 0
        };

        // Colecciones organizadas
        this.tracks = new EntityCollection();
        this.albums = new EntityCollection();
        this.artists = new EntityCollection();

        // Resultados específicos por tipo
        this.likedSongs = [];
        this.playlists = [];
        this.youtubePlaylist = null;

        // Errores y warnings
        this.errors = [];
        this.warnings = [];

        // Metadata
        this.importId = uuidv4();
        this.startedAt = Date.now();
        this.completedAt = null;
        this.source = 'unknown';
    }

    /**
     * Añade un track procesado
     */
    addTrack(track, context = 'unknown') {
        this.tracks.add(track);
        this.stats.total++;

        switch (track.matchStatus) {
            case 'matched':
                this.stats.matched++;
                break;
            case 'partial':
                this.stats.partial++;
                break;
            default:
                this.stats.failed++;
        }

        // Si es canción favorita, añadir a likedSongs
        if (context === 'liked') {
            this.likedSongs.push(track);
        }
    }

    /**
     * Añade un álbum
     */
    addAlbum(album) {
        this.albums.add(album);
    }

    /**
     * Añade un artista
     */
    addArtist(artist) {
        this.artists.add(artist);
    }

    /**
     * Añade una playlist completa
     */
    addPlaylist(name, description, tracks) {
        // Crear IDs únicos para tracks de playlist
        const playlistTracks = tracks.map(track => ({
            ...track,
            id: track.id || `playlist_track_${uuidv4()}`
        }));

        this.playlists.push({
            name,
            description,
            tracks: playlistTracks,
            trackCount: playlistTracks.length
        });

        // Añadir tracks a la colección general
        playlistTracks.forEach(track => this.addTrack(track, 'playlist'));
    }

    /**
     * Añade playlist de YouTube
     */
    addYouTubePlaylist(playlistInfo, tracks) {
        this.youtubePlaylist = {
            ...playlistInfo,
            tracks: tracks.map(track => ({
                ...track,
                id: track.id || `youtube_track_${uuidv4()}`
            }))
        };

        // Añadir tracks a la colección general
        this.youtubePlaylist.tracks.forEach(track => this.addTrack(track, 'youtube'));
    }

    /**
     * Añade un error
     */
    addError(type, message, details = null) {
        this.errors.push({
            type,
            message,
            details,
            timestamp: Date.now()
        });
    }

    /**
     * Añade un warning
     */
    addWarning(type, message, details = null) {
        this.warnings.push({
            type,
            message,
            details,
            timestamp: Date.now()
        });
    }

    /**
     * Marca como completado
     */
    complete() {
        this.completedAt = Date.now();
        this.success = this.errors.length === 0;
    }

    /**
     * Obtiene estadísticas formateadas
     */
    getFormattedStats() {
        const { total, matched, partial, failed } = this.stats;
        const matchRate = total > 0 ? Math.round(((matched + partial) / total) * 100) : 0;

        return {
            matchRate,
            total,
            matched,
            partial,
            failed,
            success: this.success,
            duration: this.completedAt ? this.completedAt - this.startedAt : 0
        };
    }

    /**
     * Convierte a formato compatible con la UI existente
     * IMPORTANTE: Usa normalizeTrackToPlain() para manejar tanto instancias
     * de Track como objetos planos de forma defensiva
     */
    toLegacyFormat() {
        return {
            success: this.success,
            stats: this.stats,
            likedSongs: this.likedSongs.map(t => normalizeTrackToPlain(t)),
            playlists: this.playlists.map(p => ({
                name: p.name,
                description: p.description,
                tracks: p.tracks.map(t => normalizeTrackToPlain(t))
            })),
            playlist: this.youtubePlaylist ? {
                name: this.youtubePlaylist.name,
                tracks: this.youtubePlaylist.tracks.map(t => normalizeTrackToPlain(t))
            } : null,
            albums: this.albums.getAll().map(a => normalizeAlbumToPlain(a)),
            artists: this.artists.getAll().map(a => normalizeArtistToPlain(a)),
            errors: this.errors,
            warnings: this.warnings
        };
    }
}
