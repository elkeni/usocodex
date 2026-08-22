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

    it('reutiliza el audio ya resuelto por el toque del usuario', () => {
        expect(playerSource).toContain("typeof track?.url === 'string'");
        expect(playerSource).toContain('url: track.url');
    });

    it('nunca convierte un fallo de precarga en un bloqueo permanente', () => {
        expect(playerSource).not.toContain('Skipping known bad track');
        expect(playerSource).not.toContain('reason: "ALREADY_FAILED"');
        expect(playerSource).toContain('prefetchCacheRef.current.delete(trackKey)');
        expect(playerSource).toContain("val.status === 'error' ? 10 * 1000");
    });

    it('solo detiene la reproducción si fallaron las canciones de la cola actual', () => {
        expect(playerSource).toContain(
            'q.every((track) => failedTracksRef.current.has(makeFailureKey(track)))',
        );
    });

    it('normaliza identificadores numéricos de Deezer antes de crear claves', () => {
        expect(playerSource).toContain('return val == null ? "" : String(val);');
        expect(playerSource).toContain('const artist = getSafeString(track?.artistId || track?.artist).toLowerCase()');
    });
});
