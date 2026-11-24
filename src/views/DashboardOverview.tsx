import React, { useState } from 'react';
import {
  ChevronRight,
  Clock,
  Plus,
  Building2
} from 'lucide-react';
import {
  BankAccount,
  CreditCard as CreditCardType,
  Transaction,
  Goal,
  Category,
  User,
  GamificationProfile,
  WorkspaceType
} from '../types';
import { FirestoreService, calculateBusinessDRE } from '../services/firestoreService';

interface DashboardOverviewProps {
  user: User;
  activeWorkspaceId?: string;
  workspaceType?: WorkspaceType;
  accounts: BankAccount[];
  cards: CreditCardType[];
  transactions: Transaction[];
  categories: Category[];
  goals: Goal[];
  gamification: GamificationProfile;
  onNavigateTab: (tab: string) => void;
  onOpenNewTransaction: () => void;
  onRefreshData: () => void;
}

export const DashboardOverview: React.FC<DashboardOverviewProps> = ({
  user,
  workspaceType = 'INDIVIDUAL',
  accounts,
  cards,
  transactions,
  categories,
  goals,
  gamification,
  onNavigateTab,
  onOpenNewTransaction,
  onRefreshData
}) => {
  const isBusiness = workspaceType === 'BUSINESS';
  const formatMoney = (val: number) => {
    if (user.privacy_mode) return '••••••';
    return `R$ ${val.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const now = new Date();
  const currentMonthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const [selectedDreMonth, setSelectedDreMonth] = useState<string>(currentMonthStr);
  const monthName = now.toLocaleString('pt-BR', { month: 'long' });
  const capitalizedMonth = monthName.charAt(0).toUpperCase() + monthName.slice(1);

  // Previous month for comparison
  const prevDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const prevMonthStr = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, '0')}`;
  const prevMonthTxs = transactions.filter(t => t.date.startsWith(prevMonthStr));
  const prevExpense = prevMonthTxs.filter(t => t.type === 'EXPENSE').reduce((acc, t) => acc + t.amount, 0);

  // Current month calculations
  const currentMonthTxs = transactions.filter(t => t.date.startsWith(currentMonthStr));
  const totalIncome = currentMonthTxs.filter(t => t.type === 'INCOME').reduce((acc, t) => acc + t.amount, 0);
  const totalExpense = currentMonthTxs.filter(t => t.type === 'EXPENSE').reduce((acc, t) => acc + t.amount, 0);
  const netBalance = totalIncome - totalExpense;

  const totalBankBalance = accounts.reduce((acc, a) => acc + a.current_balance, 0);
  const totalLimit = cards.reduce((acc, c) => acc + c.total_limit, 0);
  const totalAvailableLimit = cards.reduce((acc, c) => acc + c.available_limit, 0);
  const totalUsedLimit = Math.max(0, totalLimit - totalAvailableLimit);

  // Daily safe spend forecast
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const daysRemaining = Math.max(1, daysInMonth - now.getDate());
  const pendingIncome = currentMonthTxs.filter(t => t.type === 'INCOME' && t.status === 'PENDING').reduce((a, b) => a + b.amount, 0);
  const pendingBills = currentMonthTxs.filter(t => t.type === 'EXPENSE' && t.status === 'PENDING').reduce((a, b) => a + b.amount, 0);
  const dailySafeSpend = Math.max(0, (totalBankBalance + pendingIncome - pendingBills) / daysRemaining);

  // Expense change vs previous month
  const expenseDiffPct = prevExpense > 0
    ? Math.round(((totalExpense - prevExpense) / prevExpense) * 100)
    : null;

  // Build 6-month cash flow series for main chart
  const monthShortNames = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
  const monthlySeries = Array.from({ length: 6 }).map((_, idx) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (5 - idx), 1);
    const prefix = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const mTxs = transactions.filter(t => t.date.startsWith(prefix));
    const inc = mTxs.filter(t => t.type === 'INCOME').reduce((a, b) => a + b.amount, 0);
    const exp = mTxs.filter(t => t.type === 'EXPENSE').reduce((a, b) => a + b.amount, 0);
    return {
      key: prefix,
      label: monthShortNames[d.getMonth()],
      isCurrent: idx === 5,
      income: inc,
      expense: exp
    };
  });

  const maxChartVal = Math.max(
    1000,
    ...monthlySeries.map(m => Math.max(m.income, m.expense))
  );

  // Ranked category spending breakdown for current month
  const categoryBreakdown = categories
    .filter(c => c.type === 'EXPENSE')
    .map(cat => {
      const amount = currentMonthTxs
        .filter(t => t.type === 'EXPENSE' && t.category_id === cat.id)
        .reduce((a, b) => a + b.amount, 0);
      return {
        id: cat.id,
        name: cat.name,
        amount,
        share: totalExpense > 0 ? Math.round((amount / totalExpense) * 100) : 0
      };
    })
    .filter(c => c.amount > 0)
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 4);

  const upcomingBills = transactions
    .filter(t => t.type === 'EXPENSE' && t.status === 'PENDING')
    .slice(0, 4);

  const recentTxs = transactions.slice(0, 7);

  const handlePayTransaction = async (id: string) => {
    await FirestoreService.updateTransactionStatus(user.id, id, 'PAID');
    onRefreshData();
  };

  const savingsRatePct = totalIncome > 0 ? Math.round((netBalance / totalIncome) * 100) : 0;

  // Business Managerial Income Statement (DRE Gerencial Mensal) — only computed/displayed in BUSINESS workspace
  const dre = isBusiness ? calculateBusinessDRE(transactions, categories, selectedDreMonth) : null;
  const dreMonthOptions = monthlySeries.slice().reverse();

  return (
    <div className="space-y-6 min-w-0">
      {/* Row 1: 4 Pure Typographic Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <div className="bg-surface border border-subtle rounded-xl p-4 sm:p-5 flex flex-col justify-between min-h-[108px] min-w-0">
          <span className="text-xs text-secondary truncate">
            {isBusiness ? 'Caixa consolidado PJ' : 'Patrimônio em contas'}
          </span>
          <div className="mt-2">
            <div className="text-2xl sm:text-[28px] leading-none font-medium font-mono text-primary tabular-nums tracking-tight truncate">
              {formatMoney(totalBankBalance)}
            </div>
            <p className="text-xs text-muted mt-2 truncate">
              {accounts.length} {accounts.length === 1 ? 'conta ativa' : 'contas ativas'}
            </p>
          </div>
        </div>

        <div className="bg-surface border border-subtle rounded-xl p-4 sm:p-5 flex flex-col justify-between min-h-[108px] min-w-0">
          <span className="text-xs text-secondary truncate">
            {isBusiness ? `Faturamento bruto (${capitalizedMonth.toLowerCase()})` : `Receitas em ${capitalizedMonth.toLowerCase()}`}
          </span>
          <div className="mt-2">
            <div className="text-2xl sm:text-[28px] leading-none font-medium font-mono text-primary tabular-nums tracking-tight truncate">
              {formatMoney(totalIncome)}
            </div>
            <p className="text-xs text-[#10B981] mt-2 truncate">
              {totalIncome > 0
                ? isBusiness
                  ? `Margem operacional de ${savingsRatePct}%`
                  : `Taxa de poupança de ${savingsRatePct}%`
                : 'Sem entradas no período'}
            </p>
          </div>
        </div>

        <div className="bg-surface border border-subtle rounded-xl p-4 sm:p-5 flex flex-col justify-between min-h-[108px] min-w-0">
          <span className="text-xs text-secondary truncate">
            {isBusiness ? `Custos e despesas (${capitalizedMonth.toLowerCase()})` : `Despesas em ${capitalizedMonth.toLowerCase()}`}
          </span>
          <div className="mt-2">
            <div className="text-2xl sm:text-[28px] leading-none font-medium font-mono text-primary tabular-nums tracking-tight truncate">
              {formatMoney(totalExpense)}
            </div>
            <p className="text-xs text-muted mt-2 truncate">
              {expenseDiffPct !== null
                ? `${expenseDiffPct > 0 ? `+${expenseDiffPct}%` : `${expenseDiffPct}%`} vs mês anterior`
                : `${currentMonthTxs.filter(t => t.type === 'EXPENSE').length} lançamentos no mês`}
            </p>
          </div>
        </div>

        <div className="bg-surface border border-subtle rounded-xl p-4 sm:p-5 flex flex-col justify-between min-h-[108px] min-w-0">
          <span className="text-xs text-secondary truncate">
            {isBusiness ? `Resultado líquido (${capitalizedMonth.toLowerCase()})` : 'Margem diária segura'}
          </span>
          <div className="mt-2">
            <div
              className={`text-2xl sm:text-[28px] leading-none font-medium font-mono tabular-nums tracking-tight truncate ${
                isBusiness ? (netBalance >= 0 ? 'text-[#10B981]' : 'text-[#EF4444]') : 'text-[#10B981]'
              }`}
            >
              {formatMoney(isBusiness ? netBalance : dailySafeSpend)}
            </div>
            <p className="text-xs text-muted mt-2 truncate">
              {isBusiness
                ? `Margem líquida: ${savingsRatePct}% sobre faturamento`
                : `Pelos próximos ${daysRemaining} ${daysRemaining === 1 ? 'dia' : 'dias'}`}
            </p>
          </div>
        </div>
      </div>

      {/* BUSINESS-ONLY SECTION: DRE Gerencial Mensal */}
      {isBusiness && dre && (
        <div className="bg-surface border border-subtle rounded-xl p-4 sm:p-6 space-y-4 min-w-0">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-subtle">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-lg bg-raised border border-subtle flex items-center justify-center text-[#10B981] shrink-0">
                <Building2 className="w-4 h-4 stroke-[1.5]" />
              </div>
              <div className="min-w-0">
                <h2 className="text-[15px] font-medium text-primary truncate">
                  DRE Gerencial Mensal (Empresarial PJ)
                </h2>
                <p className="text-xs text-muted truncate">
                  Demonstrativo de resultado calculado sobre receitas, tributos e despesas operacionais PJ
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <select
                value={selectedDreMonth}
                onChange={e => setSelectedDreMonth(e.target.value)}
                className="h-8 bg-canvas border border-subtle rounded-lg px-2.5 text-xs font-mono text-primary outline-none"
              >
                {dreMonthOptions.map(m => (
                  <option key={m.key} value={m.key}>
                    {m.label} / {m.key.split('-')[0]}
                  </option>
                ))}
              </select>
              <span
                className={`text-xs font-mono px-2.5 py-1 rounded-md border tabular-nums ${
                  dre.netResult >= 0
                    ? 'bg-[#10B981]/10 text-[#10B981] border-[#10B981]/25'
                    : 'bg-[#EF4444]/10 text-[#EF4444] border-[#EF4444]/25'
                }`}
              >
                Margem {dre.netMarginPct.toFixed(1)}%
              </span>
            </div>
          </div>

          <div className="divide-y divide-subtle bg-canvas border border-subtle rounded-xl px-4 text-xs">
            <div className="py-3 flex items-center justify-between gap-2">
              <span className="font-medium text-primary">(+) Receita Operacional Bruta</span>
              <span className="font-mono font-medium text-[#10B981] tabular-nums">
                {formatMoney(dre.grossRevenue)}
              </span>
            </div>
            <div className="py-3 flex items-center justify-between gap-2">
              <span className="text-secondary">(-) Deduções e Impostos sobre Receita</span>
              <span className="font-mono text-[#EF4444] tabular-nums">
                -{formatMoney(dre.taxesAndDeductions)}
              </span>
            </div>
            <div className="py-3 flex items-center justify-between gap-2 bg-raised/40 -mx-4 px-4">
              <span className="font-medium text-primary">(=) Receita Operacional Líquida</span>
              <span className="font-mono font-medium text-primary tabular-nums">
                {formatMoney(dre.netRevenue)}
              </span>
            </div>
            <div className="py-3 flex items-center justify-between gap-2">
              <span className="text-secondary">(-) Custos e Despesas Operacionais</span>
              <span className="font-mono text-primary tabular-nums">
                -{formatMoney(dre.operatingExpenses)}
              </span>
            </div>
            <div className="py-3.5 flex items-center justify-between gap-2">
              <span className="text-sm font-medium text-primary">
                (=) Resultado Líquido do Período
              </span>
              <span
                className={`text-sm font-mono font-semibold tabular-nums ${
                  dre.netResult >= 0 ? 'text-[#10B981]' : 'text-[#EF4444]'
                }`}
              >
                {dre.netResult >= 0 ? '+' : ''}
                {formatMoney(dre.netResult)}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Row 2: Main Layout (2/3 Main Chart & Ledger + 1/3 Cards, Deadlines & Score) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 min-w-0">
        {/* Left Column (2 spans): Primary Visual Moment (Cash Flow Chart) + Recent Transactions */}
        <div className="lg:col-span-2 space-y-6 min-w-0">
          {/* Primary Chart Moment: Fluxo de Caixa Semestral & Alocação */}
          <div className="bg-surface border border-subtle rounded-xl p-4 sm:p-6 space-y-6 min-w-0">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="min-w-0">
                <h2 className="text-[15px] font-medium text-primary">
                  Fluxo de caixa semestral
                </h2>
                <p className="text-xs text-muted mt-0.5">
                  Comparativo entre entradas e saídas nos últimos 6 meses
                </p>
              </div>
              <div className="flex items-center gap-4 text-xs text-secondary shrink-0">
                <span className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-sm bg-[#10B981]" />
                  <span>Receitas</span>
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-sm bg-muted/60" />
                  <span>Despesas</span>
                </span>
              </div>
            </div>

            {/* Bar Chart on Muted Hairline Grid */}
            <div className="relative h-52 sm:h-56 pt-4 pb-6 px-1 sm:px-2 border-b border-subtle">
              {/* Horizontal reference grid lines */}
              <div className="absolute inset-x-0 top-4 bottom-8 flex flex-col justify-between pointer-events-none">
                {[1, 0.5, 0].map((ratio, i) => (
                  <div key={i} className="w-full border-t border-dashed border-subtle flex justify-end">
                    <span className="text-[10px] font-mono text-muted -mt-4 bg-surface pl-1">
                      {user.privacy_mode ? '•••' : `R$ ${Math.round((maxChartVal * ratio) / 1000)}k`}
                    </span>
                  </div>
                ))}
              </div>

              {/* Bars */}
              <div className="relative z-10 h-full flex items-end justify-between gap-2 sm:gap-4 pr-8 sm:pr-12">
                {monthlySeries.map(item => {
                  const incHeight = Math.max(4, Math.round((item.income / maxChartVal) * 100));
                  const expHeight = Math.max(4, Math.round((item.expense / maxChartVal) * 100));
                  return (
                    <div key={item.key} className="flex-1 flex flex-col items-center h-full justify-end min-w-0">
                      <div className="w-full max-w-[44px] flex items-end justify-center gap-1 sm:gap-1.5 h-[85%]">
                        <div
                          className={`flex-1 rounded-t transition-colors ${
                            item.isCurrent ? 'bg-[#10B981]' : 'bg-[#10B981]/45'
                          }`}
                          style={{ height: `${item.income > 0 ? incHeight : 3}%` }}
                          title={`Receitas ${item.label}: ${formatMoney(item.income)}`}
                        />
                        <div
                          className={`flex-1 rounded-t transition-colors ${
                            item.isCurrent ? 'bg-secondary' : 'bg-muted/35'
                          }`}
                          style={{ height: `${item.expense > 0 ? expHeight : 3}%` }}
                          title={`Despesas ${item.label}: ${formatMoney(item.expense)}`}
                        />
                      </div>
                      <span
                        className={`text-[10px] sm:text-[11px] font-mono mt-2 truncate ${
                          item.isCurrent ? 'text-primary font-medium' : 'text-muted'
                        }`}
                      >
                        {item.label}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Ranked Category Allocation List */}
            {categoryBreakdown.length > 0 && (
              <div className="space-y-3 pt-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-secondary">Concentração de despesas no mês</span>
                  <button
                    onClick={() => onNavigateTab('planning')}
                    className="text-xs text-secondary hover:text-primary transition-colors"
                  >
                    Ver orçamento
                  </button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2.5">
                  {categoryBreakdown.map((cat, idx) => (
                    <div key={cat.id} className="space-y-1 min-w-0">
                      <div className="flex items-center justify-between gap-2 text-xs">
                        <span className="text-primary truncate">{cat.name}</span>
                        <span className="font-mono text-secondary tabular-nums shrink-0">
                          {formatMoney(cat.amount)} <span className="text-muted">({cat.share}%)</span>
                        </span>
                      </div>
                      <div className="w-full h-1.5 bg-canvas rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full ${idx === 0 ? 'bg-[#10B981]' : 'bg-muted/50'}`}
                          style={{ width: `${Math.max(4, cat.share)}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Recent Transactions Ledger (Mobile-safe flex layout without rigid w-28 collision) */}
          <div className="bg-surface border border-subtle rounded-xl p-4 sm:p-6 min-w-0">
            <div className="flex items-center justify-between gap-2 mb-4">
              <div className="min-w-0">
                <h3 className="text-[15px] font-medium text-primary truncate">Lançamentos recentes</h3>
                <p className="text-xs text-muted mt-0.5 truncate">Últimas movimentações registradas</p>
              </div>
              <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
                <button
                  onClick={() => onNavigateTab('transactions')}
                  className="h-8 px-2.5 sm:px-3 text-xs text-secondary hover:text-primary transition-colors"
                >
                  Extrato
                </button>
                <button
                  onClick={onOpenNewTransaction}
                  className="h-8 px-2.5 sm:px-3 bg-raised hover:bg-surface-hover border border-subtle text-xs font-medium text-primary rounded-lg transition-colors flex items-center gap-1.5"
                >
                  <Plus className="w-3.5 h-3.5 stroke-[1.5]" />
                  <span>Novo</span>
                </button>
              </div>
            </div>

            <div className="divide-y divide-subtle">
              {recentTxs.length === 0 ? (
                <div className="py-8 text-center text-muted text-xs">
                  <p>Nenhuma movimentação registrada até o momento</p>
                  <button
                    onClick={onOpenNewTransaction}
                    className="mt-2 text-[#10B981] hover:underline font-medium"
                  >
                    Registrar primeiro lançamento
                  </button>
                </div>
              ) : (
                recentTxs.map(tx => {
                  const cat = categories.find(c => c.id === tx.category_id);
                  const origAcc = accounts.find(a => a.id === tx.account_id);
                  const destAcc = accounts.find(a => a.id === tx.destination_account_id);
                  const categoryOrTransferLabel =
                    tx.type === 'TRANSFER'
                      ? `${origAcc?.name || 'Origem'} → ${destAcc?.name || 'Destino'}`
                      : cat?.name || 'Geral';

                  return (
                    <div key={tx.id} className="min-h-[48px] py-2 flex items-center justify-between gap-3 min-w-0">
                      <div className="flex items-center gap-2.5 min-w-0 flex-1">
                        <span
                          className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                            tx.type === 'INCOME'
                              ? 'bg-[#10B981]'
                              : tx.type === 'TRANSFER'
                              ? 'bg-[#C5A059]'
                              : 'bg-muted'
                          }`}
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <p className="text-[13px] font-normal text-primary truncate">{tx.description}</p>
                            {tx.installment_total && (
                              <span className="text-[11px] font-mono text-muted shrink-0">
                                {tx.installment_current || 1}/{tx.installment_total}
                              </span>
                            )}
                            {tx.source === 'WHATSAPP' && (
                              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-raised text-secondary border border-subtle shrink-0">
                                WA
                              </span>
                            )}
                          </div>
                          <p className="sm:hidden text-[11px] text-muted truncate mt-0.5">
                            {categoryOrTransferLabel} • {tx.date.split('-').reverse().slice(0, 2).join('/')}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-3 sm:gap-5 shrink-0">
                        <span className="hidden sm:inline-block text-xs text-muted truncate max-w-[150px]">
                          {categoryOrTransferLabel}
                        </span>
                        <span className="hidden md:inline-block text-xs font-mono text-muted w-14 text-right">
                          {tx.date.split('-').reverse().slice(0, 2).join('/')}
                        </span>
                        <span
                          className={`text-xs sm:text-[13px] font-mono font-medium tabular-nums text-right shrink-0 ${
                            tx.type === 'INCOME'
                              ? 'text-[#10B981]'
                              : tx.type === 'TRANSFER'
                              ? 'text-secondary'
                              : 'text-primary'
                          }`}
                        >
                          {tx.type === 'INCOME' ? '+' : tx.type === 'EXPENSE' ? '-' : '⇄ '}
                          {formatMoney(tx.amount)}
                        </span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* Right Column (1 span): Deadlines, Credit Cards, Financial Health & Goals */}
        <div className="space-y-6 min-w-0">
          {/* Upcoming Bills */}
          <div className="bg-surface border border-subtle rounded-xl p-4 sm:p-5 min-w-0">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-medium text-primary">Próximos vencimentos</h3>
              <button
                onClick={() => onNavigateTab('transactions')}
                className="text-xs text-secondary hover:text-primary flex items-center gap-1 transition-colors"
              >
                <span>Agenda</span>
                <ChevronRight className="w-3.5 h-3.5 stroke-[1.5]" />
              </button>
            </div>

            <div className="divide-y divide-subtle">
              {upcomingBills.length === 0 ? (
                <div className="py-6 text-center text-muted text-xs">
                  Nenhuma conta pendente
                </div>
              ) : (
                upcomingBills.map(bill => (
                  <div key={bill.id} className="py-2.5 flex items-center justify-between gap-2 min-w-0">
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium text-primary truncate">{bill.description}</p>
                      <p className="text-[11px] font-mono text-muted flex items-center gap-1 mt-0.5">
                        <Clock className="w-3 h-3 stroke-[1.5]" />
                        <span>{bill.date.split('-').reverse().join('/')}</span>
                      </p>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <span className="font-mono text-xs text-primary tabular-nums">
                        {formatMoney(bill.amount)}
                      </span>
                      <button
                        onClick={() => handlePayTransaction(bill.id)}
                        className="h-7 px-2.5 bg-raised hover:bg-surface-hover border border-subtle text-[11px] font-medium text-[#10B981] rounded-md transition-colors"
                      >
                        Baixar
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Credit Cards Consolidated */}
          <div className="bg-surface border border-subtle rounded-xl p-4 sm:p-5 min-w-0">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-medium text-primary">Cartões de crédito</h3>
              <button
                onClick={() => onNavigateTab('accounts')}
                className="text-xs text-secondary hover:text-primary transition-colors"
              >
                Gerenciar
              </button>
            </div>

            {cards.length === 0 ? (
              <div className="p-4 bg-canvas border border-subtle rounded-lg text-center text-xs text-muted">
                <p>Nenhum cartão cadastrado</p>
                <button
                  onClick={() => onNavigateTab('accounts')}
                  className="mt-1.5 text-[#10B981] font-medium hover:underline"
                >
                  Adicionar cartão
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="p-3.5 bg-canvas border border-subtle rounded-lg space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-secondary">Limite disponível</span>
                    <span className="font-mono font-medium text-primary tabular-nums">
                      {formatMoney(totalAvailableLimit)}
                    </span>
                  </div>
                  <div className="w-full bg-raised h-1.5 rounded-full overflow-hidden">
                    <div
                      className="bg-[#C5A059] h-full rounded-full"
                      style={{ width: `${totalLimit > 0 ? Math.min(100, (totalUsedLimit / totalLimit) * 100) : 0}%` }}
                    />
                  </div>
                  <div className="flex items-center justify-between gap-2 text-[11px] font-mono text-muted">
                    <span className="truncate">Em uso: {formatMoney(totalUsedLimit)}</span>
                    <span className="truncate">Total: {formatMoney(totalLimit)}</span>
                  </div>
                </div>

                <div className="space-y-2">
                  {cards.map(card => (
                    <div
                      key={card.id}
                      className="px-3 py-2.5 bg-raised border border-subtle rounded-lg flex items-center justify-between gap-2 text-xs"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-primary truncate">{card.name}</p>
                        <p className="text-[11px] font-mono text-muted mt-0.5">
                          FECH {String(card.closing_day).padStart(2, '0')} • VENC {String(card.due_day).padStart(2, '0')}
                        </p>
                      </div>
                      <div className="text-right font-mono tabular-nums shrink-0">
                        <p className="font-medium text-primary">{formatMoney(card.available_limit)}</p>
                        <p className="text-[11px] text-muted">disponível</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Financial Health Score Widget */}
          <div className="bg-surface border border-subtle rounded-xl p-4 sm:p-5 min-w-0">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-medium text-primary">Índice de saúde financeira</h3>
              <span className="text-xs font-mono text-[#10B981]">
                {gamification.financial_health_score || 700}/1000
              </span>
            </div>

            <div className="space-y-2 pt-1 text-xs">
              <div className="flex justify-between text-secondary">
                <span>Taxa de poupança</span>
                <span className="font-mono text-primary tabular-nums">
                  {gamification.score_factors?.savings_rate ?? 175} / 250
                </span>
              </div>
              <div className="flex justify-between text-secondary">
                <span>Pontualidade de contas</span>
                <span className="font-mono text-primary tabular-nums">
                  {gamification.score_factors?.bill_punctuality ?? 175} / 250
                </span>
              </div>
              <div className="flex justify-between text-secondary">
                <span>Uso de limite de crédito</span>
                <span className="font-mono text-primary tabular-nums">
                  {gamification.score_factors?.credit_utilization ?? 175} / 250
                </span>
              </div>
              <div className="flex justify-between text-secondary">
                <span>Reserva de emergência</span>
                <span className="font-mono text-primary tabular-nums">
                  {gamification.score_factors?.emergency_fund ?? 175} / 250
                </span>
              </div>
            </div>
          </div>

          {/* Active Goals Mini */}
          {goals.length > 0 && (
            <div className="bg-surface border border-subtle rounded-xl p-4 sm:p-5 min-w-0">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-medium text-primary">Metas ativas</h3>
                <button
                  onClick={() => onNavigateTab('goals')}
                  className="text-xs text-secondary hover:text-primary transition-colors"
                >
                  Ver todas ({goals.length})
                </button>
              </div>

              <div className="space-y-3">
                {goals.slice(0, 2).map(goal => {
                  const pct = Math.min(100, Math.round((goal.current_amount / goal.target_amount) * 100));
                  return (
                    <div key={goal.id} className="p-3 bg-canvas border border-subtle rounded-lg space-y-2">
                      <div className="flex items-center justify-between text-xs gap-2">
                        <span className="font-medium text-primary truncate">{goal.title}</span>
                        <span className="font-mono text-[#10B981] tabular-nums shrink-0">{pct}%</span>
                      </div>
                      <div className="w-full bg-raised h-1.5 rounded-full overflow-hidden">
                        <div
                          className="bg-[#10B981] h-full rounded-full"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <div className="flex justify-between text-[11px] text-muted font-mono tabular-nums">
                        <span>{formatMoney(goal.current_amount)}</span>
                        <span>Alvo: {formatMoney(goal.target_amount)}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
