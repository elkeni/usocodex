import React, { useState, useEffect, useCallback, useMemo, useRef, memo } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence, LayoutGroup } from 'framer-motion';
import { FaCheck, FaSearch, FaArrowRight } from 'react-icons/fa';
import { useUser } from '../../context/userContext';
import { getArtistInfo, searchGlobal } from '../../services/unifiedService';
import './onboarding.css';

// Artistas populares por defecto
const DEFAULT_ARTISTS = [
    { name: 'Bad Bunny', genre: 'reggaeton' },
    { name: 'Taylor Swift', genre: 'pop' },
    { name: 'Drake', genre: 'hiphop' },
    { name: 'The Weeknd', genre: 'rnb' },
    { name: 'Dua Lipa', genre: 'pop' },
    { name: 'Ed Sheeran', genre: 'pop' },
    { name: 'Billie Eilish', genre: 'alternative' },
    { name: 'BTS', genre: 'kpop' },
    { name: 'Ariana Grande', genre: 'pop' },
    { name: 'Post Malone', genre: 'hiphop' },
    { name: 'Shakira', genre: 'latin' },
    { name: 'Kendrick Lamar', genre: 'hiphop' },
    { name: 'Olivia Rodrigo', genre: 'pop' },
    { name: 'Travis Scott', genre: 'hiphop' },
    { name: 'Karol G', genre: 'reggaeton' },
    { name: 'Bruno Mars', genre: 'pop' },
    { name: 'Coldplay', genre: 'rock' },
    { name: 'Adele', genre: 'pop' },
    { name: 'Rosalia', genre: 'latin' },
    { name: 'SZA', genre: 'rnb' }
];

// Mapeo de artistas relacionados
const RELATED_ARTISTS_MAP = {
    'bad bunny': ['Tainy', 'Rauw Alejandro', 'Jhay Cortez', 'Eladio Carrion', 'Mora'],
    'taylor swift': ['Olivia Rodrigo', 'Sabrina Carpenter', 'Gracie Abrams', 'Conan Gray', 'Phoebe Bridgers'],
    'drake': ['21 Savage', 'Future', 'Metro Boomin', 'Lil Baby', 'Travis Scott'],
    'the weeknd': ['Doja Cat', 'Post Malone', 'Khalid', 'Frank Ocean', 'Daniel Caesar'],
    'dua lipa': ['Doja Cat', 'Ava Max', 'Bebe Rexha', 'Charli XCX', 'Kim Petras'],
    'ed sheeran': ['Lewis Capaldi', 'James Arthur', 'Shawn Mendes', 'Sam Smith', 'Hozier'],
    'billie eilish': ['Finneas', 'Lorde', 'Melanie Martinez', 'Aurora', 'girl in red'],
    'bts': ['Stray Kids', 'SEVENTEEN', 'TXT', 'BLACKPINK', 'aespa'],
    'ariana grande': ['Doja Cat', 'Dua Lipa', 'Selena Gomez', 'Miley Cyrus', 'Cardi B'],
    'post malone': ['Swae Lee', 'Khalid', '24kGoldn', 'Jack Harlow', 'Lil Nas X'],
    'shakira': ['Jennifer Lopez', 'Pitbull', 'Maluma', 'J Balvin', 'Nicky Jam'],
    'kendrick lamar': ['J. Cole', 'Tyler, The Creator', 'Baby Keem', 'JID', 'Denzel Curry'],
    'olivia rodrigo': ['Gracie Abrams', 'Sabrina Carpenter', 'Conan Gray', 'Tate McRae', 'Madison Beer'],
    'travis scott': ['Don Toliver', 'Gunna', 'Lil Uzi Vert', 'Playboi Carti', 'Young Thug'],
    'karol g': ['Becky G', 'Natti Natasha', 'Anitta', 'Farina', 'Ivy Queen'],
    'bruno mars': ['Anderson .Paak', 'The Weeknd', 'Justin Timberlake', 'Pharrell Williams', 'John Legend'],
    'coldplay': ['Imagine Dragons', 'OneRepublic', 'Maroon 5', 'The Lumineers', 'Bastille'],
    'adele': ['Sam Smith', 'Sia', 'Amy Winehouse', 'Florence + The Machine', 'Lana Del Rey'],
    'rosalia': ['C. Tangana', 'Arca', 'Bad Gyal', 'Pablo Alboran', 'Amaia'],
    'sza': ['Summer Walker', 'H.E.R.', 'Jhene Aiko', 'Kehlani', 'Snoh Aalegra'],
    'daddy yankee': ['Don Omar', 'Wisin', 'Nicky Jam', 'Yandel', 'Tego Calderon'],
    'j balvin': ['Maluma', 'Ozuna', 'Anuel AA', 'Farruko', 'Sech'],
    'rauw alejandro': ['Myke Towers', 'Feid', 'Lenny Tavarez', 'Jay Wheeler', 'Lunay'],
    'peso pluma': ['Natanael Cano', 'Junior H', 'Fuerza Regida', 'Legado 7', 'Eslabón Armado'],
    'feid': ['Blessd', 'Ryan Castro', 'Lenny Tavarez', 'Dalex', 'Sech'],
};

const MIN_ARTISTS_SELECTION = 3;
const RELATED_ARTISTS_COUNT = 5;

// ============================================================================
// COMPONENTE ARTIST CARD - MEMOIZADO PARA RENDIMIENTO
// ============================================================================
const ArtistCard = memo(({
    artist,
    isSelected,
    onToggle,
    index,
    isRelated
}) => {
    const formatFans = (fans) => {
        if (!fans) return '';
        if (fans >= 1000000) return `${(fans / 1000000).toFixed(1)}M`;
        if (fans >= 1000) return `${Math.floor(fans / 1000)}K`;
        return fans.toString();
    };

    return (
        <motion.button
            layout
            layoutId={`artist-${artist.id}`}
            initial={isRelated ? { opacity: 0, scale: 0.8, y: 20 } : { opacity: 0, scale: 0.9 }}
            animate={{
                opacity: 1,
                scale: 1,
                y: 0,
                transition: {
                    type: "spring",
                    stiffness: 500,
                    damping: 30,
                    delay: isRelated ? index * 0.05 : index * 0.02
                }
            }}
            exit={{ opacity: 0, scale: 0.8, transition: { duration: 0.15 } }}
            whileHover={{ scale: 1.05, y: -4 }}
            whileTap={{ scale: 0.95 }}
            type="button"
            className={`artist-card ${isSelected ? 'selected' : ''} ${isRelated ? 'related' : ''}`}
            onClick={() => onToggle(artist)}
        >
            <motion.div
                className="artist-img-wrap"
                animate={isSelected ? {
                    boxShadow: "0 0 0 3px rgba(102, 126, 234, 0.6)"
                } : {
                    boxShadow: "0 0 0 0px rgba(102, 126, 234, 0)"
                }}
                transition={{ duration: 0.2 }}
            >
                <img
                    src={artist.image || ''}
                    alt=""
                    className="artist-img"
                    loading="lazy"
                    onError={(e) => { e.target.style.display = 'none'; }}
                />
                <div className="artist-placeholder"></div>
                <AnimatePresence>
                    {isSelected && (
                        <motion.div
                            className="check-overlay"
                            initial={{ opacity: 0, scale: 0 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0 }}
                            transition={{ type: "spring", stiffness: 600, damping: 25 }}
                        >
                            <FaCheck />
                        </motion.div>
                    )}
                </AnimatePresence>
            </motion.div>
            <span className="artist-name">{artist.name}</span>
            {artist.fans && (
                <span className="artist-fans">{formatFans(artist.fans)}</span>
            )}
        </motion.button>
    );
});

ArtistCard.displayName = 'ArtistCard';

// ============================================================================
// COMPONENTE SKELETON - MEMOIZADO
// ============================================================================
const SkeletonCard = memo(({ index }) => (
    <motion.div
        className="artist-card skeleton"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: index * 0.03 }}
    >
        <div className="skeleton-img"></div>
        <div className="skeleton-text"></div>
    </motion.div>
));

SkeletonCard.displayName = 'SkeletonCard';

// ============================================================================
// COMPONENTE PRINCIPAL
// ============================================================================
export default function Onboarding() {
    const navigate = useNavigate();
    const { bulkSaveArtists, completeOnboarding } = useUser();

    const [artists, setArtists] = useState([]);
    const [selectedArtists, setSelectedArtists] = useState([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState([]);
    const [isSearching, setIsSearching] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState('');

    const gridRef = useRef(null);
    const loadingRelatedRef = useRef(new Set());
    const loadedArtistIdsRef = useRef(new Set());
    const selectedIdsRef = useRef(new Set());

    // Cargar artistas por defecto al iniciar
    useEffect(() => {
        const loadDefaultArtists = async () => {
            setIsLoading(true);
            try {
                // Cargar en batches para mejor UX
                const batchSize = 6;
                const allArtists = [];

                for (let i = 0; i < DEFAULT_ARTISTS.length; i += batchSize) {
                    const batch = DEFAULT_ARTISTS.slice(i, i + batchSize);
                    const batchPromises = batch.map(async (artist) => {
                        try {
                            const info = await getArtistInfo(artist.name);
                            if (info) {
                                return {
                                    id: info.id,
                                    name: info.name,
                                    image: info.image,
                                    fans: info.fans,
                                    genre: artist.genre,
                                    isRelated: false
                                };
                            }
                            return null;
                        } catch (e) {
                            return null;
                        }
                    });

                    const batchResults = (await Promise.all(batchPromises)).filter(Boolean);
                    allArtists.push(...batchResults);

                    // Actualizar UI progresivamente
                    if (i === 0) {
                        setArtists([...batchResults]);
                        setIsLoading(false);
                    } else {
                        setArtists(prev => [...prev, ...batchResults]);
                    }
                }

                // Guardar IDs en la ref
                allArtists.forEach(a => loadedArtistIdsRef.current.add(a.id));
            } catch (e) {
                setError('Error cargando artistas. Por favor recarga la pagina.');
                setIsLoading(false);
            }
        };

        loadDefaultArtists();
    }, []);

    // Cargar artistas relacionados
    const loadRelatedArtists = useCallback(async (selectedArtist) => {
        const artistKey = selectedArtist.name.toLowerCase();

        if (loadingRelatedRef.current.has(artistKey)) return;
        loadingRelatedRef.current.add(artistKey);

        const relatedNames = RELATED_ARTISTS_MAP[artistKey];
        if (!relatedNames) {
            loadingRelatedRef.current.delete(artistKey);
            return;
        }

        try {
            const relatedPromises = relatedNames.slice(0, RELATED_ARTISTS_COUNT).map(async (name) => {
                try {
                    const info = await getArtistInfo(name);
                    if (info) {
                        return {
                            id: info.id,
                            name: info.name,
                            image: info.image,
                            fans: info.fans,
                            isRelated: true,
                            relatedTo: selectedArtist.name
                        };
                    }
                    return null;
                } catch (e) {
                    return null;
                }
            });

            const newArtists = (await Promise.all(relatedPromises)).filter(Boolean);

            if (newArtists.length > 0) {
                setArtists(prev => {
                    const existingIds = new Set(prev.map(a => a.id));
                    const uniqueNew = newArtists.filter(a =>
                        !existingIds.has(a.id) && !loadedArtistIdsRef.current.has(a.id)
                    );

                    uniqueNew.forEach(a => loadedArtistIdsRef.current.add(a.id));

                    if (uniqueNew.length === 0) return prev;

                    const selectedIndex = prev.findIndex(a => a.id === selectedArtist.id);

                    if (selectedIndex === -1) {
                        return [...prev, ...uniqueNew];
                    }

                    const before = prev.slice(0, selectedIndex + 1);
                    const after = prev.slice(selectedIndex + 1);

                    return [...before, ...uniqueNew, ...after];
                });
            }
        } catch (e) {
            console.warn('Error loading related artists:', e);
        } finally {
            loadingRelatedRef.current.delete(artistKey);
        }
    }, []);

    // Busqueda con debounce
    useEffect(() => {
        if (!searchQuery.trim()) {
            setSearchResults([]);
            return;
        }

        const searchTimeout = setTimeout(async () => {
            setIsSearching(true);
            try {
                const results = await searchGlobal(searchQuery, 'artist', 12);
                const formattedResults = results.map(artist => ({
                    id: artist.id,
                    name: artist.name,
                    image: artist.picture_xl || artist.picture_big || artist.picture_medium,
                    fans: artist.nb_fan,
                    isRelated: false
                }));
                setSearchResults(formattedResults);
            } catch (e) {
                console.warn('Search error');
            } finally {
                setIsSearching(false);
            }
        }, 400);

        return () => clearTimeout(searchTimeout);
    }, [searchQuery]);

    // Toggle seleccion
    const toggleArtist = useCallback((artist) => {
        const isCurrentlySelected = selectedIdsRef.current.has(artist.id);

        if (isCurrentlySelected) {
            selectedIdsRef.current.delete(artist.id);
            setSelectedArtists(prev => prev.filter(a => a.id !== artist.id));
        } else {
            selectedIdsRef.current.add(artist.id);
            setSelectedArtists(prev => [...prev, artist]);
            loadRelatedArtists(artist);
        }
        setError('');
    }, [loadRelatedArtists]);

    // Verificar seleccion
    const isSelected = useCallback((artistId) => {
        return selectedIdsRef.current.has(artistId);
    }, []);

    // Artistas a mostrar
    const displayArtists = useMemo(() => {
        return searchQuery.trim() ? searchResults : artists;
    }, [searchQuery, searchResults, artists]);

    // Guardar y completar
    const handleComplete = async () => {
        if (selectedArtists.length < MIN_ARTISTS_SELECTION) {
            setError(`Selecciona al menos ${MIN_ARTISTS_SELECTION} artistas para continuar`);
            return;
        }

        setIsSaving(true);
        setError('');

        try {
            await bulkSaveArtists(selectedArtists);
            await completeOnboarding();
            navigate('/feed');
        } catch (e) {
            setError('Error guardando tus preferencias. Intenta de nuevo.');
            setIsSaving(false);
        }
    };

    // Skip
    const handleSkip = async () => {
        try {
            await completeOnboarding();
            navigate('/feed');
        } catch (e) {
            navigate('/feed');
        }
    };

    const selectionCount = selectedArtists.length;
    const isValidSelection = selectionCount >= MIN_ARTISTS_SELECTION;

    return (
        <div className="onboarding-container">
            <div className="onboarding-bg">
                <motion.div
                    className="bg-gradient"
                    animate={{
                        scale: [1, 1.05, 1],
                        rotate: [0, 2, 0]
                    }}
                    transition={{
                        duration: 20,
                        repeat: Infinity,
                        ease: "easeInOut"
                    }}
                />
            </div>

            <header className="onboarding-header">
                <motion.div
                    className="logo"
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.5 }}
                >
                    <span className="logo-icon"></span>
                    <span className="logo-text">PARADISQUO</span>
                </motion.div>
                <motion.button
                    className="skip-btn"
                    onClick={handleSkip}
                    disabled={isSaving}
                    type="button"
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.5 }}
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                >
                    Omitir
                </motion.button>
            </header>

            <main className="onboarding-main" ref={gridRef}>
                <motion.div
                    className="onboarding-intro"
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.6, delay: 0.2 }}
                >
                    <h1>Elige tus artistas favoritos</h1>
                    <p>
                        Selecciona al menos {MIN_ARTISTS_SELECTION} artistas.
                        Te mostraremos mas opciones basadas en tu seleccion.
                    </p>
                </motion.div>

                <motion.div
                    className="search-container"
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.6, delay: 0.3 }}
                >
                    <FaSearch className="search-icon" />
                    <input
                        type="text"
                        placeholder="Buscar artistas..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="search-input"
                    />
                    <AnimatePresence>
                        {isSearching && (
                            <motion.div
                                className="search-loader"
                                initial={{ opacity: 0, scale: 0 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0, scale: 0 }}
                            />
                        )}
                    </AnimatePresence>
                </motion.div>

                <AnimatePresence>
                    {error && (
                        <motion.div
                            className="error-msg"
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            exit={{ opacity: 0, height: 0 }}
                        >
                            {error}
                        </motion.div>
                    )}
                </AnimatePresence>

                <LayoutGroup>
                    <motion.div
                        className="artists-grid"
                        layout
                    >
                        <AnimatePresence mode="popLayout">
                            {isLoading ? (
                                Array.from({ length: 12 }).map((_, i) => (
                                    <SkeletonCard key={`skeleton-${i}`} index={i} />
                                ))
                            ) : displayArtists.length > 0 ? (
                                displayArtists.map((artist, index) => (
                                    <ArtistCard
                                        key={artist.id}
                                        artist={artist}
                                        isSelected={isSelected(artist.id)}
                                        onToggle={toggleArtist}
                                        index={index}
                                        isRelated={artist.isRelated}
                                    />
                                ))
                            ) : searchQuery.trim() ? (
                                <motion.div
                                    className="no-results"
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                >
                                    No se encontraron resultados
                                </motion.div>
                            ) : null}
                        </AnimatePresence>
                    </motion.div>
                </LayoutGroup>
            </main>

            <footer className="onboarding-footer">
                <motion.div
                    className="footer-content"
                    initial={{ opacity: 0, y: 30 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.6, delay: 0.4 }}
                >
                    <div className="selection-info">
                        <AnimatePresence mode="popLayout">
                            <div className="selected-avatars">
                                {selectedArtists.slice(0, 4).map((artist) => (
                                    <motion.img
                                        key={artist.id}
                                        src={artist.image}
                                        alt=""
                                        className="avatar-mini"
                                        layoutId={`avatar-${artist.id}`}
                                        initial={{ opacity: 0, scale: 0, x: -10 }}
                                        animate={{ opacity: 1, scale: 1, x: 0 }}
                                        exit={{ opacity: 0, scale: 0 }}
                                        transition={{ type: "spring", stiffness: 500, damping: 30 }}
                                    />
                                ))}
                                <AnimatePresence>
                                    {selectionCount > 4 && (
                                        <motion.span
                                            className="avatar-more"
                                            initial={{ opacity: 0, scale: 0 }}
                                            animate={{ opacity: 1, scale: 1 }}
                                            exit={{ opacity: 0, scale: 0 }}
                                        >
                                            +{selectionCount - 4}
                                        </motion.span>
                                    )}
                                </AnimatePresence>
                            </div>
                        </AnimatePresence>
                        <motion.span
                            className={`count ${isValidSelection ? 'valid' : ''}`}
                            key={selectionCount}
                            initial={{ scale: 1.3 }}
                            animate={{ scale: 1 }}
                            transition={{ type: "spring", stiffness: 400 }}
                        >
                            {selectionCount} seleccionados
                        </motion.span>
                    </div>

                    <motion.button
                        type="button"
                        className={`continue-btn ${isValidSelection ? 'active' : ''}`}
                        onClick={handleComplete}
                        disabled={!isValidSelection || isSaving}
                        whileHover={isValidSelection ? { scale: 1.05, y: -2 } : {}}
                        whileTap={isValidSelection ? { scale: 0.95 } : {}}
                        animate={isValidSelection ? {
                            boxShadow: [
                                "0 4px 20px rgba(102, 126, 234, 0.4)",
                                "0 6px 30px rgba(102, 126, 234, 0.6)",
                                "0 4px 20px rgba(102, 126, 234, 0.4)"
                            ]
                        } : {}}
                        transition={isValidSelection ? {
                            boxShadow: { duration: 2, repeat: Infinity }
                        } : {}}
                    >
                        {isSaving ? (
                            <motion.span
                                className="btn-loader"
                                animate={{ rotate: 360 }}
                                transition={{ duration: 0.8, repeat: Infinity, ease: "linear" }}
                            />
                        ) : (
                            <>
                                <span>Continuar</span>
                                <FaArrowRight />
                            </>
                        )}
                    </motion.button>
                </motion.div>
            </footer>
        </div>
    );
}
