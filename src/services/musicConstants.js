/**
 * MUSIC KNOWLEDGE BASE
 * Shared configuration for genres, vibes, and visual identities.
 */

export const GENRE_RULES = {
    Pop: {
        seedArtists: ['Taylor Swift', 'The Weeknd', 'Dua Lipa', 'Bruno Mars', 'Ariana Grande'],
        allowedGenres: ['pop', 'dance pop', 'pop rock', 'electropop'],
        bannedKeywords: ['acoustic', 'live', 'cover', 'karaoke', 'tribute', 'remix', 'remixed', 'instrumental'],
    },
    Rock: {
        seedArtists: ['Nirvana', 'Foo Fighters', 'Metallica', 'Led Zeppelin', 'Queen', 'AC/DC', 'Linkin Park'],
        allowedGenres: ['rock', 'alternative', 'grunge', 'hard rock', 'classic rock'],
        bannedKeywords: ['acoustic', 'live', 'cover', 'karaoke', 'tribute', 'remix', 'remixed', 'instrumental', 'unplugged'],
    },
    Indie: {
        seedArtists: ['Tame Impala', 'Arctic Monkeys', 'Vampire Weekend', 'Phoenix', 'Alt-J'],
        allowedGenres: ['indie', 'indie rock', 'indie pop', 'alternative', 'dream pop'],
        bannedKeywords: ['live', 'cover', 'karaoke', 'tribute', 'remix', 'remixed', 'instrumental'],
    },
    'Hip Hop': {
        seedArtists: ['Kendrick Lamar', 'Drake', 'Kanye West', 'J. Cole', 'Nas', 'Eminem'],
        allowedGenres: ['hip hop', 'rap', 'west coast', 'east coast', 'conscious hip hop'],
        bannedKeywords: ['live', 'cover', 'karaoke', 'tribute', 'remix', 'remixed', 'instrumental', 'acoustic'],
    },
    Jazz: {
        seedArtists: ['Miles Davis', 'John Coltrane', 'Billie Holiday', 'Ella Fitzgerald', 'Louis Armstrong'],
        allowedGenres: ['jazz', 'bebop', 'cool jazz', 'vocal jazz', 'jazz fusion'],
        bannedKeywords: ['smooth', 'lounge', 'easy listening', 'live', 'cover', 'karaoke', 'tribute'],
    },
    Metal: {
        seedArtists: ['Metallica', 'Iron Maiden', 'Black Sabbath', 'Slayer', 'Megadeth', 'Pantera'],
        allowedGenres: ['metal', 'heavy metal', 'thrash metal', 'death metal', 'black metal'],
        bannedKeywords: ['acoustic', 'live', 'cover', 'karaoke', 'tribute', 'remix', 'remixed', 'instrumental'],
    },
    Latino: {
        seedArtists: ['Bad Bunny', 'Karol G', 'J Balvin', 'Shakira', 'Rosalía', 'Maluma'],
        allowedGenres: ['reggaeton', 'latin pop', 'bachata', 'salsa', 'cumbia', 'trap latino'],
        bannedKeywords: ['live', 'cover', 'karaoke', 'tribute', 'remix', 'remixed', 'instrumental', 'acoustic'],
    },
    'R&B': {
        seedArtists: ['The Weeknd', 'Frank Ocean', 'SZA', 'Daniel Caesar', 'H.E.R.'],
        allowedGenres: ['r&b', 'contemporary r&b', 'neo soul', 'soul', 'alternative r&b'],
        bannedKeywords: ['live', 'cover', 'karaoke', 'tribute', 'remix', 'remixed', 'instrumental', 'acoustic'],
    },
    'K-Pop': {
        seedArtists: ['BTS', 'BLACKPINK', 'TWICE', 'EXO', 'Red Velvet', 'IU'],
        allowedGenres: ['k-pop', 'korean pop', 'k-hip hop', 'k-r&b'],
        bannedKeywords: ['live', 'cover', 'karaoke', 'tribute', 'remix', 'remixed', 'instrumental', 'acoustic'],
    },
    Electrónica: {
        seedArtists: ['Calvin Harris', 'Avicii', 'David Guetta', 'The Chainsmokers', 'Marshmello', 'Tiësto'],
        allowedGenres: ['electronic', 'edm', 'house', 'electro', 'dance', 'techno'],
        bannedKeywords: ['live', 'cover', 'karaoke', 'tribute', 'remix', 'remixed', 'instrumental', 'acoustic', 'piano'],
    },
    // === GÉNEROS LATINOS ESPECÍFICOS ===
    Salsa: {
        seedArtists: ['Marc Anthony', 'Celia Cruz', 'Héctor Lavoe', 'Grupo Niche', 'Rubén Blades', 'Gilberto Santa Rosa', 'Oscar D\'León', 'Eddie Santiago', 'Willie Colón', 'El Gran Combo de Puerto Rico'],
        allowedGenres: ['salsa', 'salsa romántica', 'salsa dura', 'tropical'],
        bannedKeywords: ['karaoke', 'tribute', 'instrumental', 'remix', 'remixed', 'pista'],
    },
    Reggaeton: {
        seedArtists: ['Bad Bunny', 'Daddy Yankee', 'Karol G', 'J Balvin', 'Don Omar', 'Wisin & Yandel', 'Ozuna', 'Rauw Alejandro', 'Feid', 'Maluma'],
        allowedGenres: ['reggaeton', 'urbano', 'trap latino', 'reggae'],
        bannedKeywords: ['karaoke', 'tribute', 'instrumental', 'cover'],
    },
    Bachata: {
        seedArtists: ['Romeo Santos', 'Aventura', 'Prince Royce', 'Juan Luis Guerra', 'Antony Santos', 'Frank Reyes', 'Raulín Rodríguez', 'Zacarías Ferreira'],
        allowedGenres: ['bachata', 'tropical'],
        bannedKeywords: ['karaoke', 'tribute', 'instrumental', 'remix'],
    },
    Merengue: {
        seedArtists: ['Juan Luis Guerra', 'Elvis Crespo', 'Olga Tañón', 'Eddy Herrera', 'Los Hermanos Rosario', 'Wilfrido Vargas'],
        allowedGenres: ['merengue', 'tropical'],
        bannedKeywords: ['karaoke', 'tribute', 'instrumental'],
    },
    Cumbia: {
        seedArtists: ['Los Ángeles Azules', 'Grupo Cañaveral', 'La Sonora Dinamita', 'Selena', 'Gilda', 'Damas Gratis', 'Los Palmeras'],
        allowedGenres: ['cumbia', 'cumbia sonidera', 'cumbia villera', 'tropical'],
        bannedKeywords: ['karaoke', 'tribute', 'instrumental'],
    },
    'Cumbia Peruana': {
        seedArtists: ['Grupo 5', 'Armonía 10', 'Corazón Serrano', 'Agua Marina', 'Los Shapis', 'Chacalón y La Nueva Crema', 'Deyvis Orosco', 'Grupo Néctar'],
        allowedGenres: ['cumbia', 'cumbia peruana', 'chicha', 'cumbia sanjuanera', 'tropical'],
        bannedKeywords: ['karaoke', 'tribute', 'instrumental']
    },
    'Regional Mexicano': {
        seedArtists: ['Christian Nodal', 'Grupo Firme', 'Banda MS', 'Calibre 50', 'Vicente Fernández', 'Alejandro Fernández', 'Pepe Aguilar', 'Carin Leon'],
        allowedGenres: ['regional mexican', 'norteño', 'banda', 'mariachi', 'corrido'],
        bannedKeywords: ['karaoke', 'tribute', 'instrumental']
    }
};

export const VIBE_CHARACTERISTICS = {
    chill: { keywords: ['chill', 'relax', 'calm', 'tranquilo', 'ambient'], energy: 'low', description: 'Música relajante para desconectar' },
    party: { keywords: ['party', 'fiesta', 'dance', 'bailar', 'club'], energy: 'high', description: 'Música para la fiesta' },
    focus: { keywords: ['focus', 'concentrar', 'estudio', 'trabajo', 'productive'], energy: 'medium', description: 'Música para concentrarte' },
    workout: { keywords: ['workout', 'gym', 'ejercicio', 'training', 'running'], energy: 'very-high', description: 'Música para entrenar' },
    romantic: { keywords: ['romantic', 'love', 'amor', 'romantico', 'date'], energy: 'low-medium', description: 'Música para momentos especiales' },
    sad: { keywords: ['sad', 'triste', 'melancholy', 'emo', 'heartbreak', 'llorar', 'depre'], energy: 'low', description: 'Música para momentos difíciles' },
    happy: { keywords: ['happy', 'alegre', 'feliz', 'upbeat', 'positivo', 'buen humor'], energy: 'high', description: 'Música para levantar el ánimo' },

    // === VIBES LATINOS ESPECÍFICOS ===
    latino: { keywords: ['latino', 'latin', 'reggaeton', 'perreo', 'urbano'], energy: 'high', description: 'Lo mejor del ritmo urbano' },
    salsa: { keywords: ['salsa', 'salsero', 'son', 'rumba', 'azucar'], energy: 'high', description: 'Salsa para bailar y gozar' },
    tropical: { keywords: ['tropical', 'bachata', 'merengue', 'vallenato', 'cumbia', 'chicha', 'huayno'], energy: 'medium-high', description: 'Ritmos tropicales inolvidables' },
    mexican: { keywords: ['regional', 'banda', 'ranchera', 'norteño', 'mariachi', 'corridos'], energy: 'medium', description: 'Puro sentimiento regional' }
};

export const VIBE_GRADIENTS = {
    chill: ['#667eea', '#764ba2'],
    party: ['#f093fb', '#f5576c'],
    focus: ['#4facfe', '#00f2fe'],
    workout: ['#fa709a', '#fee140'],
    romantic: ['#ff9a9e', '#fecfef'],
    sad: ['#667eea', '#764ba2'],
    happy: ['#f6d365', '#fda085'],
    latino: ['#ff512f', '#dd2476'], // Hot red
    salsa: ['#fc4a1a', '#f7b733'], // Orange-yellow
    tropical: ['#11998e', '#38ef7d'], // Green
    mexican: ['#00c6ff', '#0072ff'], // Blue or Tricolorish
    default: ['#667eea', '#764ba2']
};
