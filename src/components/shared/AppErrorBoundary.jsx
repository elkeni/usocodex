import { Component } from 'react';
import { FaExclamationTriangle, FaRedoAlt } from 'react-icons/fa';
import './appErrorBoundary.css';

export default class AppErrorBoundary extends Component {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    if (import.meta.env.DEV) console.error('[AppErrorBoundary]', error, info);
  }

  handleRetry = () => {
    this.setState({ hasError: false });
    window.location.reload();
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <main className="app-error-state" role="alert">
        <div className="app-error-state__icon"><FaExclamationTriangle /></div>
        <h1>Algo interrumpió la música</h1>
        <p>Tus datos siguen guardados. Recarga la aplicación para continuar.</p>
        <button type="button" onClick={this.handleRetry}>
          <FaRedoAlt /> Recargar aplicación
        </button>
      </main>
    );
  }
}

