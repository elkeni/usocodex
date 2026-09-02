// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
    REDUCED_MOTION_STORAGE_KEY,
    applyReducedMotionPreference,
    getReducedMotionPreference,
    initializeExperiencePreferences,
    setReducedMotionPreference,
} from './experiencePreferences';

describe('experiencePreferences', () => {
    beforeEach(() => {
        localStorage.clear();
        delete document.documentElement.dataset.reducedMotion;
        vi.restoreAllMocks();
    });

    it('respeta la preferencia de movimiento reducido del sistema cuando no hay una elección guardada', () => {
        vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: true })));
        expect(getReducedMotionPreference()).toBe(true);
    });

    it('una elección guardada prevalece sobre la preferencia del sistema', () => {
        localStorage.setItem(REDUCED_MOTION_STORAGE_KEY, 'false');
        vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: true })));
        expect(getReducedMotionPreference()).toBe(false);
    });

    it('persiste y aplica el ajuste en el documento', () => {
        expect(setReducedMotionPreference(true)).toBe(true);
        expect(localStorage.getItem(REDUCED_MOTION_STORAGE_KEY)).toBe('true');
        expect(document.documentElement.dataset.reducedMotion).toBe('true');

        applyReducedMotionPreference(false);
        expect(document.documentElement.dataset.reducedMotion).toBe('false');
    });

    it('inicializa el atributo global desde el valor persistido', () => {
        localStorage.setItem(REDUCED_MOTION_STORAGE_KEY, 'true');
        initializeExperiencePreferences();
        expect(document.documentElement.dataset.reducedMotion).toBe('true');
    });
});
