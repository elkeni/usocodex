const STORAGE_KEY = 'paradox_product_metrics_v1';

export const PRODUCT_EVENTS = Object.freeze({
    PLAYBACK_STARTED: 'playback_started',
    PLAYBACK_30_SECONDS: 'playback_30_seconds',
    RADIO_STARTED: 'radio_started',
    MAGIC_PLAYLIST_CREATED: 'magic_playlist_created',
    IMPORT_STARTED: 'import_started',
    IMPORT_COMPLETED: 'import_completed',
    IMPORT_FAILED: 'import_failed',
});

const ALLOWED_EVENTS = new Set(Object.values(PRODUCT_EVENTS));

const emptyMetrics = () => ({ version: 1, counters: {}, updatedAt: null });

export const readProductMetrics = () => {
    try {
        const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
        return parsed?.version === 1 && parsed?.counters ? parsed : emptyMetrics();
    } catch {
        return emptyMetrics();
    }
};

/** Guarda únicamente contadores permitidos en este dispositivo; nunca IDs, búsquedas o canciones. */
export const recordProductEvent = (eventName) => {
    if (!ALLOWED_EVENTS.has(eventName)) return false;
    try {
        const metrics = readProductMetrics();
        metrics.counters[eventName] = (metrics.counters[eventName] || 0) + 1;
        metrics.updatedAt = new Date().toISOString().slice(0, 10);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(metrics));
        return true;
    } catch {
        return false;
    }
};

export const clearProductMetrics = () => {
    try { localStorage.removeItem(STORAGE_KEY); } catch { /* almacenamiento no disponible */ }
};

export const getSuccessSummary = () => {
    const { counters } = readProductMetrics();
    const started = counters[PRODUCT_EVENTS.PLAYBACK_STARTED] || 0;
    const meaningful = counters[PRODUCT_EVENTS.PLAYBACK_30_SECONDS] || 0;
    const importStarted = counters[PRODUCT_EVENTS.IMPORT_STARTED] || 0;
    const importCompleted = counters[PRODUCT_EVENTS.IMPORT_COMPLETED] || 0;
    return {
        playbackStarted: started,
        meaningfulPlayback: meaningful,
        meaningfulPlaybackRate: started ? Math.round((meaningful / started) * 100) : 0,
        radioStarted: counters[PRODUCT_EVENTS.RADIO_STARTED] || 0,
        magicPlaylists: counters[PRODUCT_EVENTS.MAGIC_PLAYLIST_CREATED] || 0,
        importCompletionRate: importStarted ? Math.round((importCompleted / importStarted) * 100) : 0,
    };
};
