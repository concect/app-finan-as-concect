import React, { useState } from 'react';
import { Plus, Pencil, Trash2, X } from 'lucide-react';
import { Category, Transaction, User, BankAccount } from '../types';
import { FirestoreService, roundMoney } from '../services/firestoreService';
import { useFeedback } from '../contexts/FeedbackContext';

interface BudgetPlanningViewProps {
  user: User;
  activeWorkspaceId?: string;
  workspaceType?: 'INDIVIDUAL' | 'FAMILY' | 'BUSINESS';
  categories: Category[];
  transactions: Transaction[];
  accounts: BankAccount[];
}

export const BudgetPlanningView: React.FC<BudgetPlanningViewProps> = ({
  user,
  activeWorkspaceId = 'ws_personal',
  categories,
  transactions,
  accounts
}) => {
  const { confirm, showToast } = useFeedback();

  const [simItemName, setSimItemName] = useState('Equipamento ou aquisição planejada');
  const [simAmount, setSimAmount] = useState('3500');
  const [simPaymentMethod, setSimPaymentMethod] = useState<'CASH' | 'INSTALLMENTS'>('INSTALLMENTS');
  const [simInstallments, setSimInstallments] = useState(6);

  // Category Budget Modal State
  const [showCatModal, setShowCatModal] = useState(false);
  const [editingCat, setEditingCat] = useState<Category | null>(null);
  const [catName, setCatName] = useState('');
  const [catLimit, setCatLimit] = useState('');
  const [catColor, setCatColor] = useState('#10B981');

  const formatMoney = (val: number) => {
    if (user.privacy_mode) return '••••••';
    return `R$ ${val.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const now = new Date();
  const currentMonthPrefix = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  const currentMonthExpenses = transactions.filter(t => t.date.startsWith(currentMonthPrefix) && t.type === 'EXPENSE');
  const currentMonthIncome = transactions.filter(t => t.date.startsWith(currentMonthPrefix) && t.type === 'INCOME');

  const totalIncome = currentMonthIncome.reduce((acc, t) => acc + t.amount, 0);
  const totalExpense = currentMonthExpenses.reduce((acc, t) => acc + t.amount, 0);

  const expenseCategoriesWithBudget = categories
    .filter(c => c.type === 'EXPENSE')
    .map(cat => {
      const spent = roundMoney(
        currentMonthExpenses
          .filter(t => t.category_id === cat.id)
          .reduce((acc, t) => acc + t.amount, 0)
      );
      const limit = cat.monthly_budget_limit || 0;
      const percentUsed = limit > 0 ? Math.round((spent / limit) * 100) : 0;
      return {
        ...cat,
        spent,
        limit,
        percentUsed,
        remaining: Math.max(0, roundMoney(limit - spent))
      };
    });

  const openCreateCategory = () => {
    setEditingCat(null);
    setCatName('');
    setCatLimit('1000');
    setCatColor('#10B981');
    setShowCatModal(true);
  };

  const openEditCategory = (cat: Category) => {
    setEditingCat(cat);
    setCatName(cat.name);
    setCatLimit(cat.monthly_budget_limit ? String(cat.monthly_budget_limit) : '');
    setCatColor(cat.color || '#10B981');
    setShowCatModal(true);
  };

  const handleSaveCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!catName.trim()) return;
    const limitVal = roundMoney(parseFloat(catLimit.replace(',', '.')) || 0);

    try {
      if (editingCat) {
        await FirestoreService.updateCategory(user.id, editingCat.id, {
          name: catName.trim(),
          monthly_budget_limit: limitVal > 0 ? limitVal : 0,
          color: catColor
        });
        showToast({
          type: 'success',
          title: 'Teto orçamentário atualizado',
          message: `"${catName.trim()}" salva com sucesso`
        });
      } else {
        await FirestoreService.addCategory(user.id, {
          workspace_id: activeWorkspaceId,
          name: catName.trim(),
          type: 'EXPENSE',
          monthly_budget_limit: limitVal > 0 ? limitVal : 1000,
          icon: 'Tag',
          color: catColor,
          is_system: false
        });
        showToast({
          type: 'success',
          title: 'Categoria criada',
          message: `"${catName.trim()}" adicionada ao orçamento`
        });
      }
      setShowCatModal(false);
      setEditingCat(null);
    } catch (err) {
      showToast({
        type: 'error',
        title: 'Erro ao salvar categoria',
        message: 'Não foi possível salvar o teto orçamentário'
      });
    }
  };

  const handleDeleteCategory = async (cat: Category) => {
    const linkedCount = transactions.filter(t => t.category_id === cat.id).length;
    const confirmed = await confirm({
      title: 'Excluir categoria orçamentária',
      description:
        linkedCount > 0
          ? `A categoria "${cat.name}" está associada a ${linkedCount} lançamento(s). Deseja realmente excluí-la?`
          : `Deseja remover a categoria "${cat.name}" do seu orçamento?`,
      confirmText: 'Excluir',
      cancelText: 'Cancelar',
      variant: 'danger',
      icon: 'trash'
    });

    if (confirmed) {
      try {
        await FirestoreService.deleteCategory(user.id, cat.id);
        showToast({
          type: 'success',
          title: 'Categoria excluída',
          message: `"${cat.name}" foi removida`
        });
      } catch (err) {
        showToast({
          type: 'error',
          title: 'Falha ao excluir',
          message: 'Não foi possível excluir a categoria'
        });
      }
    }
  };

  const parsedAmount = parseFloat(simAmount) || 0;
  const monthlyInstallment = simPaymentMethod === 'INSTALLMENTS'
    ? roundMoney(parsedAmount / simInstallments)
    : roundMoney(parsedAmount);

  const liquidCapital = roundMoney(
    accounts
      .filter(a => a.type === 'CHECKING' || a.type === 'CASH')
      .reduce((a, b) => a + b.current_balance, 0)
  );

  const avgMonthlyFreeCash = totalIncome > totalExpense
    ? roundMoney(totalIncome - totalExpense)
    : Math.max(1500, roundMoney(liquidCapital * 0.25));

  let verdict: 'SAFE' | 'WARNING' | 'CRITICAL' = 'SAFE';
  let verdictMessage = '';

  if (simPaymentMethod === 'CASH') {
    if (parsedAmount > liquidCapital * 0.7) {
      verdict = 'CRITICAL';
      verdictMessage = `O desembolso à vista compromete mais de 70% da liquidez imediata disponível (${formatMoney(liquidCapital)}).`;
    } else if (parsedAmount > liquidCapital * 0.4) {
      verdict = 'WARNING';
      verdictMessage = 'O pagamento à vista reduzirá a margem de segurança de caixa no curto prazo.';
    } else {
      verdict = 'SAFE';
      verdictMessage = 'Há liquidez suficiente em conta para o pagamento à vista sem comprometer as obrigações do mês.';
    }
  } else {
    const commitmentRate = (monthlyInstallment / avgMonthlyFreeCash) * 100;
    if (commitmentRate > 35) {
      verdict = 'CRITICAL';
      verdictMessage = `A parcela de ${formatMoney(monthlyInstallment)} absorve ${commitmentRate.toFixed(0)}% da margem livre mensal pelos próximos ${simInstallments} meses.`;
    } else if (commitmentRate > 15) {
      verdict = 'WARNING';
      verdictMessage = `Operação viável com atenção: a parcela representa ${commitmentRate.toFixed(0)}% do fluxo livre mensal estimado.`;
    } else {
      verdict = 'SAFE';
      verdictMessage = `A parcela de ${formatMoney(monthlyInstallment)} consome ${commitmentRate.toFixed(1)}% do fluxo de caixa livre mensal.`;
    }
  }

  const projectionMonths = [
    { label: 'Em 3 meses', freeCashAccumulated: roundMoney(avgMonthlyFreeCash * 3 - (simPaymentMethod === 'INSTALLMENTS' ? monthlyInstallment * 3 : parsedAmount)) },
    { label: 'Em 6 meses', freeCashAccumulated: roundMoney(avgMonthlyFreeCash * 6 - (simPaymentMethod === 'INSTALLMENTS' ? monthlyInstallment * Math.min(6, simInstallments) : parsedAmount)) },
    { label: 'Em 12 meses', freeCashAccumulated: roundMoney(avgMonthlyFreeCash * 12 - parsedAmount) }
  ];

  return (
    <div className="space-y-8 min-w-0">
      {/* SECTION 1: INTERACTIVE PURCHASE & BUDGET SIMULATOR */}
      <div className="bg-surface border border-subtle rounded-xl p-4 sm:p-6 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-subtle pb-4">
          <div>
            <h2 className="text-[15px] font-medium text-primary">
              Simulador de impacto no fluxo de caixa
            </h2>
            <p className="text-xs text-muted mt-0.5">
              Avalie como uma aquisição à vista ou parcelada afeta sua liquidez nos próximos meses
            </p>
          </div>
          <span className="text-xs font-mono px-2.5 py-1 rounded bg-canvas text-secondary border border-subtle tabular-nums self-start sm:self-auto">
            Liquidez: {formatMoney(liquidCapital)}
          </span>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Controls */}
          <div className="space-y-4">
            <div>
              <label className="block text-xs text-secondary mb-1.5">
                Descrição da aquisição
              </label>
              <input
                type="text"
                value={simItemName}
                onChange={e => setSimItemName(e.target.value)}
                className="w-full h-10 bg-canvas border border-subtle focus:border-[#10B981] rounded-lg px-3 text-xs text-primary outline-none"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-secondary mb-1.5">
                  Valor total (R$)
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-mono text-muted">
                    R$
                  </span>
                  <input
                    type="number"
                    value={simAmount}
                    onChange={e => setSimAmount(e.target.value)}
                    className="w-full h-10 bg-canvas border border-subtle focus:border-[#10B981] rounded-lg pl-9 pr-3 text-xs font-mono font-medium text-primary outline-none tabular-nums"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs text-secondary mb-1.5">
                  Modalidade
                </label>
                <select
                  value={simPaymentMethod}
                  onChange={e => setSimPaymentMethod(e.target.value as any)}
                  className="w-full h-10 bg-canvas border border-subtle focus:border-[#10B981] rounded-lg px-3 text-xs text-primary outline-none"
                >
                  <option value="INSTALLMENTS">Parcelado no cartão</option>
                  <option value="CASH">À vista em conta</option>
                </select>
              </div>
            </div>

            {simPaymentMethod === 'INSTALLMENTS' && (
              <div>
                <div className="flex justify-between text-xs text-secondary mb-1.5">
                  <span>Parcelamento</span>
                  <span className="font-mono font-medium text-primary tabular-nums">
                    {simInstallments}x de {formatMoney(monthlyInstallment)}
                  </span>
                </div>
                <input
                  type="range"
                  min="2"
                  max="24"
                  value={simInstallments}
                  onChange={e => setSimInstallments(parseInt(e.target.value, 10))}
                  className="w-full accent-[#10B981] cursor-pointer"
                />
                <div className="flex justify-between text-[11px] text-muted font-mono mt-1">
                  <span>2x</span>
                  <span>6x</span>
                  <span>12x</span>
                  <span>24x</span>
                </div>
              </div>
            )}
          </div>

          {/* Real-Time Impact Evaluation */}
          <div className="bg-canvas border border-subtle rounded-xl p-4 sm:p-5 flex flex-col justify-between space-y-4">
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-secondary">
                  Diagnóstico de viabilidade
                </span>
                <span
                  className={`text-xs font-medium px-2 py-0.5 rounded-md ${
                    verdict === 'SAFE'
                      ? 'bg-[#10B981]/10 text-[#10B981] border border-[#10B981]/25'
                      : verdict === 'WARNING'
                      ? 'bg-[#D97706]/10 text-[#D97706] border border-[#D97706]/25'
                      : 'bg-[#EF4444]/10 text-[#EF4444] border border-[#EF4444]/25'
                  }`}
                >
                  {verdict === 'SAFE' ? 'Viável' : verdict === 'WARNING' ? 'Atenção moderada' : 'Risco elevado'}
                </span>
              </div>

              <p className="text-[13px] text-primary mt-2 leading-relaxed">
                {verdictMessage}
              </p>
            </div>

            <div className="pt-3 border-t border-subtle grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div>
                <span className="text-muted block mb-0.5">Comprometimento mensal</span>
                <span className="font-mono font-medium text-primary tabular-nums">
                  -{formatMoney(monthlyInstallment)} / mês
                </span>
              </div>
              <div>
                <span className="text-muted block mb-0.5">Margem livre estimada</span>
                <span className="font-mono font-medium text-[#10B981] tabular-nums">
                  {formatMoney(Math.max(0, roundMoney(avgMonthlyFreeCash - monthlyInstallment)))} / mês
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Projections for 3, 6, 12 months */}
        <div className="pt-4 border-t border-subtle">
          <h4 className="text-xs text-secondary mb-3">
            Projeção de saldo líquido acumulado considerando esta decisão
          </h4>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {projectionMonths.map((proj, idx) => (
              <div key={idx} className="p-4 bg-canvas border border-subtle rounded-lg">
                <span className="text-xs text-muted block">{proj.label}</span>
                <span className="text-lg font-medium font-mono text-primary mt-1 block tabular-nums">
                  {formatMoney(proj.freeCashAccumulated)}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* SECTION 2: CATEGORY SPENDING CEILINGS */}
      <div className="bg-surface border border-subtle rounded-xl p-4 sm:p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-[15px] font-medium text-primary">Tetos orçamentários por categoria</h2>
            <p className="text-xs text-muted mt-0.5">
              Consumo acumulado no mês em relação ao limite definido
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-muted font-mono tabular-nums">
              {currentMonthExpenses.length} {currentMonthExpenses.length === 1 ? 'despesa' : 'despesas'} no mês
            </span>
            <button
              onClick={openCreateCategory}
              className="h-9 flex items-center gap-1.5 px-3.5 bg-primary hover:opacity-90 text-canvas text-xs font-medium rounded-lg transition-opacity"
            >
              <Plus className="w-4 h-4 stroke-[1.75]" />
              <span>Nova categoria</span>
            </button>
          </div>
        </div>

        {expenseCategoriesWithBudget.length === 0 ? (
          <div className="p-8 bg-canvas border border-subtle rounded-xl text-center space-y-2">
            <p className="text-xs text-muted">Nenhuma categoria de despesa cadastrada.</p>
            <button
              onClick={openCreateCategory}
              className="text-xs text-[#10B981] font-medium hover:underline"
            >
              Adicionar primeira categoria com teto
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
            {expenseCategoriesWithBudget.map(cat => {
              const hasLimit = cat.limit > 0;
              const isCritical = hasLimit && cat.percentUsed >= 90;
              const isWarning = hasLimit && cat.percentUsed >= 75 && !isCritical;

              return (
                <div
                  key={cat.id}
                  className="p-4 bg-canvas border border-subtle rounded-xl space-y-2.5"
                >
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className="w-2 h-2 rounded-full shrink-0"
                        style={{ backgroundColor: cat.color || '#10B981' }}
                      />
                      <span className="font-medium text-primary truncate">{cat.name}</span>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {hasLimit ? (
                        <span
                          className={`font-mono font-medium tabular-nums ${
                            isCritical ? 'text-[#EF4444]' : isWarning ? 'text-[#D97706]' : 'text-secondary'
                          }`}
                        >
                          {cat.percentUsed}%
                        </span>
                      ) : (
                        <span className="text-[11px] font-mono text-muted">Sem teto</span>
                      )}
                      <button
                        onClick={() => openEditCategory(cat)}
                        className="p-1 rounded text-muted hover:text-primary transition-colors"
                        title="Editar categoria e teto"
                      >
                        <Pencil className="w-3.5 h-3.5 stroke-[1.5]" />
                      </button>
                      <button
                        onClick={() => handleDeleteCategory(cat)}
                        className="p-1 rounded text-muted hover:text-[#EF4444] transition-colors"
                        title="Excluir categoria"
                      >
                        <Trash2 className="w-3.5 h-3.5 stroke-[1.5]" />
                      </button>
                    </div>
                  </div>

                  <div className="w-full bg-raised h-1.5 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${
                        !hasLimit
                          ? 'bg-muted/40'
                          : isCritical
                          ? 'bg-[#EF4444]'
                          : isWarning
                          ? 'bg-[#D97706]'
                          : 'bg-[#10B981]'
                      }`}
                      style={{ width: `${hasLimit ? Math.min(100, cat.percentUsed) : 0}%` }}
                    />
                  </div>

                  <div className="flex justify-between items-center text-[11px] text-muted font-mono tabular-nums">
                    <span>Utilizado: {formatMoney(cat.spent)}</span>
                    <span>{hasLimit ? `Limite: ${formatMoney(cat.limit)}` : 'Definir teto mensal'}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* MODAL: CREATE / EDIT CATEGORY & BUDGET CEILING */}
      {showCatModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
          <div className="w-full max-w-md bg-surface border border-subtle rounded-2xl p-6 space-y-4 relative">
            <button
              onClick={() => {
                setShowCatModal(false);
                setEditingCat(null);
              }}
              className="absolute top-5 right-5 text-muted hover:text-primary"
            >
              <X className="w-4 h-4 stroke-[1.5]" />
            </button>
            <h3 className="text-[15px] font-medium text-primary">
              {editingCat ? 'Editar teto orçamentário' : 'Nova categoria de despesa'}
            </h3>

            <form onSubmit={handleSaveCategory} className="space-y-4">
              <div>
                <label className="block text-xs text-secondary mb-1.5">Nome da categoria</label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Alimentação, Moradia, Lazer"
                  value={catName}
                  onChange={e => setCatName(e.target.value)}
                  className="w-full h-10 bg-canvas border border-subtle focus:border-[#10B981] rounded-lg px-3 text-xs text-primary outline-none"
                />
              </div>

              <div>
                <label className="block text-xs text-secondary mb-1.5">Teto mensal (R$)</label>
                <input
                  type="number"
                  step="0.01"
                  required
                  placeholder="1500,00"
                  value={catLimit}
                  onChange={e => setCatLimit(e.target.value)}
                  className="w-full h-10 bg-canvas border border-subtle focus:border-[#10B981] rounded-lg px-3 text-xs font-mono font-medium text-primary outline-none tabular-nums"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-subtle">
                <button
                  type="button"
                  onClick={() => {
                    setShowCatModal(false);
                    setEditingCat(null);
                  }}
                  className="h-9 px-3 text-xs text-secondary hover:text-primary"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="h-9 px-4 bg-primary hover:opacity-90 text-canvas font-medium text-xs rounded-lg transition-opacity"
                >
                  {editingCat ? 'Salvar alterações' : 'Criar categoria'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
