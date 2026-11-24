import React, { useState, useEffect } from 'react';
import { X, CreditCard, Landmark } from 'lucide-react';
import { FirestoreService, roundMoney } from '../services/firestoreService';
import { Transaction, TransactionType, Category, BankAccount, CreditCard as CreditCardType, WorkspaceType, CostCenter } from '../types';
import { useFeedback } from '../contexts/FeedbackContext';

interface QuickTransactionModalProps {
  isOpen: boolean;
  userId: string;
  activeWorkspaceId?: string;
  workspaceType?: WorkspaceType;
  costCenters?: CostCenter[];
  accounts: BankAccount[];
  cards: CreditCardType[];
  categories: Category[];
  initialTransaction?: Transaction | null;
  onClose: () => void;
  onSuccess: () => void;
}

export const QuickTransactionModal: React.FC<QuickTransactionModalProps> = ({
  isOpen,
  userId,
  activeWorkspaceId = 'ws_personal',
  workspaceType = 'INDIVIDUAL',
  costCenters = [],
  accounts,
  cards,
  categories,
  initialTransaction = null,
  onClose,
  onSuccess
}) => {
  const { showToast } = useFeedback();
  const isEditing = Boolean(initialTransaction);

  const [type, setType] = useState<TransactionType>('EXPENSE');
  const [amount, setAmount] = useState<string>('');
  const [description, setDescription] = useState<string>('');
  const [date, setDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [categoryId, setCategoryId] = useState<string>('');
  const [costCenterId, setCostCenterId] = useState<string>('');
  const [paymentMode, setPaymentMode] = useState<'CARD' | 'ACCOUNT'>('ACCOUNT');
  const [cardId, setCardId] = useState<string>('');
  const [accountId, setAccountId] = useState<string>('');
  const [destAccountId, setDestAccountId] = useState<string>('');
  const [installments, setInstallments] = useState<number>(1);
  const [status, setStatus] = useState<'PAID' | 'PENDING'>('PAID');
  const [isRecurring, setIsRecurring] = useState<boolean>(false);
  const [notes, setNotes] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);

  const fmtBr = (v: number) =>
    v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const filteredCategories = categories.filter(c =>
    type === 'INCOME' ? c.type === 'INCOME' : c.type === 'EXPENSE'
  );

  // Hydrate fields when opening or when initialTransaction changes
  useEffect(() => {
    if (!isOpen) return;

    if (initialTransaction) {
      setType(initialTransaction.type);
      setAmount(String(initialTransaction.amount));
      setDescription(initialTransaction.description);
      setDate(initialTransaction.date);
      setCategoryId(initialTransaction.category_id);
      setPaymentMode(initialTransaction.card_id ? 'CARD' : 'ACCOUNT');
      setCardId(initialTransaction.card_id || cards[0]?.id || '');
      setAccountId(initialTransaction.account_id || accounts[0]?.id || '');
      setDestAccountId(
        initialTransaction.destination_account_id ||
          accounts.find(a => a.id !== initialTransaction.account_id)?.id ||
          accounts[0]?.id ||
          ''
      );
      setInstallments(initialTransaction.installment_total || 1);
      setStatus(initialTransaction.status === 'OVERDUE' ? 'PENDING' : initialTransaction.status);
      setIsRecurring(Boolean(initialTransaction.is_recurring));
      setCostCenterId(initialTransaction.cost_center_id || '');
      setNotes(initialTransaction.notes || '');
    } else {
      setType('EXPENSE');
      setAmount('');
      setDescription('');
      setDate(new Date().toISOString().slice(0, 10));
      const defaultExpCat = categories.find(c => c.type === 'EXPENSE')?.id || '';
      setCategoryId(defaultExpCat);
      setPaymentMode('ACCOUNT');
      setAccountId(accounts[0]?.id || '');
      setDestAccountId(accounts[1]?.id || accounts[0]?.id || '');
      setCardId(cards[0]?.id || '');
      setInstallments(1);
      setStatus('PAID');
      setIsRecurring(false);
      setCostCenterId('');
      setNotes('');
    }
  }, [isOpen, initialTransaction]);

  // Keep category selection consistent when switching transaction type in Create mode
  useEffect(() => {
    if (!isOpen) return;
    if (filteredCategories.length > 0 && !filteredCategories.some(c => c.id === categoryId)) {
      setCategoryId(filteredCategories[0].id);
    }
    if (accounts.length > 0 && !accountId) {
      setAccountId(accounts[0].id);
    }
    if (accounts.length > 1 && !destAccountId) {
      setDestAccountId(accounts[1].id);
    }
    if (cards.length > 0 && !cardId) {
      setCardId(cards[0].id);
    }
  }, [type, categories, accounts, cards, isOpen]);

  if (!isOpen) return null;

  const numAmount = roundMoney(parseFloat(amount.replace(',', '.')) || 0);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (numAmount <= 0 || !description.trim()) return;
    if (type === 'TRANSFER' && accountId === destAccountId && accounts.length > 1) {
      showToast({
        type: 'warning',
        title: 'Contas idênticas',
        message: 'Selecione uma conta de destino diferente da conta de origem'
      });
      return;
    }

    setSubmitting(true);

    try {
      if (isEditing && initialTransaction) {
        // Edit existing transaction and recalculate balance/limit delta atomically
        const isCardExpense = type === 'EXPENSE' && paymentMode === 'CARD' && cards.length > 0;
        await FirestoreService.updateTransaction(userId, initialTransaction.id, {
          type,
          amount: numAmount,
          description: description.trim(),
          date,
          status: type === 'TRANSFER' ? status : status,
          is_recurring: type === 'TRANSFER' ? false : isRecurring,
          category_id:
            type === 'TRANSFER'
              ? initialTransaction.category_id || 'cat_transfer'
              : categoryId || filteredCategories[0]?.id || 'cat_general',
          account_id: isCardExpense ? '' : (accountId || accounts[0]?.id || ''),
          destination_account_id: type === 'TRANSFER' ? (destAccountId || accounts[1]?.id || '') : '',
          card_id: isCardExpense ? (cardId || cards[0]?.id || '') : '',
          cost_center_id: workspaceType === 'BUSINESS' && type === 'EXPENSE' ? costCenterId : '',
          notes
        });

        showToast({
          type: 'success',
          title: 'Lançamento atualizado',
          message: 'Alterações salvas e saldos recalculados'
        });
      } else {
        // Create new transaction
        if (type === 'TRANSFER') {
          await FirestoreService.addTransaction(
            userId,
            {
              workspace_id: activeWorkspaceId,
              account_id: accountId || accounts[0]?.id,
              destination_account_id: destAccountId || accounts[1]?.id || accounts[0]?.id,
              category_id: categoryId || filteredCategories[0]?.id || 'cat_transfer',
              type: 'TRANSFER',
              amount: numAmount,
              description: description.trim() || 'Transferência entre contas',
              date,
              status,
              is_recurring: false,
              source: 'APP',
              notes
            },
            accounts,
            cards
          );
        } else if (type === 'INCOME') {
          await FirestoreService.addTransaction(
            userId,
            {
              workspace_id: activeWorkspaceId,
              account_id: accountId || accounts[0]?.id,
              category_id: categoryId || filteredCategories[0]?.id || 'cat_income',
              type: 'INCOME',
              amount: numAmount,
              description: description.trim(),
              date,
              status,
              is_recurring: isRecurring,
              source: 'APP',
              notes
            },
            accounts,
            cards
          );
        } else {
          if (paymentMode === 'CARD' && cards.length > 0) {
            // Pass TOTAL PURCHASE AMOUNT and installment_total; FirestoreService splits & rounds installments accurately
            await FirestoreService.addTransaction(
              userId,
              {
                workspace_id: activeWorkspaceId,
                card_id: cardId || cards[0]?.id,
                category_id: categoryId || filteredCategories[0]?.id || 'cat_expense',
                type: 'EXPENSE',
                amount: numAmount,
                description: description.trim(),
                date,
                status,
                is_recurring: isRecurring,
                installment_current: installments > 1 ? 1 : undefined,
                installment_total: installments > 1 ? installments : undefined,
                cost_center_id: workspaceType === 'BUSINESS' && costCenterId ? costCenterId : undefined,
                source: 'APP',
                notes
              },
              accounts,
              cards
            );
          } else {
            await FirestoreService.addTransaction(
              userId,
              {
                workspace_id: activeWorkspaceId,
                account_id: accountId || accounts[0]?.id,
                category_id: categoryId || filteredCategories[0]?.id || 'cat_expense',
                type: 'EXPENSE',
                amount: numAmount,
                description: description.trim(),
                date,
                status,
                is_recurring: isRecurring,
                cost_center_id: workspaceType === 'BUSINESS' && costCenterId ? costCenterId : undefined,
                source: 'APP',
                notes
              },
              accounts,
              cards
            );
          }
        }

        showToast({
          type: 'success',
          title: 'Lançamento registrado',
          message: `${type === 'EXPENSE' ? 'Despesa' : type === 'INCOME' ? 'Receita' : 'Transferência'} adicionada ao extrato`
        });
      }

      onSuccess();
      onClose();
    } catch (err) {
      console.error('Error saving transaction:', err);
      showToast({
        type: 'error',
        title: 'Falha ao salvar',
        message: 'Não foi possível processar o lançamento'
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-3 sm:p-4 overflow-y-auto">
      <div className="w-full max-w-lg bg-surface border border-subtle rounded-2xl p-5 sm:p-6 relative">
        <button
          onClick={onClose}
          className="absolute top-5 right-5 text-muted hover:text-primary transition-colors"
        >
          <X className="w-4 h-4 stroke-[1.5]" />
        </button>

        <h3 className="text-base font-medium text-primary mb-5">
          {isEditing ? 'Editar lançamento' : 'Novo lançamento'}
        </h3>

        {/* Type Selector Tabs */}
        <div className="grid grid-cols-3 gap-1 bg-canvas p-1 rounded-lg border border-subtle mb-5">
          <button
            type="button"
            onClick={() => setType('EXPENSE')}
            className={`h-8 flex items-center justify-center gap-1.5 text-xs font-medium rounded-md transition-colors ${
              type === 'EXPENSE'
                ? 'bg-raised text-primary border border-subtle'
                : 'text-muted hover:text-primary'
            }`}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-[#EF4444]" />
            <span>Despesa</span>
          </button>
          <button
            type="button"
            onClick={() => setType('INCOME')}
            className={`h-8 flex items-center justify-center gap-1.5 text-xs font-medium rounded-md transition-colors ${
              type === 'INCOME'
                ? 'bg-raised text-primary border border-subtle'
                : 'text-muted hover:text-primary'
            }`}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-[#10B981]" />
            <span>Receita</span>
          </button>
          <button
            type="button"
            onClick={() => setType('TRANSFER')}
            className={`h-8 flex items-center justify-center gap-1.5 text-xs font-medium rounded-md transition-colors ${
              type === 'TRANSFER'
                ? 'bg-raised text-primary border border-subtle'
                : 'text-muted hover:text-primary'
            }`}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-secondary" />
            <span>Transferência</span>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Amount Input */}
          <div>
            <label className="block text-xs text-secondary mb-1.5">
              {!isEditing && type === 'EXPENSE' && paymentMode === 'CARD' && installments > 1
                ? 'Valor total da compra (R$)'
                : 'Valor (R$)'}
            </label>
            <div className="relative">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-xs font-mono text-muted">
                R$
              </span>
              <input
                type="number"
                step="0.01"
                required
                placeholder="0,00"
                value={amount}
                onChange={e => setAmount(e.target.value)}
                className="w-full h-11 bg-canvas border border-subtle focus:border-[#10B981] rounded-lg pl-10 pr-3 text-lg font-mono font-medium text-primary tabular-nums outline-none transition-colors"
              />
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs text-secondary mb-1.5">
              Descrição
            </label>
            <input
              type="text"
              required
              placeholder="Ex: Supermercado, Almoço, Honorários"
              value={description}
              onChange={e => setDescription(e.target.value)}
              className="w-full h-10 bg-canvas border border-subtle focus:border-[#10B981] rounded-lg px-3.5 text-xs text-primary outline-none transition-colors"
            />
          </div>

          {/* Date & Status */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-secondary mb-1.5">
                Data
              </label>
              <input
                type="date"
                required
                value={date}
                onChange={e => setDate(e.target.value)}
                className="w-full h-10 bg-canvas border border-subtle focus:border-[#10B981] rounded-lg px-3 text-xs font-mono text-primary outline-none"
              />
            </div>
            <div>
              <label className="block text-xs text-secondary mb-1.5">
                Situação
              </label>
              <select
                value={status}
                onChange={e => setStatus(e.target.value as any)}
                className="w-full h-10 bg-canvas border border-subtle focus:border-[#10B981] rounded-lg px-3 text-xs text-primary outline-none"
              >
                <option value="PAID">Liquidado</option>
                <option value="PENDING">Agendado</option>
              </select>
            </div>
          </div>

          {/* If Transfer */}
          {type === 'TRANSFER' ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3.5 bg-canvas rounded-xl border border-subtle">
              <div>
                <label className="block text-xs text-secondary mb-1.5">
                  Conta de origem (débito)
                </label>
                <select
                  value={accountId}
                  onChange={e => setAccountId(e.target.value)}
                  className="w-full h-9 bg-surface border border-subtle rounded-lg px-3 text-xs text-primary outline-none"
                >
                  {accounts.map(acc => (
                    <option key={acc.id} value={acc.id}>
                      {acc.name} (R$ {fmtBr(acc.current_balance)})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-secondary mb-1.5">
                  Conta de destino (crédito)
                </label>
                <select
                  value={destAccountId}
                  onChange={e => setDestAccountId(e.target.value)}
                  className="w-full h-9 bg-surface border border-subtle rounded-lg px-3 text-xs text-primary outline-none"
                >
                  {accounts.map(acc => (
                    <option key={acc.id} value={acc.id}>
                      {acc.name} (R$ {fmtBr(acc.current_balance)})
                    </option>
                  ))}
                </select>
              </div>
            </div>
          ) : (
            <>
              <div>
                <label className="block text-xs text-secondary mb-1.5">
                  Categoria
                </label>
                <select
                  value={categoryId}
                  onChange={e => setCategoryId(e.target.value)}
                  className="w-full h-10 bg-canvas border border-subtle focus:border-[#10B981] rounded-lg px-3 text-xs text-primary outline-none"
                >
                  {filteredCategories.map(c => (
                    <option key={c.id} value={c.id}>
                      {c.name} {c.monthly_budget_limit ? `(Teto: R$ ${fmtBr(c.monthly_budget_limit)})` : ''}
                    </option>
                  ))}
                </select>
              </div>

              {/* Cost Center Selector — STRICTLY BUSINESS PJ ONLY */}
              {workspaceType === 'BUSINESS' && type === 'EXPENSE' && costCenters.length > 0 && (
                <div>
                  <label className="block text-xs text-secondary mb-1.5">
                    Centro de custo (opcional)
                  </label>
                  <select
                    value={costCenterId}
                    onChange={e => setCostCenterId(e.target.value)}
                    className="w-full h-10 bg-canvas border border-subtle focus:border-[#10B981] rounded-lg px-3 text-xs text-primary outline-none"
                  >
                    <option value="">Sem centro de custo específico</option>
                    {costCenters.map(cc => (
                      <option key={cc.id} value={cc.id}>
                        {cc.code ? `${cc.code} — ${cc.name}` : cc.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {type === 'EXPENSE' ? (
                <div className="space-y-3 p-3.5 bg-canvas rounded-xl border border-subtle">
                  <div className="flex flex-wrap gap-4 sm:gap-5">
                    <label className="flex items-center gap-2 text-xs text-primary cursor-pointer">
                      <input
                        type="radio"
                        name="payMode"
                        checked={paymentMode === 'ACCOUNT'}
                        onChange={() => setPaymentMode('ACCOUNT')}
                        className="accent-[#10B981]"
                      />
                      <Landmark className="w-4 h-4 stroke-[1.5] text-secondary" />
                      <span>Conta ou Pix</span>
                    </label>
                    {cards.length > 0 && (
                      <label className="flex items-center gap-2 text-xs text-primary cursor-pointer">
                        <input
                          type="radio"
                          name="payMode"
                          checked={paymentMode === 'CARD'}
                          onChange={() => setPaymentMode('CARD')}
                          className="accent-[#10B981]"
                        />
                        <CreditCard className="w-4 h-4 stroke-[1.5] text-secondary" />
                        <span>Cartão de crédito</span>
                      </label>
                    )}
                  </div>

                  {paymentMode === 'CARD' && cards.length > 0 ? (
                    <div className={`grid grid-cols-1 ${!isEditing ? 'sm:grid-cols-2' : ''} gap-3 pt-1`}>
                      <div>
                        <label className="block text-xs text-secondary mb-1">
                          Cartão
                        </label>
                        <select
                          value={cardId}
                          onChange={e => setCardId(e.target.value)}
                          className="w-full h-9 bg-surface border border-subtle rounded-lg px-2.5 text-xs text-primary outline-none"
                        >
                          {cards.map(c => (
                            <option key={c.id} value={c.id}>
                              {c.name} (Disp: R$ {fmtBr(c.available_limit)})
                            </option>
                          ))}
                        </select>
                      </div>
                      {!isEditing && (
                        <div>
                          <label className="block text-xs text-secondary mb-1">
                            Condição
                          </label>
                          <select
                            value={installments}
                            onChange={e => setInstallments(parseInt(e.target.value, 10))}
                            className="w-full h-9 bg-surface border border-subtle rounded-lg px-2.5 text-xs text-primary outline-none font-mono"
                          >
                            <option value={1}>1x à vista (R$ {fmtBr(numAmount)})</option>
                            {[2, 3, 4, 5, 6, 8, 10, 12, 18, 24].map(num => (
                              <option key={num} value={num}>
                                {num}x de R$ {fmtBr(roundMoney(numAmount / num))}
                              </option>
                            ))}
                          </select>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div>
                      <label className="block text-xs text-secondary mb-1">
                        Conta bancária
                      </label>
                      <select
                        value={accountId}
                        onChange={e => setAccountId(e.target.value)}
                        className="w-full h-9 bg-surface border border-subtle rounded-lg px-3 text-xs text-primary outline-none"
                      >
                        {accounts.length === 0 ? (
                          <option value="">Nenhuma conta cadastrada</option>
                        ) : (
                          accounts.map(acc => (
                            <option key={acc.id} value={acc.id}>
                              {acc.name} — Saldo: R$ {fmtBr(acc.current_balance)}
                            </option>
                          ))
                        )}
                      </select>
                    </div>
                  )}
                </div>
              ) : (
                <div>
                  <label className="block text-xs text-secondary mb-1.5">
                    Conta de crédito
                  </label>
                  <select
                    value={accountId}
                    onChange={e => setAccountId(e.target.value)}
                    className="w-full h-10 bg-canvas border border-subtle rounded-lg px-3 text-xs text-primary outline-none"
                  >
                    {accounts.length === 0 ? (
                      <option value="">Nenhuma conta cadastrada</option>
                    ) : (
                      accounts.map(acc => (
                        <option key={acc.id} value={acc.id}>
                          {acc.name} — Saldo: R$ {fmtBr(acc.current_balance)}
                        </option>
                      ))
                    )}
                  </select>
                </div>
              )}
            </>
          )}

          {/* Recurring checkbox */}
          {type !== 'TRANSFER' && (
            <div className="flex items-center justify-between pt-1">
              <label className="flex items-center gap-2 text-xs text-secondary cursor-pointer">
                <input
                  type="checkbox"
                  checked={isRecurring}
                  onChange={e => setIsRecurring(e.target.checked)}
                  className="accent-[#10B981] rounded"
                />
                <span>Repetir mensalmente</span>
              </label>
            </div>
          )}

          {/* Submit button */}
          <div className="flex items-center justify-end gap-2 pt-3 border-t border-subtle">
            <button
              type="button"
              onClick={onClose}
              className="h-9 px-4 text-xs font-medium text-secondary hover:text-primary transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="h-9 px-5 bg-primary hover:opacity-90 text-canvas font-medium text-xs rounded-lg transition-opacity active:scale-[0.98] disabled:opacity-50 flex items-center justify-center"
            >
              {submitting ? (
                <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
              ) : (
                <span>{isEditing ? 'Salvar alterações' : 'Confirmar lançamento'}</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
