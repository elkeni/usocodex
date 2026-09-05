// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const playTrackMock = vi.fn();
const searchGlobalMock = vi.fn();
const userContextMock = vi.hoisted(() => ({
  toggleFavorite: vi.fn(),
  isFavorite: () => false,
  playlists: [],
  addTrackToPlaylist: vi.fn(),
  getVibeMatchingData: vi.fn(() => ({})),
}));

vi.mock('../../context/playerContext', () => ({
  usePlayerActions: () => ({ playTrack: playTrackMock }),
}));

vi.mock('../../context/userContext', () => ({
  useUser: () => userContextMock,
}));

vi.mock('../../services/screenStateCache', () => ({
  default: { get: vi.fn(() => null), set: vi.fn() },
  useScrollPersistence: vi.fn(),
}));

vi.mock('../../services/unifiedService', () => ({
  searchGlobal: (...args) => searchGlobalMock(...args),
  fetchAudioUrl: vi.fn(async () => 'https://audio.example/test.mp3'),
  artistGetTopTracks: vi.fn(async () => ({ toptracks: { track: [] } })),
  getRelatedArtists: vi.fn(async () => []),
}));

import Search from './search';

const trackResult = {
  id: 'track-1',
  title: 'Luz de prueba',
  artist: { name: 'Artista Demo', picture_xl: '' },
  album: { title: 'Álbum Demo', cover_xl: '' },
  duration: 180,
  preview: 'https://audio.example/preview.mp3',
  rank: 100,
};

const artistResult = {
  id: 'artist-1',
  name: 'Luz Artista',
  picture_xl: '',
  nb_fan: 500,
};

const albumResult = {
  id: 'album-1',
  title: 'Luz Álbum',
  artist: { name: 'Artista Demo' },
  cover_xl: '',
  fans: 200,
};

describe('Búsqueda y reproducción esenciales', () => {
  beforeEach(() => {
    localStorage.clear();
    playTrackMock.mockReset();
    userContextMock.getVibeMatchingData.mockReturnValue({});
    searchGlobalMock.mockImplementation(async (_query, type) => type === 'track' ? [trackResult] : []);
  });
  afterEach(() => cleanup());

  it('mantiene la portada enfocada en el buscador y el historial', () => {
    render(<MemoryRouter><Search /></MemoryRouter>);

    expect(screen.getByRole('searchbox', { name: 'Buscar música' })).toBeInTheDocument();
    expect(screen.queryByText(/Explorar Géneros/i)).not.toBeInTheDocument();
    expect(screen.queryByText('Top Global')).not.toBeInTheDocument();
    expect(screen.queryByText('Top Latinoamérica')).not.toBeInTheDocument();
  });

  it('mantiene la portada limpia aunque exista un perfil de gustos', () => {
    userContextMock.getVibeMatchingData.mockReturnValue({
      savedArtists: [{ name: 'Twenty One Pilots' }],
      favorites: [{ name: 'SOMA', artist: 'Skrillex' }],
    });
    render(<MemoryRouter><Search /></MemoryRouter>);

    expect(screen.queryByText('Según tus gustos')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Buscar música de Twenty One Pilots' })).not.toBeInTheDocument();
    expect(screen.getByText('Encuentra lo que')).toBeInTheDocument();
  });

  it('no oculta el historial cuando la barra pierde el foco', async () => {
    localStorage.setItem('musicalol_recent_searches_v3', JSON.stringify(['Twenty One Pilots']));
    render(<MemoryRouter><Search /></MemoryRouter>);

    const input = screen.getByRole('searchbox', { name: 'Buscar música' });
    expect(screen.getByText('Twenty One Pilots')).toBeInTheDocument();

    input.blur();
    await new Promise((resolve) => setTimeout(resolve, 250));

    expect(screen.getByText('Twenty One Pilots')).toBeInTheDocument();
  });

  it('busca y presenta resultados procedentes del servicio musical', async () => {
    const user = userEvent.setup();
    render(<MemoryRouter><Search /></MemoryRouter>);
    await user.type(screen.getByPlaceholderText('¿Qué quieres escuchar?'), 'Luz');
    expect(await screen.findByText('Luz de prueba', {}, { timeout: 2500 })).toBeInTheDocument();
    expect(searchGlobalMock).toHaveBeenCalledWith('Luz', 'track', 12);
  });

  it('inicia la reproducción desde un resultado accesible', async () => {
    const user = userEvent.setup();
    render(<MemoryRouter><Search /></MemoryRouter>);
    await user.type(screen.getByPlaceholderText('¿Qué quieres escuchar?'), 'Luz');
    const result = await screen.findByRole('button', { name: /Luz de prueba/i }, { timeout: 2500 });
    await user.click(result);
    await waitFor(() => expect(playTrackMock).toHaveBeenCalled());
    expect(playTrackMock.mock.calls[0][0]).toMatchObject({ name: 'Luz de prueba', artist: 'Artista Demo' });
  });

  it('consulta cada filtro con su propia caché y una cantidad útil de resultados', async () => {
    searchGlobalMock.mockImplementation(async (_query, type) => {
      if (type === 'track') return [trackResult];
      if (type === 'artist') return [artistResult];
      if (type === 'album') return [albumResult];
      return [];
    });

    const user = userEvent.setup();
    render(<MemoryRouter><Search /></MemoryRouter>);
    const input = screen.getByRole('searchbox', { name: 'Buscar música' });
    await user.type(input, 'Luz');
    expect(await screen.findByText('Luz de prueba', {}, { timeout: 2500 })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Artistas' }));
    expect(await screen.findByText('Luz Artista', {}, { timeout: 2500 })).toBeInTheDocument();
    await waitFor(() => expect(searchGlobalMock).toHaveBeenCalledWith('Luz', 'artist', 24), { timeout: 2500 });

    await user.click(screen.getByRole('button', { name: 'Álbumes' }));
    expect(await screen.findByText('Luz Álbum', {}, { timeout: 2500 })).toBeInTheDocument();
    await waitFor(() => expect(searchGlobalMock).toHaveBeenCalledWith('Luz', 'album', 24), { timeout: 2500 });
  });

  it('guarda en recientes sólo cuando la persona confirma la búsqueda', async () => {
    const user = userEvent.setup();
    render(<MemoryRouter><Search /></MemoryRouter>);
    const input = screen.getByRole('searchbox', { name: 'Buscar música' });
    await user.type(input, 'Luz');
    await screen.findByText('Luz de prueba', {}, { timeout: 2500 });
    expect(localStorage.getItem('musicalol_recent_searches_v3')).toBeNull();

    await user.type(input, '{Enter}');
    await waitFor(() => expect(JSON.parse(localStorage.getItem('musicalol_recent_searches_v3'))).toEqual(['Luz']));
  });

  it('elimina el historial fragmentado creado por la versión anterior', async () => {
    localStorage.setItem('musicalol_recent_searches_v2', JSON.stringify(['von jovi', 'von j', 'von jo', 'von']));

    const user = userEvent.setup();
    render(<MemoryRouter><Search /></MemoryRouter>);
    await user.click(screen.getByRole('searchbox', { name: 'Buscar música' }));

    expect(localStorage.getItem('musicalol_recent_searches_v2')).toBeNull();
    expect(screen.queryByText('von j')).not.toBeInTheDocument();
  });

  it('ignora respuestas antiguas que llegan después de una búsqueda nueva', async () => {
    const pendingFirstSearch = [];
    searchGlobalMock.mockImplementation((query, type) => {
      if (query === 'Primera') {
        return new Promise((resolve) => pendingFirstSearch.push(() => resolve(type === 'track'
          ? [{ ...trackResult, id: 'old', title: 'Resultado antiguo' }]
          : [])));
      }
      return Promise.resolve(type === 'track'
        ? [{ ...trackResult, id: 'new', title: 'Resultado vigente' }]
        : []);
    });

    const user = userEvent.setup();
    render(<MemoryRouter><Search /></MemoryRouter>);
    const input = screen.getByRole('searchbox', { name: 'Buscar música' });
    await user.type(input, 'Primera');
    await waitFor(() => expect(pendingFirstSearch).toHaveLength(4), { timeout: 2500 });

    await user.clear(input);
    await user.type(input, 'Segunda');
    expect(await screen.findByText('Resultado vigente', {}, { timeout: 2500 })).toBeInTheDocument();

    pendingFirstSearch.forEach((resolve) => resolve());
    await waitFor(() => expect(screen.queryByText('Resultado antiguo')).not.toBeInTheDocument());
  });

  it('prioriza coincidencias exactas y elimina resultados duplicados', async () => {
    searchGlobalMock.mockImplementation(async (_query, type) => type === 'track' ? [
      { ...trackResult, id: 'popular', title: 'Luces de fiesta', rank: 999999 },
      { ...trackResult, id: 'exact', title: 'Luz', rank: 10 },
      { ...trackResult, id: 'exact', title: 'Luz', rank: 10 },
    ] : []);

    const user = userEvent.setup();
    const { container } = render(<MemoryRouter><Search /></MemoryRouter>);
    await user.type(screen.getByRole('searchbox', { name: 'Buscar música' }), 'Luz');
    await screen.findByText('Luces de fiesta', {}, { timeout: 2500 });

    const names = [...container.querySelectorAll('.track-name')].map((node) => node.textContent);
    expect(names).toEqual(['Luz', 'Luces de fiesta']);
  });

  it('conserva los resultados disponibles si una categoría falla', async () => {
    searchGlobalMock.mockImplementation(async (_query, type) => {
      if (type === 'artist') throw new Error('Servicio temporalmente no disponible');
      return type === 'track' ? [trackResult] : [];
    });

    const user = userEvent.setup();
    render(<MemoryRouter><Search /></MemoryRouter>);
    await user.type(screen.getByRole('searchbox', { name: 'Buscar música' }), 'Luz');

    expect(await screen.findByText('Luz de prueba', {}, { timeout: 2500 })).toBeInTheDocument();
    expect(screen.getByText(/Algunos tipos de resultado no pudieron cargarse/i)).toBeInTheDocument();
  });
  it('muestra canciones sin esperar a una categoría lenta', async () => {
    let finishArtists;
    searchGlobalMock.mockImplementation((_query, type) => type === 'artist'
      ? new Promise(resolve => { finishArtists = resolve; })
      : Promise.resolve(type === 'track' ? [trackResult] : []));
    const user = userEvent.setup();
    render(<MemoryRouter><Search /></MemoryRouter>);
    await user.type(screen.getByRole('searchbox'), 'Luz');
    expect(await screen.findByText('Luz de prueba')).toBeInTheDocument();
    expect(screen.getByText(/Buscando en todo el catálogo/)).toBeInTheDocument();
    finishArtists([artistResult]);
    await waitFor(() => expect(screen.queryByText(/Buscando en todo el catálogo/)).not.toBeInTheDocument());
  });

  it('descarta respuestas pendientes al borrar y no abre el teclado al entrar', async () => {
    let finishTrack;
    searchGlobalMock.mockImplementation((_query, type) => type === 'track'
      ? new Promise(resolve => { finishTrack = resolve; }) : Promise.resolve([]));
    const user = userEvent.setup();
    render(<MemoryRouter><Search /></MemoryRouter>);
    const input = screen.getByRole('searchbox');
    expect(input).not.toHaveFocus();
    await user.type(input, 'Luz');
    await waitFor(() => expect(finishTrack).toBeTypeOf('function'));
    await user.clear(input);
    finishTrack([trackResult]);
    await waitFor(() => expect(screen.getByText('Encuentra lo que')).toBeInTheDocument());
    expect(screen.queryByText('Luz de prueba')).not.toBeInTheDocument();
  });

  it('distingue consultas de catálogos con escritura no latina', async () => {
    const user = userEvent.setup();
    render(<MemoryRouter><Search /></MemoryRouter>);
    const input = screen.getByRole('searchbox');
    await user.type(input, '東京');
    await screen.findByText('Luz de prueba');
    await user.clear(input);
    await user.type(input, '大阪');
    await waitFor(() => expect(searchGlobalMock).toHaveBeenCalledWith('大阪', 'track', 12));
  });

  it('amplía una categoría bajo demanda', async () => {
    searchGlobalMock.mockImplementation(async (_query, type, limit) => type === 'track'
      ? Array.from({ length: limit }, (_, i) => ({ ...trackResult, id: `track-${i}`, title: `Luz ${i}` })) : []);
    const user = userEvent.setup();
    render(<MemoryRouter><Search /></MemoryRouter>);
    await user.type(screen.getByRole('searchbox'), 'Luz');
    await screen.findByText('Luz 0');
    await user.click(screen.getByRole('button', { name: 'Canciones', exact: true }));
    await user.click(await screen.findByRole('button', { name: 'Ampliar resultados' }));
    await waitFor(() => expect(searchGlobalMock).toHaveBeenCalledWith('Luz', 'track', 60));
    expect(await screen.findByText('Luz 59')).toBeInTheDocument();
  });

});
