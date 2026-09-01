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

    it('no inicia una segunda generación al regresar durante la misma sesión', () => {
        expect(feedSource).toContain("Boolean(screenStateCache.get('feed', 'generationStarted'))");
        expect(feedSource).toContain('if (userLoading || generationStartedRef.current) return;');
        expect(feedSource).not.toContain('applyCacheIfValid');
    });

    it('entrega a la vista restaurada las secciones que terminan en segundo plano', async () => {
        const { default: cache } = await import('../../services/screenStateCache');
        const listener = vi.fn();
        const unsubscribe = cache.subscribe('feed', listener);

        cache.set('feed', 'sections', { smartRecommendations: [{ id: 'new-track' }] });

        expect(listener).toHaveBeenCalledWith(
            expect.objectContaining({ sections: { smartRecommendations: [{ id: 'new-track' }] } }),
            'sections',
        );
        unsubscribe();
        cache.set('feed', 'sections', { smartRecommendations: [] });
        expect(listener).toHaveBeenCalledTimes(1);
    });
});
