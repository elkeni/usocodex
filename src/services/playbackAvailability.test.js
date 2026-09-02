import { afterEach, describe, expect, it } from 'vitest';
import {
    NEGATIVE_PLAYBACK_TTL_MS,
    clearTrackUnavailable,
    clearUnavailableTracks,
    getPlaybackAvailabilityKey,
    getTrackUnavailable,
    markTrackUnavailable,
} from './playbackAvailability';

const track = { artist: 'KATANAZ', name: 'Prayer' };

afterEach(clearUnavailableTracks);

describe('playbackAvailability', () => {
    it('conserva un NO_MATCH solo durante 45 segundos y nunca usa localStorage', () => {
        markTrackUnavailable(track, 'NO_MATCH', 1_000);
        expect(getTrackUnavailable(track, 1_000 + NEGATIVE_PLAYBACK_TTL_MS - 1)?.reason).toBe('NO_MATCH');
        expect(getTrackUnavailable(track, 1_000 + NEGATIVE_PLAYBACK_TTL_MS)).toBeNull();
    });

    it('normaliza la identidad y elimina el fallo cuando llega un resultado válido', () => {
        markTrackUnavailable(track);
        expect(getPlaybackAvailabilityKey({ artist: 'katanáz', title: 'PRAYER' })).toBe(getPlaybackAvailabilityKey(track));
        clearTrackUnavailable({ artist: 'katanáz', title: 'PRAYER' });
        expect(getTrackUnavailable(track)).toBeNull();
    });
});
