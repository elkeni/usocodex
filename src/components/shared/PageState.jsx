import { FaArrowLeft, FaExclamationTriangle, FaInbox, FaRedoAlt } from 'react-icons/fa';
import './pageState.css';

export default function PageState({ variant = 'empty', title, message, actionLabel, onAction, secondaryLabel, onSecondary, icon, compact = false }) {
  const defaultIcon = variant === 'error' ? <FaExclamationTriangle /> : <FaInbox />;
  if (variant === 'loading') {
    return <section className={`page-state page-state--loading${compact ? ' page-state--compact' : ''}`} role="status" aria-live="polite"><span className="page-state__spinner" aria-hidden="true" /><span>{title || 'Cargando…'}</span></section>;
  }
  return (
    <section className={`page-state page-state--${variant}${compact ? ' page-state--compact' : ''}`} role={variant === 'error' ? 'alert' : 'status'}>
      <div className="page-state__icon" aria-hidden="true">{icon || defaultIcon}</div>
      <h1>{title}</h1>
      {message && <p>{message}</p>}
      {(onAction || onSecondary) && <div className="page-state__actions">
        {onSecondary && <button type="button" className="page-state__button page-state__button--secondary" onClick={onSecondary}><FaArrowLeft /> {secondaryLabel || 'Volver'}</button>}
        {onAction && <button type="button" className="page-state__button" onClick={onAction}>{variant === 'error' && <FaRedoAlt />} {actionLabel || 'Reintentar'}</button>}
      </div>}
    </section>
  );
}

