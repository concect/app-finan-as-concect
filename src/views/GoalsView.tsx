import React, { useState, useMemo } from 'react';
import {
  Target,
  Plus,
  ShieldCheck,
  Pencil,
  Trash2,
  X
} from 'lucide-react';
import { BankAccount, Goal, GoalType, Transaction, User } from '../types';
import { FirestoreService, roundMoney } from '../services/firestoreService';
import { useFeedback } from '../contexts/FeedbackContext';

interface GoalsViewProps {
  user: User;
  activeWorkspaceId?: string;
  workspaceType?: 'INDIVIDUAL' | 'FAMILY' | 'BUSINESS';
  goals: Goal[];
  transactions?: Transaction[];
  accounts?: BankAccount[];
  onRefreshData: () => void;
}

export const GoalsView: React.FC<GoalsViewProps> = ({
  user,
  activeWorkspaceId = 'ws_personal',
  goals,
  transactions = [],
  accounts = [],
  onRefreshData
}) => {
  const { confirm, showToast } = useFeedback();

  // Contribution / Redemption Modal State
  const [selectedGoalForAporte, setSelectedGoalForAporte] = useState<Goal | null>(null);
  const [aporteMode, setAporteMode] = useState<'CONTRIBUTE' | 'REDEEM'>('CONTRIBUTE');
  const [aporteAmount, setAporteAmount] = useState<string>('');
  const [sourceAccountId, setSourceAccountId] = useState<string>('');

  // Create / Edit Goal Modal State
  const [showGoalModal, setShowGoalModal] = useState<boolean>(false);
  const [editingGoal, setEditingGoal] = useState<Goal | null>(null);
  const [loading, setLoading] = useState<boolean>(false);

  const [newTitle, setNewTitle] = useState('');
  const [newType, setNewType] = useState<GoalType>('SAVINGS');
  const [newTarget, setNewTarget] = useState('');
  const [newCurrentAmount, setNewCurrentAmount] = useState('0');
  const [newDeadline, setNewDeadline] = useState('2027-06-30');
  const [emergencyMonths, setEmergencyMonths] = useState(6);

  const formatMoney = (val: number) => {
    if (user.privacy_mode) return '••••••';
    return `R$ ${val.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  // Dynamic 3-month average monthly cost of living from real EXPENSE transactions
  const avgCostOfLiving = useMemo(() => {
    const now = new Date();
    const recentMonthKeys: string[] = [];
    for (let i = 0; i < 3; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      recentMonthKeys.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
    }

    const monthlyTotals = recentMonthKeys
      .map(monthKey =>
        roundMoney(
          transactions
            .filter(t => t.type === 'EXPENSE' && t.date.startsWith(monthKey))
            .reduce((sum, t) => sum + t.amount, 0)
        )
      )
      .filter(total => total > 0);

    if (monthlyTotals.length === 0) {
      return 6000.0;
    }

    const sumMonths = monthlyTotals.reduce((a, b) => a + b, 0);
    return roundMoney(sumMonths / monthlyTotals.length);
  }, [transactions]);

  const openCreateModal = () => {
    setEditingGoal(null);
    setNewTitle('');
    setNewType('SAVINGS');
    setNewTarget('');
    setNewCurrentAmount('0');
    setNewDeadline('2027-06-30');
    setEmergencyMonths(6);
    setShowGoalModal(true);
  };

  const openEditModal = (goal: Goal) => {
    setEditingGoal(goal);
    setNewTitle(goal.title);
    setNewType(goal.type);
    setNewTarget(String(goal.target_amount));
    setNewCurrentAmount(String(goal.current_amount));
    setNewDeadline(goal.deadline);
    setEmergencyMonths(goal.auto_calculate_emergency_months || 6);
    setShowGoalModal(true);
  };

  const handleAporte = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedGoalForAporte) return;
    const rawAmount = roundMoney(parseFloat(aporteAmount.replace(',', '.')) || 0);
    if (rawAmount <= 0) return;

    const signedAmount = aporteMode === 'REDEEM' ? -rawAmount : rawAmount;

    setLoading(true);
    try {
      await FirestoreService.contributeToGoal(
        user.id,
        selectedGoalForAporte.id,
        selectedGoalForAporte.current_amount,
        selectedGoalForAporte.target_amount,
        signedAmount,
        sourceAccountId || undefined,
        selectedGoalForAporte.title,
        activeWorkspaceId
      );
      setAporteAmount('');
      setSourceAccountId('');
      setSelectedGoalForAporte(null);
      showToast({
        type: 'success',
        title: aporteMode === 'REDEEM' ? 'Resgate registrado' : 'Aporte registrado',
        message: sourceAccountId
          ? `R$ ${rawAmount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} conciliados com a conta selecionada`
          : `R$ ${rawAmount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} atualizados na meta`
      });
      onRefreshData();
    } catch (err) {
      console.error(err);
      showToast({
        type: 'error',
        title: 'Falha na operação',
        message: 'Não foi possível atualizar o saldo da meta'
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSaveGoal = async (e: React.FormEvent) => {
    e.preventDefault();
    let target = roundMoney(parseFloat(newTarget.replace(',', '.')) || 0);
    if (newType === 'EMERGENCY_FUND') {
      target = roundMoney(avgCostOfLiving * emergencyMonths);
    }
    const current = roundMoney(parseFloat(newCurrentAmount.replace(',', '.')) || 0);
    if (target <= 0 || !newTitle.trim()) return;

    setLoading(true);
    try {
      if (editingGoal) {
        await FirestoreService.updateGoal(user.id, editingGoal.id, {
          title: newTitle.trim(),
          type: newType,
          target_amount: target,
          current_amount: current,
          deadline: newDeadline,
          status: current >= target ? 'COMPLETED' : 'IN_PROGRESS',
          auto_calculate_emergency_months: newType === 'EMERGENCY_FUND' ? emergencyMonths : undefined
        });
        showToast({
          type: 'success',
          title: 'Meta atualizada',
          message: `"${newTitle.trim()}" foi atualizada`
        });
      } else {
        await FirestoreService.addGoal(user.id, {
          workspace_id: activeWorkspaceId,
          title: newTitle.trim(),
          type: newType,
          target_amount: target,
          current_amount: 0,
          deadline: newDeadline,
          status: 'IN_PROGRESS',
          created_at: new Date().toISOString().slice(0, 10),
          auto_calculate_emergency_months: newType === 'EMERGENCY_FUND' ? emergencyMonths : undefined
        });
        showToast({
          type: 'success',
          title: 'Meta criada',
          message: 'Objetivo financeiro adicionado à carteira'
        });
      }

      setShowGoalModal(false);
      setEditingGoal(null);
      setNewTitle('');
      setNewTarget('');
      onRefreshData();
    } catch (err) {
      console.error(err);
      showToast({
        type: 'error',
        title: 'Erro ao salvar meta',
        message: 'Não foi possível salvar a meta'
      });
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteGoal = async (goal: Goal) => {
    const confirmed = await confirm({
      title: 'Excluir meta financeira',
      description: `Deseja remover a meta "${goal.title}" (${formatMoney(goal.current_amount)} acumulados)?`,
      confirmText: 'Excluir meta',
      cancelText: 'Cancelar',
      variant: 'danger',
      icon: 'trash'
    });

    if (confirmed) {
      try {
        await FirestoreService.deleteGoal(user.id, goal.id);
        showToast({
          type: 'success',
          title: 'Meta excluída',
          message: `"${goal.title}" foi removida da carteira`
        });
        onRefreshData();
      } catch (err) {
        showToast({
          type: 'error',
          title: 'Falha ao excluir',
          message: 'Não foi possível excluir a meta'
        });
      }
    }
  };

  const calculatePacing = (goal: Goal) => {
    const remaining = Math.max(0, roundMoney(goal.target_amount - goal.current_amount));
    const deadlineDate = new Date(goal.deadline);
    const today = new Date();
    const diffTime = deadlineDate.getTime() - today.getTime();
    const diffDays = Math.max(1, Math.ceil(diffTime / (1000 * 60 * 60 * 24)));
    const diffMonths = Math.max(1, diffDays / 30);
    const diffWeeks = Math.max(1, diffDays / 7);

    return {
      perDay: roundMoney(remaining / diffDays),
      perWeek: roundMoney(remaining / diffWeeks),
      perMonth: roundMoney(remaining / diffMonths),
      daysLeft: diffDays
    };
  };

  return (
    <div className="space-y-6 min-w-0">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-surface border border-subtle rounded-xl p-4 sm:p-5">
        <div>
          <h2 className="text-[15px] font-medium text-primary">Metas e reservas patrimoniais</h2>
          <p className="text-xs text-muted mt-0.5">
            Acompanhamento de aportes, prazos e ritmo mensal necessário (custo médio real: {formatMoney(avgCostOfLiving)}/mês)
          </p>
        </div>

        <button
          onClick={openCreateModal}
          className="h-9 flex items-center gap-1.5 px-3.5 bg-primary hover:opacity-90 text-canvas text-xs font-medium rounded-lg transition-opacity self-start sm:self-auto"
        >
          <Plus className="w-4 h-4 stroke-[1.75]" />
          <span>Nova meta</span>
        </button>
      </div>

      {/* Goals Grid */}
      {goals.length === 0 ? (
        <div className="p-12 bg-surface border border-subtle rounded-xl text-center space-y-3">
          <Target className="w-6 h-6 stroke-[1.5] text-muted mx-auto" />
          <h3 className="text-sm font-medium text-primary">Nenhuma meta ativa</h3>
          <p className="text-xs text-muted max-w-sm mx-auto">
            Defina objetivos como reserva de emergência, aquisição de bens ou aportes programados
          </p>
          <button
            onClick={openCreateModal}
            className="h-9 px-4 bg-[#10B981] text-[#0A0A0A] text-xs font-medium rounded-lg hover:bg-[#059669] transition-colors"
          >
            Criar primeira meta
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {goals.map(goal => {
            const pct = goal.target_amount > 0 ? Math.min(100, Math.round((goal.current_amount / goal.target_amount) * 100)) : 0;
            const pacing = calculatePacing(goal);

            return (
              <div
                key={goal.id}
                className="bg-surface border border-subtle rounded-xl p-4 sm:p-6 flex flex-col justify-between space-y-5 hover:border-border-focus transition-colors min-w-0"
              >
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-9 h-9 rounded-lg bg-raised border border-subtle flex items-center justify-center text-secondary shrink-0">
                        {goal.type === 'EMERGENCY_FUND' ? (
                          <ShieldCheck className="w-4 h-4 stroke-[1.5]" />
                        ) : (
                          <Target className="w-4 h-4 stroke-[1.5]" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <h3 className="text-[15px] font-medium text-primary truncate">{goal.title}</h3>
                        <p className="text-xs text-muted font-mono mt-0.5">
                          Prazo: {goal.deadline.split('-').reverse().join('/')} ({pacing.daysLeft}d restantes)
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className="font-mono font-medium text-sm text-[#10B981] tabular-nums mr-1">
                        {pct}%
                      </span>
                      <button
                        onClick={() => openEditModal(goal)}
                        className="p-1 rounded text-muted hover:text-primary transition-colors"
                        title="Editar meta"
                      >
                        <Pencil className="w-3.5 h-3.5 stroke-[1.5]" />
                      </button>
                      <button
                        onClick={() => handleDeleteGoal(goal)}
                        className="p-1 rounded text-muted hover:text-[#EF4444] transition-colors"
                        title="Excluir meta"
                      >
                        <Trash2 className="w-3.5 h-3.5 stroke-[1.5]" />
                      </button>
                    </div>
                  </div>

                  {goal.notes && (
                    <p className="text-xs text-secondary mt-3">
                      {goal.notes}
                    </p>
                  )}

                  {/* Progress bar */}
                  <div className="mt-5 space-y-2">
                    <div className="w-full bg-canvas h-2 rounded-full overflow-hidden border border-subtle">
                      <div
                        className="bg-[#10B981] h-full rounded-full"
                        style={{ width: `${pct}%` }}
                      />
                    </div>

                    <div className="flex justify-between items-center text-xs font-mono tabular-nums">
                      <span className="text-primary font-medium">{formatMoney(goal.current_amount)}</span>
                      <span className="text-muted">Alvo: {formatMoney(goal.target_amount)}</span>
                    </div>
                  </div>
                </div>

                {/* Pacing Breakdown */}
                <div className="p-3 sm:p-3.5 bg-canvas border border-subtle rounded-lg text-xs space-y-2">
                  <span className="text-xs text-muted block">
                    Ritmo necessário até o vencimento
                  </span>
                  <div className="grid grid-cols-3 gap-1.5 sm:gap-2 text-center font-mono tabular-nums">
                    <div className="p-1.5 sm:p-2 bg-surface rounded-md border border-subtle min-w-0">
                      <span className="text-[10px] sm:text-[11px] text-muted block mb-0.5">Por dia</span>
                      <span className="font-medium text-primary text-[11px] sm:text-xs truncate block">{formatMoney(pacing.perDay)}</span>
                    </div>
                    <div className="p-1.5 sm:p-2 bg-surface rounded-md border border-subtle min-w-0">
                      <span className="text-[10px] sm:text-[11px] text-muted block mb-0.5">Por semana</span>
                      <span className="font-medium text-primary text-[11px] sm:text-xs truncate block">{formatMoney(pacing.perWeek)}</span>
                    </div>
                    <div className="p-1.5 sm:p-2 bg-surface rounded-md border border-subtle min-w-0">
                      <span className="text-[10px] sm:text-[11px] text-muted block mb-0.5">Por mês</span>
                      <span className="font-medium text-[#10B981] text-[11px] sm:text-xs truncate block">{formatMoney(pacing.perMonth)}</span>
                    </div>
                  </div>
                </div>

                <div className="flex justify-end">
                  <button
                    onClick={() => {
                      setSelectedGoalForAporte(goal);
                      setAporteMode('CONTRIBUTE');
                      setAporteAmount('');
                      setSourceAccountId('');
                    }}
                    className="w-full sm:w-auto h-9 px-4 bg-raised hover:opacity-90 border border-subtle text-xs font-medium text-primary rounded-lg transition-colors flex items-center justify-center gap-1.5"
                  >
                    <Plus className="w-3.5 h-3.5 stroke-[1.5]" />
                    <span>Aportar / Resgatar</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* MODAL: APORTE / RESGATE EM META */}
      {selectedGoalForAporte && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
          <div className="w-full max-w-sm bg-surface border border-subtle rounded-2xl p-6 relative">
            <button onClick={() => setSelectedGoalForAporte(null)} className="absolute top-5 right-5 text-muted hover:text-primary">
              <X className="w-4 h-4 stroke-[1.5]" />
            </button>
            <h3 className="text-[15px] font-medium text-primary mb-1">
              {selectedGoalForAporte.title}
            </h3>
            <p className="text-xs text-muted mb-4">
              Registre um aporte ou resgate (saldo atual: {formatMoney(selectedGoalForAporte.current_amount)})
            </p>

            <div className="grid grid-cols-2 gap-1 bg-canvas p-1 rounded-lg border border-subtle mb-4">
              <button
                type="button"
                onClick={() => setAporteMode('CONTRIBUTE')}
                className={`h-8 text-xs font-medium rounded-md transition-colors ${
                  aporteMode === 'CONTRIBUTE'
                    ? 'bg-raised text-primary border border-subtle'
                    : 'text-muted hover:text-primary'
                }`}
              >
                Aportar (+)
              </button>
              <button
                type="button"
                onClick={() => setAporteMode('REDEEM')}
                className={`h-8 text-xs font-medium rounded-md transition-colors ${
                  aporteMode === 'REDEEM'
                    ? 'bg-raised text-primary border border-subtle'
                    : 'text-muted hover:text-primary'
                }`}
              >
                Resgatar (-)
              </button>
            </div>

            <form onSubmit={handleAporte} className="space-y-4">
              <div>
                <label className="block text-xs text-secondary mb-1.5">
                  Valor (R$)
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-mono text-muted">R$</span>
                  <input
                    type="number"
                    step="0.01"
                    required
                    autoFocus
                    placeholder="250,00"
                    value={aporteAmount}
                    onChange={e => setAporteAmount(e.target.value)}
                    className="w-full h-10 bg-canvas border border-subtle focus:border-[#10B981] rounded-lg pl-9 pr-3 text-sm font-mono font-medium text-primary outline-none tabular-nums"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs text-secondary mb-1.5">
                  Vincular conta bancária (opcional)
                </label>
                <select
                  value={sourceAccountId}
                  onChange={e => setSourceAccountId(e.target.value)}
                  className="w-full h-10 bg-canvas border border-subtle rounded-lg px-3 text-xs text-primary outline-none"
                >
                  <option value="">Apenas atualizar saldo da meta</option>
                  {accounts.map(acc => (
                    <option key={acc.id} value={acc.id}>
                      {aporteMode === 'CONTRIBUTE' ? 'Debitar de: ' : 'Creditar em: '}
                      {acc.name} ({formatMoney(acc.current_balance)})
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setSelectedGoalForAporte(null)}
                  className="h-9 px-3 text-xs text-secondary hover:text-primary"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="h-9 px-4 bg-primary hover:opacity-90 text-canvas text-xs font-medium rounded-lg transition-opacity disabled:opacity-50"
                >
                  {loading ? 'Salvando...' : aporteMode === 'REDEEM' ? 'Confirmar resgate' : 'Confirmar aporte'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: CRIAR / EDITAR META */}
      {showGoalModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
          <div className="w-full max-w-md bg-surface border border-subtle rounded-2xl p-6 space-y-4 relative">
            <button
              onClick={() => {
                setShowGoalModal(false);
                setEditingGoal(null);
              }}
              className="absolute top-5 right-5 text-muted hover:text-primary"
            >
              <X className="w-4 h-4 stroke-[1.5]" />
            </button>
            <h3 className="text-[15px] font-medium text-primary">
              {editingGoal ? 'Editar meta financeira' : 'Nova meta financeira'}
            </h3>

            <form onSubmit={handleSaveGoal} className="space-y-4">
              <div>
                <label className="block text-xs text-secondary mb-1.5">
                  Título da meta
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Reserva de liquidez, Imóvel, Viagem"
                  value={newTitle}
                  onChange={e => setNewTitle(e.target.value)}
                  className="w-full h-10 bg-canvas border border-subtle focus:border-[#10B981] rounded-lg px-3 text-xs text-primary outline-none"
                />
              </div>

              <div>
                <label className="block text-xs text-secondary mb-1.5">
                  Modalidade
                </label>
                <select
                  value={newType}
                  onChange={e => setNewType(e.target.value as any)}
                  className="w-full h-10 bg-canvas border border-subtle focus:border-[#10B981] rounded-lg px-3 text-xs text-primary outline-none"
                >
                  <option value="SAVINGS">Poupança e formação de capital</option>
                  <option value="EMERGENCY_FUND">Reserva de emergência (cálculo por meses)</option>
                  <option value="PURCHASE">Aquisição de bem ou projeto</option>
                  <option value="DEBT_PAYOFF">Amortização de passivo</option>
                  <option value="INVESTMENT">Aporte em carteira de investimentos</option>
                </select>
              </div>

              {newType === 'EMERGENCY_FUND' ? (
                <div className="p-3.5 bg-canvas border border-subtle rounded-lg text-xs space-y-2">
                  <label className="block text-xs text-secondary">
                    Cobertura sobre seu custo médio mensal real ({formatMoney(avgCostOfLiving)}/mês)
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {[3, 6, 12].map(m => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => setEmergencyMonths(m)}
                        className={`h-9 rounded-lg text-[11px] sm:text-xs font-medium border transition-colors ${
                          emergencyMonths === m
                            ? 'bg-raised text-primary border-border-focus'
                            : 'bg-surface text-muted border-subtle'
                        }`}
                      >
                        {m}m ({formatMoney(roundMoney(avgCostOfLiving * m))})
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <div>
                  <label className="block text-xs text-secondary mb-1.5">
                    Valor alvo (R$)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    placeholder="10000,00"
                    value={newTarget}
                    onChange={e => setNewTarget(e.target.value)}
                    className="w-full h-10 bg-canvas border border-subtle focus:border-[#10B981] rounded-lg px-3 text-xs font-mono font-medium text-primary outline-none tabular-nums"
                  />
                </div>
              )}

              <div className={`grid grid-cols-1 ${editingGoal ? 'sm:grid-cols-2' : ''} gap-3`}>
                {editingGoal && (
                  <div>
                    <label className="block text-xs text-secondary mb-1.5">
                      Valor acumulado atual (R$)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={newCurrentAmount}
                      onChange={e => setNewCurrentAmount(e.target.value)}
                      className="w-full h-10 bg-canvas border border-subtle focus:border-[#10B981] rounded-lg px-3 text-xs font-mono font-medium text-primary outline-none tabular-nums"
                    />
                  </div>
                )}

                <div>
                  <label className="block text-xs text-secondary mb-1.5">
                    Data limite
                  </label>
                  <input
                    type="date"
                    required
                    value={newDeadline}
                    onChange={e => setNewDeadline(e.target.value)}
                    className="w-full h-10 bg-canvas border border-subtle focus:border-[#10B981] rounded-lg px-3 text-xs font-mono text-primary outline-none"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-subtle">
                <button
                  type="button"
                  onClick={() => {
                    setShowGoalModal(false);
                    setEditingGoal(null);
                  }}
                  className="h-9 px-3 text-xs text-secondary hover:text-primary"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="h-9 px-4 bg-primary hover:opacity-90 text-canvas text-xs font-medium rounded-lg transition-opacity disabled:opacity-50"
                >
                  {loading ? 'Salvando...' : editingGoal ? 'Salvar alterações' : 'Criar meta'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
