import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync(new URL('./playlist.css', import.meta.url), 'utf8');
const component = readFileSync(new URL('./playlist.jsx', import.meta.url), 'utf8');

describe('Playlist: desplazamiento dentro del shell fijo', () => {
    it('mantiene un contenedor vertical propio compatible con móviles', () => {
        const pageRule = css.match(/\.playlist-page\s*\{([\s\S]*?)\}/)?.[1] || '';
        expect(pageRule).toContain('height: 100%');
        expect(pageRule).toContain('min-height: 0');
        expect(pageRule).toContain('overflow-y: auto');
        expect(pageRule).toContain('-webkit-overflow-scrolling: touch');
    });

    it('escucha el scroll de la playlist y no el de window', () => {
        expect(component).toContain("scrollContainer.addEventListener('scroll'");
        expect(component).not.toContain("window.addEventListener('scroll', handleScroll");
    });
});
