import { useLayoutEffect } from 'react';

export const readAppViewport = (browserWindow) => {
    const viewport = browserWindow?.visualViewport;
    const height = viewport?.height || browserWindow?.innerHeight || 0;
    const top = viewport?.offsetTop || 0;

    return {
        height: Math.max(1, Math.round(height)),
        top: Math.max(0, Math.round(top)),
    };
};

/**
 * Safari en iOS puede ubicar un elemento fixed desde el viewport de layout,
 * mientras muestra un viewport visual desplazado por sus barras. Estas
 * variables mantienen la app dentro del rectángulo realmente visible.
 */
export default function useAppViewport() {
    useLayoutEffect(() => {
        const root = document.documentElement;
        const viewport = window.visualViewport;
        let frameId = 0;

        const syncViewport = () => {
            const { height, top } = readAppViewport(window);
            root.style.setProperty('--app-viewport-height', `${height}px`);
            root.style.setProperty('--app-viewport-top', `${top}px`);
        };

        const scheduleSync = () => {
            window.cancelAnimationFrame(frameId);
            frameId = window.requestAnimationFrame(syncViewport);
        };

        syncViewport();
        window.addEventListener('resize', scheduleSync, { passive: true });
        window.addEventListener('orientationchange', scheduleSync, { passive: true });
        viewport?.addEventListener('resize', scheduleSync, { passive: true });
        viewport?.addEventListener('scroll', scheduleSync, { passive: true });

        return () => {
            window.cancelAnimationFrame(frameId);
            window.removeEventListener('resize', scheduleSync);
            window.removeEventListener('orientationchange', scheduleSync);
            viewport?.removeEventListener('resize', scheduleSync);
            viewport?.removeEventListener('scroll', scheduleSync);
            root.style.removeProperty('--app-viewport-height');
            root.style.removeProperty('--app-viewport-top');
        };
    }, []);
}
