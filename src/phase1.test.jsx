// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Login from './screens/auth/login';
import Card from './components/shared/Card';
import { FeedbackProvider, useFeedback } from './context/feedbackContext';

vi.mock('./services/authService', () => ({
  AuthService: {
    login: vi.fn(),
  },
}));

function FeedbackHarness() {
  const { notify, confirm } = useFeedback();
  return (
    <>
      <button type="button" onClick={() => notify('Canción guardada', { type: 'success' })}>Notificar</button>
      <button type="button" onClick={async () => {
        const accepted = await confirm({ title: 'Eliminar playlist', message: 'No se puede deshacer', tone: 'danger' });
        if (accepted) notify('Playlist eliminada', { type: 'success' });
      }}>Eliminar</button>
    </>
  );
}

describe('Fase 1: recorridos esenciales', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => cleanup());

  it('expone etiquetas persistentes en el formulario de acceso', () => {
    render(<MemoryRouter><Login /></MemoryRouter>);
    expect(screen.getByLabelText('Correo electrónico')).toHaveAttribute('autocomplete', 'email');
    expect(screen.getByLabelText('Contraseña')).toHaveAttribute('autocomplete', 'current-password');
  });

  it('muestra un error comprensible antes de enviar un correo inválido', async () => {
    const user = userEvent.setup();
    render(<MemoryRouter><Login /></MemoryRouter>);
    await user.type(screen.getByLabelText('Correo electrónico'), 'correo-invalido');
    await user.type(screen.getByLabelText('Contraseña'), 'secreto123');
    fireEvent.submit(screen.getByRole('button', { name: 'INICIAR SESIÓN' }).closest('form'));
    expect(await screen.findByRole('alert')).toHaveTextContent('correo electrónico válido');
  });

  it('permite ir al registro usando un botón accesible', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={['/login']}>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<h1>Registro de prueba</h1>} />
        </Routes>
      </MemoryRouter>,
    );
    await user.click(screen.getByRole('button', { name: /Regístrate aquí/i }));
    expect(screen.getByRole('heading', { name: 'Registro de prueba' })).toBeInTheDocument();
  });

  it('activa una tarjeta con el teclado', async () => {
    const onClick = vi.fn();
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <Card item={{ id: '1', name: 'Canción de prueba', artist: 'Artista' }} onClick={onClick} />
      </MemoryRouter>,
    );
    const card = screen.getByRole('button', { name: /Canción de prueba/i });
    card.focus();
    await user.keyboard('{Enter}');
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('presenta notificaciones y confirmaciones sin cuadros nativos', async () => {
    const user = userEvent.setup();
    render(<FeedbackProvider><FeedbackHarness /></FeedbackProvider>);
    await user.click(screen.getByRole('button', { name: 'Notificar' }));
    expect(screen.getByRole('status')).toHaveTextContent('Canción guardada');
    await user.click(screen.getByRole('button', { name: 'Eliminar' }));
    expect(screen.getByRole('alertdialog', { name: 'Eliminar playlist' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Confirmar' }));
    expect(screen.getByText('Playlist eliminada')).toBeInTheDocument();
  });
});
