import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const feedSource = readFileSync(new URL('./feed.jsx', import.meta.url), 'utf8');
const handler = feedSource.match(
    /const handleArtistRadioClick[\s\S]*?\n[ ]{2}\}, \[playTrack, appendToQueue, showToast\]\);/,
)?.[0] || '';

describe('Feed: radio de artistas favoritos', () => {
    it('no navega a una pantalla de reproductor inexistente', () => {
        expect(handler).not.toContain("navigate('/player')");
    });

    it('reproduce la semilla antes de completar la radio en segundo plano', () => {
        expect(handler).toContain('playTrack(trackToPlay, [trackToPlay], {');
        expect(handler).toContain('includeSeed: false');
        expect(handler).toContain('appendToQueue(');
        expect(handler.indexOf('playTrack(trackToPlay, [trackToPlay], {'))
            .toBeLessThan(handler.indexOf('await buildRadioQueue'));
    });

    it('elige una semilla variable de un lote amplio, no el primer éxito fijo', () => {
        expect(handler).toContain('artistGetTopTracks({ artist: artist.name, limit: 25 })');
        expect(handler).toContain('selectArtistRadioSeed(');
        expect(handler).not.toContain('toptracks?.track?.[0]');
    });

    it('descarta solicitudes antiguas y agrega la cola silenciosamente', () => {
        expect(handler).toContain('requestId !== artistRadioRequestRef.current');
        expect(handler).toContain('sessionId: queueSessionId');
    });

    it('no mezcla la radio del artista con recomendaciones generales', () => {
        expect(handler).toContain('contextTracks: []');
        expect(handler).not.toContain('sectionsRef.current.smartRecommendations');
    });
});
