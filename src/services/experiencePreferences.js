export const REDUCED_MOTION_STORAGE_KEY = 'paradox_reduced_motion';

export const getReducedMotionPreference = (storage = globalThis.localStorage) => {
    try {
        const stored = storage?.getItem(REDUCED_MOTION_STORAGE_KEY);
        if (stored === null || stored === undefined) {
            return globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
        }
        return stored === 'true';
    } catch {
        return false;
    }
};

export const applyReducedMotionPreference = (enabled, root = globalThis.document?.documentElement) => {
    if (!root) return Boolean(enabled);
    root.dataset.reducedMotion = enabled ? 'true' : 'false';
    return Boolean(enabled);
};

export const setReducedMotionPreference = (enabled, storage = globalThis.localStorage) => {
    const normalized = Boolean(enabled);
    try { storage?.setItem(REDUCED_MOTION_STORAGE_KEY, String(normalized)); } catch { /* opcional */ }
    applyReducedMotionPreference(normalized);
    return normalized;
};

export const initializeExperiencePreferences = () => {
    applyReducedMotionPreference(getReducedMotionPreference());
};

