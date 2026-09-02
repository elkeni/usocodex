// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
    getPlaybackPrefetchKey,
    getPrefetchLimitForQuality,
    playbackPrefetchService,
    resolvedPlaybacks,
} from './playbackPrefetchService';
import { setSmartPrefetchPreference } from './experiencePreferences';

const track = { artist: 'CA7RIEL & Paco Amoroso', name: 'DUMBAI' };
const playback = (source = 'saavn', qualityMode = 'high') => ({
    success: true,
    audioUrl: `https://audio.test/${source}.m4a`,
    quality: qualityMode === 'high' ? '320kbps' : '160kbps',
    qualityMode,
    cacheStatus: 'miss',
    track: { title: 'DUMBAI', artist: 'CA7RIEL & Paco Amoroso', source },
});

beforeEach(() => localStorage.clear());

afterEach(() => {
    playbackPrefetchService.clear();
    vi.restoreAllMocks();
});

describe('PlaybackPrefetchService', () => {
    it('comparte una sola promesa y una sola llamada para solicitudes iguales', async () => {
        let release;
        const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(() => new Promise((resolve) => {
            release = () => resolve({ ok: true, json: async () => ({ success: true, playback: playback() }) });
        }));

        const first = playbackPrefetchService.resolve(track, { qualityMode: 'high' });
        const second = playbackPrefetchService.resolve(track, { qualityMode: 'high' });

        expect(first).toBe(second);
        expect(fetchMock).toHaveBeenCalledTimes(1);
        release();
        expect(await first).toMatchObject({ audioUrl: expect.any(String), qualityMode: 'high' });
    });

    it('un playback prefetched evita una nueva llamada aunque se pida instant-play', async () => {
        playbackPrefetchService.store(track, playback(), 'high');
        const fetchMock = vi.spyOn(globalThis, 'fetch');
        const result = await playbackPrefetchService.resolve(track, {
            qualityMode: 'high',
            endpoint: 'instant-play',
        });
        expect(result.audioUrl).toContain('saavn');
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('incluye la calidad en la identidad del caché', () => {
        expect(getPlaybackPrefetchKey(track, 'balanced')).not.toBe(getPlaybackPrefetchKey(track, 'high'));
        playbackPrefetchService.store(track, playback('saavn', 'high'), 'high');
        expect(playbackPrefetchService.get(track, 'balanced')).toBeNull();
        expect(playbackPrefetchService.get(track, 'high')).not.toBeNull();
    });

    it('elimina URLs vencidas según la fuente', () => {
        let now = 10_000;
        vi.spyOn(Date, 'now').mockImplementation(() => now);
        playbackPrefetchService.store(track, playback('youtube'), 'high');
        now += (3 * 60 * 1000) + 1;
        expect(playbackPrefetchService.get(track, 'high')).toBeNull();
        expect(resolvedPlaybacks.size).toBe(0);
    });

    it('cancelar una búsqueda evita iniciar su trabajo pendiente', async () => {
        const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation((_url, { signal }) => new Promise((resolve, reject) => {
            signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
        }));
        const controller = new AbortController();
        const request = playbackPrefetchService.prefetchMany([
            track,
            { artist: 'A', name: 'Dos' },
            { artist: 'B', name: 'Tres' },
        ], { limit: 3, concurrency: 2, signal: controller.signal, qualityMode: 'high' });

        controller.abort();
        await request;
        expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('en ahorro de datos limita búsqueda y desactiva el prefetch masivo de Descubrir', () => {
        expect(getPrefetchLimitForQuality('data_saver', 'search')).toBe(1);
        expect(getPrefetchLimitForQuality('data_saver', 'discovery')).toBe(0);
        expect(getPrefetchLimitForQuality('high', 'discovery')).toBe(6);
    });

    it('respeta la preferencia de desactivar la precarga inteligente', async () => {
        setSmartPrefetchPreference(false);
        const fetchMock = vi.spyOn(globalThis, 'fetch');
        expect(await playbackPrefetchService.prefetch(track, { qualityMode: 'high' })).toBeNull();
        expect(await playbackPrefetchService.prefetchMany([track], { qualityMode: 'high' })).toEqual([]);
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('reutiliza temporalmente un NO_MATCH pero permite omitirlo de forma explícita', async () => {
        const fetchMock = vi.spyOn(globalThis, 'fetch')
            .mockResolvedValueOnce({ ok: false, status: 404, json: async () => ({ success: false, reason: 'NO_MATCH' }) })
            .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ success: true, playback: playback() }) });

        expect(await playbackPrefetchService.prefetch(track, { qualityMode: 'high' })).toBeNull();
        expect(await playbackPrefetchService.prefetch(track, { qualityMode: 'high' })).toBeNull();
        expect(fetchMock).toHaveBeenCalledTimes(1);

        const recovered = await playbackPrefetchService.resolve(track, {
            qualityMode: 'high',
            endpoint: 'prefetch',
            bypassNegativeCache: true,
        });
        expect(recovered?.audioUrl).toContain('saavn');
        expect(fetchMock).toHaveBeenCalledTimes(2);
    });
});
