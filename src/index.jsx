import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import { UserProvider } from './context/userContext';
import { FeedbackProvider } from './context/feedbackContext';
import AppErrorBoundary from './components/shared/AppErrorBoundary';

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
