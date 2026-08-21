import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const feedSource = readFileSync(new URL('./feed.jsx', import.meta.url), 'utf8');

describe('Feed sin playlists automáticas invasoras', () => {
    it('elimina el generador automático y sus cuatro productos', () => {
        expect(existsSync(new URL('../../services/feedGenerator.js', import.meta.url))).toBe(false);
        expect(feedSource).not.toContain("import('../../services/feedGenerator')");

        for (const removedName of [
            'Daily Mix',
            'Descubrimiento Semanal',
            'Tu Mix de',
            'En Repetición',
        ]) {
            expect(feedSource).not.toContain(removedName);
        }
    });

    it('limpia datos antiguos sin retirar recomendaciones de canciones', () => {
        expect(feedSource).toContain('paradox_removed_automatic_mixes_v1');
        expect(feedSource).toContain('smartRecommendations');
        expect(feedSource).toContain('forYouTracks');
    });
});
