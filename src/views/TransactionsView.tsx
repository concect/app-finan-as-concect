import React, { useState } from 'react';
import {
  Search,
  FileSpreadsheet,
  Upload,
  Calendar,
  List,
  Plus,
  Pencil,
  Trash2,
  CheckCircle2,
  Clock,
  Printer,
  ChevronLeft,
  ChevronRight,
  X
} from 'lucide-react';
import { Transaction, Category, BankAccount, CreditCard, User, Reminder } from '../types';
import { FirestoreService, roundMoney } from '../services/firestoreService';
import { useFeedback } from '../contexts/FeedbackContext';
import { ImportStatementModal } from '../components/ImportStatementModal';

interface TransactionsViewProps {
  user: User;
  activeWorkspaceId?: string;
  workspaceType?: 'INDIVIDUAL' | 'FAMILY' | 'BUSINESS';
  transactions: Transaction[];
  categories: Category[];
  accounts: BankAccount[];
  cards: CreditCard[];
  reminders?: Reminder[];
  onOpenNewTransaction: () => void;
  onEditTransaction?: (tx: Transaction) => void;
  onRefreshData: () => void;
}

export const TransactionsView: React.FC<TransactionsViewProps> = ({
  user,
  activeWorkspaceId = 'ws_personal',
  transactions,
  categories,
  accounts,
  cards,
  reminders = [],
  onOpenNewTransaction,
  onEditTransaction,
  onRefreshData
}) => {
  const { confirm, showToast } = useFeedback();

  const [viewMode, setViewMode] = useState<'LIST' | 'CALENDAR'>('LIST');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedType, setSelectedType] = useState<string>('ALL');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [selectedStatus, setSelectedStatus] = useState<string>('ALL');

  const now = new Date();
  const [currentYear, setCurrentYear] = useState<number>(now.getFullYear());
  const [currentMonth, setCurrentMonth] = useState<number>(now.getMonth() + 1);
  const [selectedDay, setSelectedDay] = useState<number>(now.getDate());

  // Import Statement Modal State (CSV / OFX)
  const [showImportModal, setShowImportModal] = useState(false);

  // New Manual Reminder / Scheduled Bill Modal State
  const [showAddReminderModal, setShowAddReminderModal] = useState(false);
  const [remType, setRemType] = useState<'PAYABLE' | 'RECEIVABLE'>('PAYABLE');
  const [remTitle, setRemTitle] = useState('');
  const [remAmount, setRemAmount] = useState('');
  const [remDueDate, setRemDueDate] = useState(new Date().toISOString().slice(0, 10));
  const [remCategoryId, setRemCategoryId] = useState('');
  const [remRecurring, setRemRecurring] = useState(false);
  const [remNotes, setRemNotes] = useState('');
  const [remSubmitting, setRemSubmitting] = useState(false);

  // Settle Reminder ("Dar baixa") Modal State
  const [settlingReminder, setSettlingReminder] = useState<Reminder | null>(null);
  const [settleAccountId, setSettleAccountId] = useState<string>('');
  const [settleCreateTx, setSettleCreateTx] = useState<boolean>(true);
  const [settleDate, setSettleDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [settleLoading, setSettleLoading] = useState<boolean>(false);

  const formatMoney = (val: number) => {
    if (user.privacy_mode) return '••••••';
    return `R$ ${val.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const filteredTxs = transactions.filter(tx => {
    if (searchTerm) {
      const matchDesc = tx.description.toLowerCase().includes(searchTerm.toLowerCase());
      const matchCat = categories.find(c => c.id === tx.category_id)?.name.toLowerCase().includes(searchTerm.toLowerCase());
      if (!matchDesc && !matchCat) return false;
    }
    if (selectedType !== 'ALL' && tx.type !== selectedType) return false;
    if (selectedCategory !== 'ALL' && tx.category_id !== selectedCategory) return false;
    if (selectedStatus !== 'ALL' && tx.status !== selectedStatus) return false;
    return true;
  });

  const handleOpenCreateReminder = () => {
    setRemType('PAYABLE');
    setRemTitle('');
    setRemAmount('');
    setRemDueDate(new Date().toISOString().slice(0, 10));
    const defaultCat = categories.find(c => c.type === 'EXPENSE')?.id || '';
    setRemCategoryId(defaultCat);
    setRemRecurring(false);
    setRemNotes('');
    setShowAddReminderModal(true);
  };

  const handleCreateReminder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!remTitle.trim()) return;
    setRemSubmitting(true);

    try {
      const parsedAmount = roundMoney(parseFloat(remAmount.replace(',', '.')) || 0);
      const fallbackCat =
        categories.find(c => c.type === (remType === 'RECEIVABLE' ? 'INCOME' : 'EXPENSE'))?.id ||
        'cat_general';

      await FirestoreService.addReminder(user.id, {
        workspace_id: activeWorkspaceId,
        title: remTitle.trim(),
        amount: parsedAmount > 0 ? parsedAmount : undefined,
        due_date: remDueDate,
        type: remType,
        status: 'PENDING',
        category_id: remCategoryId || fallbackCat,
        is_recurring: remRecurring,
        notes: remNotes.trim() || undefined
      });

      showToast({
        type: 'success',
        title: 'Compromisso agendado',
        message: `"${remTitle.trim()}" adicionado à agenda financeira`
      });
      setShowAddReminderModal(false);
      onRefreshData();
    } catch (err) {
      showToast({
        type: 'error',
        title: 'Erro ao agendar',
        message: 'Não foi possível salvar o compromisso'
      });
    } finally {
      setRemSubmitting(false);
    }
  };

  const handleOpenSettleReminder = (rem: Reminder) => {
    if (rem.status === 'PAID') {
      // Revert reminder status to PENDING
      FirestoreService.updateReminderStatus(user.id, rem.id, 'PENDING').then(() => {
        showToast({
          type: 'info',
          title: 'Marcado como pendente',
          message: `"${rem.title}" voltou para pendente`
        });
        onRefreshData();
      });
      return;
    }

    setSettlingReminder(rem);
    setSettleAccountId(accounts[0]?.id || '');
    setSettleCreateTx(Boolean((rem.amount || 0) > 0 && !rem.linked_transaction_id));
    setSettleDate(new Date().toISOString().slice(0, 10));
  };

  const handleConfirmSettleReminder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!settlingReminder) return;

    setSettleLoading(true);
    try {
      await FirestoreService.markReminderAsPaid(
        user.id,
        settlingReminder,
        settleCreateTx ? settleAccountId : undefined,
        settleCreateTx,
        settleDate
      );
      showToast({
        type: 'success',
        title: 'Compromisso liquidado',
        message: settleCreateTx && settleAccountId
          ? 'Baixa registrada no extrato e saldo da conta atualizado'
          : 'Compromisso marcado como pago na agenda'
      });
      setSettlingReminder(null);
      onRefreshData();
    } catch (err) {
      showToast({
        type: 'error',
        title: 'Erro ao dar baixa',
        message: 'Não foi possível liquidar o compromisso'
      });
    } finally {
      setSettleLoading(false);
    }
  };

  const handleDeleteReminder = async (rem: Reminder) => {
    const confirmed = await confirm({
      title: 'Excluir compromisso agendado',
      description: `Deseja remover "${rem.title}" da sua agenda de contas a pagar e receber?`,
      confirmText: 'Excluir',
      cancelText: 'Cancelar',
      variant: 'danger',
      icon: 'trash'
    });

    if (confirmed) {
      try {
        await FirestoreService.deleteReminder(user.id, rem.id);
        showToast({
          type: 'success',
          title: 'Compromisso removido',
          message: 'O item foi excluído da agenda'
        });
        onRefreshData();
      } catch (err) {
        showToast({
          type: 'error',
          title: 'Erro ao excluir',
          message: 'Não foi possível remover o compromisso'
        });
      }
    }
  };

  const handleDelete = async (id: string) => {
    const tx = transactions.find(t => t.id === id);
    const desc = tx?.description ? `"${tx.description}"` : 'este lançamento';

    const confirmed = await confirm({
      title: 'Excluir lançamento',
      description: `Deseja remover ${desc}? Os saldos das contas, faturas e limites de cartão serão recalculados.`,
      confirmText: 'Excluir',
      cancelText: 'Cancelar',
      variant: 'danger',
      icon: 'trash'
    });

    if (confirmed) {
      try {
        await FirestoreService.deleteTransaction(user.id, id);
        showToast({
          type: 'success',
          title: 'Lançamento excluído',
          message: 'O registro foi removido e os saldos foram estornados'
        });
        onRefreshData();
      } catch (err: any) {
        showToast({
          type: 'error',
          title: 'Falha ao excluir',
          message: 'Não foi possível remover o lançamento'
        });
      }
    }
  };

  const handleToggleStatus = async (id: string, currentStatus: string) => {
    const nextStatus = currentStatus === 'PAID' ? 'PENDING' : 'PAID';
    try {
      await FirestoreService.updateTransactionStatus(user.id, id, nextStatus as any);
      showToast({
        type: 'success',
        title: nextStatus === 'PAID' ? 'Lançamento liquidado' : 'Lançamento revertido para pendente',
        message: 'O saldo da conta vinculada foi atualizado automaticamente'
      });
      onRefreshData();
    } catch (err) {
      showToast({
        type: 'error',
        title: 'Falha ao atualizar status',
        message: 'Não foi possível alterar o status do lançamento'
      });
    }
  };

  const handleExportCsv = () => {
    const headers = ['Data', 'Tipo', 'Descrição', 'Valor (R$)', 'Categoria', 'Conta / Cartão', 'Status', 'Origem', 'Parcelas'];
    const rows = filteredTxs.map(t => {
      const cat = categories.find(c => c.id === t.category_id)?.name || (t.type === 'TRANSFER' ? 'Transferência' : 'Geral');
      let sourceName = 'Geral';
      if (t.type === 'TRANSFER') {
        const orig = accounts.find(a => a.id === t.account_id)?.name || 'Origem';
        const dest = accounts.find(a => a.id === t.destination_account_id)?.name || 'Destino';
        sourceName = `${orig} -> ${dest}`;
      } else if (t.account_id) {
        sourceName = accounts.find(a => a.id === t.account_id)?.name || 'Conta';
      } else if (t.card_id) {
        sourceName = cards.find(c => c.id === t.card_id)?.name || 'Cartão';
      }
      const installments = t.installment_total ? `${t.installment_current || 1}/${t.installment_total}` : '1/1';
      const formattedAmount = t.type === 'EXPENSE' ? `-${t.amount.toFixed(2)}` : t.amount.toFixed(2);

      return [
        t.date,
        t.type,
        `"${t.description.replace(/"/g, '""')}"`,
        formattedAmount.replace('.', ','),
        `"${cat}"`,
        `"${sourceName}"`,
        t.status,
        t.source,
        installments
      ].join(';');
    });

    const csvContent = '\uFEFF' + [headers.join(';'), ...rows].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `concect_extrato_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const daysInMonth = new Date(currentYear, currentMonth, 0).getDate();
  const firstDayOfWeek = new Date(currentYear, currentMonth - 1, 1).getDay();

  const monthNames = [
    'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
  ];

  const activeSelectedDay = Math.min(selectedDay, daysInMonth);
  const selectedDateStr = `${currentYear}-${String(currentMonth).padStart(2, '0')}-${String(activeSelectedDay).padStart(2, '0')}`;
  const selectedDayTxs = transactions.filter(t => t.date === selectedDateStr);
  const selectedDayReminders = reminders.filter(r => r.due_date === selectedDateStr);

  const reminderFilteredCategories = categories.filter(c =>
    remType === 'RECEIVABLE' ? c.type === 'INCOME' : c.type === 'EXPENSE'
  );

  return (
    <div className="space-y-6 min-w-0">
      {/* Top Header & Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-surface border border-subtle rounded-xl p-4 sm:p-5">
        <div className="min-w-0">
          <h2 className="text-[15px] font-medium text-primary">Extrato e agenda financeira</h2>
          <p className="text-xs text-muted mt-0.5">
            Conciliação de receitas, despesas, transferências e compromissos agendados
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center bg-canvas p-1 rounded-lg border border-subtle">
            <button
              onClick={() => setViewMode('LIST')}
              className={`h-7 flex items-center gap-1.5 px-2.5 rounded-md text-xs font-medium transition-colors ${
                viewMode === 'LIST'
                  ? 'bg-raised text-primary'
                  : 'text-muted hover:text-primary'
              }`}
            >
              <List className="w-3.5 h-3.5 stroke-[1.5]" />
              <span>Lista</span>
            </button>
            <button
              onClick={() => setViewMode('CALENDAR')}
              className={`h-7 flex items-center gap-1.5 px-2.5 rounded-md text-xs font-medium transition-colors ${
                viewMode === 'CALENDAR'
                  ? 'bg-raised text-primary'
                  : 'text-muted hover:text-primary'
              }`}
            >
              <Calendar className="w-3.5 h-3.5 stroke-[1.5]" />
              <span>Calendário</span>
            </button>
          </div>

          <button
            onClick={() => setShowImportModal(true)}
            className="h-9 flex items-center gap-1.5 px-3 bg-raised hover:bg-surface-hover border border-subtle text-xs font-normal text-primary rounded-lg transition-colors"
            title="Importar Extrato (CSV / OFX)"
          >
            <Upload className="w-4 h-4 stroke-[1.5] text-[#10B981]" />
            <span className="hidden sm:inline">Importar CSV/OFX</span>
          </button>

          <button
            onClick={handleExportCsv}
            className="h-9 flex items-center gap-1.5 px-3 bg-raised hover:bg-surface-hover border border-subtle text-xs font-normal text-primary rounded-lg transition-colors"
            title="Exportar CSV"
          >
            <FileSpreadsheet className="w-4 h-4 stroke-[1.5] text-secondary" />
            <span className="hidden sm:inline">CSV</span>
          </button>

          <button
            onClick={() => window.print()}
            className="h-9 flex items-center gap-1.5 px-3 bg-raised hover:bg-surface-hover border border-subtle text-xs font-normal text-primary rounded-lg transition-colors"
            title="Imprimir ou salvar PDF"
          >
            <Printer className="w-4 h-4 stroke-[1.5] text-secondary" />
            <span className="hidden sm:inline">PDF</span>
          </button>

          <button
            onClick={onOpenNewTransaction}
            className="h-9 flex items-center gap-1.5 px-3.5 bg-primary hover:opacity-90 text-canvas text-xs font-medium rounded-lg transition-opacity"
          >
            <Plus className="w-4 h-4 stroke-[1.75]" />
            <span>Novo lançamento</span>
          </button>
        </div>
      </div>

      {/* SECTION: Contas a Pagar e Receber / Lembretes Agendados */}
      <div className="bg-surface border border-subtle rounded-xl p-4 sm:p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 stroke-[1.5] text-[#D97706] shrink-0" />
            <div>
              <h3 className="text-sm font-medium text-primary">
                Contas a pagar e receber agendadas ({reminders.filter(r => r.status === 'PENDING').length} pendentes)
              </h3>
              <p className="text-xs text-muted">
                Agende compromissos futuros e dê baixa integrando diretamente ao saldo da conta
              </p>
            </div>
          </div>

          <button
            onClick={handleOpenCreateReminder}
            className="h-8 flex items-center gap-1.5 px-3 bg-raised hover:bg-surface-hover border border-subtle text-xs font-medium text-primary rounded-lg transition-colors self-start sm:self-auto shrink-0"
          >
            <Plus className="w-3.5 h-3.5 stroke-[1.5]" />
            <span>Novo lembrete / conta agendada</span>
          </button>
        </div>

        {reminders.length === 0 ? (
          <div className="p-4 bg-canvas border border-subtle rounded-lg flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs text-muted">
            <span>Nenhum compromisso ou lembrete agendado no momento.</span>
            <button
              onClick={handleOpenCreateReminder}
              className="text-[#10B981] font-medium hover:underline self-start sm:self-auto"
            >
              Agendar primeira conta a pagar ou receber
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            {reminders.map(rem => {
              const isReceivable = rem.type === 'RECEIVABLE';
              return (
                <div
                  key={rem.id}
                  className={`p-3 rounded-lg border flex items-center justify-between gap-3 ${
                    rem.status === 'PAID'
                      ? 'bg-canvas border-subtle opacity-60'
                      : 'bg-raised border-subtle'
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span
                        className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                          isReceivable ? 'bg-[#10B981]' : 'bg-[#D97706]'
                        }`}
                      />
                      <p className={`text-xs font-medium truncate ${rem.status === 'PAID' ? 'line-through text-muted' : 'text-primary'}`}>
                        {rem.title}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 mt-1 text-[11px] text-muted font-mono tabular-nums">
                      <span>{rem.due_date.split('-').reverse().join('/')}</span>
                      {rem.amount ? (
                        <span className={isReceivable ? 'text-[#10B981]' : 'text-primary'}>
                          {isReceivable ? '+' : '-'}R$ {rem.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </span>
                      ) : null}
                      {rem.is_recurring && (
                        <span className="text-[10px] px-1 py-0.2 rounded bg-surface border border-subtle">
                          Mensal
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => handleOpenSettleReminder(rem)}
                      className={`px-2 py-1 rounded text-[11px] font-medium flex items-center gap-1 transition-colors ${
                        rem.status === 'PAID'
                          ? 'text-[#10B981] bg-[#10B981]/10 hover:bg-[#10B981]/20'
                          : 'text-primary bg-surface hover:bg-[#10B981]/15 hover:text-[#10B981] border border-subtle'
                      }`}
                      title={rem.status === 'PAID' ? 'Reabrir como pendente' : 'Dar baixa no compromisso'}
                    >
                      <CheckCircle2 className="w-3.5 h-3.5 stroke-[1.5]" />
                      <span>{rem.status === 'PAID' ? 'Pago' : 'Baixar'}</span>
                    </button>
                    <button
                      onClick={() => handleDeleteReminder(rem)}
                      className="p-1.5 rounded text-muted hover:text-[#EF4444] transition-colors"
                      title="Excluir compromisso"
                    >
                      <Trash2 className="w-4 h-4 stroke-[1.5]" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Filter Bar */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 bg-surface border border-subtle rounded-xl p-4">
        <div className="relative">
          <Search className="w-4 h-4 stroke-[1.5] absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input
            type="text"
            placeholder="Buscar lançamento"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="w-full h-9 bg-canvas border border-subtle focus:border-[#10B981] rounded-lg pl-9 pr-3 text-xs text-primary outline-none"
          />
        </div>

        <div>
          <select
            value={selectedType}
            onChange={e => setSelectedType(e.target.value)}
            className="w-full h-9 bg-canvas border border-subtle focus:border-[#10B981] rounded-lg px-3 text-xs text-primary outline-none"
          >
            <option value="ALL">Todos os tipos</option>
            <option value="EXPENSE">Despesas</option>
            <option value="INCOME">Receitas</option>
            <option value="TRANSFER">Transferências</option>
          </select>
        </div>

        <div>
          <select
            value={selectedCategory}
            onChange={e => setSelectedCategory(e.target.value)}
            className="w-full h-9 bg-canvas border border-subtle focus:border-[#10B981] rounded-lg px-3 text-xs text-primary outline-none"
          >
            <option value="ALL">Todas as categorias</option>
            {categories.map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>

        <div>
          <select
            value={selectedStatus}
            onChange={e => setSelectedStatus(e.target.value)}
            className="w-full h-9 bg-canvas border border-subtle focus:border-[#10B981] rounded-lg px-3 text-xs text-primary outline-none"
          >
            <option value="ALL">Todos os status</option>
            <option value="PAID">Liquidados</option>
            <option value="PENDING">Pendentes</option>
          </select>
        </div>
      </div>

      {/* Main Content: LIST or CALENDAR */}
      {viewMode === 'LIST' ? (
        <div className="bg-surface border border-subtle rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-deep text-muted border-b border-subtle">
                <tr>
                  <th className="py-3 px-4 font-normal">Data</th>
                  <th className="py-3 px-4 font-normal">Descrição</th>
                  <th className="py-3 px-4 font-normal">Categoria</th>
                  <th className="py-3 px-4 font-normal">Conta ou cartão</th>
                  <th className="py-3 px-4 font-normal text-right">Valor</th>
                  <th className="py-3 px-4 font-normal text-center">Status</th>
                  <th className="py-3 px-4 font-normal text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-subtle">
                {filteredTxs.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-10 text-center text-muted">
                      Nenhum lançamento encontrado para os filtros aplicados
                    </td>
                  </tr>
                ) : (
                  filteredTxs.map(tx => {
                    const cat = categories.find(c => c.id === tx.category_id);
                    const acc = accounts.find(a => a.id === tx.account_id);
                    const destAcc = accounts.find(a => a.id === tx.destination_account_id);
                    const card = cards.find(c => c.id === tx.card_id);

                    const sourceDisplay =
                      tx.type === 'TRANSFER'
                        ? `${acc?.name || 'Origem'} → ${destAcc?.name || 'Destino'}`
                        : card?.name || acc?.name || 'Geral';

                    return (
                      <tr key={tx.id} className="h-12 hover:bg-surface-hover transition-colors">
                        <td className="py-3 px-4 font-mono text-muted tabular-nums whitespace-nowrap">
                          {tx.date.split('-').reverse().join('/')}
                        </td>
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-primary">{tx.description}</span>
                            {tx.installment_total && (
                              <span className="text-[11px] font-mono px-1.5 py-0.5 rounded bg-raised text-secondary border border-subtle">
                                {tx.installment_current || 1}/{tx.installment_total}
                              </span>
                            )}
                            {tx.source === 'WHATSAPP' && (
                              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-raised text-secondary border border-subtle">
                                WA
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="py-3 px-4 text-secondary whitespace-nowrap">
                          {tx.type === 'TRANSFER' ? 'Transferência' : cat?.name || 'Geral'}
                        </td>
                        <td className="py-3 px-4 text-muted whitespace-nowrap">
                          {sourceDisplay}
                        </td>
                        <td className="py-3 px-4 text-right font-mono font-medium tabular-nums whitespace-nowrap">
                          <span
                            className={
                              tx.type === 'INCOME'
                                ? 'text-[#10B981]'
                                : tx.type === 'TRANSFER'
                                ? 'text-secondary'
                                : 'text-primary'
                            }
                          >
                            {tx.type === 'INCOME' ? '+' : tx.type === 'EXPENSE' ? '-' : '⇄ '}
                            {formatMoney(tx.amount)}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-center whitespace-nowrap">
                          <button
                            onClick={() => handleToggleStatus(tx.id, tx.status)}
                            className={`px-2 py-0.5 rounded text-[11px] font-medium transition-colors ${
                              tx.status === 'PAID'
                                ? 'bg-[#10B981]/10 text-[#10B981] hover:bg-[#10B981]/20'
                                : 'bg-[#D97706]/10 text-[#D97706] hover:bg-[#D97706]/20'
                            }`}
                          >
                            {tx.status === 'PAID' ? 'Liquidado' : 'Pendente'}
                          </button>
                        </td>
                        <td className="py-3 px-4 text-right whitespace-nowrap">
                          <div className="inline-flex items-center gap-1">
                            {onEditTransaction && (
                              <button
                                onClick={() => onEditTransaction(tx)}
                                className="p-1.5 rounded text-muted hover:text-primary transition-colors"
                                title="Editar lançamento"
                              >
                                <Pencil className="w-3.5 h-3.5 stroke-[1.5]" />
                              </button>
                            )}
                            <button
                              onClick={() => handleDelete(tx.id)}
                              className="p-1.5 rounded text-muted hover:text-[#EF4444] transition-colors"
                              title="Excluir lançamento"
                            >
                              <Trash2 className="w-4 h-4 stroke-[1.5]" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* CALENDAR VIEW — Mobile-first Responsive Grid (320px+) including Reminders */
        <div className="bg-surface border border-subtle rounded-xl p-3 sm:p-5 space-y-4 min-w-0">
          <div className="flex items-center justify-between">
            <h3 className="text-[15px] font-medium text-primary">
              {monthNames[currentMonth - 1]} {currentYear}
            </h3>

            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  if (currentMonth === 1) {
                    setCurrentMonth(12);
                    setCurrentYear(currentYear - 1);
                  } else {
                    setCurrentMonth(currentMonth - 1);
                  }
                }}
                className="w-8 h-8 flex items-center justify-center rounded-lg bg-raised border border-subtle text-secondary hover:text-primary"
              >
                <ChevronLeft className="w-4 h-4 stroke-[1.5]" />
              </button>
              <button
                onClick={() => {
                  if (currentMonth === 12) {
                    setCurrentMonth(1);
                    setCurrentYear(currentYear + 1);
                  } else {
                    setCurrentMonth(currentMonth + 1);
                  }
                }}
                className="w-8 h-8 flex items-center justify-center rounded-lg bg-raised border border-subtle text-secondary hover:text-primary"
              >
                <ChevronRight className="w-4 h-4 stroke-[1.5]" />
              </button>
            </div>
          </div>

          <div className="grid grid-cols-7 gap-1 sm:gap-2 min-w-0">
            {['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map(d => (
              <div key={d} className="text-center text-[11px] sm:text-xs text-muted py-1 truncate">
                {d}
              </div>
            ))}

            {Array.from({ length: firstDayOfWeek }).map((_, i) => (
              <div key={`empty-${i}`} className="h-14 sm:h-24 bg-canvas/40 border border-subtle/40 rounded-lg" />
            ))}

            {Array.from({ length: daysInMonth }).map((_, i) => {
              const day = i + 1;
              const dateStr = `${currentYear}-${String(currentMonth).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
              const dayTxs = transactions.filter(t => t.date === dateStr);
              const dayPendingReminders = reminders.filter(r => r.due_date === dateStr && r.status === 'PENDING');
              const dayIncome = dayTxs.filter(t => t.type === 'INCOME').reduce((a, b) => a + b.amount, 0);
              const dayExpense = dayTxs.filter(t => t.type === 'EXPENSE').reduce((a, b) => a + b.amount, 0);
              const isHighSpend = dayExpense >= 1000;
              const isSelected = activeSelectedDay === day;
              const totalEventsCount = dayTxs.length + dayPendingReminders.length;

              return (
                <button
                  type="button"
                  key={day}
                  onClick={() => setSelectedDay(day)}
                  className={`h-14 sm:h-24 p-1 sm:p-2 rounded-lg border flex flex-col justify-between text-left transition-colors min-w-0 ${
                    isSelected
                      ? 'bg-raised border-[#10B981]'
                      : isHighSpend || dayPendingReminders.length > 0
                      ? 'bg-[#D97706]/10 border-[#D97706]/40'
                      : 'bg-canvas border-subtle hover:border-border-focus'
                  }`}
                >
                  <div className="flex items-center justify-between w-full">
                    <span className={`text-[11px] sm:text-xs font-mono ${isSelected ? 'text-primary font-semibold' : isHighSpend ? 'text-[#D97706] font-medium' : 'text-muted'}`}>
                      {String(day).padStart(2, '0')}
                    </span>
                    {(isHighSpend || dayPendingReminders.length > 0) && (
                      <span
                        className="w-1.5 h-1.5 rounded-full bg-[#D97706] shrink-0"
                        title={dayPendingReminders.length > 0 ? 'Compromisso agendado pendente' : 'Concentração de saídas'}
                      />
                    )}
                  </div>

                  {/* Mobile (< 640px): Compact semantic dots + count */}
                  <div className="flex sm:hidden items-center justify-between w-full mt-auto">
                    <div className="flex items-center gap-1">
                      {dayIncome > 0 && <span className="w-1.5 h-1.5 rounded-full bg-[#10B981]" />}
                      {dayExpense > 0 && <span className="w-1.5 h-1.5 rounded-full bg-[#EF4444]" />}
                      {dayPendingReminders.length > 0 && <span className="w-1.5 h-1.5 rounded-full bg-[#D97706]" />}
                    </div>
                    {totalEventsCount > 0 && (
                      <span className="text-[9px] font-mono text-muted">{totalEventsCount}</span>
                    )}
                  </div>

                  {/* Desktop (sm+): Full monetary values & reminders indicator */}
                  <div className="hidden sm:block space-y-0.5 text-[11px] font-mono tabular-nums w-full min-w-0">
                    {dayIncome > 0 && (
                      <p className="text-[#10B981] truncate">+{formatMoney(dayIncome)}</p>
                    )}
                    {dayExpense > 0 && (
                      <p className="text-primary truncate">-{formatMoney(dayExpense)}</p>
                    )}
                    {dayPendingReminders.length > 0 && (
                      <p className="text-[#D97706] truncate text-[10px]">
                        • {dayPendingReminders.length} {dayPendingReminders.length === 1 ? 'agendado' : 'agendados'}
                      </p>
                    )}
                  </div>

                  <span className="hidden sm:inline-block text-[10px] font-mono text-muted self-end">
                    {totalEventsCount > 0 ? `${totalEventsCount} reg` : ''}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Selected Day Details Panel (Transactions + Reminders for that date) */}
          <div className="pt-4 border-t border-subtle space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-medium text-primary">
                Movimentações e agenda em {String(activeSelectedDay).padStart(2, '0')}/{String(currentMonth).padStart(2, '0')}/{currentYear}
              </h4>
              <span className="text-xs font-mono text-muted">
                {selectedDayTxs.length + selectedDayReminders.length}{' '}
                {selectedDayTxs.length + selectedDayReminders.length === 1 ? 'item' : 'itens'}
              </span>
            </div>

            {selectedDayTxs.length === 0 && selectedDayReminders.length === 0 ? (
              <p className="text-xs text-muted py-3">
                Nenhum lançamento ou compromisso agendado nesta data.
              </p>
            ) : (
              <div className="divide-y divide-subtle bg-canvas border border-subtle rounded-lg px-3">
                {/* Reminders on selected date */}
                {selectedDayReminders.map(rem => {
                  const isRec = rem.type === 'RECEIVABLE';
                  return (
                    <div key={`rem_${rem.id}`} className="py-2.5 flex items-center justify-between gap-3 text-xs min-w-0">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <Clock className="w-3.5 h-3.5 text-[#D97706] shrink-0" />
                          <p className={`font-medium truncate ${rem.status === 'PAID' ? 'line-through text-muted' : 'text-primary'}`}>
                            {rem.title}
                          </p>
                          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-raised text-[#D97706] border border-subtle shrink-0">
                            {rem.status === 'PAID' ? 'Agenda (Pago)' : 'Agenda (Pendente)'}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {rem.amount ? (
                          <span className={`font-mono font-medium tabular-nums ${isRec ? 'text-[#10B981]' : 'text-primary'}`}>
                            {isRec ? '+' : '-'}{formatMoney(rem.amount)}
                          </span>
                        ) : null}
                        <button
                          onClick={() => handleOpenSettleReminder(rem)}
                          className="px-2 py-0.5 rounded bg-raised hover:bg-surface-hover border border-subtle text-[11px] font-medium text-[#10B981]"
                        >
                          {rem.status === 'PAID' ? 'Reabrir' : 'Baixar'}
                        </button>
                      </div>
                    </div>
                  );
                })}

                {/* Transactions on selected date */}
                {selectedDayTxs.map(tx => {
                  const cat = categories.find(c => c.id === tx.category_id);
                  return (
                    <div key={tx.id} className="py-2.5 flex items-center justify-between gap-3 text-xs min-w-0">
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-primary truncate">{tx.description}</p>
                        <p className="text-[11px] text-muted truncate">
                          {tx.type === 'TRANSFER' ? 'Transferência entre contas' : cat?.name || 'Geral'}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span
                          className={`font-mono font-medium tabular-nums ${
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
                        {onEditTransaction && (
                          <button
                            onClick={() => onEditTransaction(tx)}
                            className="p-1 rounded text-muted hover:text-primary transition-colors"
                            title="Editar"
                          >
                            <Pencil className="w-3.5 h-3.5 stroke-[1.5]" />
                          </button>
                        )}
                        <button
                          onClick={() => handleDelete(tx.id)}
                          className="p-1 rounded text-muted hover:text-[#EF4444] transition-colors"
                          title="Excluir"
                        >
                          <Trash2 className="w-3.5 h-3.5 stroke-[1.5]" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* MODAL: IMPORTAR EXTRATO (CSV / OFX) */}
      <ImportStatementModal
        isOpen={showImportModal}
        userId={user.id}
        activeWorkspaceId={activeWorkspaceId}
        accounts={accounts}
        categories={categories}
        existingTransactions={transactions}
        onClose={() => setShowImportModal(false)}
        onSuccess={onRefreshData}
      />

      {/* MODAL: NOVO LEMBRETE / CONTA AGENDADA MANUAL */}
      {showAddReminderModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
          <div className="w-full max-w-md bg-surface border border-subtle rounded-2xl p-6 space-y-4 relative">
            <button
              onClick={() => setShowAddReminderModal(false)}
              className="absolute top-5 right-5 text-muted hover:text-primary"
            >
              <X className="w-4 h-4 stroke-[1.5]" />
            </button>
            <h3 className="text-[15px] font-medium text-primary">
              Novo lembrete / conta agendada
            </h3>

            <div className="grid grid-cols-2 gap-1 bg-canvas p-1 rounded-lg border border-subtle">
              <button
                type="button"
                onClick={() => {
                  setRemType('PAYABLE');
                  const expCat = categories.find(c => c.type === 'EXPENSE')?.id || '';
                  setRemCategoryId(expCat);
                }}
                className={`h-8 flex items-center justify-center gap-1.5 text-xs font-medium rounded-md transition-colors ${
                  remType === 'PAYABLE'
                    ? 'bg-raised text-primary border border-subtle'
                    : 'text-muted hover:text-primary'
                }`}
              >
                <span className="w-1.5 h-1.5 rounded-full bg-[#D97706]" />
                <span>Conta a pagar</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setRemType('RECEIVABLE');
                  const incCat = categories.find(c => c.type === 'INCOME')?.id || '';
                  setRemCategoryId(incCat);
                }}
                className={`h-8 flex items-center justify-center gap-1.5 text-xs font-medium rounded-md transition-colors ${
                  remType === 'RECEIVABLE'
                    ? 'bg-raised text-primary border border-subtle'
                    : 'text-muted hover:text-primary'
                }`}
              >
                <span className="w-1.5 h-1.5 rounded-full bg-[#10B981]" />
                <span>Conta a receber</span>
              </button>
            </div>

            <form onSubmit={handleCreateReminder} className="space-y-4">
              <div>
                <label className="block text-xs text-secondary mb-1.5">Descrição do compromisso</label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Condomínio, Energia, Recebimento cliente"
                  value={remTitle}
                  onChange={e => setRemTitle(e.target.value)}
                  className="w-full h-10 bg-canvas border border-subtle focus:border-[#10B981] rounded-lg px-3 text-xs text-primary outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-secondary mb-1.5">Valor previsto (R$)</label>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="0,00"
                    value={remAmount}
                    onChange={e => setRemAmount(e.target.value)}
                    className="w-full h-10 bg-canvas border border-subtle focus:border-[#10B981] rounded-lg px-3 text-xs font-mono font-medium text-primary outline-none tabular-nums"
                  />
                </div>
                <div>
                  <label className="block text-xs text-secondary mb-1.5">Data de vencimento</label>
                  <input
                    type="date"
                    required
                    value={remDueDate}
                    onChange={e => setRemDueDate(e.target.value)}
                    className="w-full h-10 bg-canvas border border-subtle focus:border-[#10B981] rounded-lg px-3 text-xs font-mono text-primary outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs text-secondary mb-1.5">Categoria</label>
                <select
                  value={remCategoryId}
                  onChange={e => setRemCategoryId(e.target.value)}
                  className="w-full h-10 bg-canvas border border-subtle rounded-lg px-3 text-xs text-primary outline-none"
                >
                  {reminderFilteredCategories.map(c => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs text-secondary mb-1.5">Observações (opcional)</label>
                <input
                  type="text"
                  placeholder="Código de barras, chave Pix ou nota"
                  value={remNotes}
                  onChange={e => setRemNotes(e.target.value)}
                  className="w-full h-9 bg-canvas border border-subtle rounded-lg px-3 text-xs text-primary outline-none"
                />
              </div>

              <div className="flex items-center justify-between pt-1">
                <label className="flex items-center gap-2 text-xs text-secondary cursor-pointer">
                  <input
                    type="checkbox"
                    checked={remRecurring}
                    onChange={e => setRemRecurring(e.target.checked)}
                    className="accent-[#10B981] rounded"
                  />
                  <span>Compromisso recorrente mensal</span>
                </label>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-subtle">
                <button
                  type="button"
                  onClick={() => setShowAddReminderModal(false)}
                  className="h-9 px-3 text-xs text-secondary hover:text-primary"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={remSubmitting}
                  className="h-9 px-4 bg-primary hover:opacity-90 text-canvas font-medium text-xs rounded-lg transition-opacity disabled:opacity-50"
                >
                  {remSubmitting ? 'Agendando...' : 'Agendar compromisso'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: DAR BAIXA EM LEMBRETE / CONTA AGENDADA */}
      {settlingReminder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
          <div className="w-full max-w-md bg-surface border border-subtle rounded-2xl p-6 space-y-4 relative">
            <button
              onClick={() => setSettlingReminder(null)}
              className="absolute top-5 right-5 text-muted hover:text-primary"
            >
              <X className="w-4 h-4 stroke-[1.5]" />
            </button>

            <div>
              <h3 className="text-[15px] font-medium text-primary">
                Dar baixa em compromisso
              </h3>
              <p className="text-xs text-muted mt-0.5">
                {settlingReminder.title} • Vencimento {settlingReminder.due_date.split('-').reverse().join('/')}
              </p>
            </div>

            {settlingReminder.amount ? (
              <div className="p-3.5 bg-canvas border border-subtle rounded-xl flex items-center justify-between">
                <span className="text-xs text-secondary">
                  {settlingReminder.type === 'RECEIVABLE' ? 'Valor a receber' : 'Valor a pagar'}
                </span>
                <span className="text-base font-mono font-medium text-primary tabular-nums">
                  {formatMoney(settlingReminder.amount)}
                </span>
              </div>
            ) : null}

            <form onSubmit={handleConfirmSettleReminder} className="space-y-4">
              {(settlingReminder.amount || 0) > 0 && !settlingReminder.linked_transaction_id && (
                <>
                  <label className="flex items-center gap-2 text-xs text-primary cursor-pointer">
                    <input
                      type="checkbox"
                      checked={settleCreateTx}
                      onChange={e => setSettleCreateTx(e.target.checked)}
                      className="accent-[#10B981] rounded"
                    />
                    <span>
                      Gerar lançamento no extrato e atualizar saldo da conta
                    </span>
                  </label>

                  {settleCreateTx && (
                    <div>
                      <label className="block text-xs text-secondary mb-1.5">
                        Conta bancária ({settlingReminder.type === 'RECEIVABLE' ? 'crédito' : 'débito'})
                      </label>
                      <select
                        required
                        value={settleAccountId}
                        onChange={e => setSettleAccountId(e.target.value)}
                        className="w-full h-10 bg-canvas border border-subtle rounded-lg px-3 text-xs text-primary outline-none"
                      >
                        {accounts.map(acc => (
                          <option key={acc.id} value={acc.id}>
                            {acc.name} — Saldo: {formatMoney(acc.current_balance)}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </>
              )}

              <div>
                <label className="block text-xs text-secondary mb-1.5">Data da liquidação</label>
                <input
                  type="date"
                  required
                  value={settleDate}
                  onChange={e => setSettleDate(e.target.value)}
                  className="w-full h-10 bg-canvas border border-subtle rounded-lg px-3 text-xs font-mono text-primary outline-none"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-subtle">
                <button
                  type="button"
                  onClick={() => setSettlingReminder(null)}
                  className="h-9 px-3 text-xs text-secondary hover:text-primary"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={settleLoading}
                  className="h-9 px-4 bg-[#10B981] hover:bg-[#059669] text-[#0A0A0A] font-medium text-xs rounded-lg transition-colors disabled:opacity-50"
                >
                  {settleLoading ? 'Salvando...' : 'Confirmar baixa'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
