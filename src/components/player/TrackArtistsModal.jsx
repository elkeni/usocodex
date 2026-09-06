import { useEffect, useRef } from 'react';
import useBodyScrollLock from '../../hooks/useBodyScrollLock';
import './TrackArtistsModal.css';

export default function TrackArtistsModal({ artists, onClose, onSelect }) {
    const ref = useRef(null);
    useBodyScrollLock(true);
    useEffect(() => {
        const dialog = ref.current;
        dialog.showModal();
        return () => dialog.close();
    }, []);
    return (
        <dialog ref={ref} className="track-artists-modal" aria-labelledby="track-artists-title"
            onKeyDown={(event) => { if (event.key === 'Escape') event.stopPropagation(); }}
            onCancel={(event) => { event.preventDefault(); onClose(); }}
            onClick={(event) => { if (event.target === ref.current) onClose(); }}>
            <div className="track-artists-modal__content">
                <div className="track-artists-modal__handle" aria-hidden="true" />
                <header><div><span className="track-artists-modal__eyebrow">DETRÁS DE LA MÚSICA</span><h2 id="track-artists-title">Artistas en la canción</h2></div>
                    <button type="button" aria-label="Cerrar artistas" onClick={onClose}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" /></svg></button></header>
                <p className="track-artists-modal__intro">Explora la música de quienes le dan vida.</p>
                <ul>{artists.map((artist) => <li key={artist.id || artist.name}>
                    <button type="button" onClick={() => { ref.current.close(); onSelect(artist); }}>
                        <span className="track-artists-modal__avatar" aria-hidden="true">{artist.name.slice(0, 1)}</span>
                        <span className="track-artists-modal__identity">{artist.name}{' '}<small>Ver artista</small></span><svg className="track-artists-modal__arrow" viewBox="0 0 24 24" aria-hidden="true"><path d="m9 5 7 7-7 7" /></svg>
                    </button>
                </li>)}</ul>
                {!artists.length && <p>No hay artistas disponibles para esta canción.</p>}
            </div>
        </dialog>
    );
}
