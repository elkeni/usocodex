import { useNavigate } from 'react-router-dom';
import { FaCompass } from 'react-icons/fa';
import PageState from './PageState';

export default function NotFound() {
  const navigate = useNavigate();
  return <PageState variant="empty" icon={<FaCompass />} title="Esta página no está en la playlist" message="El enlace puede haber cambiado o el contenido ya no está disponible." actionLabel="Ir a Descubrir" onAction={() => navigate('/feed', { replace: true })} secondaryLabel="Buscar música" onSecondary={() => navigate('/search')} />;
}

