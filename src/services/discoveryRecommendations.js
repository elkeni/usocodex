const BAD_VARIANT = /\b(cover|karaoke|tribute|nightcore|slowed|reverb|8d|sped\s*up)\b/i;

export const getDiscoveryArtistName = (value) => {
    const raw = typeof value === 'string'
        ? value
        : value?.name || value?.['#text'] || '';

    return String(raw)
        .split(/\s+(?:feat\.?|ft\.?|with)\s+|\s+x\s+/i)[0]
        .trim();
};

export const normalizeDiscoveryText = (value) => String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('es')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

export const getDiscoveryTrackKey = (track) => {
    const artist = normalizeDiscoveryText(getDiscoveryArtistName(track?.artist));
    const title = normalizeDiscoveryText(track?.name || track?.title);
    return artist && title ? `${artist}::${title}` : '';
};

const deterministicNumber = (value) => {
    let hash = 2166136261;
    for (const character of String(value)) {
        hash ^= character.charCodeAt(0);
        hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
};

const addArtistScore = (scores, displayNames, artistValue, score) => {
    const artist = getDiscoveryArtistName(artistValue);
    const key = normalizeDiscoveryText(artist);
    if (!key || !Number.isFinite(score) || score <= 0) return;
    scores.set(key, (scores.get(key) || 0) + score);
    if (!displayNames.has(key)) displayNames.set(key, artist);
};

const addRankedTracks = (scores, displayNames, tracks, baseWeight, limit = 80) => {
    (tracks || []).slice(0, limit).forEach((track, index) => {
        const recency = Math.max(0.35, 1 - (index / Math.max(limit, 1)) * 0.65);
        addArtistScore(scores, displayNames, track?.artist, baseWeight * recency);
    });
};

/**
 * Construye un retrato estable de gustos para una única apertura de la app.
 * Las señales explícitas pesan más que una escucha aislada.
 */
export const buildDiscoveryTasteProfile = ({
    favorites = [],
    playlists = [],
    savedArtists = [],
    savedAlbums = [],
    listeningHistory = [],
    engagement = {},
    userId = 'guest',
    sessionSeed = 'session',
} = {}) => {
    const scores = new Map();
    const displayNames = new Map();

    (savedArtists || []).slice().reverse().forEach((artist, index) => {
        addArtistScore(scores, displayNames, artist, Math.max(5, 12 - index * 0.25));
    });
    addRankedTracks(scores, displayNames, [...(favorites || [])].reverse(), 8, 120);
    addRankedTracks(scores, displayNames, listeningHistory, 3.5, 100);
    addRankedTracks(
        scores,
        displayNames,
        (playlists || []).flatMap((playlist) => playlist?.tracks || []),
        2.25,
        120,
    );
    (savedAlbums || []).slice().reverse().forEach((album, index) => {
        addArtistScore(scores, displayNames, album?.artist, Math.max(2, 5 - index * 0.12));
    });
    Object.entries(engagement?.likedArtists || {}).forEach(([artist, count]) => {
        addArtistScore(scores, displayNames, artist, Math.min(16, Number(count || 0) * 3));
    });

    const explicitlySaved = new Set((savedArtists || [])
        .map((artist) => normalizeDiscoveryText(getDiscoveryArtistName(artist)))
        .filter(Boolean));
    const avoidedArtists = new Set(Object.entries(engagement?.skippedArtists || {})
        .filter(([artist, count]) => Number(count) >= 3 && !explicitlySaved.has(normalizeDiscoveryText(artist)))
        .map(([artist]) => normalizeDiscoveryText(artist)));

    const seeds = [...scores.entries()]
        .filter(([key]) => !avoidedArtists.has(key))
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .slice(0, 12)
        .map(([key, score]) => ({ key, name: displayNames.get(key), score }));

    const knownTrackKeys = new Set([
        ...(favorites || []),
        ...(listeningHistory || []).slice(0, 120),
    ].map(getDiscoveryTrackKey).filter(Boolean));
    const knownArtists = new Set(scores.keys());
    const signature = `${userId}:${sessionSeed}:${seeds.map((seed) => `${seed.key}:${seed.score.toFixed(2)}`).join('|')}`;

    return { seeds, knownTrackKeys, knownArtists, avoidedArtists, signature };
};

const isValidCandidate = (candidate, profile) => {
    const track = candidate?.track || candidate;
    const title = String(track?.name || track?.title || '').trim();
    const artist = getDiscoveryArtistName(track?.artist);
    const artistKey = normalizeDiscoveryText(artist);
    const trackKey = getDiscoveryTrackKey(track);
    if (!title || !artist || !trackKey || BAD_VARIANT.test(title)) return false;
    if (profile?.avoidedArtists?.has(artistKey)) return false;
    if (profile?.knownTrackKeys?.has(trackKey)) return false;
    return Boolean(track?.image);
};

const candidateScore = (candidate, profile, sessionSeed) => {
    const track = candidate.track || candidate;
    const artistKey = normalizeDiscoveryText(getDiscoveryArtistName(track.artist));
    const sourceWeight = candidate.source === 'related' ? 44 : candidate.source === 'familiar' ? 25 : 12;
    const novelty = profile.knownArtists.has(artistKey) ? 0 : 16;
    const affinity = Math.min(30, Number(candidate.affinity || 0) * 1.35);
    const rank = Math.max(0, 10 - Number(candidate.rank || 0));
    const tieBreaker = deterministicNumber(`${sessionSeed}:${getDiscoveryTrackKey(track)}`) / 0xffffffff;
    return sourceWeight + novelty + affinity + rank + tieBreaker;
};

const takeDiverse = (ordered, result, seenTracks, artistCounts, limit, maxPerArtist) => {
    for (const candidate of ordered) {
        if (result.length >= limit) break;
        const track = candidate.track || candidate;
        const trackKey = getDiscoveryTrackKey(track);
        const artistKey = normalizeDiscoveryText(getDiscoveryArtistName(track.artist));
        if (seenTracks.has(trackKey) || (artistCounts.get(artistKey) || 0) >= maxPerArtist) continue;
        seenTracks.add(trackKey);
        artistCounts.set(artistKey, (artistCounts.get(artistKey) || 0) + 1);
        result.push(track);
    }
};

/** Selecciona una mezcla 70/20/10: descubrimiento, afinidad conocida y contexto popular. */
export const selectDiscoveryTracks = ({ candidates = [], profile, sessionSeed, limit = 27 } = {}) => {
    const valid = candidates
        .filter((candidate) => isValidCandidate(candidate, profile))
        .map((candidate) => ({ ...candidate, score: candidateScore(candidate, profile, sessionSeed) }))
        .sort((a, b) => b.score - a.score);

    const related = valid.filter((candidate) => candidate.source === 'related');
    const familiar = valid.filter((candidate) => candidate.source === 'familiar');
    const context = valid.filter((candidate) => candidate.source === 'chart');
    const result = [];
    const seenTracks = new Set();
    const artistCounts = new Map();

    takeDiverse(related, result, seenTracks, artistCounts, Math.ceil(limit * 0.7), 2);
    takeDiverse(familiar, result, seenTracks, artistCounts, Math.ceil(limit * 0.9), 2);
    takeDiverse(context, result, seenTracks, artistCounts, limit, 1);
    takeDiverse(valid, result, seenTracks, artistCounts, limit, 2);

    return result.slice(0, limit);
};

