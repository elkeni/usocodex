export const NEGATIVE_PLAYBACK_TTL_MS = 45 * 1000;

const unavailableTracks = new Map();

const normalizePart = (value) => String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

const getArtist = (track) => (
    typeof track?.artist === 'string' ? track.artist : track?.artist?.name || track?.creator || ''
);

const getTitle = (track) => track?.name || track?.title || '';

export const getPlaybackAvailabilityKey = (track) => (
    `${normalizePart(getArtist(track))}::${normalizePart(getTitle(track))}`
);

export const markTrackUnavailable = (track, reason = 'NO_MATCH', now = Date.now()) => {
    const key = getPlaybackAvailabilityKey(track);
    if (!key || key === '::') return null;
    const entry = { reason, timestamp: now };
    unavailableTracks.set(key, entry);
    return entry;
};

export const getTrackUnavailable = (track, now = Date.now()) => {
    const key = getPlaybackAvailabilityKey(track);
    const entry = unavailableTracks.get(key);
    if (!entry) return null;
    if (now - entry.timestamp >= NEGATIVE_PLAYBACK_TTL_MS) {
        unavailableTracks.delete(key);
        return null;
    }
    return entry;
};

export const clearTrackUnavailable = (track) => {
    unavailableTracks.delete(getPlaybackAvailabilityKey(track));
};

export const clearUnavailableTracks = () => unavailableTracks.clear();

export const getUnavailableTrackCount = () => unavailableTracks.size;
