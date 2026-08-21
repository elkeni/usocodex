// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildRadioQueue } from './services/radioService';
import { LibraryGenerator } from './services/libraryGenerator';
import { YouTubeClient } from './services/importService';
import {
    PRODUCT_EVENTS,
    clearProductMetrics,
    getSuccessSummary,
    readProductMetrics,
    recordProductEvent,
} from './services/productMetrics';

describe('Fase 3: radio unificada', () => {
    it('combina contexto, artista y relacionados sin duplicar canciones', async () => {
        const services = {
            artistGetTopTracks: vi.fn(async ({ artist }) => ({
                toptracks: {
                    track: artist === 'Seed Artist'
                        ? [
                            { name: 'Seed Song', artist },
                            { name: 'Main Two', artist },
                        ]
                        : [
                            { name: 'Related One', artist },
                            { name: 'Related Two', artist },
                        ],
                },
            })),
            getRelatedArtists: vi.fn(async () => [{ name: 'Friend Artist' }]),
        };

        const queue = await buildRadioQueue({
            seedTrack: { name: 'Seed Song', artist: 'Seed Artist' },
            contextTracks: [
                { name: 'Context Song', artist: 'Context Artist' },
                { name: 'Context Song', artist: 'Context Artist' },
            ],
            targetSize: 10,
            random: () => 0.5,
            services,
        });

        expect(queue[0]).toMatchObject({ name: 'Seed Song', artist: 'Seed Artist' });
        expect(new Set(queue.map((track) => `${track.artist}-${track.name}`)).size).toBe(queue.length);
        expect(queue.some((track) => track.artist === 'Context Artist')).toBe(true);
        expect(queue.some((track) => track.artist === 'Friend Artist')).toBe(true);
    });

    it('excluye lo que ya existe al ampliar una cola infinita', async () => {
        const services = {
            artistGetTopTracks: vi.fn(async () => ({
                toptracks: { track: [{ name: 'Already queued', artist: 'Seed Artist' }, { name: 'Fresh', artist: 'Seed Artist' }] },
            })),
            getRelatedArtists: vi.fn(async () => []),
        };
        const queue = await buildRadioQueue({
            seedTrack: { name: 'Seed', artist: 'Seed Artist' },
            existingQueue: [{ name: 'Already queued', artist: 'Seed Artist' }],
            includeSeed: false,
            services,
        });
        expect(queue.map((track) => track.name)).toEqual(['Fresh']);
    });
});

describe('Fase 3: playlist mágica con contexto real', () => {
    it('prioriza favoritos o historial del mismo universo musical y explica el resultado', () => {
        const generator = new LibraryGenerator();
        const result = generator._personalizeResult({
            title: 'Mix',
            description: 'Una selección.',
            tracks: [{ title: 'Fresh', artist: 'Artist A' }],
        }, {
            favorites: [{ name: 'Favorite', artist: 'Artist A' }],
            listeningHistory: [{ name: 'History', artist: 'Artist B' }],
        });

        expect(result.tracks[0]).toMatchObject({ title: 'Favorite', artist: 'Artist A' });
        expect(result.personalization.tracksUsed).toBe(1);
        expect(result.description).toContain('favoritos e historial');
    });
});

describe('Fase 3: medición local no sensible', () => {
    beforeEach(() => clearProductMetrics());

    it('acepta sólo eventos permitidos y guarda contadores, no metadatos', () => {
        expect(recordProductEvent(PRODUCT_EVENTS.PLAYBACK_STARTED)).toBe(true);
        expect(recordProductEvent('search:Bad Bunny:https://example.com')).toBe(false);

        const stored = JSON.stringify(readProductMetrics());
        expect(stored).not.toContain('Bad Bunny');
        expect(stored).not.toContain('example.com');
        expect(getSuccessSummary().playbackStarted).toBe(1);
    });
});

describe('Fase 3: YouTube sólo mediante backend', () => {
    it('se detiene con un mensaje honesto si falta el endpoint y no prueba terceros', async () => {
        const fetchMock = vi.fn(async () => ({ ok: false, status: 404 }));
        vi.stubGlobal('fetch', fetchMock);

        await expect(YouTubeClient.getPlaylistTracks('PL_test')).rejects.toMatchObject({
            code: 'YOUTUBE_BACKEND_UNAVAILABLE',
        });
        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(fetchMock.mock.calls[0][0]).toContain('/api/youtube-playlist?id=PL_test');

        vi.unstubAllGlobals();
    });
});
