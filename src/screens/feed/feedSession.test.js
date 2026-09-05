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
            'feed:user-a': { hero: { id: 'private-old-hero' } },
            search_state: { query: 'conservar' },
        }));

        const { default: cache } = await import('../../services/screenStateCache');

        expect(cache.get('feed', 'hero')).toBeUndefined();
        expect(cache.get('feed:user-a', 'hero')).toBeUndefined();
        expect(cache.get('search_state', 'query')).toBe('conservar');
    });

    it('revalida al cambiar entradas o regresar a la pantalla', () => {
        expect(feedSource).toContain('[userLoading, revalidateAll]');
        expect(feedSource).not.toContain('generationStartedRef.current) return');
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
