import { describe, expect, it } from 'vitest';
import { readAppViewport } from './useAppViewport';

describe('viewport visible de la aplicación', () => {
    it('usa el rectángulo visual informado por Safari', () => {
        expect(readAppViewport({
            innerHeight: 844,
            visualViewport: { height: 641.4, offsetTop: 103.6 },
        })).toEqual({ height: 641, top: 104 });
    });

    it('mantiene compatibilidad con navegadores sin Visual Viewport', () => {
        expect(readAppViewport({ innerHeight: 736 })).toEqual({ height: 736, top: 0 });
    });
});
