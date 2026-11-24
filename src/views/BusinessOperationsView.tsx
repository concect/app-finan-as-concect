import React, { useState, useMemo } from 'react';
import {
  Building2,
  Users,
  Truck,
  Layers,
  Plus,
  Pencil,
  Trash2,
  Receipt,
  X
} from 'lucide-react';
import {
  BankAccount,
  BusinessClient,
  BusinessSupplier,
  Category,
  CostCenter,
  CreditCard,
  Transaction,
  User
} from '../types';
import { FirestoreService, roundMoney } from '../services/firestoreService';
import { useFeedback } from '../contexts/FeedbackContext';

interface BusinessOperationsViewProps {
  user: User;
  activeWorkspaceId: string;
  accounts: BankAccount[];
  cards: CreditCard[];
  categories: Category[];
  transactions: Transaction[];
  clients: BusinessClient[];
  suppliers: BusinessSupplier[];
  costCenters: CostCenter[];
  onRefreshData: () => void;
}

export const BusinessOperationsView: React.FC<BusinessOperationsViewProps> = ({
  user,
  activeWorkspaceId,
  accounts,
  cards,
  categories,
  transactions,
  clients,
  suppliers,
  costCenters,
  onRefreshData
}) => {
  const { confirm, showToast } = useFeedback();
  const [activeSubTab, setActiveSubTab] = useState<'CLIENTS' | 'SUPPLIERS' | 'COST_CENTERS'>('CLIENTS');

  // --- CLIENT MODAL STATE ---
  const [showClientModal, setShowClientModal] = useState(false);
  const [editingClient, setEditingClient] = useState<BusinessClient | null>(null);
  const [cliName, setCliName] = useState('');
  const [cliDoc, setCliDoc] = useState('');
  const [cliContact, setCliContact] = useState('');
  const [cliContract, setCliContract] = useState('');
  const [cliCommPct, setCliCommPct] = useState('0');
  const [cliBillingDay, setCliBillingDay] = useState('5');
  const [cliStatus, setCliStatus] = useState<'ACTIVE' | 'INACTIVE'>('ACTIVE');
  const [cliNotes, setCliNotes] = useState('');

  // --- BILLING GENERATION MODAL STATE ---
  const [billingClient, setBillingClient] = useState<BusinessClient | null>(null);
  const [billingMode, setBillingMode] = useState<'REMINDER' | 'INCOME'>('REMINDER');
  const [billingDate, setBillingDate] = useState(new Date().toISOString().slice(0, 10));
  const [billingAccountId, setBillingAccountId] = useState(accounts[0]?.id || '');
  const [billingIncludeComm, setBillingIncludeComm] = useState(false);
  const [billingLoading, setBillingLoading] = useState(false);

  // --- SUPPLIER MODAL STATE ---
  const [showSupplierModal, setShowSupplierModal] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<BusinessSupplier | null>(null);
  const [supName, setSupName] = useState('');
  const [supCategoryId, setSupCategoryId] = useState('');
  const [supDocPix, setSupDocPix] = useState('');
  const [supContact, setSupContact] = useState('');
  const [supNotes, setSupNotes] = useState('');

  // --- COST CENTER MODAL STATE ---
  const [showCcModal, setShowCcModal] = useState(false);
  const [editingCc, setEditingCc] = useState<CostCenter | null>(null);
  const [ccName, setCcName] = useState('');
  const [ccCode, setCcCode] = useState('');
  const [ccBudget, setCcBudget] = useState('');
  const [ccColor, setCcColor] = useState('#10B981');

  const formatMoney = (val: number) => {
    if (user.privacy_mode) return '••••••';
    return `R$ ${val.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const now = new Date();
  const currentMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  // --- CLIENT METRICS ---
  const activeClients = useMemo(() => clients.filter(c => c.status === 'ACTIVE'), [clients]);
  const totalMonthlyContracts = useMemo(
    () => roundMoney(activeClients.reduce((sum, c) => sum + (c.contract_value || 0), 0)),
    [activeClients]
  );
  const totalMonthlyCommissions = useMemo(
    () =>
      roundMoney(
        activeClients.reduce((sum, c) => {
          const comm =
            c.commission_amount !== undefined
              ? c.commission_amount
              : roundMoney(((c.contract_value || 0) * (c.commission_pct || 0)) / 100);
          return sum + comm;
        }, 0)
      ),
    [activeClients]
  );

  // --- COST CENTER EXPENSE ROLLUPS ---
  const costCenterRollups = useMemo(() => {
    return costCenters.map(cc => {
      const monthSpent = roundMoney(
        transactions
          .filter(
            t =>
              t.type === 'EXPENSE' &&
              t.cost_center_id === cc.id &&
              t.date &&
              t.date.startsWith(currentMonthKey)
          )
          .reduce((sum, t) => sum + t.amount, 0)
      );
      const totalSpent = roundMoney(
        transactions
          .filter(t => t.type === 'EXPENSE' && t.cost_center_id === cc.id)
          .reduce((sum, t) => sum + t.amount, 0)
      );
      const txCount = transactions.filter(t => t.type === 'EXPENSE' && t.cost_center_id === cc.id).length;
      const pctBudget =
        cc.monthly_budget && cc.monthly_budget > 0
          ? Math.round((monthSpent / cc.monthly_budget) * 100)
          : 0;
      return { ...cc, monthSpent, totalSpent, txCount, pctBudget };
    });
  }, [costCenters, transactions, currentMonthKey]);

  const unallocatedMonthExpenses = useMemo(
    () =>
      roundMoney(
        transactions
          .filter(
            t =>
              t.type === 'EXPENSE' &&
              !t.cost_center_id &&
              t.date &&
              t.date.startsWith(currentMonthKey)
          )
          .reduce((sum, t) => sum + t.amount, 0)
      ),
    [transactions, currentMonthKey]
  );

  // --- CLIENT HANDLERS ---
  const openCreateClient = () => {
    setEditingClient(null);
    setCliName('');
    setCliDoc('');
    setCliContact('');
    setCliContract('');
    setCliCommPct('0');
    setCliBillingDay('5');
    setCliStatus('ACTIVE');
    setCliNotes('');
    setShowClientModal(true);
  };

  const openEditClient = (c: BusinessClient) => {
    setEditingClient(c);
    setCliName(c.name);
    setCliDoc(c.document || '');
    setCliContact(c.contact || '');
    setCliContract(String(c.contract_value));
    setCliCommPct(String(c.commission_pct ?? 0));
    setCliBillingDay(String(c.billing_day ?? 5));
    setCliStatus(c.status);
    setCliNotes(c.notes || '');
    setShowClientModal(true);
  };

  const handleSaveClient = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cliName.trim()) return;
    const contractVal = roundMoney(parseFloat(cliContract.replace(',', '.')) || 0);
    const commPct = Math.min(100, Math.max(0, parseFloat(cliCommPct.replace(',', '.')) || 0));
    const commAmt = roundMoney((contractVal * commPct) / 100);
    const billDay = Math.min(31, Math.max(1, parseInt(cliBillingDay, 10) || 5));

    try {
      const payload: Omit<BusinessClient, 'id'> = {
        workspace_id: activeWorkspaceId,
        name: cliName.trim(),
        document: cliDoc.trim() || undefined,
        contact: cliContact.trim() || undefined,
        contract_value: contractVal,
        commission_pct: commPct,
        commission_amount: commAmt,
        billing_day: billDay,
        status: cliStatus,
        notes: cliNotes.trim() || undefined
      };

      if (editingClient) {
        await FirestoreService.updateClient(user.id, editingClient.id, payload);
        showToast({ type: 'success', title: 'Cliente atualizado', message: `"${cliName.trim()}" salvo` });
      } else {
        await FirestoreService.addClient(user.id, payload);
        showToast({ type: 'success', title: 'Cliente cadastrado', message: `"${cliName.trim()}" adicionado à carteira PJ` });
      }
      setShowClientModal(false);
      setEditingClient(null);
      onRefreshData();
    } catch (err) {
      showToast({ type: 'error', title: 'Erro ao salvar cliente', message: 'Não foi possível gravar o cliente' });
    }
  };

  const handleDeleteClient = async (c: BusinessClient) => {
    const confirmed = await confirm({
      title: 'Excluir cliente PJ',
      description: `Deseja remover "${c.name}" (${formatMoney(c.contract_value)}/mês) do cadastro empresarial?`,
      confirmText: 'Excluir',
      cancelText: 'Cancelar',
      variant: 'danger',
      icon: 'trash'
    });
    if (confirmed) {
      await FirestoreService.deleteClient(user.id, c.id);
      showToast({ type: 'success', title: 'Cliente excluído', message: `"${c.name}" removido` });
      onRefreshData();
    }
  };

  const openBillingModal = (c: BusinessClient) => {
    setBillingClient(c);
    setBillingMode('REMINDER');
    const day = Math.min(28, Math.max(1, c.billing_day || now.getDate()));
    setBillingDate(`${currentMonthKey}-${String(day).padStart(2, '0')}`);
    setBillingAccountId(accounts[0]?.id || '');
    setBillingIncludeComm((c.commission_amount || 0) > 0);
  };

  const handleConfirmGenerateBilling = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!billingClient) return;
    setBillingLoading(true);

    try {
      const incomeCatId = categories.find(c => c.type === 'INCOME')?.id || 'cat_income';
      const expCatId = categories.find(c => c.type === 'EXPENSE')?.id || 'cat_expense';
      const commAmt =
        billingClient.commission_amount !== undefined
          ? billingClient.commission_amount
          : roundMoney(((billingClient.contract_value || 0) * (billingClient.commission_pct || 0)) / 100);

      if (billingMode === 'REMINDER') {
        await FirestoreService.addReminder(user.id, {
          workspace_id: activeWorkspaceId,
          title: `Faturamento contrato — ${billingClient.name}`,
          amount: roundMoney(billingClient.contract_value),
          due_date: billingDate,
          type: 'RECEIVABLE',
          status: 'PENDING',
          category_id: incomeCatId,
          is_recurring: true,
          notes: billingClient.document ? `Doc: ${billingClient.document}` : undefined
        });
      } else {
        await FirestoreService.addTransaction(
          user.id,
          {
            workspace_id: activeWorkspaceId,
            account_id: billingAccountId || accounts[0]?.id,
            category_id: incomeCatId,
            type: 'INCOME',
            amount: roundMoney(billingClient.contract_value),
            description: `Faturamento — ${billingClient.name}`,
            date: billingDate,
            status: 'PAID',
            is_recurring: false,
            source: 'APP'
          },
          accounts,
          cards
        );
      }

      if (billingIncludeComm && commAmt > 0) {
        await FirestoreService.addReminder(user.id, {
          workspace_id: activeWorkspaceId,
          title: `Comissão parceiro (${billingClient.commission_pct || 0}%) — ${billingClient.name}`,
          amount: roundMoney(commAmt),
          due_date: billingDate,
          type: 'PAYABLE',
          status: 'PENDING',
          category_id: expCatId,
          is_recurring: false
        });
      }

      showToast({
        type: 'success',
        title: billingMode === 'REMINDER' ? 'Conta a receber gerada' : 'Faturamento lançado',
        message: billingIncludeComm && commAmt > 0
          ? `Faturamento de ${formatMoney(billingClient.contract_value)} e comissão a pagar de ${formatMoney(commAmt)} registrados`
          : `Faturamento de ${formatMoney(billingClient.contract_value)} registrado no workspace PJ`
      });
      setBillingClient(null);
      onRefreshData();
    } catch (err) {
      showToast({ type: 'error', title: 'Falha ao gerar faturamento', message: 'Não foi possível registrar' });
    } finally {
      setBillingLoading(false);
    }
  };

  // --- SUPPLIER HANDLERS ---
  const openCreateSupplier = () => {
    setEditingSupplier(null);
    setSupName('');
    setSupCategoryId(categories.find(c => c.type === 'EXPENSE')?.id || '');
    setSupDocPix('');
    setSupContact('');
    setSupNotes('');
    setShowSupplierModal(true);
  };

  const openEditSupplier = (s: BusinessSupplier) => {
    setEditingSupplier(s);
    setSupName(s.name);
    setSupCategoryId(s.default_category_id || '');
    setSupDocPix(s.document_or_pix || '');
    setSupContact(s.contact || '');
    setSupNotes(s.notes || '');
    setShowSupplierModal(true);
  };

  const handleSaveSupplier = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supName.trim()) return;
    try {
      const payload: Omit<BusinessSupplier, 'id'> = {
        workspace_id: activeWorkspaceId,
        name: supName.trim(),
        default_category_id: supCategoryId || undefined,
        document_or_pix: supDocPix.trim() || undefined,
        contact: supContact.trim() || undefined,
        notes: supNotes.trim() || undefined
      };
      if (editingSupplier) {
        await FirestoreService.updateSupplier(user.id, editingSupplier.id, payload);
        showToast({ type: 'success', title: 'Fornecedor atualizado', message: `"${supName.trim()}" salvo` });
      } else {
        await FirestoreService.addSupplier(user.id, payload);
        showToast({ type: 'success', title: 'Fornecedor cadastrado', message: `"${supName.trim()}" adicionado` });
      }
      setShowSupplierModal(false);
      setEditingSupplier(null);
      onRefreshData();
    } catch (err) {
      showToast({ type: 'error', title: 'Erro ao salvar fornecedor', message: 'Não foi possível salvar' });
    }
  };

  const handleDeleteSupplier = async (s: BusinessSupplier) => {
    const confirmed = await confirm({
      title: 'Excluir fornecedor',
      description: `Deseja remover o fornecedor "${s.name}" da base PJ?`,
      confirmText: 'Excluir',
      cancelText: 'Cancelar',
      variant: 'danger',
      icon: 'trash'
    });
    if (confirmed) {
      await FirestoreService.deleteSupplier(user.id, s.id);
      showToast({ type: 'success', title: 'Fornecedor excluído', message: `"${s.name}" removido` });
      onRefreshData();
    }
  };

  // --- COST CENTER HANDLERS ---
  const openCreateCc = () => {
    setEditingCc(null);
    setCcName('');
    setCcCode(`CC-0${costCenters.length + 1}`);
    setCcBudget('');
    setCcColor('#10B981');
    setShowCcModal(true);
  };

  const openEditCc = (cc: CostCenter) => {
    setEditingCc(cc);
    setCcName(cc.name);
    setCcCode(cc.code || '');
    setCcBudget(cc.monthly_budget ? String(cc.monthly_budget) : '');
    setCcColor(cc.color || '#10B981');
    setShowCcModal(true);
  };

  const handleSaveCc = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ccName.trim()) return;
    const budget = roundMoney(parseFloat(ccBudget.replace(',', '.')) || 0);
    try {
      const payload: Omit<CostCenter, 'id'> = {
        workspace_id: activeWorkspaceId,
        name: ccName.trim(),
        code: ccCode.trim() || undefined,
        monthly_budget: budget > 0 ? budget : undefined,
        color: ccColor
      };
      if (editingCc) {
        await FirestoreService.updateCostCenter(user.id, editingCc.id, payload);
        showToast({ type: 'success', title: 'Centro de custo atualizado', message: `"${ccName.trim()}" salvo` });
      } else {
        await FirestoreService.addCostCenter(user.id, payload);
        showToast({ type: 'success', title: 'Centro de custo criado', message: `"${ccName.trim()}" disponível para lançamentos PJ` });
      }
      setShowCcModal(false);
      setEditingCc(null);
      onRefreshData();
    } catch (err) {
      showToast({ type: 'error', title: 'Erro ao salvar centro de custo', message: 'Não foi possível salvar' });
    }
  };

  const handleDeleteCc = async (cc: CostCenter) => {
    const confirmed = await confirm({
      title: 'Excluir centro de custo',
      description: `Deseja remover o centro de custo "${cc.name}"? Os lançamentos existentes não serão apagados.`,
      confirmText: 'Excluir',
      cancelText: 'Cancelar',
      variant: 'danger',
      icon: 'trash'
    });
    if (confirmed) {
      await FirestoreService.deleteCostCenter(user.id, cc.id);
      showToast({ type: 'success', title: 'Centro de custo excluído', message: `"${cc.name}" removido` });
      onRefreshData();
    }
  };

  return (
    <div className="space-y-6 min-w-0">
      {/* Top Header & Sub-tab Navigation */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-surface border border-subtle rounded-xl p-4 sm:p-5">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 rounded-lg bg-raised border border-subtle flex items-center justify-center text-[#10B981] shrink-0">
            <Building2 className="w-4 h-4 stroke-[1.5]" />
          </div>
          <div className="min-w-0">
            <h2 className="text-[15px] font-medium text-primary truncate">Gestão Empresarial PJ</h2>
            <p className="text-xs text-muted truncate">
              Clientes, contratos, comissões, fornecedores e centros de custo exclusivos da carteira PJ
            </p>
          </div>
        </div>

        <div className="w-full sm:w-auto grid grid-cols-3 sm:flex bg-canvas p-1 rounded-lg border border-subtle gap-1">
          <button
            onClick={() => setActiveSubTab('CLIENTS')}
            className={`h-7 px-2 sm:px-3 rounded-md text-xs font-medium transition-colors truncate ${
              activeSubTab === 'CLIENTS' ? 'bg-raised text-primary' : 'text-muted hover:text-primary'
            }`}
          >
            Clientes
          </button>
          <button
            onClick={() => setActiveSubTab('SUPPLIERS')}
            className={`h-7 px-2 sm:px-3 rounded-md text-xs font-medium transition-colors truncate ${
              activeSubTab === 'SUPPLIERS' ? 'bg-raised text-primary' : 'text-muted hover:text-primary'
            }`}
          >
            Fornecedores
          </button>
          <button
            onClick={() => setActiveSubTab('COST_CENTERS')}
            className={`h-7 px-2 sm:px-3 rounded-md text-xs font-medium transition-colors truncate ${
              activeSubTab === 'COST_CENTERS' ? 'bg-raised text-primary' : 'text-muted hover:text-primary'
            }`}
          >
            Centros custo
          </button>
        </div>
      </div>

      {/* TAB 1: CLIENTS, CONTRACTS & COMMISSIONS */}
      {activeSubTab === 'CLIENTS' && (
        <div className="space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
            <div className="bg-surface border border-subtle rounded-xl p-4 sm:p-5">
              <span className="text-xs text-secondary">Clientes ativos</span>
              <p className="text-2xl font-mono font-medium text-primary mt-1.5 tabular-nums">
                {activeClients.length}{' '}
                <span className="text-xs text-muted font-sans">/ {clients.length} total</span>
              </p>
            </div>
            <div className="bg-surface border border-subtle rounded-xl p-4 sm:p-5">
              <span className="text-xs text-secondary">Receita recorrente contratada (MRR)</span>
              <p className="text-2xl font-mono font-medium text-[#10B981] mt-1.5 tabular-nums truncate">
                {formatMoney(totalMonthlyContracts)}
              </p>
            </div>
            <div className="bg-surface border border-subtle rounded-xl p-4 sm:p-5">
              <span className="text-xs text-secondary">Comissões previstas / mês</span>
              <p className="text-2xl font-mono font-medium text-primary mt-1.5 tabular-nums truncate">
                {formatMoney(totalMonthlyCommissions)}
              </p>
            </div>
          </div>

          <div className="flex items-center justify-between gap-3">
            <h3 className="text-sm font-medium text-primary">Carteira de clientes e contratos</h3>
            <button
              onClick={openCreateClient}
              className="h-9 flex items-center gap-1.5 px-3.5 bg-primary hover:opacity-90 text-canvas text-xs font-medium rounded-lg transition-opacity"
            >
              <Plus className="w-4 h-4 stroke-[1.75]" />
              <span>Novo cliente</span>
            </button>
          </div>

          {clients.length === 0 ? (
            <div className="p-8 bg-surface border border-subtle rounded-xl text-center space-y-2">
              <Users className="w-6 h-6 stroke-[1.5] text-muted mx-auto" />
              <p className="text-xs text-secondary">Nenhum cliente PJ cadastrado ainda.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {clients.map(c => {
                const commAmt =
                  c.commission_amount !== undefined
                    ? c.commission_amount
                    : roundMoney(((c.contract_value || 0) * (c.commission_pct || 0)) / 100);
                return (
                  <div
                    key={c.id}
                    className="bg-surface border border-subtle rounded-xl p-4 sm:p-5 flex flex-col justify-between space-y-4 min-w-0"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <h4 className="text-sm font-medium text-primary truncate">{c.name}</h4>
                          <span
                            className={`text-[10px] font-mono px-1.5 py-0.5 rounded border shrink-0 ${
                              c.status === 'ACTIVE'
                                ? 'bg-[#10B981]/10 text-[#10B981] border-[#10B981]/25'
                                : 'bg-raised text-muted border-subtle'
                            }`}
                          >
                            {c.status === 'ACTIVE' ? 'Ativo' : 'Inativo'}
                          </span>
                        </div>
                        <p className="text-xs text-muted font-mono mt-0.5 truncate">
                          {c.document || 'Sem documento'} {c.contact ? `• ${c.contact}` : ''}
                        </p>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          onClick={() => openEditClient(c)}
                          className="p-1 rounded text-muted hover:text-primary"
                          title="Editar cliente"
                        >
                          <Pencil className="w-3.5 h-3.5 stroke-[1.5]" />
                        </button>
                        <button
                          onClick={() => handleDeleteClient(c)}
                          className="p-1 rounded text-muted hover:text-[#EF4444]"
                          title="Excluir cliente"
                        >
                          <Trash2 className="w-3.5 h-3.5 stroke-[1.5]" />
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3 p-3 bg-canvas border border-subtle rounded-lg text-xs font-mono tabular-nums">
                      <div>
                        <span className="text-[11px] text-muted block font-sans">Contrato mensal</span>
                        <span className="text-sm font-medium text-[#10B981]">
                          {formatMoney(c.contract_value)}
                        </span>
                      </div>
                      <div className="text-right">
                        <span className="text-[11px] text-muted block font-sans">
                          Comissão ({c.commission_pct || 0}%)
                        </span>
                        <span className="text-sm font-medium text-primary">
                          {formatMoney(commAmt)}
                        </span>
                      </div>
                    </div>

                    <div className="pt-2 border-t border-subtle flex items-center justify-between gap-2">
                      <span className="text-[11px] text-muted font-mono">
                        Faturamento dia {String(c.billing_day || 5).padStart(2, '0')}
                      </span>
                      <button
                        onClick={() => openBillingModal(c)}
                        className="h-8 px-3 bg-raised hover:bg-surface-hover border border-subtle text-xs font-medium text-[#10B981] rounded-lg flex items-center gap-1.5 transition-colors"
                      >
                        <Receipt className="w-3.5 h-3.5 stroke-[1.5]" />
                        <span>Gerar faturamento</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* TAB 2: SUPPLIERS */}
      {activeSubTab === 'SUPPLIERS' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-medium text-primary">Fornecedores e prestadores PJ</h3>
              <p className="text-xs text-muted">Base de fornecedores com chave PIX / CNPJ e categoria padrão</p>
            </div>
            <button
              onClick={openCreateSupplier}
              className="h-9 flex items-center gap-1.5 px-3.5 bg-primary hover:opacity-90 text-canvas text-xs font-medium rounded-lg transition-opacity"
            >
              <Plus className="w-4 h-4 stroke-[1.75]" />
              <span>Novo fornecedor</span>
            </button>
          </div>

          {suppliers.length === 0 ? (
            <div className="p-8 bg-surface border border-subtle rounded-xl text-center space-y-2">
              <Truck className="w-6 h-6 stroke-[1.5] text-muted mx-auto" />
              <p className="text-xs text-secondary">Nenhum fornecedor PJ cadastrado.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {suppliers.map(s => {
                const defaultCat = categories.find(c => c.id === s.default_category_id);
                return (
                  <div
                    key={s.id}
                    className="bg-surface border border-subtle rounded-xl p-4 sm:p-5 flex flex-col justify-between space-y-3 min-w-0"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <h4 className="text-sm font-medium text-primary truncate">{s.name}</h4>
                        <span className="text-[11px] text-muted block mt-0.5 truncate">
                          {defaultCat?.name || 'Sem categoria padrão'}
                        </span>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          onClick={() => openEditSupplier(s)}
                          className="p-1 rounded text-muted hover:text-primary"
                          title="Editar fornecedor"
                        >
                          <Pencil className="w-3.5 h-3.5 stroke-[1.5]" />
                        </button>
                        <button
                          onClick={() => handleDeleteSupplier(s)}
                          className="p-1 rounded text-muted hover:text-[#EF4444]"
                          title="Excluir fornecedor"
                        >
                          <Trash2 className="w-3.5 h-3.5 stroke-[1.5]" />
                        </button>
                      </div>
                    </div>

                    <div className="pt-2.5 border-t border-subtle space-y-1 text-xs font-mono text-secondary">
                      <p className="truncate">
                        <span className="text-muted font-sans">Doc / PIX: </span>
                        {s.document_or_pix || '—'}
                      </p>
                      <p className="truncate">
                        <span className="text-muted font-sans">Contato: </span>
                        {s.contact || '—'}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* TAB 3: COST CENTERS */}
      {activeSubTab === 'COST_CENTERS' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-medium text-primary">Centros de custo e consolidado de despesas</h3>
              <p className="text-xs text-muted">
                Acompanhe os gastos mensais e acumulados por departamento/área da empresa
              </p>
            </div>
            <button
              onClick={openCreateCc}
              className="h-9 flex items-center gap-1.5 px-3.5 bg-primary hover:opacity-90 text-canvas text-xs font-medium rounded-lg transition-opacity self-start sm:self-auto"
            >
              <Plus className="w-4 h-4 stroke-[1.75]" />
              <span>Novo centro de custo</span>
            </button>
          </div>

          {costCenterRollups.length === 0 ? (
            <div className="p-8 bg-surface border border-subtle rounded-xl text-center space-y-2">
              <Layers className="w-6 h-6 stroke-[1.5] text-muted mx-auto" />
              <p className="text-xs text-secondary">Nenhum centro de custo criado.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {costCenterRollups.map(cc => {
                const overBudget = cc.monthly_budget && cc.monthly_budget > 0 && cc.monthSpent > cc.monthly_budget;
                return (
                  <div
                    key={cc.id}
                    className="bg-surface border border-subtle rounded-xl p-4 sm:p-5 space-y-3 min-w-0"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span
                          className="w-2.5 h-2.5 rounded-full shrink-0"
                          style={{ backgroundColor: cc.color || '#10B981' }}
                        />
                        <div className="min-w-0">
                          <h4 className="text-sm font-medium text-primary truncate">
                            {cc.code ? `${cc.code} — ` : ''}
                            {cc.name}
                          </h4>
                          <p className="text-[11px] text-muted font-mono">
                            {cc.txCount} {cc.txCount === 1 ? 'despesa vinculada' : 'despesas vinculadas'} • Total histórico: {formatMoney(cc.totalSpent)}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          onClick={() => openEditCc(cc)}
                          className="p-1 rounded text-muted hover:text-primary"
                          title="Editar centro de custo"
                        >
                          <Pencil className="w-3.5 h-3.5 stroke-[1.5]" />
                        </button>
                        <button
                          onClick={() => handleDeleteCc(cc)}
                          className="p-1 rounded text-muted hover:text-[#EF4444]"
                          title="Excluir centro de custo"
                        >
                          <Trash2 className="w-3.5 h-3.5 stroke-[1.5]" />
                        </button>
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <div className="flex items-baseline justify-between text-xs font-mono tabular-nums">
                        <span className="text-primary font-medium">
                          Mês atual: {formatMoney(cc.monthSpent)}
                        </span>
                        <span className={overBudget ? 'text-[#EF4444]' : 'text-muted'}>
                          {cc.monthly_budget
                            ? `Teto: ${formatMoney(cc.monthly_budget)} (${cc.pctBudget}%)`
                            : 'Sem teto mensal'}
                        </span>
                      </div>
                      {cc.monthly_budget && cc.monthly_budget > 0 ? (
                        <div className="w-full bg-canvas h-1.5 rounded-full overflow-hidden border border-subtle">
                          <div
                            className={`h-full rounded-full ${overBudget ? 'bg-[#EF4444]' : 'bg-[#10B981]'}`}
                            style={{ width: `${Math.min(100, cc.pctBudget)}%` }}
                          />
                        </div>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {unallocatedMonthExpenses > 0 && (
            <div className="p-3.5 bg-surface border border-subtle rounded-xl flex items-center justify-between text-xs">
              <span className="text-secondary">Despesas PJ do mês atual sem centro de custo atribuído</span>
              <span className="font-mono font-medium text-primary tabular-nums">
                {formatMoney(unallocatedMonthExpenses)}
              </span>
            </div>
          )}
        </div>
      )}

      {/* MODAL: CREATE / EDIT CLIENT */}
      {showClientModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="w-full max-w-md bg-surface border border-subtle rounded-2xl p-6 space-y-4 relative">
            <button onClick={() => setShowClientModal(false)} className="absolute top-5 right-5 text-muted hover:text-primary">
              <X className="w-4 h-4 stroke-[1.5]" />
            </button>
            <h3 className="text-[15px] font-medium text-primary">
              {editingClient ? 'Editar cliente PJ' : 'Novo cliente PJ'}
            </h3>

            <form onSubmit={handleSaveClient} className="space-y-4">
              <div>
                <label className="block text-xs text-secondary mb-1.5">Nome / Razão Social</label>
                <input
                  type="text"
                  required
                  value={cliName}
                  onChange={e => setCliName(e.target.value)}
                  className="w-full h-10 bg-canvas border border-subtle focus:border-[#10B981] rounded-lg px-3 text-xs text-primary outline-none"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-secondary mb-1.5">CNPJ / CPF</label>
                  <input
                    type="text"
                    placeholder="00.000.000/0001-00"
                    value={cliDoc}
                    onChange={e => setCliDoc(e.target.value)}
                    className="w-full h-10 bg-canvas border border-subtle rounded-lg px-3 text-xs font-mono text-primary outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs text-secondary mb-1.5">E-mail / Contato</label>
                  <input
                    type="text"
                    placeholder="financeiro@cliente.com"
                    value={cliContact}
                    onChange={e => setCliContact(e.target.value)}
                    className="w-full h-10 bg-canvas border border-subtle rounded-lg px-3 text-xs text-primary outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block text-xs text-secondary mb-1.5">Contrato (R$)</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={cliContract}
                    onChange={e => setCliContract(e.target.value)}
                    className="w-full h-10 bg-canvas border border-subtle rounded-lg px-2.5 text-xs font-mono text-primary outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs text-secondary mb-1.5">Comissão (%)</label>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    max="100"
                    value={cliCommPct}
                    onChange={e => setCliCommPct(e.target.value)}
                    className="w-full h-10 bg-canvas border border-subtle rounded-lg px-2.5 text-xs font-mono text-primary outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs text-secondary mb-1.5">Dia fat.</label>
                  <input
                    type="number"
                    min="1"
                    max="31"
                    value={cliBillingDay}
                    onChange={e => setCliBillingDay(e.target.value)}
                    className="w-full h-10 bg-canvas border border-subtle rounded-lg px-2.5 text-xs font-mono text-primary outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs text-secondary mb-1.5">Status do contrato</label>
                <select
                  value={cliStatus}
                  onChange={e => setCliStatus(e.target.value as any)}
                  className="w-full h-10 bg-canvas border border-subtle rounded-lg px-3 text-xs text-primary outline-none"
                >
                  <option value="ACTIVE">Ativo</option>
                  <option value="INACTIVE">Inativo</option>
                </select>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-subtle">
                <button type="button" onClick={() => setShowClientModal(false)} className="h-9 px-3 text-xs text-secondary">
                  Cancelar
                </button>
                <button type="submit" className="h-9 px-4 bg-primary hover:opacity-90 text-canvas font-medium text-xs rounded-lg">
                  {editingClient ? 'Salvar alterações' : 'Salvar cliente'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: GENERATE BILLING / RECEIVABLE */}
      {billingClient && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
          <div className="w-full max-w-md bg-surface border border-subtle rounded-2xl p-6 space-y-4 relative">
            <button onClick={() => setBillingClient(null)} className="absolute top-5 right-5 text-muted hover:text-primary">
              <X className="w-4 h-4 stroke-[1.5]" />
            </button>
            <div>
              <h3 className="text-[15px] font-medium text-primary">Gerar faturamento — {billingClient.name}</h3>
              <p className="text-xs text-muted mt-0.5">
                Valor do contrato: {formatMoney(billingClient.contract_value)}
              </p>
            </div>

            <form onSubmit={handleConfirmGenerateBilling} className="space-y-4">
              <div className="grid grid-cols-2 gap-1 bg-canvas p-1 rounded-lg border border-subtle">
                <button
                  type="button"
                  onClick={() => setBillingMode('REMINDER')}
                  className={`h-8 text-xs font-medium rounded-md ${
                    billingMode === 'REMINDER' ? 'bg-raised text-primary border border-subtle' : 'text-muted'
                  }`}
                >
                  Conta a receber (agenda)
                </button>
                <button
                  type="button"
                  onClick={() => setBillingMode('INCOME')}
                  className={`h-8 text-xs font-medium rounded-md ${
                    billingMode === 'INCOME' ? 'bg-raised text-primary border border-subtle' : 'text-muted'
                  }`}
                >
                  Receita já recebida
                </button>
              </div>

              <div>
                <label className="block text-xs text-secondary mb-1.5">
                  {billingMode === 'REMINDER' ? 'Data de vencimento' : 'Data do recebimento'}
                </label>
                <input
                  type="date"
                  required
                  value={billingDate}
                  onChange={e => setBillingDate(e.target.value)}
                  className="w-full h-10 bg-canvas border border-subtle rounded-lg px-3 text-xs font-mono text-primary outline-none"
                />
              </div>

              {billingMode === 'INCOME' && (
                <div>
                  <label className="block text-xs text-secondary mb-1.5">Conta PJ de crédito</label>
                  <select
                    value={billingAccountId}
                    onChange={e => setBillingAccountId(e.target.value)}
                    className="w-full h-10 bg-canvas border border-subtle rounded-lg px-3 text-xs text-primary outline-none"
                  >
                    {accounts.map(acc => (
                      <option key={acc.id} value={acc.id}>
                        {acc.name} ({formatMoney(acc.current_balance)})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {(billingClient.commission_amount || 0) > 0 && (
                <label className="flex items-center gap-2 text-xs text-secondary cursor-pointer">
                  <input
                    type="checkbox"
                    checked={billingIncludeComm}
                    onChange={e => setBillingIncludeComm(e.target.checked)}
                    className="accent-[#10B981]"
                  />
                  <span>
                    Agendar comissão a pagar ({formatMoney(billingClient.commission_amount || 0)})
                  </span>
                </label>
              )}

              <div className="flex justify-end gap-2 pt-3 border-t border-subtle">
                <button type="button" onClick={() => setBillingClient(null)} className="h-9 px-3 text-xs text-secondary">
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={billingLoading}
                  className="h-9 px-4 bg-[#10B981] hover:bg-[#059669] text-[#0A0A0A] font-medium text-xs rounded-lg"
                >
                  {billingLoading ? 'Gerando...' : 'Confirmar faturamento'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: CREATE / EDIT SUPPLIER */}
      {showSupplierModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
          <div className="w-full max-w-md bg-surface border border-subtle rounded-2xl p-6 space-y-4 relative">
            <button onClick={() => setShowSupplierModal(false)} className="absolute top-5 right-5 text-muted hover:text-primary">
              <X className="w-4 h-4 stroke-[1.5]" />
            </button>
            <h3 className="text-[15px] font-medium text-primary">
              {editingSupplier ? 'Editar fornecedor PJ' : 'Novo fornecedor PJ'}
            </h3>

            <form onSubmit={handleSaveSupplier} className="space-y-4">
              <div>
                <label className="block text-xs text-secondary mb-1.5">Nome do fornecedor</label>
                <input
                  type="text"
                  required
                  value={supName}
                  onChange={e => setSupName(e.target.value)}
                  className="w-full h-10 bg-canvas border border-subtle focus:border-[#10B981] rounded-lg px-3 text-xs text-primary outline-none"
                />
              </div>

              <div>
                <label className="block text-xs text-secondary mb-1.5">Categoria padrão PJ</label>
                <select
                  value={supCategoryId}
                  onChange={e => setSupCategoryId(e.target.value)}
                  className="w-full h-10 bg-canvas border border-subtle rounded-lg px-3 text-xs text-primary outline-none"
                >
                  <option value="">Sem categoria padrão</option>
                  {categories.filter(c => c.type === 'EXPENSE').map(c => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-secondary mb-1.5">CNPJ / Chave PIX</label>
                  <input
                    type="text"
                    value={supDocPix}
                    onChange={e => setSupDocPix(e.target.value)}
                    className="w-full h-10 bg-canvas border border-subtle rounded-lg px-3 text-xs font-mono text-primary outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs text-secondary mb-1.5">Contato</label>
                  <input
                    type="text"
                    value={supContact}
                    onChange={e => setSupContact(e.target.value)}
                    className="w-full h-10 bg-canvas border border-subtle rounded-lg px-3 text-xs text-primary outline-none"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-subtle">
                <button type="button" onClick={() => setShowSupplierModal(false)} className="h-9 px-3 text-xs text-secondary">
                  Cancelar
                </button>
                <button type="submit" className="h-9 px-4 bg-primary hover:opacity-90 text-canvas font-medium text-xs rounded-lg">
                  {editingSupplier ? 'Salvar alterações' : 'Salvar fornecedor'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: CREATE / EDIT COST CENTER */}
      {showCcModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
          <div className="w-full max-w-md bg-surface border border-subtle rounded-2xl p-6 space-y-4 relative">
            <button onClick={() => setShowCcModal(false)} className="absolute top-5 right-5 text-muted hover:text-primary">
              <X className="w-4 h-4 stroke-[1.5]" />
            </button>
            <h3 className="text-[15px] font-medium text-primary">
              {editingCc ? 'Editar centro de custo' : 'Novo centro de custo'}
            </h3>

            <form onSubmit={handleSaveCc} className="space-y-4">
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2">
                  <label className="block text-xs text-secondary mb-1.5">Nome do centro de custo</label>
                  <input
                    type="text"
                    required
                    placeholder="Ex: Operação, Marketing, Infraestrutura"
                    value={ccName}
                    onChange={e => setCcName(e.target.value)}
                    className="w-full h-10 bg-canvas border border-subtle focus:border-[#10B981] rounded-lg px-3 text-xs text-primary outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs text-secondary mb-1.5">Código</label>
                  <input
                    type="text"
                    placeholder="CC-01"
                    value={ccCode}
                    onChange={e => setCcCode(e.target.value)}
                    className="w-full h-10 bg-canvas border border-subtle rounded-lg px-3 text-xs font-mono text-primary outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs text-secondary mb-1.5">Orçamento mensal (R$ — opcional)</label>
                <input
                  type="number"
                  step="0.01"
                  placeholder="5000,00"
                  value={ccBudget}
                  onChange={e => setCcBudget(e.target.value)}
                  className="w-full h-10 bg-canvas border border-subtle rounded-lg px-3 text-xs font-mono text-primary outline-none tabular-nums"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-subtle">
                <button type="button" onClick={() => setShowCcModal(false)} className="h-9 px-3 text-xs text-secondary">
                  Cancelar
                </button>
                <button type="submit" className="h-9 px-4 bg-primary hover:opacity-90 text-canvas font-medium text-xs rounded-lg">
                  {editingCc ? 'Salvar alterações' : 'Criar centro de custo'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
