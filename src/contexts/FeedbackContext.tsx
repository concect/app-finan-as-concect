import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { AlertTriangle, Trash2, CheckCircle2, AlertCircle, Info, X } from 'lucide-react';

export interface ConfirmOptions {
  title: string;
  description: string;
  confirmText?: string;
  cancelText?: string;
  variant?: 'danger' | 'warning' | 'info';
  icon?: 'trash' | 'alert' | 'info';
}

export interface ToastOptions {
  id?: string;
  type: 'success' | 'error' | 'warning' | 'info';
  title: string;
  message?: string;
  durationMs?: number;
}

interface FeedbackContextType {
  confirm: (options: ConfirmOptions) => Promise<boolean>;
  showToast: (options: ToastOptions) => void;
}

const FeedbackContext = createContext<FeedbackContextType | undefined>(undefined);

export const FeedbackProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [confirmState, setConfirmState] = useState<{
    isOpen: boolean;
    options: ConfirmOptions;
    resolve: (val: boolean) => void;
  } | null>(null);

  const [toasts, setToasts] = useState<ToastOptions[]>([]);

  const confirm = useCallback((options: ConfirmOptions): Promise<boolean> => {
    return new Promise(resolve => {
      setConfirmState({
        isOpen: true,
        options,
        resolve
      });
    });
  }, []);

  const handleConfirmAction = () => {
    if (confirmState) {
      confirmState.resolve(true);
      setConfirmState(null);
    }
  };

  const handleCancelAction = () => {
    if (confirmState) {
      confirmState.resolve(false);
      setConfirmState(null);
    }
  };

  const showToast = useCallback((options: ToastOptions) => {
    const id = options.id || `toast_${Date.now()}_${Math.random()}`;
    const newToast = { ...options, id };

    setToasts(prev => [...prev, newToast]);

    const duration = options.durationMs ?? 4000;
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, duration);
  }, []);

  const removeToast = (id?: string) => {
    if (!id) return;
    setToasts(prev => prev.filter(t => t.id !== id));
  };

  return (
    <FeedbackContext.Provider value={{ confirm, showToast }}>
      {children}

      {/* In-App Confirmation Modal */}
      {confirmState?.isOpen && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
          <div
            className="w-full max-w-md bg-surface border border-subtle rounded-2xl p-6 relative"
            role="dialog"
            aria-modal="true"
          >
            <div className="flex items-start gap-3.5">
              <div
                className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 border ${
                  confirmState.options.variant === 'danger' || confirmState.options.icon === 'trash'
                    ? 'bg-[#EF4444]/10 text-[#EF4444] border-[#EF4444]/25'
                    : confirmState.options.variant === 'warning'
                    ? 'bg-[#D97706]/10 text-[#D97706] border-[#D97706]/25'
                    : 'bg-raised text-secondary border-subtle'
                }`}
              >
                {confirmState.options.variant === 'danger' || confirmState.options.icon === 'trash' ? (
                  <Trash2 className="w-4 h-4 stroke-[1.5]" />
                ) : confirmState.options.variant === 'warning' ? (
                  <AlertTriangle className="w-4 h-4 stroke-[1.5]" />
                ) : (
                  <Info className="w-4 h-4 stroke-[1.5]" />
                )}
              </div>

              <div className="flex-1 space-y-1 min-w-0">
                <h3 className="text-[15px] font-medium text-primary">
                  {confirmState.options.title}
                </h3>
                <p className="text-xs text-secondary leading-relaxed">
                  {confirmState.options.description}
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 mt-6 pt-4 border-t border-subtle">
              <button
                type="button"
                onClick={handleCancelAction}
                className="h-9 px-3.5 rounded-lg text-xs font-medium text-secondary hover:text-primary hover:bg-raised border border-subtle transition-colors"
              >
                {confirmState.options.cancelText || 'Cancelar'}
              </button>
              <button
                type="button"
                onClick={handleConfirmAction}
                className={`h-9 px-4 rounded-lg text-xs font-medium transition-colors ${
                  confirmState.options.variant === 'danger' || confirmState.options.icon === 'trash'
                    ? 'bg-[#EF4444] hover:bg-[#DC2626] text-white'
                    : confirmState.options.variant === 'warning'
                    ? 'bg-[#D97706] hover:bg-[#B45309] text-black'
                    : 'bg-primary hover:opacity-90 text-canvas'
                }`}
              >
                {confirmState.options.confirmText || 'Confirmar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* In-App Toast Container */}
      {toasts.length > 0 && (
        <div className="fixed top-5 right-3 sm:right-5 z-[130] flex flex-col gap-2 pointer-events-none max-w-[calc(100vw-24px)] sm:max-w-sm w-full">
          {toasts.map(t => (
            <div
              key={t.id}
              className="pointer-events-auto flex items-start gap-3 p-3.5 bg-surface border border-subtle rounded-xl shadow-xl transition-opacity"
            >
              <div className="flex-shrink-0 mt-0.5">
                {t.type === 'success' && <CheckCircle2 className="w-4 h-4 stroke-[1.5] text-[#10B981]" />}
                {t.type === 'error' && <AlertCircle className="w-4 h-4 stroke-[1.5] text-[#EF4444]" />}
                {t.type === 'warning' && <AlertTriangle className="w-4 h-4 stroke-[1.5] text-[#D97706]" />}
                {t.type === 'info' && <Info className="w-4 h-4 stroke-[1.5] text-secondary" />}
              </div>

              <div className="flex-1 space-y-0.5 min-w-0">
                <p className="text-xs font-medium text-primary truncate">{t.title}</p>
                {t.message && (
                  <p className="text-xs text-muted leading-relaxed">{t.message}</p>
                )}
              </div>

              <button
                type="button"
                onClick={() => removeToast(t.id)}
                className="text-muted hover:text-primary p-0.5 transition-colors shrink-0"
                aria-label="Fechar"
              >
                <X className="w-3.5 h-3.5 stroke-[1.5]" />
              </button>
            </div>
          ))}
        </div>
      )}
    </FeedbackContext.Provider>
  );
};

export const useFeedback = (): FeedbackContextType => {
  const context = useContext(FeedbackContext);
  if (!context) {
    throw new Error('useFeedback must be used within a FeedbackProvider');
  }
  return context;
};
