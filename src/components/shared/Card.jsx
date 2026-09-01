import { useState, useCallback, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { getArtistPath } from '../../services/artistIdentity';
import { getAlbumPath } from '../../services/albumNavigation';
import { FaPlay, FaMusic, FaUser, FaCompactDisc, FaListAlt } from 'react-icons/fa';
import './card.css';

// Default Fallback
const DEFAULT_IMAGE = "https://images.unsplash.com/photo-1470225620780-dba8ba36b745?auto=format&fit=crop&w=500&q=60";

/**
 * Universal Card Component
 * Unifies design across Feed, Search, Library, and Radio.
 * 
 * @param {Object} props
 * @param {Object} props.item - The data object (track, artist, album, playlist)
 * @param {string} props.variant - 'vertical' (default), 'horizontal', 'circle', 'poster'
 * @param {string} props.title - Override title
 * @param {string} props.subtitle - Override subtitle
 * @param {string} props.image - Override image URL
 * @param {Function} props.onClick - Custom click handler. If null, attempts default navigation.
 * @param {Function} props.onPlay - If provided, shows a play button overlay on hover.
 * @param {boolean} props.isLoading - Show skeleton state
 * @param {boolean} props.isPlaying - Show active playing state styling
 */
export default function Card({
    item,
    variant = 'vertical',
    title,
    subtitle,
    image,
    onClick,
    onPlay,
    isLoading = false,
    isPlaying = false,
    className = ''
}) {
    const navigate = useNavigate();
    const [imgLoaded, setImgLoaded] = useState(false);
    const [imgError, setImgError] = useState(false);

    // =========================================================================
    // DATA NORMALIZATION
    // =========================================================================
    const displayTitle = useMemo(() => {
        if (title) return title;
        return item?.name || item?.title || 'Unknown';
    }, [item, title]);

    const displaySubtitle = useMemo(() => {
        if (subtitle) return subtitle;
        if (item?.artist?.name) return item.artist.name;
        if (typeof item?.artist === 'string') return item.artist;
        if (item?.creator) return `By ${item.creator}`;
        return item?.type || '';
    }, [item, subtitle]);

    const displayImage = useMemo(() => {
        let finalImage = DEFAULT_IMAGE;

        // Complex extraction logic ported from various screens
        if (image) finalImage = image;
        else if (!item) finalImage = DEFAULT_IMAGE;
        else if (typeof item.image === 'string' && item.image) finalImage = item.image;
        else if (item.picture_medium) finalImage = item.picture_medium;
        else if (item.cover_medium) finalImage = item.cover_medium;
        else if (item.album?.cover_medium) finalImage = item.album.cover_medium;
        else if (item.picture_xl) finalImage = item.picture_xl;
        else if (item.cover_xl) finalImage = item.cover_xl;
        else if (item.album?.cover_xl) finalImage = item.album.cover_xl;
        else if (Array.isArray(item.image)) {
            const best = item.image.find(i => i.size === 'medium') ||
                item.image.find(i => i.size === 'large') ||
                item.image.find(i => i.size === 'extralarge') ||
                item.image[item.image.length - 1];
            if (best?.['#text']) finalImage = best['#text'];
        }

        // ⚡ TURBO FIX: Force resize Deezer images to 250x250 if they are huge
        if (typeof finalImage === 'string' && finalImage.includes('dzcdn.net')) {
            return finalImage.replace(/\/\d+x\d+(-000000-80-0-0\.jpg)/, '/250x250$1')
                .replace(/\/\d+x\d+(\.jpg)/, '/250x250$1');
        }

        return finalImage;
    }, [item, image]);

    useEffect(() => {
        setImgLoaded(false);
        setImgError(false);
    }, [displayImage]);

    // Determine default icon based on type/variant
    const FallbackIcon = useMemo(() => {
        if (variant === 'circle' || item?.type === 'artist') return FaUser;
        if (item?.type === 'album') return FaCompactDisc;
        if (item?.type === 'playlist') return FaListAlt;
        return FaMusic;
    }, [variant, item]);

    // =========================================================================
    // HANDLERS
    // =========================================================================
    const handleClick = useCallback((e) => {
        if (onClick) {
            onClick(item, e);
            return;
        }

        // Default Navigation Logic
        if (!item) return;

        if (item.type === 'album' || variant === 'album') {
            navigate(getAlbumPath(item, 'Unknown'));
        } else if (item.type === 'playlist') {
            // Fix: Pass the item state navigation for generated/virtual playlists
            navigate(`/playlist/${item.id}`, { state: { playlist: item } });
        } else if (item.type === 'artist' || variant === 'circle') {
            navigate(getArtistPath(item));
        } else if (onPlay) {
            // Fallback to play if it's a track and no explicit navigate logic
            onPlay(item);
        }
    }, [item, variant, onClick, onPlay, navigate]);

    const handlePlayClick = useCallback((e) => {
        e.stopPropagation();
        if (onPlay) onPlay(item);
    }, [onPlay, item]);

    const handleKeyDown = useCallback((e) => {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            handleClick(e);
        }
    }, [handleClick]);

    // =========================================================================
    // RENDERING
    // =========================================================================

    // 1. SKELETON STATE
    if (isLoading) {
        return (
            <div className={`app-card variant-${variant} skeleton`}>
                <div className="app-card-img-wrapper">
                    <div className="app-card-skeleton-img" />
                </div>
                <div className="app-card-meta">
                    <div className="app-card-skeleton-text title" />
                    <div className="app-card-skeleton-text subtitle" />
                </div>
            </div>
        );
    }

    if (!item && !title) return null;

    // Auto-detect variant for artists
    const effectiveVariant = item?.type === 'artist' ? 'circle' : variant;

    // 2. LOADED STATE
    return (
        <div
            role="button"
            tabIndex={0}
            className={`app-card variant-${effectiveVariant} ${isPlaying ? 'playing' : ''} ${className}`}
            onClick={handleClick}
            onKeyDown={handleKeyDown}
            title={displayTitle}
        >
            {/* Image Container */}
            <div className="app-card-img-wrapper">
                {/* Fallback Icon */}
                {(!imgLoaded || imgError) && (
                    <div className="app-card-fallback">
                        <FallbackIcon />
                    </div>
                )}

                {/* Actual Image */}
                {!imgError && (
                    <img
                        src={displayImage}
                        alt={displayTitle}
                        className={`app-card-img ${imgLoaded ? 'is-loaded' : ''}`}
                        onLoad={() => setImgLoaded(true)}
                        onError={() => { setImgLoaded(true); setImgError(true); }}
                        loading="lazy"
                    />
                )}

                {/* Play Overlay (Only if onPlay is provided) */}
                {onPlay && (
                    <div className="app-card-play-overlay">
                        <button type="button" className="app-card-play-button" onClick={handlePlayClick} aria-label={`Reproducir ${displayTitle}`}>
                            <FaPlay />
                        </button>
                    </div>
                )}
            </div>

            {/* Meta Info */}
            <div className="app-card-meta">
                <div className="app-card-title">{displayTitle}</div>
                <div className="app-card-subtitle">{displaySubtitle}</div>
            </div>
        </div>
    );
}
