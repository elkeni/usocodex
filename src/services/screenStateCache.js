import { useEffect } from 'react';

// Memoria volátil para la sesión actual
const cache = {};

// Clave para localStorage (persistencia entre recargas)
const STORAGE_KEY = 'app_screen_state_v1';
const VOLATILE_SCREENS = new Set(['feed']);

// Cargar estado inicial del localStorage si existe
try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
        const restored = JSON.parse(stored);
        // Descubrir debe vivir sólo durante la ejecución actual: conservarlo
        // al navegar, pero generar una portada nueva al cerrar y abrir la app.
        VOLATILE_SCREENS.forEach((screen) => delete restored[screen]);
        Object.assign(cache, restored);
    }
} catch (e) {
    console.warn('Error loading screen state cache:', e);
}

const screenStateCache = {
    get: (screen, key) => {
        return cache[screen]?.[key];
    },
    set: (screen, key, value) => {
        if (!cache[screen]) {
            cache[screen] = {};
        }
        cache[screen][key] = value;
    },
    getAll: () => cache,
    clear: () => {
        for (const prop in cache) delete cache[prop];
        localStorage.removeItem(STORAGE_KEY);
    }
};

/**
 * Hook para persistir la posición del scroll de un contenedor
 */
export const useScrollPersistence = (screenName, ref) => {
    useEffect(() => {
        const element = ref.current;
        if (!element) return;

        // Restaurar scroll
        const savedPosition = screenStateCache.get(screenName, 'scrollPosition');
        if (savedPosition) {
            // Pequeño timeout para asegurar que el contenido se ha renderizado
            requestAnimationFrame(() => {
                element.scrollTop = savedPosition;
            });
        }

        // Guardar scroll al cambiar
        const handleScroll = () => {
            // Debounce simple o guardar directo (guardar directo es mas fluido si no es costoso)
            screenStateCache.set(screenName, 'scrollPosition', element.scrollTop);
        };

        element.addEventListener('scroll', handleScroll, { passive: true });
        return () => element.removeEventListener('scroll', handleScroll);
    }, [screenName, ref]);
};

/**
 * Hook para guardar el estado en localStorage al cerrar/recargar la app
 */
export const useAppShutdown = () => {
    useEffect(() => {
        const handleUnload = () => {
            try {
                const persistentCache = Object.fromEntries(
                    Object.entries(cache).filter(([screen]) => !VOLATILE_SCREENS.has(screen))
                );
                localStorage.setItem(STORAGE_KEY, JSON.stringify(persistentCache));
            } catch (e) {
                console.warn('Error saving screen state cache:', e);
            }
        };

        window.addEventListener('beforeunload', handleUnload);
        // También guardar periódicamente por si crashea (cada 30 seg)
        const interval = setInterval(handleUnload, 30000);

        return () => {
            window.removeEventListener('beforeunload', handleUnload);
            clearInterval(interval);
        };
    }, []);
};

export default screenStateCache;
