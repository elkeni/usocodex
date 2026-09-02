/**
 * TRACK NORMALIZER
 * Garantiza que NINGUNA canción se guarde sin información crítica
 * 
 * Este módulo es OBLIGATORIO antes de cualquier write a Firebase
 * 
 * @version 1.0.0
 * @date 2025-12-17
 */

// =============================================================================
// CONSTANTES
// =============================================================================

const DEFAULTS = {
    UNKNOWN_ARTIST: 'Unknown Artist',
    UNKNOWN_ALBUM: 'Unknown Album',
    SINGLE_ALBUM: 'Single',
    DEFAULT_DURATION: 0,
    DEFAULT_IMAGE: ''
};

// =============================================================================
// FUNCIÓN PRINCIPAL: finalizeTrack
// =============================================================================

/**
 * OBLIGATORIO: Combina datos del track original + matchedTrack
 * Garantiza que TODOS los campos críticos existan
 * 
 * @param {Object} originalTrack - Track original (de Spotify/YouTube)
 * @param {Object} matchedTrack - Track del matching (puede estar incompleto)
 * @param {string} source - Fuente: 'spotify', 'youtube', 'unknown'
 * @returns {Object} Track completo listo para Firebase
 * @throws {Error} Si no se puede crear un track válido
 */
export function finalizeTrack(originalTrack, matchedTrack = null, source = 'unknown') {
    // Combinar datos (matchedTrack tiene prioridad, pero originalTrack es fallback)
    const combined = {
        ...originalTrack,
        ...matchedTrack
    };

    // =========================================================================
    // 1. TITLE (obligatorio)
    // =========================================================================
    const title = _extractTitle(combined, originalTrack, matchedTrack);
    if (!title) {
        throw new Error('Track inválido: falta título');
    }

    // =========================================================================
    // 2. ARTIST (obligatorio)
    // =========================================================================
    const artist = _extractArtist(combined, originalTrack, matchedTrack);
    if (!artist) {
        console.warn(`[TrackNormalizer] Track "${title}" sin artista, usando default`);
    }

    // =========================================================================
    // 3. ALBUM (obligatorio - con reglas por fuente)
    // =========================================================================
    const album = _extractAlbum(combined, originalTrack, matchedTrack, source);

    // =========================================================================
    // 4. OTROS CAMPOS
    // =========================================================================
    const duration = _extractDuration(combined, originalTrack, matchedTrack);
    const image = _extractImage(combined, originalTrack, matchedTrack);

    // =========================================================================
    // 5. CONSTRUIR TRACK FINAL
    // =========================================================================
    const finalTrack = {
        // Campos obligatorios
        name: title,
        title: title,
        artist: artist || DEFAULTS.UNKNOWN_ARTIST,
        album: album,

        // Campos adicionales
        duration: duration,
        image: image,

        // Metadata
        addedAt: Date.now(),
        source: source,

        // Preservar campos útiles del original/matched
        videoId: matchedTrack?.videoId || originalTrack?.videoId || null,
        isrc: originalTrack?.isrc || matchedTrack?.isrc || null,
        originalId: originalTrack?.originalId || null,
        spotifyUrl: originalTrack?.spotifyUrl || matchedTrack?.spotifyUrl || null,
        matchConfidence: originalTrack?.matchConfidence || matchedTrack?.matchConfidence || 0
    };

    // =========================================================================
    // 6. VALIDACIÓN FINAL
    // =========================================================================
    validateTrack(finalTrack);

    return finalTrack;
}

// =============================================================================
// FUNCIONES DE EXTRACCIÓN
// =============================================================================

function _extractTitle(combined, original, matched) {
    return (
        matched?.title ||
        matched?.name ||
        original?.title ||
        original?.name ||
        combined?.title ||
        combined?.name ||
        null
    );
}

function _extractArtist(combined, original, matched) {
    // Prioridad: matched > original > combined
    let artist = matched?.artist || original?.artist || combined?.artist;

    // Normalizar si es objeto
    if (typeof artist === 'object' && artist !== null) {
        artist = artist.name || artist['#text'] || null;
    }

    // Normalizar si es string vacío
    if (typeof artist === 'string') {
        artist = artist.trim();
        if (artist === '') artist = null;
    }

    // También intentar con artistName
    if (!artist) {
        artist = matched?.artistName || original?.artistName || combined?.artistName;
    }

    return artist || null;
}

function _extractAlbum(combined, original, matched, source) {
    // Prioridad: original > matched > combined (el original de Spotify tiene el álbum real)
    let album = original?.album || original?.albumName ||
        matched?.album || matched?.albumName ||
        combined?.album || combined?.albumName;

    // Normalizar si es objeto
    if (typeof album === 'object' && album !== null) {
        album = album.name || album.title || null;
    }

    // Normalizar string vacío
    if (typeof album === 'string') {
        album = album.trim();
        if (album === '') album = null;
    }

    // Si no hay álbum, aplicar reglas por fuente
    if (!album) {
        switch (source) {
            case 'spotify':
                // Spotify debería tener álbum, pero si no, usar default
                album = DEFAULTS.UNKNOWN_ALBUM;
                break;
            case 'youtube':
                // YouTube raramente tiene álbum, usar "Single"
                album = DEFAULTS.SINGLE_ALBUM;
                break;
            default:
                album = DEFAULTS.UNKNOWN_ALBUM;
        }
    }

    return album;
}

function _extractDuration(combined, original, matched) {
    const duration = matched?.duration || original?.duration || combined?.duration;

    // Asegurar que es número
    if (typeof duration === 'number' && duration > 0) {
        return Math.round(duration);
    }

    return DEFAULTS.DEFAULT_DURATION;
}

function _extractImage(combined, original, matched) {
    // Prioridad: matched > original > combined
    const image = matched?.image || matched?.thumbnail ||
        original?.image || original?.thumbnail ||
        combined?.image || combined?.thumbnail;

    if (typeof image === 'string' && image.trim() !== '') {
        return image.trim();
    }

    return DEFAULTS.DEFAULT_IMAGE;
}

// =============================================================================
// VALIDACIÓN
// =============================================================================

/**
 * Valida que un track tenga todos los campos obligatorios
 * @param {Object} track - Track a validar
 * @throws {Error} Si el track es inválido
 */
export function validateTrack(track) {
    if (!track) {
        throw new Error('Track inválido: objeto vacío');
    }

    if (!track.title && !track.name) {
        throw new Error('Track inválido: falta título');
    }

    if (!track.artist) {
        throw new Error(`Track inválido: falta artista para "${track.title || track.name}"`);
    }

    if (!track.album) {
        throw new Error(`Track inválido: falta álbum para "${track.title || track.name}"`);
    }

    return true;
}

// =============================================================================
// FUNCIÓN BATCH: finalizeTracksArray
// =============================================================================

/**
 * Aplica finalizeTrack a un array de tracks
 * Filtra tracks inválidos y los reporta
 * 
 * @param {Array} tracks - Array de tracks
 * @param {string} source - Fuente de los tracks
 * @returns {{ valid: Array, invalid: Array }} Tracks válidos e inválidos
 */
export function finalizeTracksArray(tracks, source = 'unknown') {
    if (!Array.isArray(tracks)) {
        return { valid: [], invalid: [] };
    }

    const valid = [];
    const invalid = [];

    for (const track of tracks) {
        try {
            // Determinar si tiene matchedTrack
            const original = track;
            const matched = track.matchedTrack || null;

            const finalTrack = finalizeTrack(original, matched, source);
            valid.push(finalTrack);
        } catch (err) {
            console.warn(`[TrackNormalizer] Track inválido descartado:`, err.message, track);
            invalid.push({ track, error: err.message });
        }
    }

    if (invalid.length > 0) {
        console.warn(`[TrackNormalizer] ${invalid.length} tracks inválidos de ${tracks.length}`);
    }

    return { valid, invalid };
}

// =============================================================================
// EXPORTS
// =============================================================================

const trackNormalizer = {
    finalizeTrack,
    finalizeTracksArray,
    validateTrack,
    DEFAULTS
};

export default trackNormalizer;
