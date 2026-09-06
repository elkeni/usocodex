import { getRecordingCacheKey } from './playbackTarget';
export const NEGATIVE_PLAYBACK_TTL_MS = 45 * 1000;

const unavailableTracks = new Map();

export const getPlaybackAvailabilityKey = (track) => getRecordingCacheKey(track, 'availability');

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
