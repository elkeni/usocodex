import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import FeedbackLayer from '../components/shared/FeedbackLayer';

const FeedbackContext = createContext(null);

export function FeedbackProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const [dialog, setDialog] = useState(null);
  const nextId = useRef(0);

  const dismiss = useCallback((id) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const notify = useCallback((message, options = {}) => {
    const id = ++nextId.current;
    const toast = {
      id,
      message,
      type: options.type || 'info',
      duration: options.duration ?? 3600,
    };

    setToasts((current) => [...current.slice(-2), toast]);
    if (toast.duration > 0) {
      window.setTimeout(() => dismiss(id), toast.duration);
    }
    return id;
  }, [dismiss]);

  const confirm = useCallback((options) => new Promise((resolve) => {
    setDialog({
      title: options.title || 'Confirmar acción',
      message: options.message,
      confirmLabel: options.confirmLabel || 'Confirmar',
      cancelLabel: options.cancelLabel || 'Cancelar',
      tone: options.tone || 'default',
      resolve,
    });
  }), []);

  const closeDialog = useCallback((result) => {
    setDialog((current) => {
      current?.resolve(result);
      return null;
    });
  }, []);

  const value = useMemo(() => ({ notify, confirm, dismiss }), [confirm, dismiss, notify]);

  return (
    <FeedbackContext.Provider value={value}>
      {children}
      <FeedbackLayer
        toasts={toasts}
        dialog={dialog}
        onDismiss={dismiss}
        onDialogClose={closeDialog}
      />
    </FeedbackContext.Provider>
  );
}

export function useFeedback() {
  const context = useContext(FeedbackContext);
  if (!context) throw new Error('useFeedback debe usarse dentro de FeedbackProvider');
  return context;
}

