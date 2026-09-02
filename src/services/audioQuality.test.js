// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
    AUDIO_QUALITY_STORAGE_KEY,
    getAudioQualityPreference,
    resolveAudioQualityMode,
    setAudioQualityPreference,
} from './audioQuality';

describe('audioQuality', () => {
    beforeEach(() => localStorage.clear());

    it('inicializa automatic como preferencia predeterminada', () => {
        expect(getAudioQualityPreference()).toBe('automatic');
        expect(localStorage.getItem(AUDIO_QUALITY_STORAGE_KEY)).toBe('automatic');
    });

    it('resuelve automático como ahorro cuando saveData está activo', () => {
        expect(resolveAudioQualityMode('automatic', { connection: { saveData: true, type: 'wifi' } })).toBe('data_saver');
    });

    it('resuelve automático como alta cuando Wi-Fi es detectable', () => {
        expect(resolveAudioQualityMode('automatic', { connection: { saveData: false, type: 'wifi' } })).toBe('high');
    });

    it('usa balanced cuando Network Information API no existe', () => {
        expect(resolveAudioQualityMode('automatic', {})).toBe('balanced');
    });

    it('respeta la selección manual de alta calidad', () => {
        expect(resolveAudioQualityMode('high', { connection: { saveData: true } })).toBe('high');
    });

    it('persiste la preferencia en localStorage', () => {
        const dispatchSpy = vi.spyOn(globalThis, 'dispatchEvent');
        setAudioQualityPreference('data_saver');
        expect(localStorage.getItem(AUDIO_QUALITY_STORAGE_KEY)).toBe('data_saver');
        expect(getAudioQualityPreference()).toBe('data_saver');
        expect(dispatchSpy).toHaveBeenCalled();
        dispatchSpy.mockRestore();
    });
});
