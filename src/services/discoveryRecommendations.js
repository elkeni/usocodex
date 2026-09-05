const BAD_VARIANT = /\b(cover|karaoke|tribute|nightcore|slowed|reverb|8d|sped\s*up)\b/i;
const DAY = 86400000;

export const getDiscoveryArtistName = (value) => {
    const raw = typeof value === 'string' ? value : value?.name || value?.['#text'] || '';
    return String(raw).split(/\s+(?:feat\.?|ft\.?|with)\s+|\s+x\s+/i)[0].trim();
};

export const normalizeDiscoveryText = (value) => String(value || '')
    .normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .normalize('NFC').toLocaleLowerCase('es').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

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

const timestampOf = (track) => {
    const raw = track?.timestamp ?? track?.playedAt ?? track?.addedAt;
    if (raw == null) return null;
    const parsed = typeof raw === 'number' ? raw : Date.parse(raw);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

/** Recent listening leads; saved collections provide a bounded, long-term baseline. */
export const buildDiscoveryTasteProfile = ({
    favorites = [], playlists = [], savedArtists = [], savedAlbums = [],
    listeningHistory = [], engagement = {}, userId = 'guest', sessionSeed = 'session',
    now = Date.now(),
} = {}) => {
    const scores = new Map();
    const recentScores = new Map();
    const displayNames = new Map();
    const add = (map, value, weight) => {
        const name = getDiscoveryArtistName(value);
        const key = normalizeDiscoveryText(name);
        if (!key || !Number.isFinite(weight) || weight <= 0) return;
        displayNames.set(key, name);
        map.set(key, (map.get(key) || 0) + weight);
    };
    const addCollection = (items, weight, cap) => {
        const counts = new Map();
        const seen = new Set();
        items.forEach((item) => {
            const key = getDiscoveryTrackKey(item) || normalizeDiscoveryText(getDiscoveryArtistName(item?.artist));
            if (!key || seen.has(key)) return;
            seen.add(key);
            add(counts, item?.artist, 1);
        });
        counts.forEach((count, key) => add(scores, displayNames.get(key), Math.min(cap, weight * Math.sqrt(count))));
    };
    const explicitlySaved = new Set();
    savedArtists.forEach((artist) => {
        const key = normalizeDiscoveryText(getDiscoveryArtistName(artist));
        if (!key || explicitlySaved.has(key)) return;
        explicitlySaved.add(key);
        add(scores, artist, 12);
    });
    addCollection(favorites, 8, 18);
    addCollection(playlists.flatMap((playlist) => playlist?.tracks || []), 2, 6);
    addCollection(savedAlbums, 4, 8);

    // History is newest-first in the player, but stored timestamps remain authoritative.
    const history = listeningHistory.slice().sort((a, b) => (timestampOf(b) || 0) - (timestampOf(a) || 0)).slice(0, 200);
    const repeatCounts = new Map();
    history.forEach((item, index) => {
        const timestamp = timestampOf(item);
        const ageDays = timestamp === null ? index / 3 : Math.max(0, (now - timestamp) / DAY);
        const key = getDiscoveryTrackKey(item);
        const repeats = (repeatCounts.get(key) || 0) + 1;
        repeatCounts.set(key, repeats);
        add(recentScores, item?.artist, 24 * Math.pow(0.5, ageDays / 10) / Math.sqrt(repeats));
    });
    recentScores.forEach((score, key) => {
        const bounded = Math.min(80, score);
        recentScores.set(key, bounded);
        add(scores, displayNames.get(key), bounded);
    });
    Object.entries(engagement?.likedArtists || {}).forEach(([artist, count]) => {
        add(scores, artist, Math.min(12, Math.max(0, Number(count)) * 3));
    });
    const avoidedArtists = new Set(Object.entries(engagement?.skippedArtists || {})
        .filter(([artist, count]) => Number(count) >= 3 && !explicitlySaved.has(normalizeDiscoveryText(artist)))
        .map(([artist]) => normalizeDiscoveryText(artist)));
    const seeds = [...scores.entries()].filter(([key]) => !avoidedArtists.has(key))
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 16)
        .map(([key, score]) => ({ key, name: displayNames.get(key), score, recentScore: recentScores.get(key) || 0 }));
    const knownTrackKeys = new Set([...favorites, ...history].map(getDiscoveryTrackKey).filter(Boolean));
    const knownArtists = new Set(scores.keys());
    const fingerprint = [...knownTrackKeys].sort().join('|');
    const signature = `${userId}:${sessionSeed}:${seeds.map((seed) => `${seed.key}:${seed.score.toFixed(1)}`).join('|')}:${deterministicNumber(fingerprint)}`;
    return { seeds, knownTrackKeys, knownArtists, avoidedArtists, signature };
};

const candidateScore = (candidate, profile, sessionSeed) => {
    const track = candidate.track || candidate;
    const artistKey = normalizeDiscoveryText(getDiscoveryArtistName(track.artist));
    const sourceWeight = candidate.source === 'related' ? 36 : candidate.source === 'familiar' ? 24 : 18;
    const novelty = profile.knownArtists?.has(artistKey) ? 0 : 12;
    const affinity = Math.min(32, Math.max(0, Number(candidate.affinity) || 0) * 0.8);
    const rank = Math.max(0, 10 - (Number(candidate.rank) || 0));
    return sourceWeight + novelty + affinity + rank + deterministicNumber(`${sessionSeed}:${getDiscoveryTrackKey(track)}`) / 0xffffffff;
};

/** Greedy reranking spreads artists and taste origins throughout the visible list. */
export const selectDiscoveryTracks = ({ candidates = [], profile = {}, sessionSeed = 'session', limit = 27 } = {}) => {
    const byTrack = new Map();
    candidates.forEach((candidate) => {
        const track = candidate?.track || candidate;
        const title = String(track?.name || track?.title || '').trim();
        const key = getDiscoveryTrackKey(track);
        const artist = normalizeDiscoveryText(getDiscoveryArtistName(track?.artist));
        if (!key || !track?.image || BAD_VARIANT.test(title) || profile.avoidedArtists?.has(artist) || profile.knownTrackKeys?.has(key)) return;
        const score = candidateScore(candidate, profile, sessionSeed);
        const seed = normalizeDiscoveryText(getDiscoveryArtistName(candidate.seedArtist || candidate.seed));
        const genre = normalizeDiscoveryText(candidate.genre || track.genre || '');
        if (!byTrack.has(key) || byTrack.get(key).score < score) byTrack.set(key, { track, artist, seed, genre, source: candidate.source, score });
    });
    const remaining = [...byTrack.values()];
    const artistCounts = new Map();
    const seedCounts = new Map();
    const genreCounts = new Map();
    const sourceCounts = new Map();
    const result = [];
    while (result.length < Math.max(0, limit) && remaining.length) {
        let best = -1;
        let bestScore = -Infinity;
        remaining.forEach((item, index) => {
            const count = artistCounts.get(item.artist) || 0;
            if (count >= 2) return;
            const score = item.score - count * 42
                - (item.seed ? (seedCounts.get(item.seed) || 0) * 9 : 0)
                - (item.genre ? (genreCounts.get(item.genre) || 0) * 5 : 0)
                - (sourceCounts.get(item.source) || 0) * 2;
            if (score > bestScore) { best = index; bestScore = score; }
        });
        if (best === -1) break;
        const [item] = remaining.splice(best, 1);
        result.push(item.track);
        [[artistCounts, item.artist], [seedCounts, item.seed], [genreCounts, item.genre], [sourceCounts, item.source]]
            .forEach(([map, key]) => map.set(key, (map.get(key) || 0) + 1));
    }
    return result;
};

