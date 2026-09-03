import {
    getDiscoveryArtistName,
    getDiscoveryTrackKey,
    normalizeDiscoveryText,
} from './discoveryRecommendations';

const getTrackArtist = (track) => getDiscoveryArtistName(track?.artist || track?.artistName);

const addAffinity = (scores, labels, artistValue, weight) => {
    const artist = getDiscoveryArtistName(artistValue);
    const key = normalizeDiscoveryText(artist);
    if (!key || !Number.isFinite(weight) || weight <= 0) return;
    scores.set(key, (scores.get(key) || 0) + weight);
    if (!labels.has(key)) labels.set(key, artist);
};

const addTracksByRecency = (scores, labels, tracks, weight, limit) => {
    (tracks || []).slice(0, limit).forEach((track, index) => {
        const decay = Math.max(0.35, 1 - (index / Math.max(1, limit)) * 0.65);
        addAffinity(scores, labels, track?.artist, weight * decay);
    });
};

export const buildSearchTasteProfile = ({
    favorites = [],
    listeningHistory = [],
    savedArtists = [],
    savedAlbums = [],
    playlists = [],
    tasteEngagement = {},
} = {}) => {
    const scores = new Map();
    const labels = new Map();

    [...(savedArtists || [])].reverse().forEach((artist, index) => {
        addAffinity(scores, labels, artist, Math.max(10, 20 - index * 0.35));
    });
    addTracksByRecency(scores, labels, [...(favorites || [])].reverse(), 12, 120);
    addTracksByRecency(scores, labels, listeningHistory, 6, 100);
    addTracksByRecency(
        scores,
        labels,
        (playlists || []).flatMap((playlist) => playlist?.tracks || []),
        3,
        160,
    );
    [...(savedAlbums || [])].reverse().forEach((album, index) => {
        addAffinity(scores, labels, album?.artist, Math.max(4, 9 - index * 0.2));
    });
    Object.entries(tasteEngagement?.likedArtists || {}).forEach(([artist, count]) => {
        addAffinity(scores, labels, artist, Math.min(18, Number(count || 0) * 3));
    });

    const savedKeys = new Set((savedArtists || [])
        .map((artist) => normalizeDiscoveryText(getDiscoveryArtistName(artist)))
        .filter(Boolean));
    const avoidedArtists = new Set(Object.entries(tasteEngagement?.skippedArtists || {})
        .filter(([artist, count]) => Number(count) >= 3 && !savedKeys.has(normalizeDiscoveryText(artist)))
        .map(([artist]) => normalizeDiscoveryText(artist)));

    const artists = [...scores.entries()]
        .filter(([key]) => !avoidedArtists.has(key))
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .map(([key, score]) => ({ key, name: labels.get(key), score }));
    const favoriteTrackKeys = new Set((favorites || []).map(getDiscoveryTrackKey).filter(Boolean));
    const maxAffinity = Math.max(1, ...artists.map((artist) => artist.score));
    const signature = artists.slice(0, 12)
        .map((artist) => `${artist.key}:${artist.score.toFixed(1)}`)
        .join('|') || 'neutral';

    return { artists, scores, avoidedArtists, favoriteTrackKeys, maxAffinity, signature };
};

const getSearchFields = (item, type) => {
    if (type === 'artist') return { primary: item?.name, secondary: '' };
    if (type === 'album') return { primary: item?.name, secondary: item?.artist };
    if (type === 'playlist') return { primary: item?.name, secondary: item?.creator };
    return { primary: item?.name || item?.title, secondary: `${getTrackArtist(item)} ${item?.album || ''}` };
};

const getItemArtist = (item, type) => {
    if (type === 'artist') return item?.name;
    if (type === 'album' || type === 'track') return getTrackArtist(item);
    return '';
};

const textRelevance = (item, query, type) => {
    const normalizedQuery = normalizeDiscoveryText(query);
    const tokens = normalizedQuery.split(' ').filter(Boolean);
    const { primary: rawPrimary, secondary: rawSecondary } = getSearchFields(item, type);
    const primary = normalizeDiscoveryText(rawPrimary);
    const secondary = normalizeDiscoveryText(rawSecondary);
    const combined = `${primary} ${secondary}`.trim();

    if (primary === normalizedQuery) return 1_000_000;
    if (secondary === normalizedQuery) return 900_000;
    if (primary.startsWith(normalizedQuery)) return 820_000;
    if (secondary.startsWith(normalizedQuery)) return 760_000;
    if (primary.includes(normalizedQuery)) return 700_000;
    if (secondary.includes(normalizedQuery)) return 640_000;

    const matchedTokens = tokens.filter((token) => combined.includes(token)).length;
    if (tokens.length && matchedTokens === tokens.length) return 560_000;
    return tokens.length ? Math.round((matchedTokens / tokens.length) * 360_000) : 0;
};

const popularityScore = (item) => {
    const popularity = Math.max(0, Number(item?.rank || item?.fans || item?.popularity || 0));
    return Math.min(9_000, Math.log10(popularity + 1) * 1_500);
};

const getIdentity = (item, type) => {
    if (item?.id !== undefined && item?.id !== null) return `${type}:${item.id}`;
    const fields = getSearchFields(item, type);
    return `${type}:${normalizeDiscoveryText(fields.primary)}::${normalizeDiscoveryText(fields.secondary)}`;
};

/**
 * La relevancia textual siempre manda. La afinidad personal únicamente ordena
 * candidatos del mismo nivel, como hacen los buscadores de catálogo maduros.
 */
export const rankPersonalizedSearchResults = (items, query, type, profile) => {
    const unique = new Map();
    (items || []).forEach((item) => {
        if (!item) return;
        const identity = getIdentity(item, type);
        if (!unique.has(identity)) unique.set(identity, item);
    });

    return [...unique.values()]
        .map((item) => {
            const artist = getItemArtist(item, type);
            const artistKey = normalizeDiscoveryText(artist);
            const affinity = profile?.avoidedArtists?.has(artistKey)
                ? 0
                : Number(profile?.scores?.get(artistKey) || 0);
            const normalizedAffinity = Math.min(1, affinity / Math.max(1, profile?.maxAffinity || 1));
            const isFavoriteTrack = type === 'track' && profile?.favoriteTrackKeys?.has(getDiscoveryTrackKey(item));
            const personalizationScore = normalizedAffinity * 42_000 + (isFavoriteTrack ? 8_000 : 0);
            const personalized = affinity > 0;
            const score = textRelevance(item, query, type) + personalizationScore + popularityScore(item);

            return {
                ...item,
                _searchMeta: {
                    score,
                    personalized,
                    affinity,
                    reason: personalized ? `Porque te gusta ${artist}` : '',
                },
            };
        })
        .sort((a, b) => b._searchMeta.score - a._searchMeta.score);
};

export const getPersonalizedSearchSuggestions = (profile, limit = 6) => (
    (profile?.artists || []).slice(0, limit).map((artist) => artist.name).filter(Boolean)
);
