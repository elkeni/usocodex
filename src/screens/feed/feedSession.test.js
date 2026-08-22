// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const feedSource = readFileSync('src/screens/feed/feed.jsx', 'utf8');

describe('Sesión de Descubrir', () => {
    beforeEach(() => {
        localStorage.clear();
        vi.resetModules();
    });

    it('no restaura Descubrir después de cerrar y abrir la app', async () => {
        localStorage.setItem('app_screen_state_v1', JSON.stringify({
            feed: { hero: { id: 'old-hero' }, sections: { trending: [{ id: 'old-track' }] } },
            search_state: { query: 'conservar' },
        }));

        const { default: cache } = await import('../../services/screenStateCache');

        expect(cache.get('feed', 'hero')).toBeUndefined();
        expect(cache.get('search_state', 'query')).toBe('conservar');
    });

    it('no revalida las canciones al regresar durante la misma sesión', () => {
        expect(feedSource).toContain('if (userLoading || wasRestoredFromMemoryRef.current) return;');
    });
});
