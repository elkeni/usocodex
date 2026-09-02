// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { setAudioQualityPreference } from './audioQuality';
import { buildInstantPlayUrl, clearAudioUrlCache, fetchAudioUrl } from './unifiedService';
import { clearUnavailableTracks, getTrackUnavailable } from './playbackAvailability';

describe('instant-play audio quality', () => {
    beforeEach(() => {
        localStorage.clear();
        clearAudioUrlCache();
        clearUnavailableTracks();
        vi.restoreAllMocks();
    });

    it('incluye siempre el parámetro quality en la solicitud', () => {
        const url = buildInstantPlayUrl('https://music.test', {
            artist: 'Twenty One Pilots',
            title: 'Overcompensate',
            artistId: 123,
            id: 456,
        }, 'high');

        const parsed = new URL(url);
        expect(parsed.pathname).toBe('/api/instant-play');
        expect(parsed.searchParams.get('artist')).toBe('Twenty One Pilots');
        expect(parsed.searchParams.get('track')).toBe('Overcompensate');
        expect(parsed.searchParams.get('quality')).toBe('high');
    });

    it('envía el modo resuelto en la solicitud real a instant-play', async () => {
        setAudioQualityPreference('high');
        const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
            const url = String(input);
            if (url.includes('/api/search')) return { ok: false };
            if (url.includes('/api/instant-play')) {
                return {
                    ok: true,
                    json: async () => ({
                        success: true,
                        audioUrl: 'https://audio.test/quality-check.m4a',
                        quality: '320kbps',
                        qualityMode: 'high',
                        track: { artist: 'Quality Test Artist' },
                    }),
                };
            }
            throw new Error(`Solicitud inesperada: ${url}`);
        });

        const result = await fetchAudioUrl({
            id: 'quality-request-test',
            artist: 'Quality Test Artist',
            title: 'Quality Test Track',
            duration: 181,
        });

        const instantPlayCall = fetchMock.mock.calls.find(([input]) => String(input).includes('/api/instant-play'));
        expect(instantPlayCall).toBeTruthy();
        expect(new URL(String(instantPlayCall[0])).searchParams.get('quality')).toBe('high');
        expect(result.audio.quality).toBe('320kbps');
        expect(result.audio.qualityMode).toBe('high');
    });

    it.each(['NO_MATCH', 'AUDIO_SOURCE_UNAVAILABLE'])(
        'conserva el contrato unavailable cuando el backend responde %s',
        async (backendError) => {
            vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
                const url = String(input);
                if (url.includes('/api/search')) return { ok: false };
                return {
                    ok: false,
                    json: async () => ({ success: false, error: backendError }),
                };
            });

            const result = await fetchAudioUrl({
                id: `unavailable-${backendError}`,
                artist: 'Unavailable Contract Artist',
                title: `Unavailable ${backendError}`,
                duration: 199,
            });

            expect(result).toMatchObject({ status: 'unavailable', reason: 'NO_MATCH' });
        },
    );

    it('omite temporalmente un NO_MATCH y el clic explícito lo reintenta una vez', async () => {
        const target = { id: 'manual-retry', artist: 'KATANAZ', title: 'Prayer', duration: 180 };
        let backendAvailable = false;
        const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
            const url = String(input);
            if (url.includes('/api/search')) return { ok: false, json: async () => ({ results: [] }) };
            if (!backendAvailable) return { ok: false, status: 404, json: async () => ({ success: false, reason: 'NO_MATCH' }) };
            return {
                ok: true,
                status: 200,
                json: async () => ({
                    success: true,
                    audioUrl: 'https://audio.test/prayer.m4a',
                    quality: '160kbps',
                    qualityMode: 'balanced',
                    track: { artist: 'KATANAZ' },
                }),
            };
        });

        expect((await fetchAudioUrl(target)).status).toBe('unavailable');
        const callsAfterFailure = fetchMock.mock.calls.length;
        expect((await fetchAudioUrl(target)).status).toBe('unavailable');
        expect(fetchMock).toHaveBeenCalledTimes(callsAfterFailure);

        backendAvailable = true;
        expect((await fetchAudioUrl(target, { bypassNegativeCache: true })).status).toBe('ok');
        expect(getTrackUnavailable(target)).toBeNull();
    });
});
