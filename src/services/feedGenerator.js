/**
 * FEED GENERATOR SERVICE (Paradisquo Adaptive Curator)
 * 
 * Este servicio corre automáticamente en segundo plano para poblar el Feed.
 * "Aprende" del usuario analizando su historial y favoritos.
 * 
 * Salidas:
 * - Daily Mixes
 * - Discover Weekly
 * - On Repeat
 */

import { artistGetTopTracks, getRelatedArtists, trackSearch } from './unifiedService';
import { GENRE_RULES, VIBE_CHARACTERISTICS } from './musicConstants';

class FeedGenerator {

    /**
     * Genera recomendaciones automáticas para el Feed
     * @param {Object} userContext - { user, favorites, listeningHistory, tasteEngagement }
     */
    async generateFeedRecommendations(userContext) {
        const CACHE_KEY = `feed_gen_cache_v2_${userContext.user?.uid || 'guest'}`;
        const CACHE_TTL = 3 * 24 * 60 * 60 * 1000; // 3 días en milisegundos

        // 1. Intentar recuperar del caché
        try {
            const cachedRaw = localStorage.getItem(CACHE_KEY);
            if (cachedRaw) {
                const { timestamp, data } = JSON.parse(cachedRaw);
                const age = Date.now() - timestamp;

                // Solo usamos caché si es válido y tiene CONTENIDO SUSTANCIAL (>= 1 lista)
                // Antes pedía 2, pero si solo se generó 'Descubrimiento' porque falta historia para otros, vale la pena guardar.
                if (age < CACHE_TTL && Array.isArray(data) && data.length >= 1) {
                    console.log(`[FeedGenerator] ⚡ Usando caché (${Math.round(age / 3600000)}h de antigüedad)`);
                    return data;
                }
            }
        } catch (e) {
            console.warn('[FeedGenerator] Error leyendo caché:', e);
        }

        console.log('[FeedGenerator] 🔄 Generando nuevas recomendaciones...');
        console.log(`[FeedGenerator] Historial disponible: ${userContext.listeningHistory?.length || 0} tracks`);

        const recommendations = [];

        // 1. Daily Mixes
        if (userContext.listeningHistory?.length >= 4) {
            const dailyMix = await this._generateDailyMix(userContext);
            if (dailyMix) recommendations.push(dailyMix);
        } else {
            console.log('[FeedGenerator] ⚠️ Saltando Daily Mix: Historial insuficiente (< 4)');
        }

        // 2. Discover Mode
        const discover = await this._generateDiscoverWeekly(userContext);
        if (discover) recommendations.push(discover);

        // 3. Smart Genre Mix
        const smartMix = await this._generateSmartGenreMix(userContext);
        if (smartMix) recommendations.push(smartMix);

        // 4. On Repeat
        const onRepeat = this._generateOnRepeat(userContext);
        if (onRepeat) recommendations.push(onRepeat);

        console.log(`[FeedGenerator] ✅ Generados ${recommendations.length} mixes`);

        // Guardar en caché SOLO si el resultado es robusto (>= 2 mixes)
        if (recommendations.length >= 2) {
            try {
                localStorage.setItem(CACHE_KEY, JSON.stringify({
                    timestamp: Date.now(),
                    data: recommendations
                }));
                console.log('[FeedGenerator] 💾 Cache actualizado (3 días)');
            } catch (e) {
                console.warn('[FeedGenerator] Error guardando caché:', e);
            }
        } else {
            console.log('[FeedGenerator] 🚫 Resultado pobre (< 2 mixes), NO se guardará en caché para reintentar luego.');
        }

        return recommendations;
    }



    // =========================================================================
    // ESTRATEGIAS DE GENERACIÓN AUTOMÁTICA
    // =========================================================================

    async _generateDailyMix(userContext) {
        const { listeningHistory = [] } = userContext;
        // REQUERIMIENTO: Al menos 20 canciones en historial para considerar que hay "buena data"
        if (listeningHistory.length < 20) return null;

        // 1. Análisis Profundo: Mirar las últimas 100 canciones (o las que haya)
        // Buscamos patrones reales de repetición, no solo lo último que sonó
        const recentHistory = listeningHistory.slice(0, 100);
        const artistFreq = {};

        recentHistory.forEach(t => {
            const artist = (typeof t.artist === 'object' ? t.artist.name : t.artist);
            if (artist) {
                artistFreq[artist] = (artistFreq[artist] || 0) + 1;
            }
        });

        // 2. Top Artistas: Elegimos los 3 más escuchados recientemente
        const topArtists = Object.entries(artistFreq)
            .sort((a, b) => b[1] - a[1]) // Orden descendente por frecuencia
            .slice(0, 3)
            .map(([name]) => name);

        if (topArtists.length === 0) return null;

        const mainArtist = topArtists[0];

        // 3. Generación Robusta: Traemos muchas canciones de estos 3 artistas
        try {
            const promises = topArtists.map(artist =>
                artistGetTopTracks({ artist, limit: 20 }) // 20 tracks por artista = ~60 tracks raw
                    .then(res => (res?.toptracks?.track || []).map(t => this._formatTrack(t)))
                    .catch(() => [])
            );

            const results = await Promise.all(promises);
            let combinedTracks = results.flat();

            // 4. Limpieza y Mezcla
            combinedTracks = this._deduplicateTracks(combinedTracks);
            combinedTracks = combinedTracks.sort(() => Math.random() - 0.5); // Shuffle

            // Solo devolvemos si logramos una lista decente (> 15 canciones)
            if (combinedTracks.length < 15) return null;

            return {
                id: `feed-daily-${Date.now()}`,
                title: `Daily Mix: ${mainArtist}`,
                description: `Basado en tu rotación reciente de ${topArtists.join(', ')}`,
                tracks: combinedTracks, // Mandamos todo lo que encontramos (hasta 60)
                image: '/PlaylisyImages/dailymix.jpg',
                type: 'daily-mix',
                isNative: true
            };
        } catch (e) {
            console.warn('[FeedGenerator] Error generando Daily Mix:', e);
            return null;
        }
    }

    async _generateDiscoverWeekly(userContext) {
        const { favorites = [] } = userContext;
        // Requisito: Al menos 5 favoritos para tener semillas
        if (favorites.length < 5) return null;

        // 1. Obtener semillas variadas de favoritos recientes
        const recentFavs = favorites.slice(0, 50);
        const uniqueArtists = [...new Set(recentFavs.map(t => typeof t.artist === 'object' ? t.artist.name : t.artist))];

        if (uniqueArtists.length === 0) return null;

        // Tomamos 5 artistas semilla al azar
        const seedArtists = uniqueArtists.sort(() => Math.random() - 0.5).slice(0, 5);
        const mainSeed = seedArtists[0];

        try {
            // 2. "Explosión de Artistas": Buscamos relacionados para cada semilla
            // Queremos MUCHOS artistas distintos para tener 1 canción de cada uno
            const relatedPromises = seedArtists.map(artist => getRelatedArtists(artist, 5)); // 5 relacionados por semilla = ~25 artistas nuevos
            const relatedResults = await Promise.all(relatedPromises);

            // Aplanar y únicos
            const allRelated = relatedResults.flat();
            let candidateArtists = [...new Set(allRelated.map(a => a.name))];

            // Sacamos a los artistas que ya son semillas (para no repetir)
            candidateArtists = candidateArtists.filter(name => !seedArtists.includes(name));

            // Si nos faltan, relajamos el filtro, pero tratamos de tener al menos 20 artistas distintos
            if (candidateArtists.length < 10) return null;

            // 3. Cirugía: Extraer SOLO 1 canción top de cada artista relacionado
            // Esto asegura variedad total: "Una playlist de 30 canciones = 30 artistas nuevos"
            const trackPromises = candidateArtists.slice(0, 40).map(artistName =>
                artistGetTopTracks({ artist: artistName, limit: 5 }) // Traemos 5 para elegir la mejor/random
                    .then(res => {
                        const tracks = res?.toptracks?.track || [];
                        if (!tracks.length) return null;
                        // Tomamos 1 canción al azar de este artista
                        const randomTrack = tracks[Math.floor(Math.random() * tracks.length)];
                        return this._formatTrack(randomTrack);
                    })
                    .catch(() => null)
            );

            const tracksResults = await Promise.all(trackPromises);
            let discoverTracks = tracksResults.filter(t => t !== null);

            // 4. Filtrado Final: No incluir canciones que YA están en favoritos
            const favIds = new Set(favorites.map(f => f.id || f.title));
            discoverTracks = discoverTracks.filter(t => !favIds.has(t.id) && !favIds.has(t.title));

            discoverTracks = this._deduplicateTracks(discoverTracks);

            if (discoverTracks.length < 15) return null;

            // Mezclar final y cortar a 30
            discoverTracks = discoverTracks.sort(() => Math.random() - 0.5).slice(0, 30);

            return {
                id: `feed-discover-${Date.now()}`,
                title: 'Descubrimiento Semanal',
                description: `Variedad total inspirada en ${mainSeed} y más`,
                tracks: discoverTracks,
                image: '/PlaylisyImages/descubrimientosemanal.jpg',
                type: 'discover',
                isNative: true
            };
        } catch (e) {
            console.warn('Error generando Discover Weekly', e);
            return null;
        }
    }

    _deduplicateTracks(tracks) {
        const seen = new Set();
        return tracks.filter(t => {
            const key = `${t.title}-${t.artist}`.toLowerCase();
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });
    }

    async _generateSmartGenreMix(userContext) {
        const { listeningHistory = [] } = userContext;
        if (listeningHistory.length < 5) return null;

        // 1. Analizar historial para detectar géneros predominantes
        // Mapear artistas del historial a géneros conocidos
        const genreCounts = {};

        listeningHistory.slice(0, 50).forEach(track => {
            const artist = (typeof track.artist === 'object' ? track.artist.name : track.artist).toLowerCase();
            const trackName = (track.name || track.title).toLowerCase();

            // Check against GENRE_RULES
            for (const [genre, rules] of Object.entries(GENRE_RULES)) {
                if (rules.seedArtists.some(sa => sa.toLowerCase() === artist) ||
                    rules.allowedGenres.some(g => trackName.includes(g))) {
                    genreCounts[genre] = (genreCounts[genre] || 0) + 1;
                }
            }
        });

        // Encontrar el género ganador
        let topGenre = null;
        let maxCount = 0;

        for (const [genre, count] of Object.entries(genreCounts)) {
            if (count > maxCount) {
                maxCount = count;
                topGenre = genre;
            }
        }

        // Umbral mínimo para generar mix dedicado
        if (!topGenre || maxCount < 2) return null;

        console.log(`[FeedGenerator] Detectado gusto por: ${topGenre}`);

        try {
            // Generar mix del género
            const rules = GENRE_RULES[topGenre];
            // Usar lógica similar a LibraryGenerator pero simplificada
            const seedArtists = rules.seedArtists.sort(() => Math.random() - 0.5).slice(0, 5);

            const promises = seedArtists.map(async (artist) => {
                try {
                    const res = await artistGetTopTracks({ artist, limit: 10 });
                    return res?.toptracks?.track || [];
                } catch (e) { return []; }
            });

            const results = await Promise.all(promises);
            const rawTracks = results.flat();

            if (rawTracks.length < 5) return null;

            return {
                id: `feed-smart-${Date.now()}`,
                title: `Tu Mix de ${topGenre}`,
                description: `Porque has estado escuchando ${topGenre} recientemente.`,
                tracks: rawTracks.map(t => this._formatTrack(t)).sort(() => Math.random() - 0.5),
                image: rawTracks[0].image?.[3]?.['#text'] || rawTracks[0].image?.[2]?.['#text'] || '',
                type: 'smart-mix',
                isNative: true,
                vibe: topGenre.toLowerCase()
            };

        } catch (e) {
            console.warn('[FeedGenerator] Error smart mix:', e);
            return null;
        }
    }

    _generateOnRepeat(userContext) {
        const { listeningHistory = [] } = userContext;
        if (listeningHistory.length < 10) return null;

        // Count frequencies using map
        const freq = new Map();
        listeningHistory.forEach(t => {
            const id = t.id || t.name;
            freq.set(id, (freq.get(id) || 0) + 1);
        });

        // Dedup and Sort by frequency
        const unique = [];
        const seen = new Set();

        listeningHistory.forEach(t => {
            const id = t.id || t.name;
            if (!seen.has(id)) {
                seen.add(id);
                unique.push({ ...t, freq: freq.get(id) });
            }
        });

        const sorted = unique.sort((a, b) => b.freq - a.freq).slice(0, 20);

        return {
            id: `feed-repeat-${Date.now()}`,
            title: 'En Repetición',
            description: 'Las canciones que no paras de escuchar',
            tracks: sorted.map(t => this._formatTrack(t)),
            image: '/PlaylisyImages/enrepeticion.jpg',
            type: 'on-repeat',
            isNative: true
        };
    }

    // =========================================================================
    // UTILIDADES
    // =========================================================================

    _formatTrack(t) {
        return {
            id: t.id,
            title: t.name || t.title,
            artist: typeof t.artist === 'object' ? t.artist.name : t.artist,
            album: t.album?.title || t.album || '',
            image: t.image?.['#text'] || t.image || '',
            duration: t.duration
        };
    }
}

export const feedGenerator = new FeedGenerator();
