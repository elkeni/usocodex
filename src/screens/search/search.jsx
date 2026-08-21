import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    FaSearch,
    FaPlay,
    FaCompactDisc,
    FaUser,
    FaMusic,
    FaListAlt,
    FaTimes,
    FaHistory,
    FaHeart,
    FaPlus,
    FaCheck
} from 'react-icons/fa';
import './search.css';
import Card from '../../components/shared/Card';
import PageHeader from '../../components/shared/PageHeader';

import { usePlayerActions } from '../../context/playerContext';
import { useUser } from '../../context/userContext';
import {
    searchGlobal,
    fetchAudioUrl,
    artistGetTopTracks,
    getRelatedArtists
} from '../../services/unifiedService';



// ⭐ Sistema de caché en memoria para persistencia entre navegaciones
import screenStateCache, { useScrollPersistence } from '../../services/screenStateCache';

// =============================================================================
// CATEGORÍAS DE EXPLORACIÓN (Actualizado con tus links manuales)
// =============================================================================

const SEARCH_CATEGORIES = [
    {
        id: 'global',
        title: 'Top Global',
        color: 'linear-gradient(135deg, #1DB954 0%, #191414 100%)',
        image: 'https://cdn-images.dzcdn.net/images/playlist/69e153933022f3855f916981ef0a38f3/250x250-000000-80-0-0.jpg',
        playlistId: '2098157264' // Tu link anterior
    },
    {
        id: 'latino',
        title: 'Top Latinoamérica',
        color: '#FF9800',
        image: 'https://cdn-images.dzcdn.net/images/playlist/5b8e0fae2be474dbc9728cf50b6d7984/250x250-000000-80-0-0.jpg',
        playlistId: '2025681806' // Tu link anterior
    },
    {
        id: 'salsa',
        title: 'Salsa Brava y Vieja', // ⭐ NUEVO: Tu link 8291888262
        color: '#9C27B0',
        image: 'https://cdn-images.dzcdn.net/images/playlist/00b38322674843f770f48cb024815db2/250x250-000000-80-0-0.jpg',
        playlistId: '8291888262'
    },
    {
        id: 'alternative',
        title: 'Alternative Essentials', // ⭐ ACTUALIZADO desde channels/alternative
        color: '#009688',
        image: 'https://cdn-images.dzcdn.net/images/playlist/90e455a288cebc49fe49a0e3e0730da9/250x250-000000-80-0-0.jpg',
        playlistId: '668126235' // ID Oficial de Alternative Essentials
    },
    {
        id: 'electronic',
        title: 'Electronic Hits', // ⭐ ACTUALIZADO desde channels/electronic
        color: '#00C853',
        image: 'https://cdn-images.dzcdn.net/images/playlist/84a4d267e88397ccc542fc8295e1027c/250x250-000000-80-0-0.jpg',
        playlistId: '1902101402' // ID Oficial de Electronic Hits
    },
    {
        id: 'pop',
        title: 'Pop Hits',
        color: '#2196F3',
        image: 'https://cdn-images.dzcdn.net/images/playlist/1479973d20b21505fdccabda26a7aa42/250x250-000000-80-0-0.jpg',
        playlistId: '1282495565'
    },
    {
        id: 'reggaeton',
        title: 'Reggaetón',
        color: '#FF4081',
        image: 'https://cdn-images.dzcdn.net/images/playlist/1e4966b5abd8ba3b5ba3f2c07cf9e0ce/250x250-000000-80-0-0.jpg',
        playlistId: '3803398766'
    },
    {
        id: 'hiphop',
        title: 'Hip-Hop',
        color: '#3F51B5',
        image: 'https://cdn-images.dzcdn.net/images/playlist/7a4c3ec4f11a72e3b3301d6fb7adec4e/250x250-000000-80-0-0.jpg',
        playlistId: '1677006641'
    },
    {
        id: 'rock',
        title: 'Rock Classics',
        color: '#F44336',
        image: 'https://cdn-images.dzcdn.net/images/playlist/4f509c2f5222f32b23ac29be0a80cfe4/250x250-000000-80-0-0.jpg',
        playlistId: '1306931615'
    },
    {
        id: 'dance',
        title: 'Dance & Electro',
        color: '#673AB7',
        image: 'https://cdn-images.dzcdn.net/images/playlist/e9e5eb1be34467a109657fa024ec2837/250x250-000000-80-0-0.jpg',
        playlistId: '2159765062'
    },
    {
        id: 'fiesta',
        title: 'Party Hits',
        color: '#009688',
        image: 'https://cdn-images.dzcdn.net/images/playlist/cd9f2e361aba27ab53cd728947cef8f6/250x250-000000-80-0-0.jpg',
        playlistId: '2097558104'
    },
    {
        id: 'reggae',
        title: 'Reggae Essentials',
        color: '#607D8B',
        image: 'https://cdn-images.dzcdn.net/images/playlist/4a0ab2f8497c1da8aa46a4617c756ad5/250x250-000000-80-0-0.jpg',
        playlistId: '2448918882'
    }
];
const DEFAULT_IMAGE = 'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?auto=format&fit=crop&w=500&q=60';

// =============================================================================
// UTILIDADES
// =============================================================================

const getImageUrl = (item) => {
    let finalImage = null;

    if (!item) finalImage = null;
    else if (item.image && typeof item.image === 'string') finalImage = item.image;
    else if (item.cover_xl) finalImage = item.cover_xl;
    else if (item.picture_xl) finalImage = item.picture_xl;
    else if (Array.isArray(item.image)) {
        const best = item.image.find(i => i.size === 'extralarge') ||
            item.image.find(i => i.size === 'large') ||
            item.image[item.image.length - 1];
        if (best?.['#text'] && !best['#text'].includes('2a96cbd8')) {
            finalImage = best['#text'];
        }
    }

    // ⭐ TURBO OPTIMIZER: Enforce 250x250 for lists (replacing 1000x1000 or similar)
    if (typeof finalImage === 'string' && finalImage.includes('dzcdn.net')) {
        return finalImage
            .replace(/\/1000x1000/, '/250x250')
            .replace(/\/500x500/, '/250x250')
            .replace(/\/[\dx]+(-000000-80-0-0\.jpg)/, '/250x250$1');
    }

    return finalImage;
};

/**
 * ⭐ ORDENAR POR RANK (Popularidad de Deezer)
 * Los items con rank más alto aparecen primero
 */
const sortByRank = (items) => {
    if (!Array.isArray(items) || items.length === 0) return [];
    return [...items].sort((a, b) => {
        // rank es el campo de popularidad de Deezer (mayor = más popular)
        const rankA = a.rank || a.popularity || a.nb_fan || 0;
        const rankB = b.rank || b.popularity || b.nb_fan || 0;
        return rankB - rankA;
    });
};

/**
 * Limpia el nombre del artista para búsqueda
 */
const cleanArtistForSearch = (artist) => {
    if (!artist) return '';
    return artist
        .replace(/\s*&\s*/g, ' ')
        .replace(/\s+and\s+/gi, ' ')
        .replace(/\s+/g, ' ')
        .trim();
};

/**
 * Limpia el título para búsqueda
 */
const cleanTitleForSearch = (title) => {
    if (!title) return '';
    return title
        .replace(/\s*\(feat\..*?\)/gi, '')
        .replace(/\s*\(ft\..*?\)/gi, '')
        .replace(/\s*\[.*?\]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
};

/**
 * ⭐ FORMATO DE DURACIÓN
 * Convierte segundos a formato mm:ss
 */
const formatDuration = (seconds) => {
    if (!seconds || isNaN(seconds)) return '';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
};

/**
 * ⭐ GENERAR COLA INTELIGENTE (Smart Queue)
 * Crea una cola de reproducción tipo "radio" basada en:
 * 1. Canciones del mismo artista (prioridad máxima)
 * 2. Canciones de artistas similares/relacionados
 * 3. Canciones populares del contexto de búsqueda
 * 4. Mezcla para evitar repetición monótona
 * 
 * @param {Object} selectedTrack - La canción seleccionada para reproducir
 * @param {Array} allTracks - Todos los resultados de búsqueda
 * @param {string} searchQuery - El término de búsqueda original
 * @returns {Array} Cola ordenada de forma inteligente
 */
// Conservado como referencia para una futura estrategia de cola alternativa.
// eslint-disable-next-line no-unused-vars
const generateSmartQueue = (selectedTrack, allTracks, searchQuery = '') => {
    if (!selectedTrack || !Array.isArray(allTracks) || allTracks.length === 0) {
        return [];
    }

    // Normalizar nombre de artista para comparación
    const normalizeArtist = (artist) => {
        if (!artist) return '';
        return artist.toLowerCase()
            .replace(/\s*&\s*/g, ' ')
            .replace(/\s+feat\.?\s*/gi, ' ')
            .replace(/\s+ft\.?\s*/gi, ' ')
            .replace(/\s+/g, ' ')
            .trim();
    };

    const selectedArtist = normalizeArtist(selectedTrack.artist);
    const selectedId = selectedTrack.id || selectedTrack.name;

    // Separar tracks en categorías
    const sameArtistTracks = [];
    const relatedTracks = [];
    const otherPopularTracks = [];

    allTracks.forEach(track => {
        const trackId = track.id || track.name;

        // Excluir el track seleccionado
        if (trackId === selectedId) return;

        const trackArtist = normalizeArtist(track.artist);

        // 1. Mismo artista (máxima prioridad)
        if (trackArtist === selectedArtist ||
            trackArtist.includes(selectedArtist) ||
            selectedArtist.includes(trackArtist)) {
            sameArtistTracks.push(track);
        }
        // 2. Artista relacionado (comparten palabras en común, ej: colaboraciones)
        else if (trackArtist.split(' ').some(word =>
            word.length > 2 && selectedArtist.includes(word)
        )) {
            relatedTracks.push(track);
        }
        // 3. Otros tracks populares
        else {
            otherPopularTracks.push(track);
        }
    });

    // Ordenar cada categoría por popularidad
    const sortedSameArtist = sortByRank(sameArtistTracks);
    const sortedRelated = sortByRank(relatedTracks);
    const sortedOthers = sortByRank(otherPopularTracks);

    // ⭐ ALGORITMO DE MEZCLA INTELIGENTE CON DIVERSIDAD
    // Evita más de 2 canciones consecutivas del mismo artista
    const smartQueue = [];
    // Indices are managed internally by the smart queue algorithm
    let consecutiveCount = {}; // Track consecutive songs per artist

    // Máximo de canciones en cola (evitar colas infinitas)
    const MAX_QUEUE_SIZE = 30;
    const MAX_CONSECUTIVE = 2; // Máximo de canciones consecutivas del mismo artista

    // Función helper para verificar si podemos añadir un track
    const canAddTrack = (track) => {
        if (smartQueue.length === 0) return true;

        const currentArtist = normalizeArtist(track.artist);
        const lastArtist = normalizeArtist(smartQueue[smartQueue.length - 1].artist);

        if (currentArtist === lastArtist) {
            consecutiveCount[currentArtist] = (consecutiveCount[currentArtist] || 0) + 1;
            return consecutiveCount[currentArtist] <= MAX_CONSECUTIVE;
        } else {
            // Reset counter for new artist
            consecutiveCount[currentArtist] = 1;
            return true;
        }
    };

    // Función helper para añadir tracks de una lista con verificación de diversidad
    const addTracksFromList = (trackList, indexRef, maxToAdd = 2) => {
        let added = 0;
        while (added < maxToAdd && indexRef.value < trackList.length && smartQueue.length < MAX_QUEUE_SIZE) {
            const candidateTrack = trackList[indexRef.value];
            if (canAddTrack(candidateTrack)) {
                smartQueue.push(candidateTrack);
                indexRef.value++;
                added++;
            } else {
                // Skip this track to avoid consecutive artists
                indexRef.value++;
                // If we've exhausted options, we might need to add anyway to avoid empty queue
                if (indexRef.value >= trackList.length) break;
            }
        }
        return added > 0;
    };

    // Usar objeto para referencias mutables
    const indices = { same: 0, related: 0, other: 0 };

    while (smartQueue.length < MAX_QUEUE_SIZE) {
        let addedSomething = false;

        // Añadir 1-2 del mismo artista (prioridad máxima)
        if (indices.same < sortedSameArtist.length) {
            addedSomething = addTracksFromList(sortedSameArtist, { value: indices.same }, 2) || addedSomething;
        }

        // Añadir 1 relacionado
        if (indices.related < sortedRelated.length && smartQueue.length < MAX_QUEUE_SIZE) {
            const candidateTrack = sortedRelated[indices.related];
            if (canAddTrack(candidateTrack)) {
                smartQueue.push(candidateTrack);
                indices.related++;
                addedSomething = true;
            } else {
                indices.related++; // Skip if would create consecutive
            }
        }

        // Añadir 1-2 populares
        if (indices.other < sortedOthers.length) {
            addedSomething = addTracksFromList(sortedOthers, { value: indices.other }, 2) || addedSomething;
        }

        // Si no añadimos nada en esta iteración, salir para evitar loop infinito
        if (!addedSomething) break;

        // Si ya no hay más tracks disponibles, salir
        if (indices.same >= sortedSameArtist.length &&
            indices.related >= sortedRelated.length &&
            indices.other >= sortedOthers.length) {
            break;
        }
    }

    if (import.meta.env.DEV) {
        console.log(`[SmartQueue] 🎵 Cola generada: ${smartQueue.length} tracks`);
        console.log(`  → Mismo artista: ${sameArtistTracks.length}`);
        console.log(`  → Relacionados: ${relatedTracks.length}`);
        console.log(`  → Populares: ${otherPopularTracks.length}`);
    }

    return smartQueue;
};

// =============================================================================
// 🎵 RADIO INSTANTÁNEA PARA BÚSQUEDA
// Genera cola de canciones similares basada en artistas relacionados
// =============================================================================
// =============================================================================
// 🎵 RADIO INSTANTÁNEA PARA BÚSQUEDA (MEJORADA)
// Lógica:
// 1. Contexto (Resultados de búsqueda): Prioridad alta, es lo que el usuario pidió.
// 2. Artista Principal: Familiaridad.
// 3. Artistas Relacionados: Descubrimiento.
// =============================================================================
const buildInstantRadioForSearch = async (seedTrack, localTracks = []) => {
    if (!seedTrack?.artist || !seedTrack?.name) {
        return [seedTrack];
    }

    // Normalización de claves para evitar duplicados
    const getTrackKey = (t) => `${t.artist}-${t.name}`.toLowerCase();
    const seenKeys = new Set();
    seenKeys.add(getTrackKey(seedTrack));

    // Helper para limpiar metadatos de artista
    const getCleanArtist = (t) => {
        const artist = typeof t === 'string' ? t : (t.artist?.name || t.artist || '');
        return artist.split(/[,&]|feat\.?|ft\.?|with|x\s/i)[0].trim();
    };

    const seedArtistName = getCleanArtist(seedTrack);
    console.log(`[InstantRadio/Search] 🎵 Generando radio para: "${seedTrack.name}" (${seedArtistName})`);

    // --- 1. PREPARAR POOLS DE CANCIONES ---

    // A. POOL CONTEXTO (Resultados de la búsqueda actual - MÁXIMA RELEVANCIA)
    // Filtramos el seed y duplicados
    const contextPool = localTracks
        .filter(t => {
            // Descartar si ya lo vimos
            if (seenKeys.has(getTrackKey(t))) return false;

            // [MOD] NO FILTER: Incluir todo lo que venga del contexto (Search Results).
            // Si el usuario buscó algo y sale un cover, es relevante.
            return true;
        })
        .map(t => ({ ...t, _source: 'context' }));

    // B. POOL ARTISTA PRINCIPAL (Familiaridad)
    const mainArtistPool = [];

    // C. POOL RELACIONADOS (Descubrimiento)
    const relatedPool = [];

    try {
        // Fetch en paralelo: Top de artista principal + Artistas relacionados
        const [mainArtistRes, relatedArtistsData] = await Promise.all([
            artistGetTopTracks({ artist: seedArtistName, limit: 15 }).catch(() => null),
            getRelatedArtists(seedArtistName, 10).catch(() => [])
        ]);

        // Llenar pool principal
        if (mainArtistRes?.toptracks?.track) {
            mainArtistRes.toptracks.track.forEach(t => {
                if (!seenKeys.has(getTrackKey(t))) {
                    mainArtistPool.push({
                        id: t.id,
                        name: t.name || t.title,
                        artist: t.artist?.name || seedArtistName,
                        image: t.image || t.album?.cover_big,
                        duration: t.duration,
                        preview: t.preview,
                        _source: 'main_artist'
                    });
                }
            });
        }

        // Llenar pool relacionados (Fetch en paralelo de sus top tracks)
        const relatedArtists = (relatedArtistsData || []).slice(0, 6); // Top 6 relacionados
        if (relatedArtists.length > 0) {
            const relatedPromises = relatedArtists.map(rel =>
                artistGetTopTracks({ artist: rel.name, limit: 3 }) // Solo Top 3 de cada uno para variar
                    .then(res => ({ artist: rel.name, tracks: res?.toptracks?.track || [] }))
                    .catch(() => ({ artist: rel.name, tracks: [] }))
            );

            const relatedResults = await Promise.all(relatedPromises);

            // Aplanar resultados: Mezclar artistas, no bloques del mismo
            const tempRelated = [];
            relatedResults.forEach(res => {
                res.tracks.forEach(t => {
                    if (!seenKeys.has(getTrackKey(t))) {
                        tempRelated.push({
                            id: t.id,
                            name: t.name || t.title,
                            artist: res.artist,
                            image: t.image || t.album?.cover_big,
                            duration: t.duration,
                            preview: t.preview,
                            _source: 'related'
                        });
                    }
                });
            });
            // Shuffle simple para variedad
            relatedPool.push(...tempRelated.sort(() => Math.random() - 0.5));
        }

    } catch (e) {
        console.warn('[InstantRadio] Error fetching external data:', e);
    }

    // --- 2. ALGORITMO DE MEZCLA (INTERLEAVING) ---
    const finalQueue = [];
    const TARGET_SIZE = 25;

    // Estructura de mezcla ponderada:
    // [Contexto, Main, Related, Contexto, Related, Main...]
    // Priorizamos Contexto si existe (porque el usuario lo buscó)

    // Índices
    let idxContext = 0;
    let idxMain = 0;
    let idxRelated = 0;

    let consecutiveArtistCount = 0;
    let lastArtist = seedArtistName.toLowerCase();

    // Helper para añadir track verificando diversidad
    const tryAdd = (track) => {
        if (!track) return false;

        const trackKey = getTrackKey(track);
        if (seenKeys.has(trackKey)) return false;

        const thisArtist = getCleanArtist(track).toLowerCase();

        // Evitar más de 2 veces seguidas el mismo artista (salvo que sea el único disponible)
        if (thisArtist === lastArtist) {
            consecutiveArtistCount++;
            if (consecutiveArtistCount > 2) return false;
        } else {
            consecutiveArtistCount = 1;
            lastArtist = thisArtist;
        }

        finalQueue.push(track);
        seenKeys.add(trackKey);
        return true;
    };

    while (finalQueue.length < TARGET_SIZE) {
        let added = false;

        // 1. Intento Contexto (Search Results)
        if (idxContext < contextPool.length) {
            if (tryAdd(contextPool[idxContext])) added = true;
            idxContext++;
        }

        // 2. Intento Main Artist (si no hemos abusado)
        if (idxMain < mainArtistPool.length && consecutiveArtistCount < 2) {
            if (tryAdd(mainArtistPool[idxMain])) added = true;
            idxMain++;
        }

        // 3. Intento Related (Discovery)
        if (idxRelated < relatedPool.length) {
            if (tryAdd(relatedPool[idxRelated])) added = true;
            idxRelated++;
        }

        // 4. Intento Contexto de nuevo (Mayor peso a la búsqueda original)
        if (idxContext < contextPool.length) {
            if (tryAdd(contextPool[idxContext])) added = true;
            idxContext++;
        }

        // Si fallamos en añadir de las 3 fuentes en esta ronda, forzamos avance
        if (!added) {
            // Si nos quedamos sin opciones válidas por restricciones de artista,
            // relajamos las restricciones o salimos si no hay tracks.
            const remaining = [
                ...contextPool.slice(idxContext),
                ...relatedPool.slice(idxRelated),
                ...mainArtistPool.slice(idxMain)
            ];

            if (remaining.length === 0) break;

            // Force add next available regardless of artist restriction
            const next = remaining[0];
            finalQueue.push(next);
            seenKeys.add(getTrackKey(next));

            // Advance corresponding index manually (inefficient but safe backup)
            if (contextPool.includes(next)) idxContext++;
            else if (relatedPool.includes(next)) idxRelated++;
            else idxMain++;
        }
    }

    console.log(`[InstantRadio] ✅ Radio generada con ${finalQueue.length} tracks. (Contexto: ${idxContext}, Main: ${idxMain}, Related: ${idxRelated})`);

    return [seedTrack, ...finalQueue];
};

// =============================================================================
// COMPONENTES
// =============================================================================

// Menu de opciones (Long Press)
const LongPressMenu = ({ track, onClose }) => {
    const { playTrack, addToQueue } = usePlayerActions();
    const { toggleFavorite, isFavorite, playlists, addTrackToPlaylist } = useUser();
    const [view, setView] = useState('main'); // 'main' | 'playlists'
    const [feedback, setFeedback] = useState(null); // Mensaje de feedback

    if (!track) return null;

    const isLiked = isFavorite(track);

    const showFeedback = (msg) => {
        setFeedback(msg);
        setTimeout(() => {
            onClose();
        }, 1500);
    };

    const handlePlay = () => {
        playTrack(track);
        onClose();
    };

    const handleQueue = () => {
        addToQueue(track, true); // Silent mode to avoid double toast
        showFeedback('Agregada a la cola');
    };

    const handleLike = () => {
        toggleFavorite(track);
        showFeedback(isLiked ? 'Eliminada de Me gusta' : 'Agregada a Me gusta');
    };

    const handlePlaylistClick = async (playlist) => {
        const added = await addTrackToPlaylist(playlist.id, track);
        if (added) showFeedback(`Agregada a ${playlist.name}`);
    };

    // Renderizado del contenido según la vista
    return (
        <div className="context-menu-overlay" onClick={onClose} style={{ animation: 'fadeIn 0.2s ease-out' }}>
            <div className="context-menu-content" onClick={e => e.stopPropagation()}>

                {feedback ? (
                    <div style={{ padding: '30px', textAlign: 'center', color: 'white' }}>
                        <div style={{ fontSize: '28px', marginBottom: '16px', color: '#1DB954' }}>
                            <FaCheck />
                        </div>
                        <div style={{ fontSize: '15px', fontWeight: '500' }}>{feedback}</div>
                    </div>
                ) : view === 'playlists' ? (
                    // VISTA DE SELECCIÓN DE PLAYLISTS
                    <div className="context-menu-playlists">
                        <div className="context-menu-header">
                            <button className="context-menu-back" onClick={() => setView('main')}>
                                <FaSearch className="rotate-icon" style={{ transform: 'rotate(90deg)', marginRight: '8px' }} />
                                Volver
                            </button>
                            <div className="context-menu-title" style={{ marginLeft: 'auto' }}>Elegir playlist</div>
                        </div>
                        <div className="context-menu-scrollable-list" style={{ maxHeight: '300px', overflowY: 'auto' }}>
                            {playlists.length === 0 ? (
                                <div style={{ padding: '20px', textAlign: 'center', color: '#888' }}>
                                    No tienes playlists creadas
                                </div>
                            ) : (
                                playlists.map(p => (
                                    <button
                                        key={p.id}
                                        className="context-menu-item playlist-option"
                                        onClick={() => handlePlaylistClick(p)}
                                    >
                                        <div style={{
                                            width: '32px', height: '32px', borderRadius: '4px',
                                            background: '#333', overflow: 'hidden', marginRight: '12px'
                                        }}>
                                            {p.image ? <img src={p.image} style={{ width: '100%', height: '100%' }} alt="" /> : <FaListAlt style={{ margin: '8px', color: '#666' }} />}
                                        </div>
                                        <div style={{ flex: 1, textAlign: 'left', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                            {p.name}
                                        </div>
                                    </button>
                                ))
                            )}
                        </div>
                    </div>
                ) : (
                    // VISTA PRINCIPAL
                    <>
                        <div className="context-menu-header">
                            <img
                                src={track.image || track.image_xl || 'https://via.placeholder.com/50'}
                                className="context-menu-img"
                                alt={track.name}
                            />
                            <div className="context-menu-info">
                                <div className="context-menu-title">{track.name}</div>
                                <div className="context-menu-subtitle">{track.artist}</div>
                            </div>
                        </div>

                        <div className="context-menu-options">
                            <button className="context-menu-item play" onClick={handlePlay}>
                                <FaPlay /> Reproducir ahora
                            </button>
                            <button className="context-menu-item queue" onClick={handleQueue}>
                                <FaListAlt /> Agregar a la cola
                            </button>
                            <button className="context-menu-item playlist" onClick={() => setView('playlists')}>
                                <FaPlus /> Añadir a playlist
                            </button>
                            <button className={`context-menu-item like ${isLiked ? 'active-like' : ''}`} onClick={handleLike}>
                                <FaHeart color={isLiked ? '#E91E63' : 'inherit'} /> {isLiked ? 'Eliminar de Me gusta' : 'Me gusta'}
                            </button>
                        </div>

                        <button className="context-menu-cancel" onClick={onClose}>
                            Cancelar
                        </button>
                    </>
                )}
            </div>
        </div>
    );
};

// Track Row - Lista de canciones estilo Apple Music (mejorado)
const TrackRow = ({ track, isLoading, onPlay, showRank = false, index = 0, onLongPress }) => {
    const img = getImageUrl(track);
    const duration = formatDuration(track.duration);

    // Detección de Long Press
    const timerRef = useRef(null);
    const isLongPress = useRef(false);

    const startPress = useCallback(() => {
        isLongPress.current = false;
        timerRef.current = setTimeout(() => {
            isLongPress.current = true;
            if (navigator.vibrate) navigator.vibrate(50);
            if (onLongPress) onLongPress(track);
        }, 500); // 500ms para activar
    }, [onLongPress, track]);

    const cancelPress = useCallback(() => {
        if (timerRef.current) {
            clearTimeout(timerRef.current);
            timerRef.current = null;
        }
    }, []);

    const handleClick = useCallback((e) => {
        if (isLongPress.current) {
            e.preventDefault();
            e.stopPropagation();
            return;
        }
        onPlay(track);
    }, [onPlay, track]);

    return (
        <button type="button"
            className="track-row"
            onClick={handleClick}
            onMouseDown={startPress}
            onMouseUp={cancelPress}
            onMouseLeave={cancelPress}
            onTouchStart={startPress}
            onTouchEnd={(e) => {
                cancelPress();
                // Si fue long press, prevenimos el click fantasma que sigue al touchend
                if (isLongPress.current) {
                    e.preventDefault();
                }
            }}
            onTouchMove={cancelPress}
            onContextMenu={(e) => {
                // Prevenir menú nativo en móvil si estamos controlando el long press
                e.preventDefault();
            }}
        >
            {/* Número de ranking opcional */}
            {showRank && (
                <div className="track-rank">
                    {index + 1}
                </div>
            )}

            <div className="track-artwork">
                {img ? (
                    <img src={img} alt={track.name} onError={(e) => { e.target.src = DEFAULT_IMAGE; }} />
                ) : (
                    <div className="track-artwork-fallback">
                        <FaMusic size={18} />
                    </div>
                )}
                <div className="track-play-overlay">
                    {isLoading ? (
                        <div className="track-loading-spinner" />
                    ) : (
                        <FaPlay className="track-play-icon" />
                    )}
                </div>
            </div>

            <div className="track-info">
                <div className="track-name">{track.name}</div>
                <div className="track-artist">
                    {track.artist}
                    {track.album && <span className="track-album-hint"> · {track.album}</span>}
                </div>
            </div>

            {/* Duración del track */}
            {duration && (
                <div className="track-duration">
                    {duration}
                </div>
            )}
        </button>
    );
};


// =============================================================================
// COMPONENTE PRINCIPAL
// =============================================================================

// =============================================================================
// ✅ VALIDACIONES FINALES - COHERENCIA DE BÚSQUEDA
// =============================================================================
// TEST CASES PARA VERIFICAR:
// 1. Buscar "salsa":
//    - intent: genre
//    - Top Result: NO puede ser artista llamado "Salsa"
//    - Playlists aparecen ANTES que artistas
//    - Subtítulo coherente: "Playlist · Género salsa"
//
// 2. Buscar "rock":
//    - intent: genre
//    - Top Result: playlist o track, nunca artist
//    - Orden: Playlists → Canciones → Artistas → Álbumes
//
// 3. Buscar "bad bunny":
//    - intent: artist
//    - Top Result: artist
//    - Orden: Artistas → Canciones → Álbumes → Playlists
//
// 4. Buscar "love":
//    - intent: mood/general
//    - Top Result: razonable (playlist, track, etc.)
//
// 5. Sin resultados:
//    - No Top Result, muestra "no results" correctamente
//
// 6. Cache funciona:
//    - Misma búsqueda es instantánea
export default function Search() {
    const navigate = useNavigate();
    const { playTrack } = usePlayerActions();

    // Referencias
    const inputRef = useRef(null);
    const searchContainerRef = useRef(null);
    const headerRef = useRef(null);
    const searchCacheRef = useRef({});

    // Use persistence scroll
    useScrollPersistence(searchContainerRef, 'search-scroll');

    // Estados
    const [query, setQuery] = useState('');
    const [filter, setFilter] = useState('all'); // all, artist, album, track, playlist
    const [results, setResults] = useState(() => {
        // Restaurar resultados si existen en caché para la query actual (si la hubiera)
        // Pero como query inicia vacío, esto suele ser vacío.
        return { tracks: [], artists: [], albums: [], playlists: [] };
    });
    const [isLoading, setIsLoading] = useState(false);
    const [showRecents, setShowRecents] = useState(false);
    const [hasSearched, setHasSearched] = useState(false);
    const [playingTrackId, setPlayingTrackId] = useState(null);
    const [menuTrack, setMenuTrack] = useState(null); // Estado para el menú desplegable

    // Estados de UI
    const [isScrolled, setIsScrolled] = useState(false);

    // Búsquedas recientes desde localStorage
    const RECENT_STORAGE_KEY = 'musicalol_recent_searches_v2'; // v2 para estructura limpia
    const MAX_RECENT_SEARCHES = 10;
    const [recentSearches, setRecentSearches] = useState([]);

    // Cargar recientes al inicio
    useEffect(() => {
        try {
            const saved = localStorage.getItem(RECENT_STORAGE_KEY);
            if (saved) {
                setRecentSearches(JSON.parse(saved));
            }
        } catch (e) {
            console.warn('Error loading recent searches', e);
        }
    }, []);

    // Detectar Scroll para Header Sticky
    useEffect(() => {
        const container = searchContainerRef.current;
        if (!container) return;

        const handleScroll = () => {
            setIsScrolled(container.scrollTop > 10);
        };

        container.addEventListener('scroll', handleScroll, { passive: true });
        return () => container.removeEventListener('scroll', handleScroll);
    }, []);

    // Recuperar estado desde Caché Global al montar (si volvemos de otra pantalla)
    useEffect(() => {
        const cachedState = screenStateCache.get('search_state');
        if (cachedState) {
            if (cachedState.query) setQuery(cachedState.query);
            if (cachedState.results) setResults(cachedState.results);
            if (cachedState.hasSearched) setHasSearched(cachedState.hasSearched);
            if (cachedState.filter) setFilter(cachedState.filter);
        }
    }, []);

    // Guardar estado en Caché Global al desmontar o cambiar
    useEffect(() => {
        screenStateCache.set('search_state', {
            query,
            results,
            hasSearched,
            filter
        });
    }, [query, results, hasSearched, filter]);

    // ========================================
    // LÓGICA DE BÚSQUEDA CENTRALIZADA
    // ========================================
    const performSearch = useCallback(async (searchQuery) => {
        if (!searchQuery || searchQuery.trim().length < 2) {
            setResults({ tracks: [], artists: [], albums: [], playlists: [] });
            setHasSearched(false);
            return;
        }

        const normalizedQuery = searchQuery.trim().toLowerCase();

        // 1. Revisar caché local de resultados
        if (searchCacheRef.current[normalizedQuery]) {
            setResults(searchCacheRef.current[normalizedQuery]);
            setHasSearched(true);
            return;
        }

        setIsLoading(true);
        setHasSearched(true);

        try {
            const limit = 10;
            const trackLimit = 12;

            const shouldSearchTracks = filter === 'all' || filter === 'track';
            const shouldSearchArtists = filter === 'all' || filter === 'artist';
            const shouldSearchAlbums = filter === 'all' || filter === 'album';
            const shouldSearchPlaylists = filter === 'all' || filter === 'playlist';

            // Ejecutar búsquedas en paralelo usando searchGlobal
            const promises = {
                tracks: shouldSearchTracks ? searchGlobal(searchQuery, 'track', trackLimit) : Promise.resolve([]),
                artists: shouldSearchArtists ? searchGlobal(searchQuery, 'artist', limit) : Promise.resolve([]),
                albums: shouldSearchAlbums ? searchGlobal(searchQuery, 'album', limit) : Promise.resolve([]),
                playlists: shouldSearchPlaylists ? searchGlobal(searchQuery, 'playlist', limit) : Promise.resolve([])
            };

            const [rawTracks, rawArtists, rawAlbums, rawPlaylists] = await Promise.all([
                promises.tracks,
                promises.artists,
                promises.albums,
                promises.playlists
            ]);

            // Mappers locales para estandarizar resultados (Unified UI Contract)
            // ⭐ MODIFIED: NOW STORES LOW-RES 'image' AND HIGH-RES 'image_xl'
            const mapTrack = t => ({
                id: t.id,
                name: t.title,
                artist: t.artist?.name,
                album: t.album?.title,
                image: getImageUrl({ image: t.album?.cover_xl || t.artist?.picture_xl }, false), // 250x250
                image_xl: getImageUrl({ image: t.album?.cover_xl || t.artist?.picture_xl }, true), // 1000x1000
                duration: t.duration,
                preview: t.preview,
                rank: t.rank
            });

            const mapArtist = a => ({
                id: a.id,
                name: a.name,
                image: getImageUrl({ image: a.picture_xl }, false),
                image_xl: getImageUrl({ image: a.picture_xl }, true),
                fans: a.nb_fan
            });

            const mapAlbum = a => ({
                id: a.id,
                name: a.title,
                artist: a.artist?.name,
                image: getImageUrl({ image: a.cover_xl }, false),
                image_xl: getImageUrl({ image: a.cover_xl }, true),
                fans: a.fans
            });

            const mapPlaylist = p => ({
                id: p.id,
                name: p.title,
                creator: p.user?.name,
                image: getImageUrl({ image: p.picture_xl }, false),
                image_xl: getImageUrl({ image: p.picture_xl }, true),
                trackCount: p.nb_tracks
            });

            // Procesar y limpiar resultados
            const cleanAndMap = (items, mapper) => {
                if (!Array.isArray(items)) return [];
                return items
                    .filter(i => i && (i.title || i.name)) // Filtrar inválidos
                    .map(mapper);
            };

            // Ordenar por RANK (base de Deezer)
            const resultsData = {
                tracks: sortByRank(cleanAndMap(rawTracks, mapTrack)),
                artists: sortByRank(cleanAndMap(rawArtists, mapArtist)),
                albums: sortByRank(cleanAndMap(rawAlbums, mapAlbum)),
                playlists: sortByRank(cleanAndMap(rawPlaylists, mapPlaylist))
            };

            setResults(resultsData);

            // Guardar en caché
            searchCacheRef.current[normalizedQuery] = resultsData;

        } catch (error) {
            console.error("[Search] Error:", error);
        } finally {
            setIsLoading(false);
        }
    }, [filter]); // cleanResults ya no es dependencia porque es interna o reemplazada

    // ========================================
    // GUARDAR BÚSQUEDA EN HISTORIAL
    // ========================================
    const saveToRecentSearches = useCallback((searchTerm) => {
        if (!searchTerm || searchTerm.trim().length < 2) return;

        const term = searchTerm.trim();

        setRecentSearches(prev => {
            // Filtrar duplicados (case insensitive)
            const filtered = prev.filter(
                item => item.toLowerCase() !== term.toLowerCase()
            );
            // Añadir al inicio y limitar a MAX
            const updated = [term, ...filtered].slice(0, MAX_RECENT_SEARCHES);

            // Guardar en localStorage
            try {
                localStorage.setItem(RECENT_STORAGE_KEY, JSON.stringify(updated));
            } catch (e) {
                console.warn('[Search] Error guardando historial:', e);
            }

            return updated;
        });
    }, []);

    // ========================================
    // ELIMINAR DEL HISTORIAL
    // ========================================
    const removeFromRecent = useCallback((termToRemove) => {
        setRecentSearches(prev => {
            const updated = prev.filter(
                item => item.toLowerCase() !== termToRemove.toLowerCase()
            );
            try {
                localStorage.setItem(RECENT_STORAGE_KEY, JSON.stringify(updated));
            } catch (e) {
                // Ignorar
            }
            return updated;
        });
    }, []);

    // ========================================
    // LIMPIAR TODO EL HISTORIAL
    // ========================================
    const clearAllRecent = useCallback(() => {
        setRecentSearches([]);
        try {
            localStorage.removeItem(RECENT_STORAGE_KEY);
        } catch (e) {
            // Ignorar
        }
    }, []);

    // ========================================
    // EJECUTAR BÚSQUEDA DESDE HISTORIAL
    // ========================================
    const executeRecentSearch = useCallback((term) => {
        setQuery(term);
        setShowRecents(false);
        performSearch(term);
        // No guardar aquí - ya está guardado en el historial
    }, [performSearch]);

    // Debounce de búsqueda
    useEffect(() => {
        const timer = setTimeout(() => {
            if (query.trim()) {
                performSearch(query);
                // Guardar en historial cuando se realiza una búsqueda
                saveToRecentSearches(query);
                // Ocultar recientes cuando hay texto
                setShowRecents(false);
            } else {
                setResults({ tracks: [], artists: [], albums: [], playlists: [] });
                setHasSearched(false);
            }
        }, 400);
        return () => clearTimeout(timer);
    }, [query, performSearch, saveToRecentSearches]);

    // ⭐ Reproducir track - Con RADIO INSTANTÁNEA (artistas relacionados vía API)
    const handlePlayTrack = useCallback(async (track) => {
        if (playingTrackId) return;

        const trackId = track.id || track.name;
        setPlayingTrackId(trackId);

        try {
            const artistClean = cleanArtistForSearch(track.artist);
            const titleClean = cleanTitleForSearch(track.name);

            if (import.meta.env.DEV) {
                console.log(`[Search] 🎵 Reproduciendo: "${artistClean} - ${titleClean}"`);
            }

            // Preparar el track para reproducción
            const trackToPlay = {
                id: track.id,
                name: track.name,
                artist: track.artist,
                // ⭐ USE XL IMAGE FOR PLAYER, FALLBACK TO REGULAR (OPTIMIZED)
                image: track.image_xl || track.image || getImageUrl(track, true) || DEFAULT_IMAGE,
                url: track.preview,
                album: track.album || 'Búsqueda',
                duration: track.duration || 0
            };

            // Buscar audio si no hay preview
            if (!trackToPlay.url) {
                if (import.meta.env.DEV) {
                    console.log(`[Search] 🔍 Buscando audio en backend...`);
                }
                trackToPlay.url = await fetchAudioUrl(track.artist, track.name, track.duration);
            }

            if (!trackToPlay.url) {
                console.warn(`[Search] ❌ No se encontró audio para: "${track.artist} - ${track.name}"`);
                return;
            }

            if (import.meta.env.DEV) {
                console.log(`[Search] ✅ Audio encontrado, generando radio...`);
            }

            // 🎵 RADIO INSTANTÁNEA con timeout para no hacer esperar demasiado
            const RADIO_TIMEOUT_MS = 3000;
            let radioQueue = [trackToPlay];

            try {
                // Pasamos los tracks results actuales para tener pool inicial
                // NOTA: Para la radio necesitamos también imágenes de buena calidad si es posible,
                // pero si vienen del search results ya traen .image_xl.
                const radioPromise = buildInstantRadioForSearch(track, results.tracks);
                const timeoutPromise = new Promise((_, reject) =>
                    setTimeout(() => reject(new Error('timeout')), RADIO_TIMEOUT_MS)
                );

                const rawQueue = await Promise.race([radioPromise, timeoutPromise]);

                // Formatear la cola para el reproductor
                radioQueue = rawQueue.map(t => ({
                    id: t.id,
                    name: t.name,
                    artist: t.artist,
                    image: t.image_xl || t.image || getImageUrl(t, true) || DEFAULT_IMAGE, // prefer XL
                    duration: t.duration || 0,
                    url: t.preview || t.url,
                    album: t.album || 'Radio de Búsqueda'
                }));

                // Asegurar que el primer track tenga la URL de audio
                if (radioQueue.length > 0) {
                    radioQueue[0].url = trackToPlay.url;
                }

                if (import.meta.env.DEV) {
                    console.log(`[Search] 📻 Radio generada: ${radioQueue.length} canciones`);
                }
            } catch (err) {
                console.warn('[Search] Radio timeout/error, playing single track');
                radioQueue = [trackToPlay];
            }

            playTrack(trackToPlay, radioQueue);

        } catch (e) {
            console.error("[Search] Error reproduciendo:", e);
        } finally {
            setPlayingTrackId(null);
        }
    }, [playingTrackId, results.tracks, playTrack]);

    // Limpiar búsqueda
    const clearSearch = useCallback(() => {
        setQuery('');
        setResults({ tracks: [], artists: [], albums: [], playlists: [] });
        setHasSearched(false);
    }, []);

    // Resultados a mostrar (sin filtrar por Top Result)
    const tracksToShow = useMemo(() => {
        return results.tracks.slice(0, 5);
    }, [results.tracks]);

    const artistsToShow = useMemo(() => {
        return results.artists.slice(0, 6);
    }, [results.artists]);

    const albumsToShow = useMemo(() => {
        return results.albums.slice(0, 10);
    }, [results.albums]);

    const playlistsToShow = useMemo(() => {
        return results.playlists.slice(0, 10);
    }, [results.playlists]);

    // Verificar si hay resultados
    const hasResults = Object.values(results).some(arr => arr.length > 0);

    // ⭐ RENDER SECTIONS - Orden Estándar
    const renderSections = useCallback(() => {
        if (filter !== 'all') return null;

        const sections = [];

        // Orden fijo estándar
        const sectionOrder = [
            'tracks',
            'artists',
            'albums',
            'playlists'
        ];

        // Renderizar secciones en el orden determinado
        sectionOrder.forEach(sectionType => {
            switch (sectionType) {
                case 'tracks':
                    if (tracksToShow.length > 0) {
                        sections.push(
                            <section key="tracks" className="result-section">
                                <div className="section-header">
                                    <h3 className="section-title">
                                        <FaMusic className="section-title-icon" />
                                        Canciones
                                    </h3>
                                    {results.tracks.length > 5 && (
                                        <button
                                            className="section-see-all"
                                            onClick={() => setFilter('track')}
                                        >
                                            Ver todo
                                        </button>
                                    )}
                                </div>
                                <div className="tracks-list">
                                    {tracksToShow.map((track, i) => (
                                        <TrackRow
                                            key={`track-${track.id || i}`}
                                            track={track}
                                            isLoading={playingTrackId === (track.id || track.name)}
                                            onPlay={handlePlayTrack}
                                            onLongPress={setMenuTrack}
                                        />
                                    ))}
                                </div>
                            </section>
                        );
                    }
                    break;

                case 'artists':
                    if (artistsToShow.length > 0) {
                        sections.push(
                            <section key="artists" className="result-section">
                                <div className="section-header">
                                    <h3 className="section-title">
                                        <FaUser className="section-title-icon" />
                                        Artistas
                                    </h3>
                                    {results.artists.length > 6 && (
                                        <button
                                            className="section-see-all"
                                            onClick={() => setFilter('artist')}
                                        >
                                            Ver todo
                                        </button>
                                    )}
                                </div>
                                <div className="artists-horizontal-list">
                                    {artistsToShow.map((artist, i) => (
                                        <div className="search-card-wrapper" key={`artist-${i}`}>
                                            <Card
                                                item={artist}
                                                variant="vertical" // Force vertical for bubbles style
                                                onClick={() => navigate(`/artist/${encodeURIComponent(artist.name)}`)}
                                            />
                                        </div>
                                    ))}
                                </div>
                            </section>
                        );
                    }
                    break;

                case 'albums':
                    if (albumsToShow.length > 0) {
                        sections.push(
                            <section key="albums" className="result-section">
                                <div className="section-header">
                                    <h3 className="section-title">
                                        <FaCompactDisc className="section-title-icon" />
                                        Álbumes
                                    </h3>
                                </div>
                                <div className="cards-scroll">
                                    {albumsToShow.map((album, i) => (
                                        <div className="search-card-wrapper" key={`album-${i}`}>
                                            <Card
                                                item={album}
                                                variant="vertical"
                                                onClick={() => navigate(`/album/${encodeURIComponent(album.artist)}/${encodeURIComponent(album.name)}`)}
                                                subtitle={album.artist}
                                            />
                                        </div>
                                    ))}
                                </div>
                            </section>
                        );
                    }
                    break;

                case 'playlists':
                    if (playlistsToShow.length > 0) {
                        sections.push(
                            <section key="playlists" className="result-section">
                                <div className="section-header">
                                    <h3 className="section-title">
                                        <FaListAlt className="section-title-icon" />
                                        Playlists
                                    </h3>
                                </div>
                                <div className="cards-scroll">
                                    {playlistsToShow.map((playlist, i) => (
                                        <div className="search-card-wrapper" key={`playlist-${playlist.id || i}`}>
                                            <Card
                                                item={playlist}
                                                variant="vertical"
                                                onClick={() => navigate(`/playlist/${playlist.id}`)}
                                                subtitle={`Por ${playlist.creator || 'Deezer'}`}
                                            />
                                        </div>
                                    ))}
                                </div>
                            </section>
                        );
                    }
                    break;
                default:
                    break;
            }
        });

        return sections;
    }, [
        filter,

        tracksToShow,
        artistsToShow,
        albumsToShow,
        playlistsToShow,
        results,
        playingTrackId,
        handlePlayTrack,
        setFilter,
        navigate
    ]);

    // Filtros estilo Apple Music
    const filters = [
        { id: 'all', label: 'Top resultados' },
        { id: 'artist', label: 'Artistas' },
        { id: 'album', label: 'Álbumes' },
        { id: 'track', label: 'Canciones' },
        { id: 'playlist', label: 'Playlists' }
    ];

    return (
        <div className="search-page" ref={searchContainerRef}>
            {/* MENU DESPLEGABLE (LONG PRESS) */}
            {menuTrack && (
                <LongPressMenu
                    track={menuTrack}
                    onClose={() => setMenuTrack(null)}
                />
            )}

            {/* Sticky Header */}
            {/* Sticky Header */}
            <PageHeader
                className="search-page-header"
                isScrolled={isScrolled}
                ref={headerRef}
            >
                {/* Search Input */}
                <div className="search-input-container">
                    <div className="search-capsule">
                        <input
                            ref={inputRef}
                            type="text"
                            className="search-capsule-input"
                            placeholder="¿Qué quieres escuchar?"
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            onFocus={() => {
                                // Mostrar recientes solo si no hay texto
                                if (!query.trim()) {
                                    setShowRecents(true);
                                }
                            }}
                            onBlur={() => {
                                // Delay para permitir clicks en la lista
                                setTimeout(() => setShowRecents(false), 200);
                            }}
                            autoFocus
                        />
                        <FaSearch className="search-icon" />
                        <button
                            className={`search-clear-btn ${query ? 'visible' : ''}`}
                            onClick={() => {
                                clearSearch();
                                setShowRecents(true);
                                inputRef.current?.focus();
                            }}
                        >
                            <FaTimes size={12} />
                        </button>
                    </div>
                </div>

                {/* Filter Pills */}
                <div className="search-filters">
                    {filters.map(f => (
                        <button
                            key={f.id}
                            className={`filter-glass-pill ${filter === f.id ? 'active' : ''}`}
                            onClick={() => setFilter(f.id)}
                        >
                            {f.label}
                        </button>
                    ))}
                </div>
            </PageHeader>

            {/* Content Area */}
            <main className="search-content">
                {/* Loading State */}
                {isLoading && (
                    <div className="search-loading">
                        <div className="loading-spinner-large" />
                        <p>Buscando...</p>
                    </div>
                )}

                {/* =====================================================
                    BÚSQUEDAS RECIENTES - Mostrar cuando input tiene foco pero está vacío
                ===================================================== */}
                {!isLoading && !hasSearched && showRecents && recentSearches.length > 0 && (
                    <div className="recent-searches">
                        <div className="recent-header">
                            <h2 className="recent-title">Búsquedas Recientes</h2>
                            <button className="recent-clear-all" onClick={clearAllRecent}>
                                Borrar todo
                            </button>
                        </div>
                        <div className="recent-list">
                            {recentSearches.map((term, index) => (
                                <div
                                    key={`recent-${index}-${term}`}
                                    className="recent-item"
                                    onClick={() => executeRecentSearch(term)}
                                >
                                    <div className="recent-icon">
                                        <FaHistory />
                                    </div>
                                    <span className="recent-text">{term}</span>
                                    <button
                                        className="recent-delete"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            removeFromRecent(term);
                                        }}
                                    >
                                        <FaTimes size={12} />
                                    </button>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* =====================================================
                    BROWSE CATEGORIES - Cuando NO hay búsqueda y NO hay recientes visibles
                    ✅ CORREGIDO: Navega DIRECTO a /playlist/{playlistId}
                ===================================================== */}
                {!isLoading && !hasSearched && !(showRecents && recentSearches.length > 0) && (
                    <div className="browse-categories">
                        <h2 className="browse-title">Explorar Géneros</h2>
                        <div className="categories-grid">
                            {SEARCH_CATEGORIES.map((category) => (
                                <div
                                    key={category.id}
                                    className="category-card"
                                    style={{ background: category.color }}
                                    onClick={() => navigate(`/playlist/${category.playlistId}`)}
                                >
                                    <span className="category-title">{category.title}</span>
                                    <div className="category-image-wrapper">
                                        <img
                                            src={category.image}
                                            alt={category.title}
                                            loading="lazy"
                                            onError={(e) => { e.target.style.display = 'none'; }}
                                        />
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* =====================================================
                    RESULTADOS DE BÚSQUEDA - Estructura Limpia
                ===================================================== */}
                {!isLoading && hasSearched && (
                    <div className="results-wrapper">

                        {/* ========================================== */}
                        {/* VISTA "TOP RESULTADOS" (filter === 'all') */}
                        {/* ========================================== */}
                        {filter === 'all' && (
                            <>
                                {/* Secciones ordenadas */}
                                {renderSections()}
                            </>
                        )}

                        {/* ========================================== */}
                        {/* VISTA SOLO ARTISTAS */}
                        {/* ========================================== */}
                        {filter === 'artist' && (
                            <div className="cards-grid">
                                {results.artists.map((artist, i) => (
                                    <div className="search-card-wrapper" key={`artist-${i}`}>
                                        <Card
                                            item={artist}
                                            variant="circle"
                                            onClick={() => navigate(`/artist/${encodeURIComponent(artist.name)}`)}
                                        />
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* ========================================== */}
                        {/* VISTA SOLO ÁLBUMES */}
                        {/* ========================================== */}
                        {filter === 'album' && (
                            <div className="cards-grid">
                                {results.albums.map((album, i) => (
                                    <div className="search-card-wrapper" key={`album-${i}`}>
                                        <Card
                                            item={album}
                                            variant="vertical"
                                            onClick={() => navigate(`/album/${encodeURIComponent(album.artist)}/${encodeURIComponent(album.name)}`)}
                                        />
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* ========================================== */}
                        {/* VISTA SOLO CANCIONES */}
                        {/* ========================================== */}
                        {filter === 'track' && (
                            <div className="tracks-list">
                                {results.tracks.map((track, i) => (
                                    <TrackRow
                                        key={`track-${track.id || i}`}
                                        track={track}
                                        isLoading={playingTrackId === (track.id || track.name)}
                                        onPlay={handlePlayTrack}
                                        onLongPress={setMenuTrack}
                                    />
                                ))}
                            </div>
                        )}

                        {/* ========================================== */}
                        {/* VISTA SOLO PLAYLISTS */}
                        {/* ========================================== */}
                        {filter === 'playlist' && (
                            <div className="cards-grid">
                                {results.playlists.map((playlist, i) => (
                                    <div className="search-card-wrapper" key={`playlist-${playlist.id || i}`}>
                                        <Card
                                            item={playlist}
                                            variant="vertical"
                                            onClick={() => navigate(`/playlist/${playlist.id}`)}
                                        />
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* No Results */}
                        {hasSearched && !hasResults && (
                            <div className="no-results">
                                <h3>No encontramos resultados para "{query}"</h3>
                                <p>Intenta con otra búsqueda o verifica la ortografía</p>
                            </div>
                        )}
                    </div>
                )}
            </main>
        </div>
    );
}
