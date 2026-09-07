import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const searchStyles = readFileSync(new URL('./search.css', import.meta.url), 'utf8');
const searchSource = readFileSync(new URL('./search.jsx', import.meta.url), 'utf8');

describe('Buscador en iPhone', () => {
    it('evita el zoom automático de Safari al enfocar el campo', () => {
        const inputRule = searchStyles.match(/\.search-capsule-input\s*\{[\s\S]*?\}/)?.[0] || '';
        expect(inputRule).toContain('font-size: 16px');
    });

    it('no añade etiquetas visuales de personalización a los resultados', () => {
        expect(searchSource).not.toContain('Para ti');
    });
});
