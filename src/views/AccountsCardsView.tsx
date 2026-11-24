import React, { useState } from 'react';
import {
  CreditCard as CardIcon,
  Landmark,
  Plus,
  Repeat,
  Pencil,
  Trash2,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  Receipt,
  X
} from 'lucide-react';
import {
  BankAccount,
  CreditCard,
  CreditCardInvoice,
  InvoiceStatus,
  SubscriptionAndLoan,
  Transaction,
  User
} from '../types';
import {
  FirestoreService,
  roundMoney,
  computeCardInvoiceCycle,
  buildInvoiceId
} from '../services/firestoreService';
import { useFeedback } from '../contexts/FeedbackContext';

interface AccountsCardsViewProps {
  user: User;
  activeWorkspaceId?: string;
  workspaceType?: 'INDIVIDUAL' | 'FAMILY' | 'BUSINESS';
  accounts: BankAccount[];
  cards: CreditCard[];
  invoices: CreditCardInvoice[];
  subscriptions: SubscriptionAndLoan[];
  transactions?: Transaction[];
  onRefreshData: () => void;
  onOpenNewTransaction: () => void;
}

interface EnrichedCardInvoice extends CreditCardInvoice {
  referenceKey: string;
  isCurrentCycle: boolean;
  items: Transaction[];
}

export const AccountsCardsView: React.FC<AccountsCardsViewProps> = ({
  user,
  activeWorkspaceId = 'ws_personal',
  workspaceType = 'INDIVIDUAL',
  accounts,
  cards,
  invoices,
  subscriptions,
  transactions = [],
  onRefreshData,
  onOpenNewTransaction
}) => {
  const { confirm, showToast } = useFeedback();

  // Modal & Edit States
  const [showAccountModal, setShowAccountModal] = useState(false);
  const [editingAccount, setEditingAccount] = useState<BankAccount | null>(null);

  const [showCardModal, setShowCardModal] = useState(false);
  const [editingCard, setEditingCard] = useState<CreditCard | null>(null);

  const [showSubModal, setShowSubModal] = useState(false);
  const [editingSub, setEditingSub] = useState<SubscriptionAndLoan | null>(null);

  // Invoice Navigation & Payment Modal State
  const [selectedInvoiceKeyByCard, setSelectedInvoiceKeyByCard] = useState<Record<string, string>>({});
  const [expandedInvoiceItemsByCard, setExpandedInvoiceItemsByCard] = useState<Record<string, boolean>>({});
  const [payingInvoice, setPayingInvoice] = useState<{
    card: CreditCard;
    invoice: EnrichedCardInvoice;
  } | null>(null);
  const [payAccountId, setPayAccountId] = useState<string>('');
  const [payDate, setPayDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [payingLoading, setPayingLoading] = useState<boolean>(false);

  // Account Form
  const [accName, setAccName] = useState('');
  const [accInstitution, setAccInstitution] = useState('');
  const [accType, setAccType] = useState<'CHECKING' | 'SAVINGS' | 'INVESTMENT' | 'CASH'>('CHECKING');
  const [accBalance, setAccBalance] = useState('0');

  // Card Form
  const [cardName, setCardName] = useState('');
  const [cardBrand, setCardBrand] = useState<'Mastercard' | 'Visa' | 'Elo' | 'Amex'>('Mastercard');
  const [cardLimit, setCardLimit] = useState('');
  const [closingDay, setClosingDay] = useState(25);
  const [dueDay, setDueDay] = useState(5);

  // Subscription Form
  const [subName, setSubName] = useState('');
  const [subAmount, setSubAmount] = useState('');
  const [subType] = useState<'SUBSCRIPTION' | 'LOAN'>('SUBSCRIPTION');
  const [subCycle, setSubCycle] = useState<'MONTHLY' | 'YEARLY'>('MONTHLY');

  const formatMoney = (val: number) => {
    if (user.privacy_mode) return '••••••';
    return `R$ ${val.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const getAccountTypeLabel = (type: string) => {
    switch (type) {
      case 'CHECKING': return 'Conta corrente';
      case 'SAVINGS': return 'Poupança';
      case 'INVESTMENT': return 'Investimento';
      default: return 'Caixa físico';
    }
  };

  const getInvoiceStatusBadge = (status: InvoiceStatus) => {
    switch (status) {
      case 'PAID':
        return {
          label: 'Paga',
          className: 'bg-[#10B981]/15 text-[#10B981] border-[#10B981]/30'
        };
      case 'OVERDUE':
        return {
          label: 'Vencida',
          className: 'bg-[#EF4444]/15 text-[#EF4444] border-[#EF4444]/30'
        };
      case 'CLOSED':
        return {
          label: 'Fechada',
          className: 'bg-[#D97706]/15 text-[#D97706] border-[#D97706]/30'
        };
      default:
        return {
          label: 'Aberta',
          className: 'bg-[#C5A059]/15 text-[#C5A059] border-[#C5A059]/30'
        };
    }
  };

  /**
   * Builds the complete chronological list of invoices for a given card,
   * combining persisted Firestore invoices, card transactions, and the current active cycle.
   */
  const buildCardInvoices = (card: CreditCard): EnrichedCardInvoice[] => {
    const todayStr = new Date().toISOString().slice(0, 10);
    const currentCycle = computeCardInvoiceCycle(todayStr, card);
    const map = new Map<string, EnrichedCardInvoice>();

    // 1. Seed current active cycle so every card always has an active invoice
    map.set(currentCycle.referenceKey, {
      id: currentCycle.invoiceId,
      card_id: card.id,
      reference_month: currentCycle.referenceMonth,
      reference_year: currentCycle.referenceYear,
      reference_key: currentCycle.referenceKey,
      referenceKey: currentCycle.referenceKey,
      total_amount: 0,
      status: currentCycle.defaultStatus,
      closing_date: currentCycle.closingDate,
      due_date: currentCycle.dueDate,
      isCurrentCycle: true,
      items: []
    });

    // 2. Merge persisted Firestore invoices for this card
    invoices
      .filter(inv => inv.card_id === card.id)
      .forEach(inv => {
        const refKey =
          inv.reference_key ||
          `${inv.reference_year}-${String(inv.reference_month).padStart(2, '0')}`;
        map.set(refKey, {
          ...inv,
          id: inv.id || buildInvoiceId(card.id, inv.reference_year, inv.reference_month),
          referenceKey: refKey,
          isCurrentCycle: refKey === currentCycle.referenceKey,
          items: []
        });
      });

    // 3. Group all card transactions into their respective invoice cycle
    const cardTxs = transactions.filter(t => t.card_id === card.id && t.type === 'EXPENSE');
    for (const tx of cardTxs) {
      const cycle = computeCardInvoiceCycle(tx.date, card);
      const refKey = cycle.referenceKey;
      const existing = map.get(refKey);
      if (existing) {
        existing.items.push(tx);
      } else {
        map.set(refKey, {
          id: cycle.invoiceId,
          card_id: card.id,
          reference_month: cycle.referenceMonth,
          reference_year: cycle.referenceYear,
          reference_key: refKey,
          referenceKey: refKey,
          total_amount: 0,
          status: cycle.defaultStatus,
          closing_date: cycle.closingDate,
          due_date: cycle.dueDate,
          isCurrentCycle: refKey === currentCycle.referenceKey,
          items: [tx]
        });
      }
    }

    // 4. Reconcile total_amount and dynamic status from items
    for (const inv of map.values()) {
      const sumItems = roundMoney(inv.items.reduce((acc, t) => acc + t.amount, 0));
      if (inv.items.length > 0) {
        inv.total_amount = sumItems;
      } else {
        inv.total_amount = roundMoney(inv.total_amount || 0);
      }

      if (inv.status !== 'PAID') {
        const allItemsPaid = inv.items.length > 0 && inv.items.every(t => t.status === 'PAID');
        if (allItemsPaid && inv.paid_at) {
          inv.status = 'PAID';
        } else if (todayStr > inv.due_date && inv.total_amount > 0) {
          inv.status = 'OVERDUE';
        } else if (todayStr >= inv.closing_date) {
          inv.status = 'CLOSED';
        } else {
          inv.status = 'OPEN';
        }
      }
    }

    return Array.from(map.values()).sort((a, b) => a.referenceKey.localeCompare(b.referenceKey));
  };

  const handleOpenPayInvoice = (card: CreditCard, invoice: EnrichedCardInvoice) => {
    setPayingInvoice({ card, invoice });
    setPayAccountId(accounts[0]?.id || '');
    setPayDate(new Date().toISOString().slice(0, 10));
  };

  const handleConfirmPayInvoice = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!payingInvoice || !payAccountId) {
      showToast({
        type: 'warning',
        title: 'Conta necessária',
        message: 'Selecione uma conta bancária para debitar o pagamento da fatura'
      });
      return;
    }

    setPayingLoading(true);
    try {
      const { invoice, card } = payingInvoice;
      await FirestoreService.payCardInvoice(
        user.id,
        invoice.id,
        payAccountId,
        payDate,
        invoice,
        invoice.items.map(t => t.id)
      );

      showToast({
        type: 'success',
        title: 'Fatura paga com sucesso',
        message: `Fatura ${String(invoice.reference_month).padStart(2, '0')}/${invoice.reference_year} de ${card.name} liquidada e limite recomposto`
      });
      setPayingInvoice(null);
      onRefreshData();
    } catch (err) {
      console.error(err);
      showToast({
        type: 'error',
        title: 'Falha ao pagar fatura',
        message: 'Não foi possível processar o pagamento da fatura'
      });
    } finally {
      setPayingLoading(false);
    }
  };

  // --- ACCOUNT HANDLERS ---
  const openCreateAccount = () => {
    setEditingAccount(null);
    setAccName('');
    setAccInstitution('');
    setAccType('CHECKING');
    setAccBalance('0');
    setShowAccountModal(true);
  };

  const openEditAccount = (acc: BankAccount) => {
    setEditingAccount(acc);
    setAccName(acc.name);
    setAccInstitution(acc.institution);
    setAccType(acc.type);
    setAccBalance(String(acc.current_balance));
    setShowAccountModal(true);
  };

  const handleSaveAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!accName.trim()) return;
    const balance = roundMoney(parseFloat(accBalance.replace(',', '.')) || 0);

    try {
      if (editingAccount) {
        await FirestoreService.updateAccount(user.id, editingAccount.id, {
          name: accName.trim(),
          institution: accInstitution.trim() || accName.trim(),
          type: accType,
          current_balance: balance
        });
        showToast({
          type: 'success',
          title: 'Conta atualizada',
          message: `Os dados de "${accName.trim()}" foram atualizados`
        });
      } else {
        await FirestoreService.addAccount(user.id, {
          workspace_id: activeWorkspaceId,
          name: accName.trim(),
          institution: accInstitution.trim() || accName.trim(),
          type: accType,
          initial_balance: balance,
          current_balance: balance,
          color: '#10B981',
          icon: 'Landmark'
        });
        showToast({
          type: 'success',
          title: 'Conta adicionada',
          message: `Conta "${accName.trim()}" criada com sucesso`
        });
      }

      setShowAccountModal(false);
      setEditingAccount(null);
      onRefreshData();
    } catch (err) {
      showToast({
        type: 'error',
        title: 'Erro ao salvar conta',
        message: 'Não foi possível salvar as alterações'
      });
    }
  };

  const handleDeleteAccount = async (acc: BankAccount) => {
    const linkedTxsCount = transactions.filter(
      t => t.account_id === acc.id || t.destination_account_id === acc.id
    ).length;

    const confirmed = await confirm({
      title: 'Excluir conta bancária',
      description:
        linkedTxsCount > 0
          ? `A conta "${acc.name}" possui ${linkedTxsCount} lançamento(s) vinculado(s) no histórico. Tem certeza de que deseja excluí-la permanentemente?`
          : `Deseja excluir a conta "${acc.name}" (${formatMoney(acc.current_balance)})?`,
      confirmText: 'Excluir conta',
      cancelText: 'Cancelar',
      variant: 'danger',
      icon: 'trash'
    });

    if (confirmed) {
      try {
        await FirestoreService.deleteAccount(user.id, acc.id);
        showToast({
          type: 'success',
          title: 'Conta excluída',
          message: `"${acc.name}" foi removida da carteira`
        });
        onRefreshData();
      } catch (err) {
        showToast({
          type: 'error',
          title: 'Erro ao excluir',
          message: 'Não foi possível excluir a conta bancária'
        });
      }
    }
  };

  // --- CARD HANDLERS ---
  const openCreateCard = () => {
    setEditingCard(null);
    setCardName('');
    setCardBrand('Mastercard');
    setCardLimit('');
    setClosingDay(25);
    setDueDay(5);
    setShowCardModal(true);
  };

  const openEditCard = (card: CreditCard) => {
    setEditingCard(card);
    setCardName(card.name);
    setCardBrand((card.brand as any) || 'Mastercard');
    setCardLimit(String(card.total_limit));
    setClosingDay(card.closing_day);
    setDueDay(card.due_day);
    setShowCardModal(true);
  };

  const handleSaveCard = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cardName.trim()) return;
    const limit = roundMoney(parseFloat(cardLimit.replace(',', '.')) || 1000);

    try {
      if (editingCard) {
        await FirestoreService.updateCard(user.id, editingCard.id, {
          name: cardName.trim(),
          brand: cardBrand,
          total_limit: limit,
          closing_day: closingDay,
          due_day: dueDay
        });
        showToast({
          type: 'success',
          title: 'Cartão atualizado',
          message: `Limites e ciclo de "${cardName.trim()}" salvos`
        });
      } else {
        await FirestoreService.addCard(user.id, {
          workspace_id: activeWorkspaceId,
          name: cardName.trim(),
          brand: cardBrand,
          total_limit: limit,
          available_limit: limit,
          closing_day: closingDay,
          due_day: dueDay,
          color: '#1F1F1D'
        });
        showToast({
          type: 'success',
          title: 'Cartão adicionado',
          message: `Cartão "${cardName.trim()}" cadastrado`
        });
      }

      setShowCardModal(false);
      setEditingCard(null);
      onRefreshData();
    } catch (err) {
      showToast({
        type: 'error',
        title: 'Erro ao salvar cartão',
        message: 'Não foi possível salvar os dados do cartão'
      });
    }
  };

  const handleDeleteCard = async (card: CreditCard) => {
    const linkedTxsCount = transactions.filter(t => t.card_id === card.id).length;

    const confirmed = await confirm({
      title: 'Excluir cartão de crédito',
      description:
        linkedTxsCount > 0
          ? `O cartão "${card.name}" possui ${linkedTxsCount} lançamento(s) vinculado(s). Deseja confirmar a exclusão permanente deste cartão?`
          : `Deseja excluir o cartão "${card.name}" da sua carteira?`,
      confirmText: 'Excluir cartão',
      cancelText: 'Cancelar',
      variant: 'danger',
      icon: 'trash'
    });

    if (confirmed) {
      try {
        await FirestoreService.deleteCard(user.id, card.id);
        showToast({
          type: 'success',
          title: 'Cartão excluído',
          message: `"${card.name}" foi removido`
        });
        onRefreshData();
      } catch (err) {
        showToast({
          type: 'error',
          title: 'Erro ao excluir',
          message: 'Não foi possível excluir o cartão'
        });
      }
    }
  };

  // --- SUBSCRIPTION HANDLERS ---
  const openCreateSub = () => {
    setEditingSub(null);
    setSubName('');
    setSubAmount('');
    setSubCycle('MONTHLY');
    setShowSubModal(true);
  };

  const openEditSub = (sub: SubscriptionAndLoan) => {
    setEditingSub(sub);
    setSubName(sub.name);
    setSubAmount(String(sub.amount));
    setSubCycle(sub.billing_cycle === 'YEARLY' ? 'YEARLY' : 'MONTHLY');
    setShowSubModal(true);
  };

  const handleSaveSubscription = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!subName.trim()) return;
    const amount = roundMoney(parseFloat(subAmount.replace(',', '.')) || 50);

    try {
      if (editingSub) {
        await FirestoreService.updateSubscription(user.id, editingSub.id, {
          name: subName.trim(),
          amount,
          billing_cycle: subCycle
        });
        showToast({
          type: 'success',
          title: 'Assinatura atualizada',
          message: `"${subName.trim()}" foi atualizada`
        });
      } else {
        await FirestoreService.addSubscription(user.id, {
          workspace_id: activeWorkspaceId,
          name: subName.trim(),
          type: subType,
          amount,
          billing_cycle: subCycle,
          next_billing_date: new Date().toISOString().slice(0, 10),
          category_id: 'cat_assinaturas',
          payment_method: 'CARD'
        });
        showToast({
          type: 'success',
          title: 'Assinatura cadastrada',
          message: `"${subName.trim()}" adicionada às recorrências`
        });
      }

      setShowSubModal(false);
      setEditingSub(null);
      onRefreshData();
    } catch (err) {
      showToast({
        type: 'error',
        title: 'Erro ao salvar assinatura',
        message: 'Não foi possível salvar os dados'
      });
    }
  };

  const handleDeleteSub = async (sub: SubscriptionAndLoan) => {
    const confirmed = await confirm({
      title: 'Excluir assinatura',
      description: `Deseja remover "${sub.name}" (${formatMoney(sub.amount)}) das suas recorrências?`,
      confirmText: 'Excluir',
      cancelText: 'Cancelar',
      variant: 'danger',
      icon: 'trash'
    });

    if (confirmed) {
      try {
        await FirestoreService.deleteSubscription(user.id, sub.id);
        showToast({
          type: 'success',
          title: 'Assinatura excluída',
          message: `"${sub.name}" foi removida`
        });
        onRefreshData();
      } catch (err) {
        showToast({
          type: 'error',
          title: 'Erro ao excluir',
          message: 'Não foi possível remover a assinatura'
        });
      }
    }
  };

  const pureSubscriptions = subscriptions.filter(s => s.type === 'SUBSCRIPTION');
  const monthlySubsCost = pureSubscriptions.reduce(
    (acc, s) => acc + (s.billing_cycle === 'YEARLY' ? roundMoney(s.amount / 12) : s.amount),
    0
  );
  const annualizedSubsCost = roundMoney(monthlySubsCost * 12);

  return (
    <div className="space-y-8 min-w-0">
      {/* SECTION 1: BANK ACCOUNTS */}
      <div>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
          <div>
            <h2 className="text-[15px] font-medium text-primary">Contas bancárias e aplicações</h2>
            <p className="text-xs text-muted mt-0.5">
              Saldos conciliados por instituição
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onOpenNewTransaction}
              className="h-9 px-3 bg-raised hover:opacity-90 border border-subtle text-xs font-medium text-primary rounded-lg transition-colors"
            >
              Transferir
            </button>
            <button
              onClick={openCreateAccount}
              className="h-9 flex items-center gap-1.5 px-3.5 bg-primary hover:opacity-90 text-canvas text-xs font-medium rounded-lg transition-opacity"
            >
              <Plus className="w-4 h-4 stroke-[1.75]" />
              <span>Nova conta</span>
            </button>
          </div>
        </div>

        {accounts.length === 0 ? (
          <div className="p-8 bg-surface border border-subtle rounded-xl text-center space-y-3">
            <Landmark className="w-6 h-6 stroke-[1.5] text-muted mx-auto" />
            <p className="text-xs text-secondary">Nenhuma conta bancária cadastrada</p>
            <button
              onClick={openCreateAccount}
              className="h-9 px-4 bg-[#10B981] text-[#0A0A0A] text-xs font-medium rounded-lg hover:bg-[#059669] transition-colors"
            >
              Adicionar primeira conta
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {accounts.map(acc => (
              <div
                key={acc.id}
                className="bg-surface border border-subtle rounded-xl p-4 sm:p-5 flex flex-col justify-between hover:border-border-focus transition-colors min-w-0"
              >
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs text-muted">
                    {getAccountTypeLabel(acc.type)}
                  </span>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => openEditAccount(acc)}
                      className="p-1 rounded text-muted hover:text-primary transition-colors"
                      title="Editar conta"
                    >
                      <Pencil className="w-3.5 h-3.5 stroke-[1.5]" />
                    </button>
                    <button
                      onClick={() => handleDeleteAccount(acc)}
                      className="p-1 rounded text-muted hover:text-[#EF4444] transition-colors"
                      title="Excluir conta"
                    >
                      <Trash2 className="w-3.5 h-3.5 stroke-[1.5]" />
                    </button>
                  </div>
                </div>

                <div className="min-w-0">
                  <h3 className="text-sm font-medium text-primary truncate">{acc.name}</h3>
                  <p className="text-xs text-muted mt-0.5 truncate">{acc.institution}</p>
                </div>

                <div className="mt-5 pt-3 border-t border-subtle">
                  <span className="text-xs text-muted block mb-1">Saldo atual</span>
                  <span className="text-xl sm:text-2xl font-medium font-mono text-primary tabular-nums truncate block">
                    {formatMoney(acc.current_balance)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* SECTION 2: TACTILE CREDIT CARDS & INVOICES */}
      <div>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
          <div>
            <h2 className="text-[15px] font-medium text-primary">Cartões de crédito, limites e faturas</h2>
            <p className="text-xs text-muted mt-0.5">
              Ciclos de fechamento, navegação por faturas mensais e recomposição de limite
            </p>
          </div>
          <button
            onClick={openCreateCard}
            className="h-9 flex items-center gap-1.5 px-3.5 bg-raised hover:opacity-90 border border-subtle text-xs font-medium text-primary rounded-lg transition-colors self-start sm:self-auto"
          >
            <Plus className="w-4 h-4 stroke-[1.5]" />
            <span>Novo cartão</span>
          </button>
        </div>

        {cards.length === 0 ? (
          <div className="p-8 bg-surface border border-subtle rounded-xl text-center space-y-3">
            <CardIcon className="w-6 h-6 stroke-[1.5] text-muted mx-auto" />
            <p className="text-xs text-secondary">Nenhum cartão de crédito cadastrado</p>
            <button
              onClick={openCreateCard}
              className="h-9 px-4 bg-[#10B981] text-[#0A0A0A] text-xs font-medium rounded-lg hover:bg-[#059669] transition-colors"
            >
              Cadastrar cartão de crédito
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {cards.map(card => {
              const used = Math.max(0, roundMoney(card.total_limit - card.available_limit));
              const usedPct = card.total_limit > 0 ? Math.round((used / card.total_limit) * 100) : 0;

              const cardInvoices = buildCardInvoices(card);
              const defaultInvoice =
                cardInvoices.find(inv => inv.isCurrentCycle) || cardInvoices[cardInvoices.length - 1];
              const selectedKey = selectedInvoiceKeyByCard[card.id] || defaultInvoice.referenceKey;
              const activeIdx = Math.max(
                0,
                cardInvoices.findIndex(inv => inv.referenceKey === selectedKey)
              );
              const activeInvoice = cardInvoices[activeIdx] || defaultInvoice;
              const statusBadge = getInvoiceStatusBadge(activeInvoice.status);
              const isExpanded = Boolean(expandedInvoiceItemsByCard[card.id]);

              return (
                <div
                  key={card.id}
                  className="rounded-2xl p-5 sm:p-6 border border-[#2A2A27] bg-gradient-to-b from-[#1A1A18] to-[#121211] shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] flex flex-col justify-between min-w-0 space-y-4"
                >
                  {/* Top Card Row: EMV Chip + Brand + Actions */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-9 h-7 rounded-md bg-gradient-to-br from-[#D4B475] to-[#9E7E43] border border-[#C5A059]/40 p-1 flex flex-col justify-between opacity-90 shrink-0">
                        <div className="w-full h-px bg-[#121211]/30" />
                        <div className="w-full h-px bg-[#121211]/30" />
                      </div>
                      <div className="min-w-0">
                        <h3 className="text-[15px] font-medium text-[#F2F0EC] leading-tight truncate">{card.name}</h3>
                        <span className="text-xs font-mono text-[#78746C]">
                          {card.brand}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className="text-[10px] sm:text-[11px] font-mono px-2 py-0.5 rounded bg-[#0A0A0A]/80 border border-[#262624] text-[#A39E93]">
                        FECH {String(card.closing_day).padStart(2, '0')} • VENC {String(card.due_day).padStart(2, '0')}
                      </span>
                      <button
                        onClick={() => openEditCard(card)}
                        className="p-1 rounded text-[#A39E93] hover:text-[#F2F0EC] transition-colors"
                        title="Editar cartão"
                      >
                        <Pencil className="w-3.5 h-3.5 stroke-[1.5]" />
                      </button>
                      <button
                        onClick={() => handleDeleteCard(card)}
                        className="p-1 rounded text-[#A39E93] hover:text-[#EF4444] transition-colors"
                        title="Excluir cartão"
                      >
                        <Trash2 className="w-3.5 h-3.5 stroke-[1.5]" />
                      </button>
                    </div>
                  </div>

                  {/* Middle: Available Limit Figure */}
                  <div>
                    <div className="flex items-baseline justify-between gap-2 mb-2">
                      <span className="text-xs text-[#A39E93]">Limite disponível</span>
                      <span className="text-lg sm:text-xl font-medium font-mono text-[#F2F0EC] tabular-nums">
                        {formatMoney(card.available_limit)}
                      </span>
                    </div>
                    <div className="w-full bg-[#0A0A0A] h-1.5 rounded-full overflow-hidden">
                      <div
                        className="bg-[#C5A059] h-full rounded-full"
                        style={{ width: `${Math.min(100, usedPct)}%` }}
                      />
                    </div>
                    <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[11px] font-mono text-[#78746C] tabular-nums">
                      <span>Em uso: {formatMoney(used)} ({usedPct}%)</span>
                      <span>Total: {formatMoney(card.total_limit)}</span>
                    </div>
                  </div>

                  {/* INVOICE PANEL: Current / Previous / Next Selector + Purchases + Pay Button */}
                  <div className="p-3.5 rounded-xl bg-[#0A0A0A]/90 border border-[#262624] space-y-3">
                    {/* Invoice Selector Header */}
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          disabled={activeIdx <= 0}
                          onClick={() => {
                            if (activeIdx > 0) {
                              setSelectedInvoiceKeyByCard(prev => ({
                                ...prev,
                                [card.id]: cardInvoices[activeIdx - 1].referenceKey
                              }));
                            }
                          }}
                          className="p-1 rounded bg-[#141413] border border-[#262624] text-[#A39E93] hover:text-[#F2F0EC] disabled:opacity-30 transition-colors"
                          title="Fatura anterior"
                        >
                          <ChevronLeft className="w-3.5 h-3.5 stroke-[1.5]" />
                        </button>
                        <span className="text-xs font-mono font-medium text-[#F2F0EC] px-1.5">
                          Fatura {String(activeInvoice.reference_month).padStart(2, '0')}/{activeInvoice.reference_year}
                        </span>
                        <button
                          type="button"
                          disabled={activeIdx >= cardInvoices.length - 1}
                          onClick={() => {
                            if (activeIdx < cardInvoices.length - 1) {
                              setSelectedInvoiceKeyByCard(prev => ({
                                ...prev,
                                [card.id]: cardInvoices[activeIdx + 1].referenceKey
                              }));
                            }
                          }}
                          className="p-1 rounded bg-[#141413] border border-[#262624] text-[#A39E93] hover:text-[#F2F0EC] disabled:opacity-30 transition-colors"
                          title="Próxima fatura"
                        >
                          <ChevronRight className="w-3.5 h-3.5 stroke-[1.5]" />
                        </button>
                      </div>

                      <span className={`text-[10px] font-mono px-2 py-0.5 rounded border ${statusBadge.className}`}>
                        {statusBadge.label}
                      </span>
                    </div>

                    {/* Invoice Amount & Dates */}
                    <div className="flex items-baseline justify-between gap-2">
                      <div>
                        <span className="text-[11px] text-[#78746C] block">Total da fatura</span>
                        <span className="text-base font-mono font-medium text-[#F2F0EC] tabular-nums">
                          {formatMoney(activeInvoice.total_amount)}
                        </span>
                      </div>
                      <div className="text-right text-[10px] font-mono text-[#78746C] space-y-0.5">
                        <p>Fech: {activeInvoice.closing_date.split('-').reverse().slice(0, 2).join('/')}</p>
                        <p>Venc: {activeInvoice.due_date.split('-').reverse().slice(0, 2).join('/')}</p>
                      </div>
                    </div>

                    {/* Actions Row: Toggle items + Pay Invoice Button */}
                    <div className="flex items-center justify-between gap-2 pt-2 border-t border-[#262624]">
                      <button
                        type="button"
                        onClick={() =>
                          setExpandedInvoiceItemsByCard(prev => ({
                            ...prev,
                            [card.id]: !prev[card.id]
                          }))
                        }
                        className="text-[11px] text-[#A39E93] hover:text-[#F2F0EC] flex items-center gap-1 transition-colors"
                      >
                        <Receipt className="w-3.5 h-3.5 stroke-[1.5]" />
                        <span>
                          {isExpanded ? 'Ocultar compras' : `Compras (${activeInvoice.items.length})`}
                        </span>
                      </button>

                      {activeInvoice.status === 'PAID' ? (
                        <span className="text-[11px] text-[#10B981] font-medium flex items-center gap-1">
                          <CheckCircle2 className="w-3.5 h-3.5 stroke-[1.5]" />
                          <span>Liquidada</span>
                        </span>
                      ) : (
                        <button
                          type="button"
                          disabled={activeInvoice.total_amount <= 0}
                          onClick={() => handleOpenPayInvoice(card, activeInvoice)}
                          className="h-7 px-2.5 bg-[#10B981] hover:bg-[#059669] disabled:opacity-35 text-[#0A0A0A] text-[11px] font-medium rounded-md transition-colors"
                        >
                          Pagar fatura
                        </button>
                      )}
                    </div>

                    {/* Expandable Invoice Items List */}
                    {isExpanded && (
                      <div className="pt-2 border-t border-[#262624] max-h-40 overflow-y-auto space-y-1.5 scrollbar-thin">
                        {activeInvoice.items.length === 0 ? (
                          <p className="text-[11px] text-[#78746C] text-center py-2">
                            Nenhum lançamento nesta fatura
                          </p>
                        ) : (
                          activeInvoice.items.map(tx => (
                            <div
                              key={tx.id}
                              className="flex items-center justify-between gap-2 text-[11px] py-1 border-b border-[#262624]/50 last:border-none"
                            >
                              <div className="min-w-0 flex-1">
                                <p className="text-[#F2F0EC] truncate">{tx.description}</p>
                                <p className="text-[10px] font-mono text-[#78746C]">
                                  {tx.date.split('-').reverse().join('/')}
                                </p>
                              </div>
                              <span className="font-mono text-[#F2F0EC] tabular-nums shrink-0">
                                {formatMoney(tx.amount)}
                              </span>
                            </div>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* SECTION 3: SUBSCRIPTIONS & RECURRENCES */}
      <div>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
          <div>
            <h2 className="text-[15px] font-medium text-primary">Assinaturas e serviços recorrentes</h2>
            <p className="text-xs text-muted mt-0.5">
              Custo fixo mensal e projeção anualizada
            </p>
          </div>
          <button
            onClick={openCreateSub}
            className="h-9 flex items-center gap-1.5 px-3.5 bg-raised hover:opacity-90 border border-subtle text-xs font-medium text-primary rounded-lg transition-colors self-start sm:self-auto"
          >
            <Plus className="w-4 h-4 stroke-[1.5]" />
            <span>Nova assinatura</span>
          </button>
        </div>

        <div className="bg-surface border border-subtle rounded-xl p-4 sm:p-5 space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-subtle">
            <span className="text-xs text-secondary">Comprometimento anualizado</span>
            <span className="text-sm font-mono font-medium text-primary tabular-nums">
              {formatMoney(annualizedSubsCost)} / ano
            </span>
          </div>

          {pureSubscriptions.length === 0 ? (
            <p className="text-xs text-muted py-4 text-center">Nenhuma assinatura recorrente cadastrada</p>
          ) : (
            <div className="divide-y divide-subtle">
              {pureSubscriptions.map(sub => (
                <div key={sub.id} className="h-12 flex items-center justify-between gap-2 text-xs">
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <Repeat className="w-4 h-4 stroke-[1.5] text-muted shrink-0" />
                    <div className="min-w-0">
                      <p className="font-medium text-primary truncate">{sub.name}</p>
                      <p className="text-[11px] text-muted">
                        Ciclo {sub.billing_cycle === 'MONTHLY' ? 'mensal' : 'anual'}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <div className="text-right font-mono tabular-nums">
                      <p className="font-medium text-primary">
                        {formatMoney(sub.amount)}/{sub.billing_cycle === 'YEARLY' ? 'ano' : 'mês'}
                      </p>
                      <p className="text-[11px] text-muted">
                        {sub.billing_cycle === 'YEARLY'
                          ? `${formatMoney(roundMoney(sub.amount / 12))}/mês`
                          : `${formatMoney(roundMoney(sub.amount * 12))}/ano`}
                      </p>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => openEditSub(sub)}
                        className="p-1 rounded text-muted hover:text-primary transition-colors"
                        title="Editar assinatura"
                      >
                        <Pencil className="w-3.5 h-3.5 stroke-[1.5]" />
                      </button>
                      <button
                        onClick={() => handleDeleteSub(sub)}
                        className="p-1 rounded text-muted hover:text-[#EF4444] transition-colors"
                        title="Excluir assinatura"
                      >
                        <Trash2 className="w-3.5 h-3.5 stroke-[1.5]" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* MODAL: PAY CREDIT CARD INVOICE */}
      {payingInvoice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
          <div className="w-full max-w-md bg-surface border border-subtle rounded-2xl p-6 space-y-4 relative">
            <button
              onClick={() => setPayingInvoice(null)}
              className="absolute top-5 right-5 text-muted hover:text-primary"
            >
              <X className="w-4 h-4 stroke-[1.5]" />
            </button>

            <div>
              <h3 className="text-[15px] font-medium text-primary">
                Pagar fatura — {payingInvoice.card.name}
              </h3>
              <p className="text-xs text-muted mt-0.5">
                Competência {String(payingInvoice.invoice.reference_month).padStart(2, '0')}/
                {payingInvoice.invoice.reference_year} • Vencimento{' '}
                {payingInvoice.invoice.due_date.split('-').reverse().join('/')}
              </p>
            </div>

            <div className="p-4 bg-canvas border border-subtle rounded-xl flex items-center justify-between">
              <span className="text-xs text-secondary">Valor da fatura</span>
              <span className="text-lg font-mono font-medium text-primary tabular-nums">
                {formatMoney(payingInvoice.invoice.total_amount)}
              </span>
            </div>

            <p className="text-[11px] text-muted leading-relaxed">
              O pagamento debitará o saldo da conta bancária selecionada e recomporá automaticamente o limite
              disponível do cartão, sem duplicar despesas nos relatórios.
            </p>

            <form onSubmit={handleConfirmPayInvoice} className="space-y-4">
              <div>
                <label className="block text-xs text-secondary mb-1.5">
                  Conta bancária para débito
                </label>
                <select
                  required
                  value={payAccountId}
                  onChange={e => setPayAccountId(e.target.value)}
                  className="w-full h-10 bg-canvas border border-subtle rounded-lg px-3 text-xs text-primary outline-none"
                >
                  {accounts.length === 0 ? (
                    <option value="">Cadastre uma conta bancária primeiro</option>
                  ) : (
                    accounts.map(acc => (
                      <option key={acc.id} value={acc.id}>
                        {acc.name} — Saldo: {formatMoney(acc.current_balance)}
                      </option>
                    ))
                  )}
                </select>
              </div>

              <div>
                <label className="block text-xs text-secondary mb-1.5">
                  Data do pagamento
                </label>
                <input
                  type="date"
                  required
                  value={payDate}
                  onChange={e => setPayDate(e.target.value)}
                  className="w-full h-10 bg-canvas border border-subtle rounded-lg px-3 text-xs font-mono text-primary outline-none"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-subtle">
                <button
                  type="button"
                  onClick={() => setPayingInvoice(null)}
                  className="h-9 px-3 text-xs text-secondary hover:text-primary"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={payingLoading || accounts.length === 0}
                  className="h-9 px-4 bg-[#10B981] hover:bg-[#059669] disabled:opacity-40 text-[#0A0A0A] font-medium text-xs rounded-lg transition-colors"
                >
                  {payingLoading ? 'Liquidando...' : 'Confirmar pagamento'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: CREATE / EDIT ACCOUNT */}
      {showAccountModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
          <div className="w-full max-w-md bg-surface border border-subtle rounded-2xl p-6 space-y-4 relative">
            <button
              onClick={() => {
                setShowAccountModal(false);
                setEditingAccount(null);
              }}
              className="absolute top-5 right-5 text-muted hover:text-primary"
            >
              <X className="w-4 h-4 stroke-[1.5]" />
            </button>
            <h3 className="text-[15px] font-medium text-primary">
              {editingAccount ? 'Editar conta bancária' : 'Nova conta bancária'}
            </h3>

            <form onSubmit={handleSaveAccount} className="space-y-4">
              <div>
                <label className="block text-xs text-secondary mb-1.5">Nome da conta ou instituição</label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Itaú Personalité, Nubank, Bradesco"
                  value={accName}
                  onChange={e => setAccName(e.target.value)}
                  className="w-full h-10 bg-canvas border border-subtle focus:border-[#10B981] rounded-lg px-3 text-xs text-primary outline-none"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-secondary mb-1.5">Modalidade</label>
                  <select
                    value={accType}
                    onChange={e => setAccType(e.target.value as any)}
                    className="w-full h-10 bg-canvas border border-subtle rounded-lg px-3 text-xs text-primary outline-none"
                  >
                    <option value="CHECKING">Conta corrente</option>
                    <option value="SAVINGS">Poupança</option>
                    <option value="INVESTMENT">Investimento</option>
                    <option value="CASH">Caixa físico</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-secondary mb-1.5">Saldo atual (R$)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={accBalance}
                    onChange={e => setAccBalance(e.target.value)}
                    className="w-full h-10 bg-canvas border border-subtle rounded-lg px-3 text-xs font-mono font-medium text-primary outline-none"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-subtle">
                <button
                  type="button"
                  onClick={() => {
                    setShowAccountModal(false);
                    setEditingAccount(null);
                  }}
                  className="h-9 px-3 text-xs text-secondary hover:text-primary"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="h-9 px-4 bg-primary hover:opacity-90 text-canvas font-medium text-xs rounded-lg transition-opacity"
                >
                  {editingAccount ? 'Salvar alterações' : 'Salvar conta'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: CREATE / EDIT CARD */}
      {showCardModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
          <div className="w-full max-w-md bg-surface border border-subtle rounded-2xl p-6 space-y-4 relative">
            <button
              onClick={() => {
                setShowCardModal(false);
                setEditingCard(null);
              }}
              className="absolute top-5 right-5 text-muted hover:text-primary"
            >
              <X className="w-4 h-4 stroke-[1.5]" />
            </button>
            <h3 className="text-[15px] font-medium text-primary">
              {editingCard ? 'Editar cartão de crédito' : 'Novo cartão de crédito'}
            </h3>

            <form onSubmit={handleSaveCard} className="space-y-4">
              <div>
                <label className="block text-xs text-secondary mb-1.5">Identificação do cartão</label>
                <input
                  type="text"
                  required
                  placeholder="Ex: C6 Carbon, Ultravioleta, Itaú Black"
                  value={cardName}
                  onChange={e => setCardName(e.target.value)}
                  className="w-full h-10 bg-canvas border border-subtle focus:border-[#10B981] rounded-lg px-3 text-xs text-primary outline-none"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-secondary mb-1.5">Bandeira</label>
                  <select
                    value={cardBrand}
                    onChange={e => setCardBrand(e.target.value as any)}
                    className="w-full h-10 bg-canvas border border-subtle rounded-lg px-3 text-xs text-primary outline-none"
                  >
                    <option value="Mastercard">Mastercard</option>
                    <option value="Visa">Visa</option>
                    <option value="Elo">Elo</option>
                    <option value="Amex">Amex</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-secondary mb-1.5">Limite total (R$)</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    placeholder="10000"
                    value={cardLimit}
                    onChange={e => setCardLimit(e.target.value)}
                    className="w-full h-10 bg-canvas border border-subtle rounded-lg px-3 text-xs font-mono font-medium text-primary outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-secondary mb-1.5">Dia de fechamento</label>
                  <input
                    type="number"
                    min="1"
                    max="31"
                    value={closingDay}
                    onChange={e => setClosingDay(parseInt(e.target.value, 10))}
                    className="w-full h-10 bg-canvas border border-subtle rounded-lg px-3 text-xs font-mono text-primary outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs text-secondary mb-1.5">Dia de vencimento</label>
                  <input
                    type="number"
                    min="1"
                    max="31"
                    value={dueDay}
                    onChange={e => setDueDay(parseInt(e.target.value, 10))}
                    className="w-full h-10 bg-canvas border border-subtle rounded-lg px-3 text-xs font-mono text-primary outline-none"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-subtle">
                <button
                  type="button"
                  onClick={() => {
                    setShowCardModal(false);
                    setEditingCard(null);
                  }}
                  className="h-9 px-3 text-xs text-secondary hover:text-primary"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="h-9 px-4 bg-primary hover:opacity-90 text-canvas font-medium text-xs rounded-lg transition-opacity"
                >
                  {editingCard ? 'Salvar alterações' : 'Salvar cartão'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: CREATE / EDIT SUBSCRIPTION */}
      {showSubModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
          <div className="w-full max-w-md bg-surface border border-subtle rounded-2xl p-6 space-y-4 relative">
            <button
              onClick={() => {
                setShowSubModal(false);
                setEditingSub(null);
              }}
              className="absolute top-5 right-5 text-muted hover:text-primary"
            >
              <X className="w-4 h-4 stroke-[1.5]" />
            </button>
            <h3 className="text-[15px] font-medium text-primary">
              {editingSub ? 'Editar assinatura recorrente' : 'Nova assinatura recorrente'}
            </h3>

            <form onSubmit={handleSaveSubscription} className="space-y-4">
              <div>
                <label className="block text-xs text-secondary mb-1.5">Nome do serviço</label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Netflix, Spotify, iCloud"
                  value={subName}
                  onChange={e => setSubName(e.target.value)}
                  className="w-full h-10 bg-canvas border border-subtle focus:border-[#10B981] rounded-lg px-3 text-xs text-primary outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-secondary mb-1.5">Valor (R$)</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    placeholder="49,90"
                    value={subAmount}
                    onChange={e => setSubAmount(e.target.value)}
                    className="w-full h-10 bg-canvas border border-subtle rounded-lg px-3 text-xs font-mono font-medium text-primary outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs text-secondary mb-1.5">Periodicidade</label>
                  <select
                    value={subCycle}
                    onChange={e => setSubCycle(e.target.value as any)}
                    className="w-full h-10 bg-canvas border border-subtle rounded-lg px-3 text-xs text-primary outline-none"
                  >
                    <option value="MONTHLY">Mensal</option>
                    <option value="YEARLY">Anual</option>
                  </select>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-subtle">
                <button
                  type="button"
                  onClick={() => {
                    setShowSubModal(false);
                    setEditingSub(null);
                  }}
                  className="h-9 px-3 text-xs text-secondary hover:text-primary"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="h-9 px-4 bg-primary hover:opacity-90 text-canvas font-medium text-xs rounded-lg transition-opacity"
                >
                  {editingSub ? 'Salvar alterações' : 'Salvar assinatura'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
