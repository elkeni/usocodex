import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const playerSource = readFileSync(new URL('./playerContext.jsx', import.meta.url), 'utf8');

describe('Player: reproducción en segundo plano', () => {
    it('vuelve a precargar cuando una radio agrega canciones a la cola', () => {
        expect(playerSource).toContain(
            'currentTrack, currentIndex, queue.length, shuffledIndex, shuffledQueue.length',
        );
        expect(playerSource).toContain('}, 120);');
    });

    it('deja preparada una reserva antes de que iOS suspenda la app', () => {
        expect(playerSource).toContain("document.addEventListener('visibilitychange', prepareForBackground)");
        expect(playerSource).toContain('primeNextFromCache(i, q);');
        expect(playerSource).toContain('runAggressivePrefetch(i, q);');
        expect(playerSource).toContain('const PREFETCH_LOOKAHEAD = 4');
    });

    it('atiende los controles del sistema mediante referencias estables', () => {
        expect(playerSource).toContain('const handlePreviousTrack = () => previousRef.current?.()');
        expect(playerSource).toContain('const handleNextTrack = () => skipRef.current?.(false)');
        expect(playerSource).toContain('navigator.mediaSession.setActionHandler(action, handler)');
    });

    it('evita el crossfade de dos reproductores con la app oculta', () => {
        expect(playerSource).toContain("document.visibilityState !== 'hidden'");
    });
});
