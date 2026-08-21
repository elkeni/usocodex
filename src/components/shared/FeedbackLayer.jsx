import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { FaCheckCircle, FaExclamationCircle, FaInfoCircle, FaTimes } from 'react-icons/fa';
import useBodyScrollLock from '../../hooks/useBodyScrollLock';
import './feedback.css';

const icons = {
  success: <FaCheckCircle />,
  error: <FaExclamationCircle />,
  warning: <FaExclamationCircle />,
  info: <FaInfoCircle />,
};

export default function FeedbackLayer({ toasts, dialog, onDismiss, onDialogClose }) {
  const cancelRef = useRef(null);
  const dialogRef = useRef(null);
  useBodyScrollLock(Boolean(dialog));

  useEffect(() => {
    if (!dialog) return undefined;
    const previousFocus = document.activeElement;
    cancelRef.current?.focus();

    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onDialogClose(false);
      }

      if (event.key === 'Tab') {
        const focusable = dialogRef.current?.querySelectorAll('button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])');
        if (!focusable?.length) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      previousFocus?.focus?.();
    };
  }, [dialog, onDialogClose]);

  return createPortal(
    <>
      <div className="feedback-toasts" aria-live="polite" aria-atomic="false">
        {toasts.map((toast) => (
          <div key={toast.id} className={`feedback-toast feedback-toast--${toast.type}`} role={toast.type === 'error' ? 'alert' : 'status'}>
            <span className="feedback-toast__icon" aria-hidden="true">{icons[toast.type] || icons.info}</span>
            <span className="feedback-toast__message">{toast.message}</span>
            <button type="button" className="feedback-toast__close" onClick={() => onDismiss(toast.id)} aria-label="Cerrar mensaje">
              <FaTimes />
            </button>
          </div>
        ))}
      </div>

      {dialog && (
        <div className="feedback-dialog-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onDialogClose(false)}>
          <section ref={dialogRef} className="feedback-dialog" role="alertdialog" aria-modal="true" aria-labelledby="feedback-dialog-title" aria-describedby="feedback-dialog-message">
            <h2 id="feedback-dialog-title">{dialog.title}</h2>
            <p id="feedback-dialog-message">{dialog.message}</p>
            <div className="feedback-dialog__actions">
              <button ref={cancelRef} type="button" className="feedback-dialog__button feedback-dialog__button--secondary" onClick={() => onDialogClose(false)}>
                {dialog.cancelLabel}
              </button>
              <button type="button" className={`feedback-dialog__button feedback-dialog__button--${dialog.tone}`} onClick={() => onDialogClose(true)}>
                {dialog.confirmLabel}
              </button>
            </div>
          </section>
        </div>
      )}
    </>,
    document.body,
  );
}
