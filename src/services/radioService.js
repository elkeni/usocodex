import { artistGetTopTracks, getRelatedArtists } from './unifiedService';

const BAD_VARIANTS = /\b(cover|karaoke|tribute|nightcore|slowed|reverb|8d)\b/i;

export const getArtistName = (track) => {
    const value = typeof track?.artist === 'string'
        ? track.artist
        : track?.artist?.name || track?.artist?.['#text'] || '';
    return value.split(/[,&]|feat\.?|ft\.?|with|\sx\s/i)[0].trim();
};

export const getRadioTrackKey = (track) => {
    const artist = getArtistName(track).toLocaleLowerCase('es');
    const name = String(track?.name || track?.title || '').trim().toLocaleLowerCase('es');
    return `${artist}::${name}`;
};

const normalizeTrack = (track, fallbackArtist = '') => {
    if (!track) return null;
    const artist = getArtistName(track) || fallbackArtist;
    const name = String(track.name || track.title || '').trim();
    if (!artist || !name || BAD_VARIANTS.test(name)) return null;

    const image = typeof track.image === 'string'
        ? track.image
        : track.image?.[3]?.['#text'] || track.image?.[2]?.['#text'] || track.image?.[1]?.['#text'] ||
          track.album?.cover_xl || track.album?.cover_big || track.picture_xl || '';

    return {
        ...track,
        id: track.id || `${artist}-${name}`,
        name,
        artist,
        image,
        type: 'track',
    };
};

const uniqueTracks = (tracks, existingKeys = new Set()) => {
    const seen = new Set(existingKeys);
    return tracks.reduce((result, rawTrack) => {
        const track = normalizeTrack(rawTrack);
        const key = getRadioTrackKey(track);
        if (!track || !key || seen.has(key)) return result;
        seen.add(key);
        result.push(track);
        return result;
    }, []);
};

const shuffled = (items, random) => {
    const copy = [...items];
    for (let index = copy.length - 1; index > 0; index -= 1) {
        const swapIndex = Math.floor(random() * (index + 1));
        [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
    }
    return copy;
};

/**
 * Selecciona una semilla distinta para una radio de artista.
 * La API devuelve los éxitos en un orden fijo; no usar siempre el índice 0
 * evita que la estación empiece invariablemente con el tema más popular.
 */
export const selectArtistRadioSeed = (tracks, { recentKeys = [], random = Math.random } = {}) => {
    const candidates = uniqueTracks(tracks);
    if (!candidates.length) return null;

    const recent = recentKeys.filter(Boolean);
    const recentSet = new Set(recent);
    let pool = candidates.filter((track) => !recentSet.has(getRadioTrackKey(track)));

    // Tras recorrer el catálogo disponible, empieza un ciclo nuevo sin repetir
    // de inmediato el último tema que abrió la estación.
    if (!pool.length) {
        const lastKey = recent[0];
        pool = candidates.filter((track) => getRadioTrackKey(track) !== lastKey);
    }

    const selectionPool = pool.length ? pool : candidates;
    const index = Math.min(selectionPool.length - 1, Math.floor(random() * selectionPool.length));
    return selectionPool[index];
};

const interleaveWithArtistSpacing = (pools, targetSize) => {
    const queue = [];
    let lastArtist = '';
    let sameArtistCount = 0;

    while (queue.length < targetSize && pools.some((pool) => pool.length)) {
        let added = false;
        for (const pool of pools) {
            const nextIndex = pool.findIndex((track) => {
                const artist = getArtistName(track).toLocaleLowerCase('es');
                return artist !== lastArtist || sameArtistCount < 2;
            });
            if (nextIndex < 0) continue;

            const [track] = pool.splice(nextIndex, 1);
            const artist = getArtistName(track).toLocaleLowerCase('es');
            sameArtistCount = artist === lastArtist ? sameArtistCount + 1 : 1;
            lastArtist = artist;
            queue.push(track);
            added = true;
            if (queue.length >= targetSize) break;
        }
        if (!added) {
            const fallbackPool = pools.find((pool) => pool.length);
            queue.push(fallbackPool.shift());
        }
    }
    return queue;
};

/**
 * Único constructor de radio para Feed, Búsqueda y continuación automática.
 * Reproduce la semilla de inmediato; las llamadas remotas solo completan la cola.
 */
export const buildRadioQueue = async ({
    seedTrack,
    artistName = '',
    contextTracks = [],
    existingQueue = [],
    targetSize = 24,
    includeSeed = true,
    random = Math.random,
    services = { artistGetTopTracks, getRelatedArtists },
} = {}) => {
    const seed = normalizeTrack(seedTrack);
    if (!seed) return [];

    // En una radio de artista, la estación se ancla al artista elegido y no a
    // los créditos de la primera pista. Esto importa en colaboraciones o
    // cuando la pista inicial llega normalizada con otro crédito principal.
    const stationArtist = String(artistName || getArtistName(seed)).trim();
    if (!stationArtist) return [];
    const existingKeys = new Set(existingQueue.map(getRadioTrackKey));
    existingKeys.add(getRadioTrackKey(seed));

    const [mainResponse, relatedArtists] = await Promise.all([
        services.artistGetTopTracks({ artist: stationArtist, limit: 18 }).catch(() => null),
        services.getRelatedArtists(stationArtist, 8).catch(() => []),
    ]);

    const related = (relatedArtists || []).slice(0, 6);
    const relatedResponses = await Promise.all(related.map(async (artist) => {
        const name = artist?.name || artist;
        if (!name) return [];
        const response = await services.artistGetTopTracks({ artist: name, limit: 5 }).catch(() => null);
        return (response?.toptracks?.track || []).map((track) => normalizeTrack(track, name));
    }));

    const contextPool = shuffled(uniqueTracks(contextTracks, existingKeys), random);
    const mainPool = shuffled(uniqueTracks(mainResponse?.toptracks?.track || [], existingKeys), random);
    const relatedPool = shuffled(uniqueTracks(relatedResponses.flat(), existingKeys), random);

    const additional = uniqueTracks(
        interleaveWithArtistSpacing([contextPool, relatedPool, mainPool], targetSize),
        existingKeys,
    ).slice(0, targetSize);

    return includeSeed ? [seed, ...additional] : additional;
};

export default buildRadioQueue;
