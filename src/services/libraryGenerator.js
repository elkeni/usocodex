/**
 * LIBRARY GENERATOR SERVICE
 * 
 * Este servicio permite al usuario CREAR playlists personalizadas en su biblioteca.
 * Funciona bajo demanda (cuando el usuario lo solicita).
 * 
 * Capacidades:
 * 1. Generar por Vibe (Input de texto libre: "Música para programar", "Fiesta en la playa")
 * 2. Generar por Género Estricto (Botones: "Rock", "Pop", etc.)
 */

import { artistGetTopTracks, trackSearch, getRelatedArtists } from './unifiedService';
import { GENRE_RULES, VIBE_CHARACTERISTICS, VIBE_GRADIENTS } from './musicConstants';

class LibraryGenerator {

    /**
     * Entry Point: Decide si es Género o Vibe y genera
     */
    async generate(input, userContext) {
        const userId = userContext.user?.uid || 'anon';
        const genreMatch = this._matchGenre(input);

        if (genreMatch) {
            console.log(`[LibraryGenerator] Generando por Género Estricto: ${genreMatch}`);
            return this._generateByGenre(genreMatch, userId);
        }

        // HEURÍSTICA: Si no hay keywords de vibe claras, asumir que es un ARTISTA
        const vibeAnalysis = this._analyzeVibe(input);
        if (vibeAnalysis.matchScore === 0 && input.length < 40) {
            console.log(`[LibraryGenerator] No se detectó vibe, intentando como Artista: ${input}`);
            try {
                const artistMix = await this._generateByArtist(input, userId);
                if (artistMix) return artistMix;
            } catch (e) {
                console.warn('[LibraryGenerator] Falló generación por artista, volviendo a Vibe genérico');
            }
        }

        console.log(`[LibraryGenerator] Generando por Vibe: ${input}`);
        return this._generateByVibe(input, userContext, vibeAnalysis);
    }

    // =========================================================================
    // LÓGICA DE GÉNERO
    // =========================================================================

    async _generateByGenre(genreName, userId) {
        const rules = GENRE_RULES[genreName];
        const tracks = await this._fetchGenreTracks(genreName, rules);
        const uniqueTracks = this._deduplicateTracks(tracks).slice(0, 40);

        const now = Date.now();
        const colors = this._getRandomGradientColors();

        return {
            id: `lib-gen-${now}-${Math.random().toString(36).substr(2, 5)}`,
            userId,
            title: `${genreName} Esencial`,
            description: `Lo mejor del ${genreName.toLowerCase()}, seleccionado manualmente.`,
            vibe: genreName.toLowerCase(),
            tags: [genreName.toLowerCase(), 'library-generated'],
            cover: { type: 'gradient', colors },
            tracks: this._formatTracks(uniqueTracks),
            isNative: true,
            createdAt: now,
            updatedAt: now
        };
    }

    async _fetchGenreTracks(genre, rules) {
        // PARALLELIZATION: Fetch all artists simultaneously instead of sequentially
        const promises = rules.seedArtists.map(async (artist) => {
            try {
                const res = await artistGetTopTracks({ artist, limit: 10 });
                return (res?.toptracks?.track || []).filter(t => this._passesGenreFilter(t, rules));
            } catch (e) {
                console.warn(`[LibraryGenerator] Error fetching ${artist}:`, e);
                return [];
            }
        });

        const results = await Promise.all(promises);
        return results.flat(); // Flatten array of arrays
    }

    _passesGenreFilter(track, rules) {
        const text = ((track.name || track.title) + ' ' + (track.artist?.name || track.artist)).toLowerCase();
        return !rules.bannedKeywords.some(b => text.includes(b));
    }

    _matchGenre(input) {
        const normalized = input.toLowerCase().trim();
        return Object.keys(GENRE_RULES).find(k => k.toLowerCase() === normalized) || null;
    }

    // =========================================================================
    // LÓGICA DE VIBE (User Input)
    // =========================================================================

    async _generateByArtist(artistName, userId) {
        // 1. Validar artista y obtener top tracks
        const mainTracksRes = await artistGetTopTracks({ artist: artistName, limit: 15 });
        const mainTracks = mainTracksRes?.toptracks?.track || [];

        if (mainTracks.length === 0) return null; // No es un artista válido

        // Nombre real del artista (capitalizado correctamente desde la API)
        const realArtistName = typeof mainTracks[0].artist === 'object' ? mainTracks[0].artist.name : mainTracks[0].artist;
        const artistImage = mainTracks[0].image?.[3]?.['#text'] || mainTracks[0].image?.[2]?.['#text'] || '';

        // 2. Obtener artistas relacionados para variedad
        const relatedArtists = await getRelatedArtists(realArtistName, 3);

        // 3. Fetch tracks de relacionados en paralelo
        const relatedPromises = (relatedArtists || []).map(async (rel) => {
            try {
                const res = await artistGetTopTracks({ artist: rel.name, limit: 5 });
                return res?.toptracks?.track || [];
            } catch (e) { return []; }
        });

        const relatedTracksResults = await Promise.all(relatedPromises);
        const relatedTracks = relatedTracksResults.flat();

        // 4. Construir Mix (60% Artista Principal, 40% Relacionados)
        const mixTracks = [];
        const mainPool = [...mainTracks];
        const relatedPool = [...relatedTracks].sort(() => Math.random() - 0.5);

        // Asegurar que empezamos con el artista principal
        mixTracks.push(mainPool.shift());
        mixTracks.push(mainPool.shift());

        while (mixTracks.length < 30 && (mainPool.length > 0 || relatedPool.length > 0)) {
            // 60% probabilidad de main artist si quedan
            const pickMain = (Math.random() < 0.6 && mainPool.length > 0) || relatedPool.length === 0;

            if (pickMain && mainPool.length > 0) {
                mixTracks.push(mainPool.shift());
            } else if (relatedPool.length > 0) {
                mixTracks.push(relatedPool.shift());
            } else {
                break;
            }
        }

        const now = Date.now();
        console.log(`[LibraryGenerator] ✅ Artist Mix generado para: ${realArtistName}`);

        return {
            id: `lib-artist-${now}-${Math.random().toString(36).substr(2, 5)}`,
            userId,
            title: `This Is ${realArtistName}`,
            description: `Sus mejores éxitos y música relacionada.`,
            vibe: 'artist-mix',
            tags: [realArtistName, 'artist-mix', 'library-generated'],
            cover: { type: 'image', url: artistImage }, // Usar foto del artista si es posible
            tracks: this._formatTracks(mixTracks),
            isNative: true,
            createdAt: now,
            updatedAt: now
        };
    }

    // =========================================================================
    // LÓGICA DE VIBE (User Input)
    // =========================================================================

    async _generateByVibe(input, userContext, preCalculatedVibe = null) {
        const vibeAnalysis = preCalculatedVibe || this._analyzeVibe(input);
        const tracks = await this._resolveTracksForVibe(vibeAnalysis, userContext);
        const title = this._generateSmartTitle(vibeAnalysis, input);
        const gradient = VIBE_GRADIENTS[vibeAnalysis.primaryVibe] || VIBE_GRADIENTS.default;

        const now = Date.now();

        return {
            id: `lib-vibe-${now}-${Math.random().toString(36).substr(2, 5)}`,
            userId: userContext.user?.uid || 'anon',
            title,
            description: vibeAnalysis.description,
            vibe: vibeAnalysis.primaryVibe,
            tags: vibeAnalysis.keywords,
            cover: { type: 'gradient', colors: this._hexToRgb(gradient[0]) },
            tracks: this._formatTracks(tracks.slice(0, 40)),
            isNative: true,
            createdAt: now,
            updatedAt: now
        };
    }

    _analyzeVibe(input) {
        const normalized = input.toLowerCase().trim();
        let primaryVibe = 'chill';
        let matchScore = 0;
        let matchedKeywords = [];

        for (const [vibe, config] of Object.entries(VIBE_CHARACTERISTICS)) {
            for (const kw of config.keywords) {
                if (normalized.includes(kw)) {
                    matchedKeywords.push(kw);
                    if (kw.length > matchScore) {
                        matchScore = kw.length;
                        primaryVibe = vibe;
                    }
                }
            }
        }

        return {
            primaryVibe,
            description: VIBE_CHARACTERISTICS[primaryVibe].description,
            keywords: matchedKeywords,
            originalInput: input,
            matchScore // Return score
        };
    }

    async _resolveTracksForVibe(vibeAnalysis, userContext) {
        const { favorites = [], listeningHistory = [] } = userContext;

        // 1. IMPROVED ACCURACY: Filter User's Favorites/History by Vibe
        // We only want to include local tracks if they actually fit the requested mood/genre
        const allLocal = [...favorites, ...listeningHistory];
        const relevantLocal = allLocal.filter(t => {
            const text = `${t.name} ${t.artist} ${t.album || ''}`.toLowerCase();
            return vibeAnalysis.keywords.some(k => text.includes(k)) ||
                text.includes(vibeAnalysis.primaryVibe) ||
                text.includes(vibeAnalysis.originalInput.toLowerCase());
        });

        // 2. Prepare Search
        const searchTerms = vibeAnalysis.keywords.length > 0 ? vibeAnalysis.keywords : [vibeAnalysis.primaryVibe];
        // Ensure unique terms
        const uniqueSearchTerms = [...new Set(searchTerms)];

        const isGenreVibe = ['latino', 'salsa', 'tropical', 'mexican', 'cumbia peruana'].includes(vibeAnalysis.primaryVibe);

        const effectiveSearchTerms = isGenreVibe
            ? uniqueSearchTerms.slice(0, 4)
            : uniqueSearchTerms.map(t => `${t} music`).slice(0, 3);

        // 3. PARALLEL FETCHING for Fresh Tracks
        const freshPromises = effectiveSearchTerms.map(async (term) => {
            try {
                // If genre specific, we search directly. If general vibe, we append music to context.
                const res = await trackSearch({ track: term, limit: 25 });
                return res?.results?.trackmatches?.track || [];
            } catch (e) {
                console.warn(`[LibraryGenerator] Error searching ${term}:`, e);
                return [];
            }
        });

        const freshResults = await Promise.all(freshPromises);
        let freshTracks = freshResults.flat();

        // 4. Mixing Logic: Prefer Relevant Local, fill with Fresh
        const uniqueRelevantLocal = this._deduplicateTracks(relevantLocal);
        const uniqueFresh = this._deduplicateTracks(freshTracks).filter(t =>
            !uniqueRelevantLocal.some(l => l.name === t.name)
        );

        // Shuffle
        const shuffledFresh = uniqueFresh.sort(() => Math.random() - 0.5);
        const shuffledLocal = uniqueRelevantLocal.sort(() => Math.random() - 0.5);

        const targetSize = 30;
        const finalSelection = [];

        // Dynamic Mixing:
        // If we have relevant local tracks, use them up to 50%
        // If not, use 100% fresh.
        while (finalSelection.length < targetSize) {
            const wantLocal = Math.random() < 0.5; // 50/50 split preference

            if (wantLocal && shuffledLocal.length > 0) {
                finalSelection.push(shuffledLocal.pop());
            } else if (shuffledFresh.length > 0) {
                finalSelection.push(shuffledFresh.pop());
            } else if (shuffledLocal.length > 0) {
                // Fallback to local if fresh exhausted
                finalSelection.push(shuffledLocal.pop());
            } else {
                break;
            }
        }

        return finalSelection;
    }



    // =========================================================================
    // UTILITIES
    // =========================================================================

    _formatTracks(tracks) {
        const now = Date.now();
        return tracks.map((t, i) => ({
            id: t.id || `t-${now}-${i}`,
            title: t.name || t.title,
            artist: typeof t.artist === 'object' ? t.artist.name : t.artist,
            album: t.album?.title || t.album || '',
            duration: t.duration || 0,
            image: t.image?.['#text'] || t.image || '',
            addedAt: now,
            resolved: null
        }));
    }

    _generateSmartTitle(vibe, input) {
        if (input.length > 3 && input.length < 25) return input.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
        return `${vibe.primaryVibe.charAt(0).toUpperCase() + vibe.primaryVibe.slice(1)} Mix`;
    }

    _deduplicateTracks(tracks) {
        const seen = new Set();
        return tracks.filter(t => {
            const key = `${t.artist}-${t.name}`.toLowerCase();
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });
    }

    _hexToRgb(hex) {
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        return result ? [parseInt(result[1], 16), parseInt(result[2], 16), parseInt(result[3], 16)] : [0, 0, 0];
    }

    _getRandomGradientColors() {
        const values = Object.values(VIBE_GRADIENTS);
        const hex = values[Math.floor(Math.random() * values.length)][0];
        return this._hexToRgb(hex);
    }
}

export const libraryGenerator = new LibraryGenerator();
