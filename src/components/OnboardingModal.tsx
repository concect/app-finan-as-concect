import React, { useState } from 'react';
import { Landmark, CreditCard, ArrowRight, X } from 'lucide-react';
import { FirestoreService } from '../services/firestoreService';
import { useFeedback } from '../contexts/FeedbackContext';

interface OnboardingModalProps {
  isOpen: boolean;
  userId: string;
  activeWorkspaceId?: string;
  onClose: () => void;
  onSuccess: () => void;
}

export const OnboardingModal: React.FC<OnboardingModalProps> = ({
  isOpen,
  userId,
  activeWorkspaceId = 'ws_personal',
  onClose,
  onSuccess
}) => {
  const { showToast } = useFeedback();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);

  const [accName, setAccName] = useState('Conta Principal');
  const [accInstitution, setAccInstitution] = useState('Conta Principal');
  const [accType, setAccType] = useState<'CHECKING' | 'SAVINGS' | 'INVESTMENT' | 'CASH'>('CHECKING');
  const [accBalance, setAccBalance] = useState('0');

  const [hasCard, setHasCard] = useState(true);
  const [cardName, setCardName] = useState('Cartão Principal');
  const [cardBrand, setCardBrand] = useState<'Mastercard' | 'Visa' | 'Elo' | 'Amex'>('Mastercard');
  const [cardLimit, setCardLimit] = useState('5000');
  const [closingDay, setClosingDay] = useState(25);
  const [dueDay, setDueDay] = useState(5);

  if (!isOpen) return null;

  const handleFinish = async () => {
    setLoading(true);
    try {
      const initialBal = parseFloat(accBalance.replace(',', '.')) || 0;
      await FirestoreService.addAccount(userId, {
        workspace_id: activeWorkspaceId,
        name: accName.trim() || 'Conta Principal',
        institution: accInstitution.trim() || accName.trim(),
        type: accType,
        initial_balance: initialBal,
        current_balance: initialBal,
        color: '#10B981',
        icon: 'Landmark'
      });

      if (hasCard) {
        const totalLim = parseFloat(cardLimit.replace(',', '.')) || 1000;
        await FirestoreService.addCard(userId, {
          workspace_id: activeWorkspaceId,
          name: cardName.trim() || 'Cartão Principal',
          brand: cardBrand,
          total_limit: totalLim,
          available_limit: totalLim,
          closing_day: closingDay,
          due_day: dueDay,
          color: '#1F1F1D'
        });
      }

      showToast({
        type: 'success',
        title: 'Configuração concluída',
        message: 'Sua conta e cartão foram adicionados à carteira'
      });
      onSuccess();
      onClose();
    } catch (e) {
      console.error('Error saving onboarding data:', e);
      showToast({
        type: 'error',
        title: 'Erro na inicialização',
        message: 'Não foi possível salvar os dados iniciais'
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4">
      <div className="w-full max-w-lg bg-surface border border-subtle rounded-2xl p-6 sm:p-8 relative">
        <button
          onClick={onClose}
          className="absolute top-5 right-5 text-muted hover:text-primary transition-colors"
        >
          <X className="w-4 h-4 stroke-[1.5]" />
        </button>

        {/* Steps indicator */}
        <div className="flex items-center gap-2 mb-6">
          <div className={`h-1 flex-1 rounded-full ${step >= 1 ? 'bg-[#10B981]' : 'bg-subtle'}`} />
          <div className={`h-1 flex-1 rounded-full ${step >= 2 ? 'bg-[#10B981]' : 'bg-subtle'}`} />
        </div>

        {step === 1 ? (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-raised text-secondary border border-subtle flex items-center justify-center shrink-0">
                <Landmark className="w-4 h-4 stroke-[1.5]" />
              </div>
              <div>
                <h3 className="text-[15px] font-medium text-primary">Conta bancária principal</h3>
                <p className="text-xs text-muted">Defina sua conta ou carteira de movimentação diária</p>
              </div>
            </div>

            <div className="space-y-3 pt-2">
              <div>
                <label className="block text-xs text-secondary mb-1.5">
                  Instituição ou identificação
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Itaú, Nubank, Bradesco, C6"
                  value={accName}
                  onChange={e => {
                    setAccName(e.target.value);
                    setAccInstitution(e.target.value);
                  }}
                  className="w-full h-10 bg-canvas border border-subtle focus:border-[#10B981] rounded-lg px-3.5 text-xs text-primary outline-none"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-secondary mb-1.5">
                    Modalidade
                  </label>
                  <select
                    value={accType}
                    onChange={e => setAccType(e.target.value as any)}
                    className="w-full h-10 bg-canvas border border-subtle focus:border-[#10B981] rounded-lg px-3 text-xs text-primary outline-none"
                  >
                    <option value="CHECKING">Conta corrente</option>
                    <option value="SAVINGS">Poupança</option>
                    <option value="INVESTMENT">Investimento</option>
                    <option value="CASH">Caixa físico</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs text-secondary mb-1.5">
                    Saldo inicial (R$)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="0,00"
                    value={accBalance}
                    onChange={e => setAccBalance(e.target.value)}
                    className="w-full h-10 bg-canvas border border-subtle focus:border-[#10B981] rounded-lg px-3 text-xs font-mono font-medium text-primary outline-none tabular-nums"
                  />
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between pt-4 border-t border-subtle">
              <button
                type="button"
                onClick={onClose}
                className="text-xs text-muted hover:text-primary"
              >
                Iniciar sem conta
              </button>
              <button
                type="button"
                onClick={() => setStep(2)}
                className="h-9 px-4 bg-primary hover:opacity-90 text-canvas font-medium text-xs rounded-lg flex items-center gap-1.5 transition-opacity"
              >
                <span>Continuar</span>
                <ArrowRight className="w-3.5 h-3.5 stroke-[1.5]" />
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-raised text-secondary border border-subtle flex items-center justify-center shrink-0">
                <CreditCard className="w-4 h-4 stroke-[1.5]" />
              </div>
              <div>
                <h3 className="text-[15px] font-medium text-primary">Cartão de crédito</h3>
                <p className="text-xs text-muted">Configure limites e datas de fechamento e vencimento</p>
              </div>
            </div>

            <div className="flex items-center gap-2 py-1">
              <input
                type="checkbox"
                id="hasCardCheck"
                checked={hasCard}
                onChange={e => setHasCard(e.target.checked)}
                className="accent-[#10B981] rounded"
              />
              <label htmlFor="hasCardCheck" className="text-xs text-primary cursor-pointer">
                Adicionar cartão de crédito agora
              </label>
            </div>

            {hasCard && (
              <div className="space-y-3 p-4 bg-canvas rounded-xl border border-subtle">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-secondary mb-1">
                      Identificação
                    </label>
                    <input
                      type="text"
                      placeholder="Ex: C6 Carbon, Itaú Black"
                      value={cardName}
                      onChange={e => setCardName(e.target.value)}
                      className="w-full h-9 bg-surface border border-subtle rounded-lg px-3 text-xs text-primary outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs text-secondary mb-1">
                      Bandeira
                    </label>
                    <select
                      value={cardBrand}
                      onChange={e => setCardBrand(e.target.value as any)}
                      className="w-full h-9 bg-surface border border-subtle rounded-lg px-3 text-xs text-primary outline-none"
                    >
                      <option value="Mastercard">Mastercard</option>
                      <option value="Visa">Visa</option>
                      <option value="Elo">Elo</option>
                      <option value="Amex">Amex</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="block text-xs text-secondary mb-1">
                      Limite (R$)
                    </label>
                    <input
                      type="number"
                      value={cardLimit}
                      onChange={e => setCardLimit(e.target.value)}
                      className="w-full h-9 bg-surface border border-subtle rounded-lg px-2.5 text-xs font-mono font-medium text-primary outline-none tabular-nums"
                    />
                  </div>

                  <div>
                    <label className="block text-xs text-secondary mb-1">
                      Fechamento
                    </label>
                    <input
                      type="number"
                      min="1"
                      max="31"
                      value={closingDay}
                      onChange={e => setClosingDay(parseInt(e.target.value, 10))}
                      className="w-full h-9 bg-surface border border-subtle rounded-lg px-2.5 text-xs font-mono text-primary outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs text-secondary mb-1">
                      Vencimento
                    </label>
                    <input
                      type="number"
                      min="1"
                      max="31"
                      value={dueDay}
                      onChange={e => setDueDay(parseInt(e.target.value, 10))}
                      className="w-full h-9 bg-surface border border-subtle rounded-lg px-2.5 text-xs font-mono text-primary outline-none"
                    />
                  </div>
                </div>
              </div>
            )}

            <div className="flex items-center justify-between pt-4 border-t border-subtle">
              <button
                type="button"
                onClick={() => setStep(1)}
                className="text-xs text-secondary hover:text-primary"
              >
                Voltar
              </button>
              <button
                type="button"
                disabled={loading}
                onClick={handleFinish}
                className="h-9 px-5 bg-primary hover:opacity-90 text-canvas font-medium text-xs rounded-lg flex items-center justify-center transition-opacity disabled:opacity-50"
              >
                {loading ? (
                  <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                ) : (
                  <span>Concluir configuração</span>
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
