import React, { useState, useMemo } from 'react';
import {
  TrendingUp,
  Home,
  Landmark,
  Plus,
  Pencil,
  Trash2,
  CheckCircle2,
  X,
  Info
} from 'lucide-react';
import {
  AssetKind,
  BankAccount,
  Category,
  CreditCard,
  CreditCardInvoice,
  InvestmentCategory,
  PatrimonyAsset,
  PropertyCategory,
  SubscriptionAndLoan,
  Transaction,
  User,
  WorkspaceType
} from '../types';
import {
  FirestoreService,
  roundMoney,
  computeCardInvoiceCycle
} from '../services/firestoreService';
import { useFeedback } from '../contexts/FeedbackContext';

interface PatrimonyViewProps {
  user: User;
  activeWorkspaceId?: string;
  workspaceType?: WorkspaceType;
  accounts: BankAccount[];
  cards: CreditCard[];
  invoices: CreditCardInvoice[];
  transactions: Transaction[];
  categories: Category[];
  assets: PatrimonyAsset[];
  subscriptions: SubscriptionAndLoan[];
  onRefreshData: () => void;
}

const INVESTMENT_CATEGORY_LABELS: Record<InvestmentCategory, string> = {
  CDB: 'CDB / Renda Fixa',
  TESOURO: 'Tesouro Direto',
  ACOES: 'Ações',
  FII: 'Fundos Imobiliários (FII)',
  FUNDOS: 'Fundos de Investimento',
  CRIPTO: 'Criptoativos',
  OUTROS: 'Outros Investimentos'
};

const PROPERTY_CATEGORY_LABELS: Record<PropertyCategory, string> = {
  IMOVEL: 'Imóvel',
  VEICULO: 'Veículo',
  OUTROS: 'Outro Bem'
};

export const PatrimonyView: React.FC<PatrimonyViewProps> = ({
  user,
  activeWorkspaceId = 'ws_personal',
  workspaceType = 'INDIVIDUAL',
  accounts,
  cards,
  invoices,
  transactions,
  categories,
  assets,
  subscriptions,
  onRefreshData
}) => {
  const { confirm, showToast } = useFeedback();
  const isBusiness = workspaceType === 'BUSINESS';

  // Asset Modal State (Investments & Properties)
  const [showAssetModal, setShowAssetModal] = useState(false);
  const [editingAsset, setEditingAsset] = useState<PatrimonyAsset | null>(null);
  const [assetKind, setAssetKind] = useState<AssetKind>('INVESTMENT');
  const [assetCategory, setAssetCategory] = useState<InvestmentCategory | PropertyCategory>('CDB');
  const [assetName, setAssetName] = useState('');
  const [assetInstitution, setAssetInstitution] = useState('');
  const [assetInvested, setAssetInvested] = useState('');
  const [assetCurrentVal, setAssetCurrentVal] = useState('');
  const [assetQty, setAssetQty] = useState('');
  const [assetDate, setAssetDate] = useState(new Date().toISOString().slice(0, 10));
  const [assetYield, setAssetYield] = useState('');
  const [assetNotes, setAssetNotes] = useState('');
  const [assetSaving, setAssetSaving] = useState(false);

  // Debt / Loan Modal State
  const [showLoanModal, setShowLoanModal] = useState(false);
  const [editingLoan, setEditingLoan] = useState<SubscriptionAndLoan | null>(null);
  const [loanName, setLoanName] = useState('');
  const [loanCreditor, setLoanCreditor] = useState('');
  const [loanInitialDebt, setLoanInitialDebt] = useState('');
  const [loanTotalDebt, setLoanTotalDebt] = useState('');
  const [loanInstallmentAmt, setLoanInstallmentAmt] = useState('');
  const [loanInterestRate, setLoanInterestRate] = useState('');
  const [loanInterestPeriod, setLoanInterestPeriod] = useState<'MONTHLY' | 'YEARLY'>('MONTHLY');
  const [loanTotalInst, setLoanTotalInst] = useState('12');
  const [loanPaidInst, setLoanPaidInst] = useState('0');
  const [loanNotes, setLoanNotes] = useState('');
  const [loanSaving, setLoanSaving] = useState(false);

  // Pay Loan Installment Modal State
  const [payingLoan, setPayingLoan] = useState<SubscriptionAndLoan | null>(null);
  const [payLoanAmt, setPayLoanAmt] = useState('');
  const [payLoanAccountId, setPayLoanAccountId] = useState('');
  const [payLoanDate, setPayLoanDate] = useState(new Date().toISOString().slice(0, 10));
  const [payLoanLoading, setPayLoanLoading] = useState(false);

  const formatMoney = (val: number) => {
    if (user.privacy_mode) return '••••••';
    return `R$ ${val.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  // --- NET WORTH CALCULATIONS (Ativos, Passivos, Patrimônio Líquido) ---
  const investments = useMemo(() => assets.filter(a => a.kind === 'INVESTMENT'), [assets]);
  const properties = useMemo(() => assets.filter(a => a.kind === 'PROPERTY'), [assets]);
  const loans = useMemo(() => subscriptions.filter(s => s.type === 'LOAN'), [subscriptions]);

  const totalAccountsBalance = useMemo(
    () => roundMoney(accounts.reduce((sum, a) => sum + (a.current_balance || 0), 0)),
    [accounts]
  );
  const totalInvestmentsValue = useMemo(
    () => roundMoney(investments.reduce((sum, i) => sum + (i.current_value || 0), 0)),
    [investments]
  );
  const totalPropertiesValue = useMemo(
    () => roundMoney(properties.reduce((sum, p) => sum + (p.current_value || 0), 0)),
    [properties]
  );
  const totalAssets = roundMoney(totalAccountsBalance + totalInvestmentsValue + totalPropertiesValue);

  const totalDebtsBalance = useMemo(
    () => roundMoney(loans.reduce((sum, l) => sum + Math.max(0, l.total_debt || 0), 0)),
    [loans]
  );

  // Open/unpaid credit card invoices (reconciled from persisted invoices + pending card purchases)
  const totalOpenCardInvoices = useMemo(() => {
    const paidInvIds = new Set(invoices.filter(inv => inv.status === 'PAID').map(inv => inv.id));
    const cardMap = new Map(cards.map(c => [c.id, c]));
    let unpaidSum = 0;

    // Sum unpaid card transactions (each purchase/installment whose invoice is not PAID)
    const unpaidTxInvoices = new Set<string>();
    for (const tx of transactions) {
      if (tx.card_id && tx.type === 'EXPENSE' && tx.status !== 'PAID') {
        const card = cardMap.get(tx.card_id);
        const invId = tx.invoice_id || (card ? computeCardInvoiceCycle(tx.date, card).invoiceId : '');
        if (!invId || !paidInvIds.has(invId)) {
          unpaidSum = roundMoney(unpaidSum + tx.amount);
          if (invId) unpaidTxInvoices.add(invId);
        }
      }
    }

    // Include any persisted unpaid invoice that didn't have matching transactions
    for (const inv of invoices) {
      if (inv.status !== 'PAID' && !unpaidTxInvoices.has(inv.id)) {
        unpaidSum = roundMoney(unpaidSum + (inv.total_amount || 0));
      }
    }

    return roundMoney(unpaidSum);
  }, [cards, invoices, transactions]);

  const totalLiabilities = roundMoney(totalDebtsBalance + totalOpenCardInvoices);
  const netWorth = roundMoney(totalAssets - totalLiabilities);

  // --- ASSET HANDLERS ---
  const openCreateAsset = (kind: AssetKind) => {
    setEditingAsset(null);
    setAssetKind(kind);
    setAssetCategory(kind === 'INVESTMENT' ? 'CDB' : 'IMOVEL');
    setAssetName('');
    setAssetInstitution('');
    setAssetInvested('');
    setAssetCurrentVal('');
    setAssetQty('');
    setAssetDate(new Date().toISOString().slice(0, 10));
    setAssetYield('');
    setAssetNotes('');
    setShowAssetModal(true);
  };

  const openEditAsset = (asset: PatrimonyAsset) => {
    setEditingAsset(asset);
    setAssetKind(asset.kind);
    setAssetCategory(asset.category);
    setAssetName(asset.name);
    setAssetInstitution(asset.institution || '');
    setAssetInvested(String(asset.invested_amount));
    setAssetCurrentVal(String(asset.current_value));
    setAssetQty(asset.quantity !== undefined ? String(asset.quantity) : '');
    setAssetDate(asset.purchase_date || new Date().toISOString().slice(0, 10));
    setAssetYield(asset.reported_yield_pct !== undefined ? String(asset.reported_yield_pct) : '');
    setAssetNotes(asset.notes || '');
    setShowAssetModal(true);
  };

  const handleSaveAsset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!assetName.trim()) return;
    setAssetSaving(true);

    const invested = roundMoney(parseFloat(assetInvested.replace(',', '.')) || 0);
    const current = roundMoney(parseFloat(assetCurrentVal.replace(',', '.')) || invested);
    const qty = assetQty.trim() ? parseFloat(assetQty.replace(',', '.')) : undefined;
    const yieldPct = assetYield.trim() ? parseFloat(assetYield.replace(',', '.')) : undefined;

    try {
      const payload: Omit<PatrimonyAsset, 'id'> = {
        workspace_id: activeWorkspaceId,
        kind: assetKind,
        category: assetCategory,
        name: assetName.trim(),
        institution: assetInstitution.trim() || undefined,
        invested_amount: invested,
        current_value: current,
        quantity: qty !== undefined && !isNaN(qty) ? qty : undefined,
        purchase_date: assetDate || undefined,
        reported_yield_pct: yieldPct !== undefined && !isNaN(yieldPct) ? yieldPct : undefined,
        notes: assetNotes.trim() || undefined
      };

      if (editingAsset) {
        await FirestoreService.updateAsset(user.id, editingAsset.id, payload);
        showToast({
          type: 'success',
          title: assetKind === 'INVESTMENT' ? 'Investimento atualizado' : 'Bem patrimonial atualizado',
          message: `"${assetName.trim()}" salvo com sucesso`
        });
      } else {
        await FirestoreService.addAsset(user.id, payload);
        showToast({
          type: 'success',
          title: assetKind === 'INVESTMENT' ? 'Investimento cadastrado' : 'Bem patrimonial cadastrado',
          message: `"${assetName.trim()}" adicionado ao patrimônio`
        });
      }

      setShowAssetModal(false);
      setEditingAsset(null);
      onRefreshData();
    } catch (err) {
      showToast({
        type: 'error',
        title: 'Erro ao salvar ativo',
        message: 'Não foi possível salvar o registro'
      });
    } finally {
      setAssetSaving(false);
    }
  };

  const handleDeleteAsset = async (asset: PatrimonyAsset) => {
    const confirmed = await confirm({
      title: asset.kind === 'INVESTMENT' ? 'Excluir investimento' : 'Excluir bem patrimonial',
      description: `Deseja remover "${asset.name}" (${formatMoney(asset.current_value)}) do seu patrimônio?`,
      confirmText: 'Excluir',
      cancelText: 'Cancelar',
      variant: 'danger',
      icon: 'trash'
    });

    if (confirmed) {
      try {
        await FirestoreService.deleteAsset(user.id, asset.id);
        showToast({
          type: 'success',
          title: 'Ativo removido',
          message: `"${asset.name}" foi excluído`
        });
        onRefreshData();
      } catch (err) {
        showToast({
          type: 'error',
          title: 'Erro ao excluir',
          message: 'Não foi possível excluir o ativo'
        });
      }
    }
  };

  // --- DEBT / LOAN HANDLERS ---
  const openCreateLoan = () => {
    setEditingLoan(null);
    setLoanName('');
    setLoanCreditor('');
    setLoanInitialDebt('');
    setLoanTotalDebt('');
    setLoanInstallmentAmt('');
    setLoanInterestRate('');
    setLoanInterestPeriod('MONTHLY');
    setLoanTotalInst('24');
    setLoanPaidInst('0');
    setLoanNotes('');
    setShowLoanModal(true);
  };

  const openEditLoan = (loan: SubscriptionAndLoan) => {
    setEditingLoan(loan);
    setLoanName(loan.name);
    setLoanCreditor(loan.creditor || '');
    setLoanInitialDebt(String(loan.initial_debt ?? loan.total_debt ?? 0));
    setLoanTotalDebt(String(loan.total_debt ?? 0));
    setLoanInstallmentAmt(String(loan.amount ?? 0));
    setLoanInterestRate(loan.interest_rate !== undefined ? String(loan.interest_rate) : '');
    setLoanInterestPeriod(loan.interest_period || 'MONTHLY');
    setLoanTotalInst(String(loan.total_installments ?? 12));
    setLoanPaidInst(String(loan.paid_installments ?? 0));
    setLoanNotes(loan.notes || '');
    setShowLoanModal(true);
  };

  const handleSaveLoan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!loanName.trim()) return;
    setLoanSaving(true);

    const initialDebt = roundMoney(parseFloat(loanInitialDebt.replace(',', '.')) || 0);
    const totalDebt = roundMoney(parseFloat(loanTotalDebt.replace(',', '.')) || initialDebt);
    const instAmt = roundMoney(parseFloat(loanInstallmentAmt.replace(',', '.')) || 0);
    const rate = loanInterestRate.trim() ? parseFloat(loanInterestRate.replace(',', '.')) : undefined;
    const totalInst = Math.max(1, parseInt(loanTotalInst, 10) || 1);
    const paidInst = Math.max(0, Math.min(totalInst, parseInt(loanPaidInst, 10) || 0));
    const remInst = Math.max(0, totalInst - paidInst);
    const defaultCat = categories.find(c => c.type === 'EXPENSE')?.id || 'cat_expense';

    try {
      const payload: Omit<SubscriptionAndLoan, 'id'> = {
        workspace_id: activeWorkspaceId,
        name: loanName.trim(),
        type: 'LOAN',
        creditor: loanCreditor.trim() || undefined,
        amount: instAmt,
        initial_debt: initialDebt,
        total_debt: totalDebt,
        interest_rate: rate !== undefined && !isNaN(rate) ? rate : undefined,
        interest_period: rate !== undefined && !isNaN(rate) ? loanInterestPeriod : undefined,
        total_installments: totalInst,
        paid_installments: paidInst,
        remaining_installments: remInst,
        billing_cycle: 'MONTHLY',
        next_billing_date: new Date().toISOString().slice(0, 10),
        category_id: editingLoan?.category_id || defaultCat,
        payment_method: 'ACCOUNT',
        notes: loanNotes.trim() || undefined
      };

      if (editingLoan) {
        await FirestoreService.updateSubscription(user.id, editingLoan.id, payload);
        showToast({
          type: 'success',
          title: 'Dívida atualizada',
          message: `Saldo devedor de "${loanName.trim()}" salvo`
        });
      } else {
        await FirestoreService.addSubscription(user.id, payload);
        showToast({
          type: 'success',
          title: 'Dívida cadastrada',
          message: `"${loanName.trim()}" adicionada aos passivos`
        });
      }

      setShowLoanModal(false);
      setEditingLoan(null);
      onRefreshData();
    } catch (err) {
      showToast({
        type: 'error',
        title: 'Erro ao salvar dívida',
        message: 'Não foi possível salvar os dados do passivo'
      });
    } finally {
      setLoanSaving(false);
    }
  };

  const handleDeleteLoan = async (loan: SubscriptionAndLoan) => {
    const confirmed = await confirm({
      title: 'Excluir dívida / empréstimo',
      description: `Deseja remover "${loan.name}" (saldo devedor ${formatMoney(loan.total_debt || 0)}) dos seus passivos?`,
      confirmText: 'Excluir',
      cancelText: 'Cancelar',
      variant: 'danger',
      icon: 'trash'
    });

    if (confirmed) {
      try {
        await FirestoreService.deleteSubscription(user.id, loan.id);
        showToast({
          type: 'success',
          title: 'Dívida excluída',
          message: `"${loan.name}" foi removida`
        });
        onRefreshData();
      } catch (err) {
        showToast({
          type: 'error',
          title: 'Erro ao excluir',
          message: 'Não foi possível remover a dívida'
        });
      }
    }
  };

  const handleOpenPayLoan = (loan: SubscriptionAndLoan) => {
    setPayingLoan(loan);
    setPayLoanAmt(String(loan.amount || 0));
    setPayLoanAccountId(accounts[0]?.id || '');
    setPayLoanDate(new Date().toISOString().slice(0, 10));
  };

  const handleConfirmPayLoan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!payingLoan) return;
    const amt = roundMoney(parseFloat(payLoanAmt.replace(',', '.')) || 0);
    if (amt <= 0) return;

    setPayLoanLoading(true);
    try {
      await FirestoreService.payLoanInstallment(
        user.id,
        payingLoan,
        amt,
        payLoanAccountId || undefined,
        payLoanDate
      );
      showToast({
        type: 'success',
        title: 'Parcela registrada',
        message: payLoanAccountId
          ? `Saldo devedor abatido e débito de ${formatMoney(amt)} lançado na conta`
          : `Saldo devedor de "${payingLoan.name}" abatido em ${formatMoney(amt)}`
      });
      setPayingLoan(null);
      onRefreshData();
    } catch (err) {
      showToast({
        type: 'error',
        title: 'Falha ao registrar pagamento',
        message: 'Não foi possível atualizar a dívida'
      });
    } finally {
      setPayLoanLoading(false);
    }
  };

  return (
    <div className="space-y-8 min-w-0">
      {/* TOP 3 NET WORTH KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 sm:gap-4">
        <div className="bg-surface border border-subtle rounded-xl p-4 sm:p-5 flex flex-col justify-between min-h-[112px] min-w-0">
          <span className="text-xs text-secondary truncate">
            {isBusiness ? 'Total de Ativos PJ' : 'Total de Ativos'}
          </span>
          <div className="mt-2">
            <div className="text-2xl sm:text-[28px] leading-none font-medium font-mono text-primary tabular-nums tracking-tight truncate">
              {formatMoney(totalAssets)}
            </div>
            <p className="text-[11px] text-muted mt-2 truncate font-mono">
              Contas {formatMoney(totalAccountsBalance)} • Inv. {formatMoney(totalInvestmentsValue)} • Bens {formatMoney(totalPropertiesValue)}
            </p>
          </div>
        </div>

        <div className="bg-surface border border-subtle rounded-xl p-4 sm:p-5 flex flex-col justify-between min-h-[112px] min-w-0">
          <span className="text-xs text-secondary truncate">
            {isBusiness ? 'Total de Passivos PJ' : 'Total de Passivos'}
          </span>
          <div className="mt-2">
            <div className="text-2xl sm:text-[28px] leading-none font-medium font-mono text-[#EF4444] tabular-nums tracking-tight truncate">
              {formatMoney(totalLiabilities)}
            </div>
            <p className="text-[11px] text-muted mt-2 truncate font-mono">
              Dívidas {formatMoney(totalDebtsBalance)} • Faturas abertas {formatMoney(totalOpenCardInvoices)}
            </p>
          </div>
        </div>

        <div className="bg-surface border border-subtle rounded-xl p-4 sm:p-5 flex flex-col justify-between min-h-[112px] min-w-0">
          <span className="text-xs text-secondary truncate">
            {isBusiness ? 'Patrimônio Líquido PJ' : 'Patrimônio Líquido (Ativos - Passivos)'}
          </span>
          <div className="mt-2">
            <div
              className={`text-2xl sm:text-[28px] leading-none font-medium font-mono tabular-nums tracking-tight truncate ${
                netWorth >= 0 ? 'text-[#10B981]' : 'text-[#EF4444]'
              }`}
            >
              {formatMoney(netWorth)}
            </div>
            <p className="text-xs text-muted mt-2 truncate">
              {totalAssets > 0
                ? `Grau de alavancagem: ${Math.round((totalLiabilities / totalAssets) * 100)}%`
                : 'Cadastre seus ativos e passivos abaixo'}
            </p>
          </div>
        </div>
      </div>

      {/* Transparency Notice: Manual Valuation */}
      <div className="flex items-center gap-2.5 px-4 py-2.5 bg-surface border border-subtle rounded-lg text-xs text-muted">
        <Info className="w-4 h-4 stroke-[1.5] text-secondary shrink-0" />
        <span>
          Os saldos de investimentos, bens e rentabilidades exibidos abaixo são <strong className="text-primary font-medium">informados manualmente</strong> por você, sem cotações externas automáticas.
        </span>
      </div>

      {/* SECTION 1: INVESTMENTS */}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-[15px] font-medium text-primary">Investimentos e aplicações</h2>
            <p className="text-xs text-muted mt-0.5">
              Renda fixa, renda variável, fundos e criptoativos (valores manuais)
            </p>
          </div>
          <button
            onClick={() => openCreateAsset('INVESTMENT')}
            className="h-9 flex items-center gap-1.5 px-3.5 bg-primary hover:opacity-90 text-canvas text-xs font-medium rounded-lg transition-opacity self-start sm:self-auto"
          >
            <Plus className="w-4 h-4 stroke-[1.75]" />
            <span>Novo investimento</span>
          </button>
        </div>

        {investments.length === 0 ? (
          <div className="p-8 bg-surface border border-subtle rounded-xl text-center space-y-3">
            <TrendingUp className="w-6 h-6 stroke-[1.5] text-muted mx-auto" />
            <p className="text-xs text-secondary">Nenhum investimento cadastrado neste workspace</p>
            <button
              onClick={() => openCreateAsset('INVESTMENT')}
              className="h-9 px-4 bg-[#10B981] text-[#0A0A0A] text-xs font-medium rounded-lg hover:bg-[#059669] transition-colors"
            >
              Cadastrar primeiro investimento
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {investments.map(inv => {
              const gain = roundMoney(inv.current_value - inv.invested_amount);
              const computedYield =
                inv.reported_yield_pct !== undefined
                  ? inv.reported_yield_pct
                  : inv.invested_amount > 0
                  ? roundMoney((gain / inv.invested_amount) * 100)
                  : 0;

              return (
                <div
                  key={inv.id}
                  className="bg-surface border border-subtle rounded-xl p-4 sm:p-5 flex flex-col justify-between space-y-4 hover:border-border-focus transition-colors min-w-0"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-raised text-secondary border border-subtle inline-block mb-1.5">
                        {INVESTMENT_CATEGORY_LABELS[inv.category as InvestmentCategory] || inv.category}
                      </span>
                      <h3 className="text-sm font-medium text-primary truncate">{inv.name}</h3>
                      <p className="text-xs text-muted truncate">
                        {inv.institution || 'Custódia manual'}
                        {inv.quantity !== undefined ? ` • Qtd: ${inv.quantity}` : ''}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => openEditAsset(inv)}
                        className="p-1 rounded text-muted hover:text-primary transition-colors"
                        title="Editar investimento"
                      >
                        <Pencil className="w-3.5 h-3.5 stroke-[1.5]" />
                      </button>
                      <button
                        onClick={() => handleDeleteAsset(inv)}
                        className="p-1 rounded text-muted hover:text-[#EF4444] transition-colors"
                        title="Excluir investimento"
                      >
                        <Trash2 className="w-3.5 h-3.5 stroke-[1.5]" />
                      </button>
                    </div>
                  </div>

                  <div className="pt-3 border-t border-subtle space-y-1.5">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-xs text-muted">Valor atual (manual)</span>
                      <span className="text-lg font-mono font-medium text-primary tabular-nums">
                        {formatMoney(inv.current_value)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-2 text-[11px] font-mono tabular-nums">
                      <span className="text-muted">Aplicado: {formatMoney(inv.invested_amount)}</span>
                      <span className={computedYield >= 0 ? 'text-[#10B981]' : 'text-[#EF4444]'}>
                        {computedYield >= 0 ? '+' : ''}
                        {computedYield.toFixed(2)}%
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* SECTION 2: PROPERTIES / BENS PATRIMONIAIS */}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-[15px] font-medium text-primary">Bens patrimoniais</h2>
            <p className="text-xs text-muted mt-0.5">
              Imóveis, veículos e ativos imobilizados (avaliação manual)
            </p>
          </div>
          <button
            onClick={() => openCreateAsset('PROPERTY')}
            className="h-9 flex items-center gap-1.5 px-3.5 bg-raised hover:bg-surface-hover border border-subtle text-xs font-medium text-primary rounded-lg transition-colors self-start sm:self-auto"
          >
            <Plus className="w-4 h-4 stroke-[1.5]" />
            <span>Novo bem</span>
          </button>
        </div>

        {properties.length === 0 ? (
          <div className="p-6 bg-surface border border-subtle rounded-xl text-center space-y-2">
            <Home className="w-5 h-5 stroke-[1.5] text-muted mx-auto" />
            <p className="text-xs text-muted">Nenhum bem patrimonial (imóvel ou veículo) registrado.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {properties.map(prop => (
              <div
                key={prop.id}
                className="bg-surface border border-subtle rounded-xl p-4 sm:p-5 flex flex-col justify-between space-y-4 hover:border-border-focus transition-colors min-w-0"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-raised text-secondary border border-subtle inline-block mb-1.5">
                      {PROPERTY_CATEGORY_LABELS[prop.category as PropertyCategory] || prop.category}
                    </span>
                    <h3 className="text-sm font-medium text-primary truncate">{prop.name}</h3>
                    {prop.institution && (
                      <p className="text-xs text-muted truncate">{prop.institution}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => openEditAsset(prop)}
                      className="p-1 rounded text-muted hover:text-primary transition-colors"
                      title="Editar bem"
                    >
                      <Pencil className="w-3.5 h-3.5 stroke-[1.5]" />
                    </button>
                    <button
                      onClick={() => handleDeleteAsset(prop)}
                      className="p-1 rounded text-muted hover:text-[#EF4444] transition-colors"
                      title="Excluir bem"
                    >
                      <Trash2 className="w-3.5 h-3.5 stroke-[1.5]" />
                    </button>
                  </div>
                </div>

                <div className="pt-3 border-t border-subtle space-y-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-xs text-muted">Valor estimado (manual)</span>
                    <span className="text-lg font-mono font-medium text-primary tabular-nums">
                      {formatMoney(prop.current_value)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-[11px] font-mono text-muted">
                    <span>Aquisição: {formatMoney(prop.invested_amount)}</span>
                    {prop.purchase_date && (
                      <span>{prop.purchase_date.split('-').reverse().join('/')}</span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* SECTION 3: LIABILITIES — DEBTS & LOANS */}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-[15px] font-medium text-primary">Passivos — Dívidas e financiamentos</h2>
            <p className="text-xs text-muted mt-0.5">
              Controle de saldo devedor, juros, parcelas pagas e amortizações vinculadas às contas
            </p>
          </div>
          <button
            onClick={openCreateLoan}
            className="h-9 flex items-center gap-1.5 px-3.5 bg-raised hover:bg-surface-hover border border-subtle text-xs font-medium text-primary rounded-lg transition-colors self-start sm:self-auto"
          >
            <Plus className="w-4 h-4 stroke-[1.5]" />
            <span>Nova dívida / empréstimo</span>
          </button>
        </div>

        {loans.length === 0 ? (
          <div className="p-8 bg-surface border border-subtle rounded-xl text-center space-y-2">
            <Landmark className="w-6 h-6 stroke-[1.5] text-muted mx-auto" />
            <p className="text-xs text-secondary">Nenhuma dívida ou financiamento cadastrado neste workspace</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {loans.map(loan => {
              const totalInst = loan.total_installments || 1;
              const paidInst = loan.paid_installments ?? Math.max(0, totalInst - (loan.remaining_installments ?? 0));
              const pctPaid = Math.min(100, Math.round((paidInst / totalInst) * 100));
              const isPaidOff = (loan.total_debt || 0) <= 0 || paidInst >= totalInst;

              return (
                <div
                  key={loan.id}
                  className="bg-surface border border-subtle rounded-xl p-4 sm:p-5 flex flex-col justify-between space-y-4 hover:border-border-focus transition-colors min-w-0"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h3 className="text-sm font-medium text-primary truncate">{loan.name}</h3>
                      <p className="text-xs text-muted mt-0.5 truncate">
                        {loan.creditor || 'Instituição credora'}
                        {loan.interest_rate !== undefined
                          ? ` • Juros: ${loan.interest_rate}% ${loan.interest_period === 'YEARLY' ? 'a.a.' : 'a.m.'}`
                          : ''}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => openEditLoan(loan)}
                        className="p-1 rounded text-muted hover:text-primary transition-colors"
                        title="Editar dívida"
                      >
                        <Pencil className="w-3.5 h-3.5 stroke-[1.5]" />
                      </button>
                      <button
                        onClick={() => handleDeleteLoan(loan)}
                        className="p-1 rounded text-muted hover:text-[#EF4444] transition-colors"
                        title="Excluir dívida"
                      >
                        <Trash2 className="w-3.5 h-3.5 stroke-[1.5]" />
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3 p-3 bg-canvas border border-subtle rounded-lg text-xs font-mono tabular-nums">
                    <div>
                      <span className="text-[11px] text-muted block font-sans">Saldo devedor atual</span>
                      <span className="text-base font-medium text-[#EF4444]">
                        {formatMoney(loan.total_debt || 0)}
                      </span>
                    </div>
                    <div className="text-right">
                      <span className="text-[11px] text-muted block font-sans">Parcela mensal</span>
                      <span className="text-base font-medium text-primary">
                        {formatMoney(loan.amount)}
                      </span>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <div className="flex justify-between text-[11px] font-mono text-muted tabular-nums">
                      <span>Parcelas pagas: {paidInst} / {totalInst}</span>
                      <span>Valor inicial: {formatMoney(loan.initial_debt ?? loan.total_debt ?? 0)}</span>
                    </div>
                    <div className="w-full bg-canvas h-1.5 rounded-full overflow-hidden border border-subtle">
                      <div
                        className="bg-[#10B981] h-full rounded-full"
                        style={{ width: `${pctPaid}%` }}
                      />
                    </div>
                  </div>

                  <div className="pt-2 border-t border-subtle flex items-center justify-between gap-2">
                    <span className="text-[11px] text-muted font-mono">
                      {isPaidOff ? 'Quitado' : `${Math.max(0, totalInst - paidInst)} parcelas restantes`}
                    </span>
                    {isPaidOff ? (
                      <span className="text-xs text-[#10B981] font-medium flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5 stroke-[1.5]" />
                        <span>Liquidada</span>
                      </span>
                    ) : (
                      <button
                        onClick={() => handleOpenPayLoan(loan)}
                        className="h-8 px-3 bg-raised hover:bg-surface-hover border border-subtle text-xs font-medium text-[#10B981] rounded-lg transition-colors"
                      >
                        Registrar pagamento de parcela
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* MODAL: CREATE / EDIT ASSET (INVESTMENT OR PROPERTY) */}
      {showAssetModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="w-full max-w-md bg-surface border border-subtle rounded-2xl p-6 space-y-4 relative">
            <button
              onClick={() => {
                setShowAssetModal(false);
                setEditingAsset(null);
              }}
              className="absolute top-5 right-5 text-muted hover:text-primary"
            >
              <X className="w-4 h-4 stroke-[1.5]" />
            </button>
            <h3 className="text-[15px] font-medium text-primary">
              {editingAsset
                ? assetKind === 'INVESTMENT'
                  ? 'Editar investimento'
                  : 'Editar bem patrimonial'
                : assetKind === 'INVESTMENT'
                ? 'Novo investimento'
                : 'Novo bem patrimonial'}
            </h3>

            <form onSubmit={handleSaveAsset} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-secondary mb-1.5">Categoria</label>
                  <select
                    value={assetCategory}
                    onChange={e => setAssetCategory(e.target.value as any)}
                    className="w-full h-10 bg-canvas border border-subtle rounded-lg px-3 text-xs text-primary outline-none"
                  >
                    {assetKind === 'INVESTMENT'
                      ? (Object.keys(INVESTMENT_CATEGORY_LABELS) as InvestmentCategory[]).map(k => (
                          <option key={k} value={k}>
                            {INVESTMENT_CATEGORY_LABELS[k]}
                          </option>
                        ))
                      : (Object.keys(PROPERTY_CATEGORY_LABELS) as PropertyCategory[]).map(k => (
                          <option key={k} value={k}>
                            {PROPERTY_CATEGORY_LABELS[k]}
                          </option>
                        ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-secondary mb-1.5">
                    {assetKind === 'INVESTMENT' ? 'Instituição / Corretora' : 'Referência / Registro'}
                  </label>
                  <input
                    type="text"
                    placeholder={assetKind === 'INVESTMENT' ? 'Ex: BTG, XP, NuInvest' : 'Ex: Placa, Matrícula'}
                    value={assetInstitution}
                    onChange={e => setAssetInstitution(e.target.value)}
                    className="w-full h-10 bg-canvas border border-subtle focus:border-[#10B981] rounded-lg px-3 text-xs text-primary outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs text-secondary mb-1.5">Nome do ativo</label>
                <input
                  type="text"
                  required
                  placeholder={assetKind === 'INVESTMENT' ? 'Ex: Tesouro IPCA+ 2035, HGLG11' : 'Ex: Apartamento 92m², Carro'}
                  value={assetName}
                  onChange={e => setAssetName(e.target.value)}
                  className="w-full h-10 bg-canvas border border-subtle focus:border-[#10B981] rounded-lg px-3 text-xs text-primary outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-secondary mb-1.5">
                    {assetKind === 'INVESTMENT' ? 'Valor aplicado (R$)' : 'Valor de aquisição (R$)'}
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={assetInvested}
                    onChange={e => setAssetInvested(e.target.value)}
                    className="w-full h-10 bg-canvas border border-subtle rounded-lg px-3 text-xs font-mono text-primary outline-none tabular-nums"
                  />
                </div>
                <div>
                  <label className="block text-xs text-secondary mb-1.5">
                    Valor atual manual (R$)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={assetCurrentVal}
                    onChange={e => setAssetCurrentVal(e.target.value)}
                    className="w-full h-10 bg-canvas border border-subtle rounded-lg px-3 text-xs font-mono text-primary outline-none tabular-nums"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block text-xs text-secondary mb-1.5">Data</label>
                  <input
                    type="date"
                    value={assetDate}
                    onChange={e => setAssetDate(e.target.value)}
                    className="w-full h-10 bg-canvas border border-subtle rounded-lg px-2 text-xs font-mono text-primary outline-none"
                  />
                </div>
                {assetKind === 'INVESTMENT' && (
                  <>
                    <div>
                      <label className="block text-xs text-secondary mb-1.5">Quantidade</label>
                      <input
                        type="number"
                        step="0.0001"
                        placeholder="Opcional"
                        value={assetQty}
                        onChange={e => setAssetQty(e.target.value)}
                        className="w-full h-10 bg-canvas border border-subtle rounded-lg px-2.5 text-xs font-mono text-primary outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-secondary mb-1.5">Rentab. (%)</label>
                      <input
                        type="number"
                        step="0.01"
                        placeholder="Ex: 11.5"
                        value={assetYield}
                        onChange={e => setAssetYield(e.target.value)}
                        className="w-full h-10 bg-canvas border border-subtle rounded-lg px-2.5 text-xs font-mono text-primary outline-none"
                      />
                    </div>
                  </>
                )}
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-subtle">
                <button
                  type="button"
                  onClick={() => {
                    setShowAssetModal(false);
                    setEditingAsset(null);
                  }}
                  className="h-9 px-3 text-xs text-secondary hover:text-primary"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={assetSaving}
                  className="h-9 px-4 bg-primary hover:opacity-90 text-canvas font-medium text-xs rounded-lg transition-opacity disabled:opacity-50"
                >
                  {assetSaving ? 'Salvando...' : editingAsset ? 'Salvar alterações' : 'Salvar ativo'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: CREATE / EDIT DEBT OR LOAN */}
      {showLoanModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="w-full max-w-md bg-surface border border-subtle rounded-2xl p-6 space-y-4 relative">
            <button
              onClick={() => {
                setShowLoanModal(false);
                setEditingLoan(null);
              }}
              className="absolute top-5 right-5 text-muted hover:text-primary"
            >
              <X className="w-4 h-4 stroke-[1.5]" />
            </button>
            <h3 className="text-[15px] font-medium text-primary">
              {editingLoan ? 'Editar dívida / empréstimo' : 'Nova dívida / empréstimo'}
            </h3>

            <form onSubmit={handleSaveLoan} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-secondary mb-1.5">Descrição da dívida</label>
                  <input
                    type="text"
                    required
                    placeholder="Ex: Financiamento Imóvel / Veículo"
                    value={loanName}
                    onChange={e => setLoanName(e.target.value)}
                    className="w-full h-10 bg-canvas border border-subtle focus:border-[#10B981] rounded-lg px-3 text-xs text-primary outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs text-secondary mb-1.5">Credor / Banco</label>
                  <input
                    type="text"
                    placeholder="Ex: Itaú, Caixa, Banco do Brasil"
                    value={loanCreditor}
                    onChange={e => setLoanCreditor(e.target.value)}
                    className="w-full h-10 bg-canvas border border-subtle focus:border-[#10B981] rounded-lg px-3 text-xs text-primary outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-secondary mb-1.5">Valor inicial (R$)</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={loanInitialDebt}
                    onChange={e => setLoanInitialDebt(e.target.value)}
                    className="w-full h-10 bg-canvas border border-subtle rounded-lg px-3 text-xs font-mono text-primary outline-none tabular-nums"
                  />
                </div>
                <div>
                  <label className="block text-xs text-secondary mb-1.5">Saldo devedor atual (R$)</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={loanTotalDebt}
                    onChange={e => setLoanTotalDebt(e.target.value)}
                    className="w-full h-10 bg-canvas border border-subtle rounded-lg px-3 text-xs font-mono text-primary outline-none tabular-nums"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block text-xs text-secondary mb-1.5">Parcela (R$)</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={loanInstallmentAmt}
                    onChange={e => setLoanInstallmentAmt(e.target.value)}
                    className="w-full h-10 bg-canvas border border-subtle rounded-lg px-2.5 text-xs font-mono text-primary outline-none tabular-nums"
                  />
                </div>
                <div>
                  <label className="block text-xs text-secondary mb-1.5">Total parc.</label>
                  <input
                    type="number"
                    min="1"
                    required
                    value={loanTotalInst}
                    onChange={e => setLoanTotalInst(e.target.value)}
                    className="w-full h-10 bg-canvas border border-subtle rounded-lg px-2.5 text-xs font-mono text-primary outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs text-secondary mb-1.5">Pagas</label>
                  <input
                    type="number"
                    min="0"
                    value={loanPaidInst}
                    onChange={e => setLoanPaidInst(e.target.value)}
                    className="w-full h-10 bg-canvas border border-subtle rounded-lg px-2.5 text-xs font-mono text-primary outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-secondary mb-1.5">Taxa de juros % (opcional)</label>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="Ex: 1.15"
                    value={loanInterestRate}
                    onChange={e => setLoanInterestRate(e.target.value)}
                    className="w-full h-10 bg-canvas border border-subtle rounded-lg px-3 text-xs font-mono text-primary outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs text-secondary mb-1.5">Período da taxa</label>
                  <select
                    value={loanInterestPeriod}
                    onChange={e => setLoanInterestPeriod(e.target.value as any)}
                    className="w-full h-10 bg-canvas border border-subtle rounded-lg px-3 text-xs text-primary outline-none"
                  >
                    <option value="MONTHLY">Mensal (a.m.)</option>
                    <option value="YEARLY">Anual (a.a.)</option>
                  </select>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-subtle">
                <button
                  type="button"
                  onClick={() => {
                    setShowLoanModal(false);
                    setEditingLoan(null);
                  }}
                  className="h-9 px-3 text-xs text-secondary hover:text-primary"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={loanSaving}
                  className="h-9 px-4 bg-primary hover:opacity-90 text-canvas font-medium text-xs rounded-lg transition-opacity disabled:opacity-50"
                >
                  {loanSaving ? 'Salvando...' : editingLoan ? 'Salvar alterações' : 'Salvar dívida'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: PAY LOAN INSTALLMENT */}
      {payingLoan && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
          <div className="w-full max-w-md bg-surface border border-subtle rounded-2xl p-6 space-y-4 relative">
            <button
              onClick={() => setPayingLoan(null)}
              className="absolute top-5 right-5 text-muted hover:text-primary"
            >
              <X className="w-4 h-4 stroke-[1.5]" />
            </button>
            <div>
              <h3 className="text-[15px] font-medium text-primary">Registrar pagamento de parcela</h3>
              <p className="text-xs text-muted mt-0.5">
                {payingLoan.name} • Saldo devedor: {formatMoney(payingLoan.total_debt || 0)}
              </p>
            </div>

            <form onSubmit={handleConfirmPayLoan} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-secondary mb-1.5">Valor amortizado (R$)</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={payLoanAmt}
                    onChange={e => setPayLoanAmt(e.target.value)}
                    className="w-full h-10 bg-canvas border border-subtle focus:border-[#10B981] rounded-lg px-3 text-xs font-mono font-medium text-primary outline-none tabular-nums"
                  />
                </div>
                <div>
                  <label className="block text-xs text-secondary mb-1.5">Data do pagamento</label>
                  <input
                    type="date"
                    required
                    value={payLoanDate}
                    onChange={e => setPayLoanDate(e.target.value)}
                    className="w-full h-10 bg-canvas border border-subtle rounded-lg px-3 text-xs font-mono text-primary outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs text-secondary mb-1.5">
                  Debitar da conta bancária (opcional)
                </label>
                <select
                  value={payLoanAccountId}
                  onChange={e => setPayLoanAccountId(e.target.value)}
                  className="w-full h-10 bg-canvas border border-subtle rounded-lg px-3 text-xs text-primary outline-none"
                >
                  <option value="">Apenas abater saldo devedor (sem débito em conta)</option>
                  {accounts.map(acc => (
                    <option key={acc.id} value={acc.id}>
                      {acc.name} — Saldo: {formatMoney(acc.current_balance)}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-subtle">
                <button
                  type="button"
                  onClick={() => setPayingLoan(null)}
                  className="h-9 px-3 text-xs text-secondary hover:text-primary"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={payLoanLoading}
                  className="h-9 px-4 bg-[#10B981] hover:bg-[#059669] text-[#0A0A0A] font-medium text-xs rounded-lg transition-colors disabled:opacity-50"
                >
                  {payLoanLoading ? 'Registrando...' : 'Confirmar pagamento'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
