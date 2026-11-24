import React, { useState } from 'react';
import { Lock, Shield, Delete, AlertCircle } from 'lucide-react';

interface PinLockModalProps {
  isOpen: boolean;
  onUnlock: () => void;
  correctPin: string;
}

export const PinLockModal: React.FC<PinLockModalProps> = ({ isOpen, onUnlock, correctPin }) => {
  const [pin, setPin] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleNumberClick = (num: string) => {
    if (pin.length < 4) {
      const nextPin = pin + num;
      setPin(nextPin);
      setError(null);

      if (nextPin.length === 4) {
        if (nextPin === correctPin) {
          setTimeout(() => {
            setPin('');
            onUnlock();
          }, 150);
        } else {
          setError('PIN incorreto');
          setTimeout(() => {
            setPin('');
          }, 600);
        }
      }
    }
  };

  const handleDelete = () => {
    setPin(prev => prev.slice(0, -1));
    setError(null);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-canvas/95 backdrop-blur-md p-4">
      <div className="w-full max-w-sm bg-surface border border-subtle rounded-2xl p-6 sm:p-8 flex flex-col items-center text-center">
        <div className="w-11 h-11 rounded-xl bg-raised border border-subtle flex items-center justify-center mb-4 text-secondary">
          <Shield className="w-5 h-5 stroke-[1.5]" />
        </div>

        <h2 className="text-base font-medium text-primary tracking-tight">
          Concect Finanças
        </h2>
        <p className="text-xs text-muted mt-1 mb-6">
          Sessão bloqueada. Informe seu PIN de 4 dígitos
        </p>

        {/* PIN Indicators */}
        <div className="flex items-center justify-center gap-4 mb-6">
          {[0, 1, 2, 3].map(idx => (
            <div
              key={idx}
              className={`w-3 h-3 rounded-full border transition-colors ${
                pin.length > idx
                  ? 'bg-[#10B981] border-[#10B981]'
                  : 'bg-raised border-subtle'
              }`}
            />
          ))}
        </div>

        {error && (
          <div className="flex items-center gap-1.5 text-xs text-[#EF4444] mb-4">
            <AlertCircle className="w-3.5 h-3.5 stroke-[1.5]" />
            <span>{error}</span>
          </div>
        )}

        {/* Numeric Keypad */}
        <div className="grid grid-cols-3 gap-2.5 w-full max-w-[240px] mb-6">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map(num => (
            <button
              key={num}
              onClick={() => handleNumberClick(num)}
              className="h-12 rounded-lg bg-raised hover:opacity-90 border border-subtle text-base font-mono font-medium text-primary transition-colors active:scale-95 flex items-center justify-center"
            >
              {num}
            </button>
          ))}
          <div />
          <button
            onClick={() => handleNumberClick('0')}
            className="h-12 rounded-lg bg-raised hover:opacity-90 border border-subtle text-base font-mono font-medium text-primary transition-colors active:scale-95 flex items-center justify-center"
          >
            0
          </button>
          <button
            onClick={handleDelete}
            className="h-12 rounded-lg bg-raised hover:opacity-90 border border-subtle text-muted hover:text-primary transition-colors active:scale-95 flex items-center justify-center"
            title="Apagar"
          >
            <Delete className="w-4 h-4 stroke-[1.5]" />
          </button>
        </div>

        <div className="text-[11px] text-muted flex items-center gap-1.5 font-mono">
          <Lock className="w-3 h-3 stroke-[1.5] text-muted" />
          <span>Sessão protegida por PIN</span>
        </div>
      </div>
    </div>
  );
};
