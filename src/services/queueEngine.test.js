import { describe, expect, it } from 'vitest';
import {
    appendUniqueTracks,
    findQueueIndex,
    getNextQueuePosition,
    prepareQueue,
    serializeQueueSnapshot,
    shuffleQueueFromTrack,
} from './queueEngine';

const tracks = [
    { id: '1', name: 'Uno', artist: 'Artista', duration: 180 },
    { id: '2', name: 'Dos', artist: 'Artista', duration: 190 },
    { id: '3', name: 'Tres', artist: 'Otro', duration: 200 },
];

describe('QueueEngine', () => {
    it('mantiene la canción elegida al inicio del orden aleatorio sin mutar la cola', () => {
        const prepared = prepareQueue(tracks, tracks[1], () => `entry-${Math.random()}`);
        const originalOrder = prepared.map((track) => track.id);
        const shuffled = shuffleQueueFromTrack(prepared, prepared[1], () => 0);

        expect(shuffled[0].id).toBe('2');
        expect(prepared.map((track) => track.id)).toEqual(originalOrder);
        expect(findQueueIndex(shuffled, prepared[1])).toBe(0);
    });

    it.each([
        [{ length: 3, currentIndex: 0, repeatMode: 0 }, 1],
        [{ length: 3, currentIndex: 2, repeatMode: 0 }, -1],
        [{ length: 3, currentIndex: 2, repeatMode: 1 }, 0],
        [{ length: 3, currentIndex: 1, repeatMode: 2 }, 1],
    ])('calcula el siguiente índice sin desincronizar pista y cursor', (input, expected) => {
        expect(getNextQueuePosition(input)).toBe(expected);
    });

    it('descarta duplicados al ampliar una radio, pero conserva la cola existente', () => {
        const prepared = prepareQueue(tracks.slice(0, 2), null, () => `entry-${Math.random()}`);
        const expanded = appendUniqueTracks(prepared, [tracks[1], tracks[2]]);
        expect(expanded.map((track) => track.id)).toEqual(['1', '2', '3']);
    });

    it('no persiste URLs temporales y sí restaura el orden aleatorio', () => {
        const resolved = { ...tracks[0], url: 'https://temporary.test/audio', urlSource: 'resolved' };
        const snapshot = serializeQueueSnapshot({
            queue: [resolved],
            currentTrack: resolved,
            currentIndex: 0,
            shuffledQueue: [resolved],
            shuffledIndex: 0,
        });
        expect(snapshot.queue[0].url).toBeUndefined();
        expect(snapshot.currentTrack.url).toBeUndefined();
        expect(snapshot.shuffledQueue).toHaveLength(1);
    });
});
