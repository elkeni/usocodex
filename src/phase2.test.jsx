// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import Home from './screens/home';

vi.mock('./context/userContext', () => ({
  useUser: () => ({ user: { username: 'Oyente' } }),
}));

vi.mock('./context/playerContext', () => ({
  usePlayer: () => ({ currentTrack: null }),
}));

vi.mock('./screens/feed/feed', () => ({ default: () => <h1>Descubrir cargado</h1> }));
vi.mock('./screens/search/search', () => ({ default: () => <h1>Buscar cargado</h1> }));
vi.mock('./screens/library', () => ({ default: () => <h1>Biblioteca cargada</h1> }));
vi.mock('./screens/profile', () => ({ default: () => <h1>Perfil cargado</h1> }));
vi.mock('./screens/playlist/playlist', () => ({ default: () => <h1>Playlist cargada</h1> }));
vi.mock('./screens/artist/artistDetail', () => ({ default: () => <h1>Artista cargado</h1> }));
vi.mock('./screens/album/albumDetail', () => ({ default: () => <h1>Álbum cargado</h1> }));
vi.mock('./screens/import/import', () => ({ default: () => <h1>Importar cargado</h1> }));

describe('Fase 2: navegación móvil y fluidez', () => {
  afterEach(() => cleanup());

  it('expone cuatro destinos principales con nombres accesibles', async () => {
    render(<MemoryRouter initialEntries={['/feed']}><Home /></MemoryRouter>);
    const navigation = screen.getByRole('navigation', { name: 'Navegación principal' });
    expect(navigation).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Descubrir' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Buscar' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Biblioteca' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Importar' })).toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: 'Descubrir cargado' })).toBeInTheDocument();
  });

  it('desmonta la pantalla anterior al cambiar de sección', async () => {
    const user = userEvent.setup();
    render(<MemoryRouter initialEntries={['/feed']}><Home /></MemoryRouter>);
    expect(await screen.findByRole('heading', { name: 'Descubrir cargado' })).toBeInTheDocument();
    await user.click(screen.getByRole('link', { name: 'Buscar' }));
    expect(await screen.findByRole('heading', { name: 'Buscar cargado' })).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('heading', { name: 'Descubrir cargado' })).not.toBeInTheDocument());
  });

  it('ofrece recuperación útil para enlaces inexistentes', async () => {
    render(<MemoryRouter initialEntries={['/una-ruta-vieja']}><Home /></MemoryRouter>);
    expect(await screen.findByRole('heading', { name: 'Esta página no está en la playlist' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Ir a Descubrir/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Buscar música/i })).toBeInTheDocument();
  });
});
