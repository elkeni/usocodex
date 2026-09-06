// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { appendPlaybackTarget, getRecordingCacheKey } from './playbackTarget';
import { buildInstantPlayUrl, clearAudioUrlCache, fetchAudioUrl } from './unifiedService';
import { playbackPrefetchService } from './playbackPrefetchService';

afterEach(() => { vi.restoreAllMocks(); clearAudioUrlCache(); playbackPrefetchService.clear(); });
const track = { artist: 'Daft Punk', title: 'One More Time', duration: '5:20', album: { title: 'Discovery' }, explicit: false };

describe('recording identity from UI to backend', () => {
    it('sends duration, album and the explicit false value', () => {
        const params = appendPlaybackTarget(new URLSearchParams(), track);
        expect(params.get('duration')).toBe('320');
        expect(params.get('album')).toBe('Discovery');
        expect(params.get('explicit')).toBe('false');
        const url = new URL(buildInstantPlayUrl('https://music.test', track, 'high'));
        expect(url.searchParams.get('duration')).toBe('320');
        expect(url.searchParams.get('explicit')).toBe('false');
    });
    it('uses separate caches for clean, explicit and short edits', () => {
        const keys = [track, { ...track, explicit: true }, { ...track, duration: 240 }, { ...track, album: 'Other' }]
            .map(value => getRecordingCacheKey(value, 'high'));
        expect(new Set(keys).size).toBe(4);
        expect(getRecordingCacheKey({ artist: '東京', title: '春' }, 'high'))
            .not.toBe(getRecordingCacheKey({ artist: '東京', title: '夏' }, 'high'));
    });
    it('never races an unvalidated index hit against the playback resolver', async () => {
        const mock = vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: true, json: async () => ({
            success: true, audioUrl: 'https://audio.test/correct', quality: '160kbps',
            track: { artist: 'Daft Punk', source: 'saavn' },
        }) });
        const result = await fetchAudioUrl(track);
        expect(result.status).toBe('ok');
        expect(mock).toHaveBeenCalledTimes(1);
        const params = new URL(mock.mock.calls[0][0]).searchParams;
        expect(params.get('duration')).toBe('320');
        expect(params.get('explicit')).toBe('false');
    });
    it('prefetch sends the same identity and respects the server expiration', async () => {
        const expiresAt = Date.now() + 500;
        const mock = vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: true, json: async () => ({
            success: true, playback: { success: true, audioUrl: 'https://audio.test/correct', expiresAt, track: { source: 'saavn' } },
        }) });
        const result = await playbackPrefetchService.resolve(track, { qualityMode: 'high' });
        expect(result.expiresAt).toBe(expiresAt);
        expect(new URL(mock.mock.calls[0][0]).searchParams.get('duration')).toBe('320');
        vi.spyOn(Date, 'now').mockReturnValue(expiresAt + 1);
        expect(playbackPrefetchService.get(track, 'high')).toBeNull();
    });
});
