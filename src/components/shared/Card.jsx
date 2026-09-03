import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { getArtistPath } from '../../services/artistIdentity';
import { getAlbumPath } from '../../services/albumNavigation';
import { getArtworkImageProps } from '../../services/imageQuality';
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
    className = '',
    onPrefetchIntent,
    onPlaybackPointerDown,
    prefetchOnVisible = false,
}) {
    const navigate = useNavigate();
    const [imgLoaded, setImgLoaded] = useState(false);
    const [imgError, setImgError] = useState(false);
    const cardRef = useRef(null);

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

    const imageProps = useMemo(() => {
        const effectiveVariant = item?.type === 'artist' ? 'circle' : variant;
        const compact = effectiveVariant === 'horizontal';
        return getArtworkImageProps(image ? { image_xl: image } : item, {
            fallback: DEFAULT_IMAGE,
            size: compact ? 160 : 500,
            maxSize: compact ? 500 : 1000,
            sizes: compact
                ? '64px'
                : effectiveVariant === 'wide'
                    ? '(max-width: 600px) 78vw, 280px'
                    : '(max-width: 600px) 42vw, 220px',
        });
    }, [item, image, variant]);

    const displayImage = imageProps.src;

    useEffect(() => {
        setImgLoaded(false);
        setImgError(false);
    }, [displayImage]);

    useEffect(() => {
        if (!prefetchOnVisible || !onPrefetchIntent || !cardRef.current || typeof IntersectionObserver !== 'function') return undefined;
        let controller = null;
        const observer = new IntersectionObserver(([entry]) => {
            if (entry?.isIntersecting) {
                controller ??= new AbortController();
                onPrefetchIntent(item, { signal: controller.signal, reason: 'visible' });
            } else if (controller) {
                controller.abort();
                controller = null;
            }
        }, { rootMargin: '160px 80px', threshold: 0.05 });
        observer.observe(cardRef.current);
        return () => {
            controller?.abort();
            observer.disconnect();
        };
    }, [item, onPrefetchIntent, prefetchOnVisible]);

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
            ref={cardRef}
            role="button"
            tabIndex={0}
            className={`app-card variant-${effectiveVariant} ${isPlaying ? 'playing' : ''} ${className}`}
            onClick={handleClick}
            onKeyDown={handleKeyDown}
            onPointerEnter={() => onPrefetchIntent?.(item, { reason: 'pointer' })}
            onPointerDown={() => onPlaybackPointerDown?.(item)}
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
                        {...imageProps}
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
