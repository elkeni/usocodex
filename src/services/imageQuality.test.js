import { describe, expect, it } from 'vitest';
import {
    buildArtworkSrcSet,
    getBestArtworkUrl,
    getArtworkImageProps,
    resizeArtworkUrl,
} from './imageQuality';

const deezer250 = 'https://e-cdns-images.dzcdn.net/images/cover/hash/250x250-000000-80-0-0.jpg';

describe('calidad adaptativa de imágenes', () => {
    it('prefiere una fuente XL sobre una miniatura genérica', () => {
        expect(getBestArtworkUrl({ image: 'https://example.com/thumb.jpg', cover_xl: deezer250 }))
            .toBe(deezer250);
    });

    it('solicita una portada Deezer adecuada para pantallas retina', () => {
        expect(resizeArtworkUrl(deezer250, 420)).toContain('/500x500-');
        expect(resizeArtworkUrl(deezer250, 900)).toContain('/1000x1000-');
    });

    it('genera srcset solo para proveedores con tamaños seguros', () => {
        expect(buildArtworkSrcSet(deezer250)).toContain('500x500-000000-80-0-0.jpg 500w');
        expect(buildArtworkSrcSet('https://example.com/photo.jpg')).toBeUndefined();
    });

    it('entrega propiedades no bloqueantes para la imagen', () => {
        expect(getArtworkImageProps({ cover_xl: deezer250 }, { size: 500 })).toMatchObject({
            src: expect.stringContaining('/500x500-'),
            decoding: 'async',
        });
    });
});
