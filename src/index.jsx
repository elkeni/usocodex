import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import { UserProvider } from './context/userContext';
import { FeedbackProvider } from './context/feedbackContext';
import AppErrorBoundary from './components/shared/AppErrorBoundary';
import { initializeExperiencePreferences } from './services/experiencePreferences';

initializeExperiencePreferences();

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <FeedbackProvider>
    <AppErrorBoundary>
      <UserProvider>
        <App />
      </UserProvider>
    </AppErrorBoundary>
  </FeedbackProvider>
);

// PWA de alcance honesto: instala la interfaz y ofrece una portada sin conexión.
// Audio, búsquedas e importaciones siempre dependen del backend y no se almacenan aquí.
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // La instalación es opcional; nunca debe impedir abrir o reproducir la app.
    });
  });
}
