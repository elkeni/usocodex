import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const feedSource = readFileSync(new URL('./feed.jsx', import.meta.url), 'utf8');
const handler = feedSource.match(
    /const handleArtistRadioClick[\s\S]*?\n[ ]{2}\}, \[playTrack, addToQueue, showToast\]\);/,
)?.[0] || '';

describe('Feed: radio de artistas favoritos', () => {
    it('no navega a una pantalla de reproductor inexistente', () => {
        expect(handler).not.toContain("navigate('/player')");
    });

    it('reproduce la semilla antes de completar la radio en segundo plano', () => {
        expect(handler).toContain('playTrack(trackToPlay, [trackToPlay])');
        expect(handler).toContain('includeSeed: false');
        expect(handler).toContain('addToQueue(');
        expect(handler.indexOf('playTrack(trackToPlay, [trackToPlay])'))
            .toBeLessThan(handler.indexOf('await buildRadioQueue'));
    });

    it('descarta solicitudes antiguas y agrega la cola silenciosamente', () => {
        expect(handler).toContain('requestId !== artistRadioRequestRef.current');
        expect(handler).toContain('}, true)');
    });
});
