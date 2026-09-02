export const AUDIO_QUALITY_STORAGE_KEY = 'audioQualityPreference';
export const AUDIO_QUALITY_CHANGE_EVENT = 'paradisquo:audio-quality-change';

export const AUDIO_QUALITY_PREFERENCES = Object.freeze({
    AUTOMATIC: 'automatic',
    HIGH: 'high',
    DATA_SAVER: 'data_saver',
});

const VALID_PREFERENCES = new Set(Object.values(AUDIO_QUALITY_PREFERENCES));

export const normalizeAudioQualityPreference = (value) => (
    VALID_PREFERENCES.has(value) ? value : AUDIO_QUALITY_PREFERENCES.AUTOMATIC
);

export const getAudioQualityPreference = (storage = globalThis.localStorage) => {
    try {
        const storedPreference = storage?.getItem(AUDIO_QUALITY_STORAGE_KEY);
        const normalized = normalizeAudioQualityPreference(storedPreference);
        if (storedPreference !== normalized) {
            storage?.setItem(AUDIO_QUALITY_STORAGE_KEY, normalized);
        }
        return normalized;
    } catch {
        return AUDIO_QUALITY_PREFERENCES.AUTOMATIC;
    }
};

export const setAudioQualityPreference = (preference, storage = globalThis.localStorage) => {
    const normalized = normalizeAudioQualityPreference(preference);
    try {
        storage?.setItem(AUDIO_QUALITY_STORAGE_KEY, normalized);
    } catch { /* El almacenamiento puede estar bloqueado en modo privado. */ }

    if (typeof globalThis.dispatchEvent === 'function' && typeof globalThis.CustomEvent === 'function') {
        globalThis.dispatchEvent(new CustomEvent(AUDIO_QUALITY_CHANGE_EVENT, { detail: normalized }));
    }
    return normalized;
};

export const getNetworkConnection = (navigatorLike = globalThis.navigator) => (
    navigatorLike?.connection || navigatorLike?.mozConnection || navigatorLike?.webkitConnection || null
);

export const resolveAudioQualityMode = (
    preference = AUDIO_QUALITY_PREFERENCES.AUTOMATIC,
    navigatorLike = globalThis.navigator,
) => {
    const normalized = normalizeAudioQualityPreference(preference);
    if (normalized === AUDIO_QUALITY_PREFERENCES.HIGH) return 'high';
    if (normalized === AUDIO_QUALITY_PREFERENCES.DATA_SAVER) return 'data_saver';

    const connection = getNetworkConnection(navigatorLike);
    if (connection?.saveData === true) return 'data_saver';
    if (String(connection?.type || '').toLowerCase() === 'wifi') return 'high';
    return 'balanced';
};

export const getResolvedAudioQualityMode = ({ storage, navigatorLike } = {}) => (
    resolveAudioQualityMode(
        getAudioQualityPreference(storage ?? globalThis.localStorage),
        navigatorLike ?? globalThis.navigator,
    )
);

export const getAudioQualityLabel = (quality) => {
    if (!quality) return '';
    return String(quality).replace(/\s+/g, '');
};
