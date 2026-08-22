import { lazy, Suspense } from 'react';
import { Link, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { FaUserCircle } from 'react-icons/fa';
import Sidebar from '../../components/sidebar';
import PageState from '../../components/shared/PageState';
import NotFound from '../../components/shared/NotFound';
import { useUser } from '../../context/userContext';
import { usePlayer } from '../../context/playerContext';
import './home.css';

const Feed = lazy(() => import('../feed/feed'));
const Search = lazy(() => import('../search/search'));
const Library = lazy(() => import('../library'));
const Profile = lazy(() => import('../profile'));
const Playlist = lazy(() => import('../playlist/playlist'));
const ArtistDetail = lazy(() => import('../artist/artistDetail'));
const AlbumDetail = lazy(() => import('../album/albumDetail'));
const Import = lazy(() => import('../import/import'));

function RouteLoader() {
  return <PageState variant="loading" title="Preparando tu música" compact />;
}

export default function Home() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useUser();
  const { currentTrack } = usePlayer();
  const isProfilePage = location.pathname === '/profile';

  return (
    <div className={`home-container${currentTrack ? ' has-player' : ' without-player'}`}>
      <nav className="glass-navbar" aria-label="Navegación superior">
        <Link className="nav-logo" to="/feed" aria-label="Ir a Descubrir">
          <span className="nav-logo-icon" aria-hidden="true" />
          PARADISQUO
        </Link>

        <button
          type="button"
          className={`nav-profile ${isProfilePage ? 'active' : ''}`}
          onClick={() => navigate('/profile')}
          aria-label="Abrir mi perfil"
          aria-current={isProfilePage ? 'page' : undefined}
        >
          {user?.photoURL ? <img src={user.photoURL} alt="" /> : <FaUserCircle color="white" size={24} />}
        </button>
      </nav>

      <div className="home-shell">
        <Sidebar />
        <main className="main-content" id="main-content">
          <div className="route-page" key={location.pathname}>
            <Suspense fallback={<RouteLoader />}>
              <Routes location={location}>
                <Route path="/" element={<Navigate to="/feed" replace />} />
                <Route path="/feed" element={<Feed />} />
                <Route path="/search" element={<Search />} />
                <Route path="/library" element={<Library />} />
                <Route path="/favorites" element={<Navigate to="/library" replace />} />
                <Route path="/profile" element={<Profile />} />
                <Route path="/playlist/:playlistId" element={<Playlist />} />
                <Route path="/artist/:name" element={<ArtistDetail />} />
                <Route path="/album/:albumId" element={<AlbumDetail />} />
                <Route path="/album/:artist/:name" element={<AlbumDetail />} />
                <Route path="/import/*" element={<Import />} />
                <Route path="*" element={<NotFound />} />
              </Routes>
            </Suspense>
          </div>
        </main>
      </div>
    </div>
  );
}
