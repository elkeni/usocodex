import { describe, expect, it } from 'vitest';
import { getReleaseType, groupDiscography } from './discography';

describe('discography', () => {
    it('clasifica álbumes, EPs y singles aunque la API cambie el nombre del campo', () => {
        expect(getReleaseType({ recordType: 'album' })).toBe('album');
        expect(getReleaseType({ record_type: 'ep' })).toBe('ep');
        expect(getReleaseType({ type: 'Single' })).toBe('single');
        expect(getReleaseType({ type: 'Extended Play' })).toBe('ep');
    });

    it('preserva el orden cronológico que recibe cada categoría', () => {
        const groups = groupDiscography([
            { id: 'album-new', recordType: 'album' },
            { id: 'single-new', recordType: 'single' },
            { id: 'album-old', recordType: 'album' },
        ]);

        expect(groups.album.map(({ id }) => id)).toEqual(['album-new', 'album-old']);
        expect(groups.single.map(({ id }) => id)).toEqual(['single-new']);
        expect(groups.ep).toEqual([]);
    });
});
