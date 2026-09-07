import { useEffect, useMemo, useRef, useState } from 'react';
import useBodyScrollLock from '../../hooks/useBodyScrollLock';
import { getArtistInfo } from '../../services/unifiedService';
import { getBestArtworkUrl, getArtworkImageProps } from '../../services/imageQuality';
import './TrackArtistsModal.css';

const artistImageCache = new Map();
const getArtistKey = (artist, index) => String(artist?.id || artist?.name || index);

export default function TrackArtistsModal({ artists, onClose, onSelect }) {
    const ref = useRef(null);
    const artistList = useMemo(() => artists || [], [artists]);
    const artistSignature = artistList.map(getArtistKey).join('|');
    const [artistImages, setArtistImages] = useState({});
    useBodyScrollLock(true);

    useEffect(() => {
        const dialog = ref.current;
        dialog.showModal();
        return () => dialog.close();
    }, []);

    useEffect(() => {
        let cancelled = false;

        const loadArtistImages = async () => {
            const entries = await Promise.all(artistList.map(async (artist, index) => {
                const key = getArtistKey(artist, index);
                const directImage = getBestArtworkUrl(artist);
                if (directImage) return [key, directImage];
                if (artistImageCache.has(key)) return [key, artistImageCache.get(key)];

                const info = await getArtistInfo(artist?.id || artist?.name).catch(() => null);
                const image = getBestArtworkUrl(info);
                artistImageCache.set(key, image);
                return [key, image];
            }));

            if (!cancelled) setArtistImages(Object.fromEntries(entries.filter(([, image]) => image)));
        };

        if (artistList.length) loadArtistImages();
        return () => { cancelled = true; };
    }, [artistList, artistSignature]);

    return (
        <dialog ref={ref} className="track-artists-modal" aria-labelledby="track-artists-title"
            onKeyDown={(event) => { if (event.key === 'Escape') event.stopPropagation(); }}
            onCancel={(event) => { event.preventDefault(); onClose(); }}
            onClick={(event) => { if (event.target === ref.current) onClose(); }}>
            <div className="track-artists-modal__content">
                <div className="track-artists-modal__handle" aria-hidden="true" />
                <header><div><span className="track-artists-modal__eyebrow">DETRÁS DE LA MÚSICA</span><h2 id="track-artists-title">Artistas en la canción</h2></div>
                    <button type="button" aria-label="Cerrar artistas" onClick={onClose}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" /></svg></button></header>
                <p className="track-artists-modal__intro">Participan en esta canción</p>
                <ul>{artistList.map((artist, index) => {
                    const image = artistImages[getArtistKey(artist, index)];
                    return <li key={artist.id || artist.name} style={{ '--artist-index': index }}>
                    <button type="button" onClick={() => { ref.current.close(); onSelect(artist); }}>
                        <span className="track-artists-modal__avatar" aria-hidden="true">
                            <span>{artist.name.slice(0, 1)}</span>
                            {image && <img {...getArtworkImageProps(image, { size: 160, maxSize: 250, sizes: '52px' })} alt="" loading="lazy" onError={(event) => { event.currentTarget.remove(); }} />}
                        </span>
                        <span className="track-artists-modal__identity">{artist.name}{' '}<small>Ver artista</small></span><svg className="track-artists-modal__arrow" viewBox="0 0 24 24" aria-hidden="true"><path d="m9 5 7 7-7 7" /></svg>
                    </button></li>;
                })}</ul>
                {!artistList.length && <p>No hay artistas disponibles para esta canción.</p>}
            </div>
        </dialog>
    );
}
