import {
  User,
  Workspace,
  BankAccount,
  CreditCard,
  CreditCardInvoice,
  Category,
  Transaction,
  SubscriptionAndLoan,
  Goal,
  GamificationProfile,
  NotificationItem,
  WhatsAppLog,
  Reminder,
  ChatMessageRecord,
  PatrimonyAsset,
  BusinessClient,
  BusinessSupplier,
  CostCenter
} from '../types';
import {
  roundMoney,
  computeCardInvoiceCycle,
  DEFAULT_SYSTEM_CATEGORIES,
  DEFAULT_BUSINESS_CATEGORIES
} from '../services/financeMath';

export const DEMO_USER_ID = 'demo_user_isolated';
export const DEMO_STORAGE_KEY = 'concect_demo_state';

export interface DemoState {
  user: User;
  accounts: BankAccount[];
  cards: CreditCard[];
  invoices: CreditCardInvoice[];
  categories: Category[];
  transactions: Transaction[];
  subscriptions: SubscriptionAndLoan[];
  assets: PatrimonyAsset[];
  clients: BusinessClient[];
  suppliers: BusinessSupplier[];
  costCenters: CostCenter[];
  goals: Goal[];
  reminders: Reminder[];
  gamification: GamificationProfile;
  notifications: NotificationItem[];
  whatsappLogs: WhatsAppLog[];
  chatHistory: ChatMessageRecord[];
}

export { DEFAULT_BUSINESS_CATEGORIES };

export const INITIAL_WORKSPACES: Workspace[] = [
  {
    id: 'ws_personal',
    name: 'Finanças Pessoais',
    type: 'INDIVIDUAL',
    owner_id: DEMO_USER_ID,
    description: 'Gestão de contas do dia a dia, reserva e investimentos pessoais'
  },
  {
    id: 'ws_family',
    name: 'Residência & Família',
    type: 'FAMILY',
    owner_id: DEMO_USER_ID,
    description: 'Contas conjuntas, mercado, educação e condomínio familiar'
  },
  {
    id: 'ws_business',
    name: 'CONCECT Digital PJ',
    type: 'BUSINESS',
    owner_id: DEMO_USER_ID,
    description: 'Fluxo de caixa empresarial, faturamento de contratos, impostos e DRE'
  }
];

const formatDateYMD = (year: number, month1Based: number, day: number): string => {
  const maxDay = new Date(year, month1Based, 0).getDate();
  const clamped = Math.min(Math.max(1, day), maxDay);
  return `${year}-${String(month1Based).padStart(2, '0')}-${String(clamped).padStart(2, '0')}`;
};

export function buildMathematicallyClosedDemoState(): DemoState {
  const now = new Date();
  const todayStr = now.toISOString().slice(0, 10);

  const user: User = {
    id: DEMO_USER_ID,
    name: 'Lucas Antunes (Demo)',
    email: 'demo@concectfinancas.com',
    auth_provider: 'demo',
    pin_hash: '1234',
    two_factor_enabled: false,
    whatsapp_number: '5562994372561',
    whatsapp_connected: true,
    theme_preference: 'dark',
    active_profile_type: 'INDIVIDUAL',
    privacy_mode: false
  };

  // 1. Categories for Personal, Family, and Business PJ
  const categories: Category[] = [
    // Personal
    ...DEFAULT_SYSTEM_CATEGORIES.map((c, idx) => ({
      ...c,
      id: `demo_cat_p_${idx + 1}`,
      workspace_id: 'ws_personal'
    })),
    // Family
    { id: 'demo_cat_f_1', workspace_id: 'ws_family', name: 'Aporte Familiar', type: 'INCOME', color: '#10B981', icon: 'DollarSign', is_system: true },
    { id: 'demo_cat_f_2', workspace_id: 'ws_family', name: 'Condomínio & Casa', type: 'EXPENSE', color: '#F97316', icon: 'Home', monthly_budget_limit: 2800, is_system: true },
    { id: 'demo_cat_f_3', workspace_id: 'ws_family', name: 'Supermercado Família', type: 'EXPENSE', color: '#EF4444', icon: 'ShoppingBag', monthly_budget_limit: 2200, is_system: true },
    { id: 'demo_cat_f_4', workspace_id: 'ws_family', name: 'Educação & Escola', type: 'EXPENSE', color: '#3B82F6', icon: 'BookOpen', monthly_budget_limit: 1600, is_system: true },
    // Business PJ
    ...DEFAULT_BUSINESS_CATEGORIES.map((c, idx) => ({
      ...c,
      id: `demo_cat_b_${idx + 1}`,
      workspace_id: 'ws_business'
    }))
  ];

  // Quick category ID lookups
  const catPSalary = 'demo_cat_p_1';
  const catPDiv = 'demo_cat_p_3';
  const catPFood = 'demo_cat_p_5';
  const catPHousing = 'demo_cat_p_6';
  const catPTransp = 'demo_cat_p_7';
  const catPLeisure = 'demo_cat_p_8';
  const catPHealth = 'demo_cat_p_9';
  const catPSubs = 'demo_cat_p_10';

  const catBContracts = 'demo_cat_b_1';
  const catBConsult = 'demo_cat_b_2';
  const catBTax = 'demo_cat_b_4';
  const catBDeduct = 'demo_cat_b_5';
  const catBPayroll = 'demo_cat_b_6';
  const catBCloud = 'demo_cat_b_7';
  const catBMkt = 'demo_cat_b_8';
  const catBAdmin = 'demo_cat_b_9';

  // 2. Bank Accounts (initial balances; current_balance will be mathematically computed below)
  const accounts: BankAccount[] = [
    // Personal
    {
      id: 'demo_acc_itau',
      workspace_id: 'ws_personal',
      name: 'Itaú Personnalité',
      institution: 'Itaú Unibanco',
      type: 'CHECKING',
      initial_balance: 12000.0,
      current_balance: 12000.0,
      color: '#EC7000',
      icon: 'Landmark'
    },
    {
      id: 'demo_acc_nubank',
      workspace_id: 'ws_personal',
      name: 'Nubank Conta Digital',
      institution: 'Nubank',
      type: 'CHECKING',
      initial_balance: 4500.0,
      current_balance: 4500.0,
      color: '#820AD1',
      icon: 'Landmark'
    },
    {
      id: 'demo_acc_btg',
      workspace_id: 'ws_personal',
      name: 'BTG Reserva & CDBs',
      institution: 'BTG Pactual',
      type: 'INVESTMENT',
      initial_balance: 36000.0,
      current_balance: 36000.0,
      color: '#10B981',
      icon: 'TrendingUp'
    },
    // Family
    {
      id: 'demo_acc_fam',
      workspace_id: 'ws_family',
      name: 'Conta Conjunta Família',
      institution: 'Itaú',
      type: 'CHECKING',
      initial_balance: 6000.0,
      current_balance: 6000.0,
      color: '#3B82F6',
      icon: 'Landmark'
    },
    // Business PJ
    {
      id: 'demo_acc_pj_inter',
      workspace_id: 'ws_business',
      name: 'Inter Empresas PJ',
      institution: 'Banco Inter PJ',
      type: 'CHECKING',
      initial_balance: 28000.0,
      current_balance: 28000.0,
      color: '#F97316',
      icon: 'Building2'
    },
    {
      id: 'demo_acc_pj_btg',
      workspace_id: 'ws_business',
      name: 'BTG Caixa Corporativo',
      institution: 'BTG Empresas',
      type: 'INVESTMENT',
      initial_balance: 45000.0,
      current_balance: 45000.0,
      color: '#10B981',
      icon: 'TrendingUp'
    }
  ];

  // 3. Credit Cards (available_limit will be mathematically computed below)
  const cards: CreditCard[] = [
    {
      id: 'demo_card_c6',
      workspace_id: 'ws_personal',
      bank_account_id: 'demo_acc_itau',
      name: 'C6 Carbon Black',
      brand: 'Mastercard',
      total_limit: 18000.0,
      available_limit: 18000.0,
      closing_day: 25,
      due_day: 5,
      color: '#1F1F1D'
    },
    {
      id: 'demo_card_nu',
      workspace_id: 'ws_personal',
      bank_account_id: 'demo_acc_nubank',
      name: 'Nubank Ultravioleta',
      brand: 'Mastercard',
      total_limit: 10000.0,
      available_limit: 10000.0,
      closing_day: 15,
      due_day: 22,
      color: '#1F1F1D'
    },
    {
      id: 'demo_card_pj',
      workspace_id: 'ws_business',
      bank_account_id: 'demo_acc_pj_inter',
      name: 'Corporativo Inter PJ',
      brand: 'Mastercard',
      total_limit: 25000.0,
      available_limit: 25000.0,
      closing_day: 20,
      due_day: 28,
      color: '#1F1F1D'
    }
  ];

  const transactions: Transaction[] = [];
  let txSeq = 1;
  const nextTxId = () => `demo_tx_${String(txSeq++).padStart(4, '0')}`;

  // 4. Generate 6 months of coherent transactions (M-5 to M0)
  for (let offset = 5; offset >= 0; offset--) {
    const d = new Date(now.getFullYear(), now.getMonth() - offset, 1);
    const y = d.getFullYear();
    const m = d.getMonth() + 1;
    const isCurrentMonth = offset === 0;
    const refMonthKey = `${y}-${String(m).padStart(2, '0')}`;

    // ---- PERSONAL WORKSPACE ----
    // Salary (Day 05)
    transactions.push({
      id: nextTxId(),
      workspace_id: 'ws_personal',
      account_id: 'demo_acc_itau',
      category_id: catPSalary,
      type: 'INCOME',
      amount: 12800.0,
      description: 'Pró-labore & Remuneração Mensal',
      date: formatDateYMD(y, m, 5),
      status: 'PAID',
      is_recurring: true,
      recurring_source_id: 'tpl_p_salary',
      reference_month: refMonthKey,
      source: 'APP'
    });

    // Dividends (Day 15)
    if (!isCurrentMonth || now.getDate() >= 15) {
      transactions.push({
        id: nextTxId(),
        workspace_id: 'ws_personal',
        account_id: 'demo_acc_btg',
        category_id: catPDiv,
        type: 'INCOME',
        amount: roundMoney(680 + (5 - offset) * 45.5),
        description: 'Rendimentos FIIs & CDBs',
        date: formatDateYMD(y, m, 15),
        status: 'PAID',
        is_recurring: false,
        source: 'APP'
      });
    }

    // Rent / Housing (Day 08)
    transactions.push({
      id: nextTxId(),
      workspace_id: 'ws_personal',
      account_id: 'demo_acc_itau',
      category_id: catPHousing,
      type: 'EXPENSE',
      amount: 2150.0,
      description: 'Aluguel e Condomínio',
      date: formatDateYMD(y, m, 8),
      status: 'PAID',
      is_recurring: true,
      recurring_source_id: 'tpl_p_rent',
      reference_month: refMonthKey,
      source: 'APP'
    });

    // Internal Transfer to Investment Reserve (Day 10) — neutral to income/expense!
    transactions.push({
      id: nextTxId(),
      workspace_id: 'ws_personal',
      account_id: 'demo_acc_itau',
      destination_account_id: 'demo_acc_btg',
      category_id: 'cat_transfer',
      type: 'TRANSFER',
      amount: 2000.0,
      description: 'Aporte Mensal Reserva BTG',
      date: formatDateYMD(y, m, 10),
      status: 'PAID',
      is_recurring: false,
      source: 'APP'
    });

    // Supermarket on Nubank Checking (Day 12)
    transactions.push({
      id: nextTxId(),
      workspace_id: 'ws_personal',
      account_id: 'demo_acc_nubank',
      category_id: catPFood,
      type: 'EXPENSE',
      amount: roundMoney(980 + (offset % 3) * 115.4),
      description: 'Supermercado Pão de Açúcar',
      date: formatDateYMD(y, m, 12),
      status: 'PAID',
      is_recurring: false,
      source: 'WHATSAPP'
    });

    // Fuel & Transport on C6 Carbon (Day 14)
    transactions.push({
      id: nextTxId(),
      workspace_id: 'ws_personal',
      card_id: 'demo_card_c6',
      category_id: catPTransp,
      type: 'EXPENSE',
      amount: roundMoney(490 + (offset === 0 ? 220 : (offset % 2) * 65)),
      description: 'Posto Shell & Mobilidade',
      date: formatDateYMD(y, m, 14),
      status: 'PENDING',
      is_recurring: false,
      source: 'WHATSAPP'
    });

    // Dining & Leisure on C6 Carbon (Day 18) — intentionally slightly above avg in current month for AI Diagnostics
    transactions.push({
      id: nextTxId(),
      workspace_id: 'ws_personal',
      card_id: 'demo_card_c6',
      category_id: catPLeisure,
      type: 'EXPENSE',
      amount: isCurrentMonth ? 820.0 : roundMoney(440 + (offset % 3) * 45),
      description: 'Restaurantes & Jantares',
      date: formatDateYMD(y, m, Math.min(18, now.getDate())),
      status: 'PENDING',
      is_recurring: false,
      source: 'WHATSAPP'
    });

    // Health Plan (Day 16)
    transactions.push({
      id: nextTxId(),
      workspace_id: 'ws_personal',
      account_id: 'demo_acc_nubank',
      category_id: catPHealth,
      type: 'EXPENSE',
      amount: 345.0,
      description: 'Plano de Saúde & Farmácia',
      date: formatDateYMD(y, m, 16),
      status: 'PAID',
      is_recurring: true,
      recurring_source_id: 'tpl_p_health',
      reference_month: refMonthKey,
      source: 'APP'
    });

    // Streaming subscriptions on Ultravioleta (Day 09)
    transactions.push({
      id: nextTxId(),
      workspace_id: 'ws_personal',
      card_id: 'demo_card_nu',
      category_id: catPSubs,
      type: 'EXPENSE',
      amount: 129.8,
      description: 'Assinaturas Digitais (Netflix + Spotify + iCloud)',
      date: formatDateYMD(y, m, 9),
      status: 'PENDING',
      is_recurring: true,
      recurring_source_id: 'sub_demo_bundle',
      reference_month: refMonthKey,
      source: 'APP'
    });

    // Pending bill in current month
    if (isCurrentMonth) {
      transactions.push({
        id: nextTxId(),
        workspace_id: 'ws_personal',
        account_id: 'demo_acc_itau',
        category_id: catPHousing,
        type: 'EXPENSE',
        amount: 285.4,
        description: 'Energia Elétrica & Fibra Óptica',
        date: formatDateYMD(y, m, Math.min(28, now.getDate() + 3)),
        status: 'PENDING',
        is_recurring: false,
        source: 'APP'
      });
    }

    // ---- FAMILY WORKSPACE ----
    transactions.push({
      id: nextTxId(),
      workspace_id: 'ws_family',
      account_id: 'demo_acc_fam',
      category_id: 'demo_cat_f_1',
      type: 'INCOME',
      amount: 7200.0,
      description: 'Rateio Mensal Casa & Família',
      date: formatDateYMD(y, m, 5),
      status: 'PAID',
      is_recurring: true,
      recurring_source_id: 'tpl_f_inc',
      reference_month: refMonthKey,
      source: 'APP'
    });
    transactions.push({
      id: nextTxId(),
      workspace_id: 'ws_family',
      account_id: 'demo_acc_fam',
      category_id: 'demo_cat_f_2',
      type: 'EXPENSE',
      amount: 2450.0,
      description: 'Condomínio Residencial & IPTU',
      date: formatDateYMD(y, m, 10),
      status: 'PAID',
      is_recurring: true,
      recurring_source_id: 'tpl_f_cond',
      reference_month: refMonthKey,
      source: 'APP'
    });
    transactions.push({
      id: nextTxId(),
      workspace_id: 'ws_family',
      account_id: 'demo_acc_fam',
      category_id: 'demo_cat_f_3',
      type: 'EXPENSE',
      amount: roundMoney(1820 + (offset % 2) * 140),
      description: 'Compras do Mês Família',
      date: formatDateYMD(y, m, 14),
      status: 'PAID',
      is_recurring: false,
      source: 'APP'
    });

    // ---- BUSINESS PJ WORKSPACE (CONCECT Digital PJ) ----
    const baseRevenue = 28500 + (5 - offset) * 1650;
    transactions.push({
      id: nextTxId(),
      workspace_id: 'ws_business',
      account_id: 'demo_acc_pj_inter',
      category_id: catBContracts,
      type: 'INCOME',
      amount: roundMoney(baseRevenue),
      description: 'Faturamento Contratos Recorrentes SaaS',
      date: formatDateYMD(y, m, 6),
      status: 'PAID',
      is_recurring: true,
      recurring_source_id: 'tpl_b_saas',
      reference_month: refMonthKey,
      source: 'APP'
    });

    transactions.push({
      id: nextTxId(),
      workspace_id: 'ws_business',
      account_id: 'demo_acc_pj_inter',
      category_id: catBConsult,
      type: 'INCOME',
      amount: roundMoney(6400 + (offset % 3) * 1200),
      description: 'Projetos de Implantação & Consultoria',
      date: formatDateYMD(y, m, 18),
      status: 'PAID',
      is_recurring: false,
      source: 'APP'
    });

    // Taxes (Simples Nacional / ISS) — DRE Deductions/Taxes line
    const grossMonth = roundMoney(baseRevenue + 6400 + (offset % 3) * 1200);
    transactions.push({
      id: nextTxId(),
      workspace_id: 'ws_business',
      account_id: 'demo_acc_pj_inter',
      category_id: catBTax,
      type: 'EXPENSE',
      amount: roundMoney(grossMonth * 0.085),
      description: 'Guia DAS — Simples Nacional / ISS',
      date: formatDateYMD(y, m, 20),
      status: 'PAID',
      is_recurring: true,
      recurring_source_id: 'tpl_b_das',
      reference_month: refMonthKey,
      source: 'APP'
    });

    // Payment Gateway Fees — DRE Deductions line
    transactions.push({
      id: nextTxId(),
      workspace_id: 'ws_business',
      account_id: 'demo_acc_pj_inter',
      category_id: catBDeduct,
      type: 'EXPENSE',
      amount: roundMoney(grossMonth * 0.022),
      description: 'Taxas de Gateway & Tarifas Bancárias',
      date: formatDateYMD(y, m, 19),
      status: 'PAID',
      is_recurring: false,
      source: 'APP'
    });

    // Operational Costs: Payroll & Contractors
    transactions.push({
      id: nextTxId(),
      workspace_id: 'ws_business',
      account_id: 'demo_acc_pj_inter',
      category_id: catBPayroll,
      cost_center_id: 'demo_cc_ops',
      type: 'EXPENSE',
      amount: 10800.0,
      description: 'Prestadores de Engenharia & Design',
      date: formatDateYMD(y, m, 10),
      status: 'PAID',
      is_recurring: true,
      recurring_source_id: 'tpl_b_payroll',
      reference_month: refMonthKey,
      source: 'APP'
    });

    // Cloud & SaaS on Corporate Card
    transactions.push({
      id: nextTxId(),
      workspace_id: 'ws_business',
      card_id: 'demo_card_pj',
      category_id: catBCloud,
      cost_center_id: 'demo_cc_infra',
      type: 'EXPENSE',
      amount: roundMoney(2180 + (5 - offset) * 90),
      description: 'Google Cloud, Firebase & Vercel Pro',
      date: formatDateYMD(y, m, 12),
      status: 'PENDING',
      is_recurring: true,
      recurring_source_id: 'tpl_b_cloud',
      reference_month: refMonthKey,
      source: 'APP'
    });

    // Marketing on Corporate Card
    transactions.push({
      id: nextTxId(),
      workspace_id: 'ws_business',
      card_id: 'demo_card_pj',
      category_id: catBMkt,
      cost_center_id: 'demo_cc_mkt',
      type: 'EXPENSE',
      amount: roundMoney(2850 + (offset % 2) * 350),
      description: 'Campanhas Google Ads & Meta Ads',
      date: formatDateYMD(y, m, 14),
      status: 'PENDING',
      is_recurring: false,
      source: 'APP'
    });

    // Admin
    transactions.push({
      id: nextTxId(),
      workspace_id: 'ws_business',
      account_id: 'demo_acc_pj_inter',
      category_id: catBAdmin,
      cost_center_id: 'demo_cc_admin',
      type: 'EXPENSE',
      amount: 1450.0,
      description: 'Contabilidade, Jurídico & Escritório',
      date: formatDateYMD(y, m, 15),
      status: 'PAID',
      is_recurring: true,
      recurring_source_id: 'tpl_b_admin',
      reference_month: refMonthKey,
      source: 'APP'
    });

    // PJ Reserve Transfer (Inter PJ -> BTG Caixa PJ)
    transactions.push({
      id: nextTxId(),
      workspace_id: 'ws_business',
      account_id: 'demo_acc_pj_inter',
      destination_account_id: 'demo_acc_pj_btg',
      category_id: 'cat_transfer',
      type: 'TRANSFER',
      amount: 5000.0,
      description: 'Transferência para Reserva de Caixa PJ',
      date: formatDateYMD(y, m, 22),
      status: 'PAID',
      is_recurring: false,
      source: 'APP'
    });
  }

  // 5. Add a 6x Installment Purchase on C6 Carbon starting 2 months ago (exact cent reconciliation)
  const instStart = new Date(now.getFullYear(), now.getMonth() - 2, 11);
  const totalNotebook = 5999.98;
  const nInst = 6;
  const baseInst = Math.floor((totalNotebook / nInst) * 100) / 100; // 999.99
  const firstInst = roundMoney(totalNotebook - roundMoney(baseInst * (nInst - 1))); // 1000.03
  const parentInstId = 'demo_tx_inst_notebook';

  for (let i = 1; i <= nInst; i++) {
    const instDate = new Date(instStart.getFullYear(), instStart.getMonth() + (i - 1), 11);
    const formatted = formatDateYMD(instDate.getFullYear(), instDate.getMonth() + 1, 11);
    transactions.push({
      id: i === 1 ? parentInstId : `${parentInstId}_${i}`,
      workspace_id: 'ws_personal',
      card_id: 'demo_card_c6',
      category_id: catPLeisure,
      type: 'EXPENSE',
      amount: i === 1 ? firstInst : baseInst,
      description: `MacBook Air M3 (${i}/${nInst})`,
      date: formatted,
      status: 'PENDING',
      is_recurring: false,
      installment_current: i,
      installment_total: nInst,
      parent_transaction_id: parentInstId,
      source: 'APP'
    });
  }

  // 6. MATHEMATICAL CLOSURE ENGINE:
  //    Compute CreditCardInvoices, mark past invoices PAID, debit bank accounts, and reconcile card limits.
  const invoiceMap = new Map<string, CreditCardInvoice>();
  const cardById = new Map(cards.map(c => [c.id, c]));

  for (const tx of transactions) {
    if (tx.card_id && tx.type === 'EXPENSE') {
      const card = cardById.get(tx.card_id);
      if (!card) continue;
      const cycle = computeCardInvoiceCycle(tx.date, card);
      tx.invoice_id = cycle.invoiceId;
      tx.reference_month = cycle.referenceKey;

      const existing = invoiceMap.get(cycle.invoiceId);
      if (existing) {
        existing.total_amount = roundMoney(existing.total_amount + tx.amount);
      } else {
        invoiceMap.set(cycle.invoiceId, {
          id: cycle.invoiceId,
          card_id: card.id,
          reference_month: cycle.referenceMonth,
          reference_year: cycle.referenceYear,
          reference_key: cycle.referenceKey,
          total_amount: roundMoney(tx.amount),
          status: cycle.defaultStatus,
          closing_date: cycle.closingDate,
          due_date: cycle.dueDate
        });
      }
    }
  }

  const invoices = Array.from(invoiceMap.values()).sort((a, b) =>
    (a.reference_key || '').localeCompare(b.reference_key || '')
  );

  // Settle past invoices (due_date < todayStr) automatically from the card's linked bank account
  const paidInvoiceIds = new Set<string>();
  const invoiceDebitByAccount = new Map<string, number>();

  for (const inv of invoices) {
    if (inv.due_date < todayStr && inv.total_amount > 0) {
      const card = cardById.get(inv.card_id);
      const payAccId = card?.bank_account_id || (card?.workspace_id === 'ws_business' ? 'demo_acc_pj_inter' : 'demo_acc_itau');
      inv.status = 'PAID';
      inv.paid_at = inv.due_date;
      inv.paid_account_id = payAccId;
      paidInvoiceIds.add(inv.id);

      const prevDebit = invoiceDebitByAccount.get(payAccId) || 0;
      invoiceDebitByAccount.set(payAccId, roundMoney(prevDebit + inv.total_amount));
    }
  }

  // Update card transactions belonging to paid invoices to PAID & reconcile each card's available_limit
  const unpaidAmountByCard = new Map<string, number>();
  for (const tx of transactions) {
    if (tx.card_id && tx.type === 'EXPENSE') {
      if (tx.invoice_id && paidInvoiceIds.has(tx.invoice_id)) {
        tx.status = 'PAID';
      } else {
        tx.status = 'PENDING';
        const prevUsed = unpaidAmountByCard.get(tx.card_id) || 0;
        unpaidAmountByCard.set(tx.card_id, roundMoney(prevUsed + tx.amount));
      }
    }
  }

  for (const card of cards) {
    const used = unpaidAmountByCard.get(card.id) || 0;
    card.available_limit = Math.max(0, roundMoney(card.total_limit - used));
  }

  // Reconcile every BankAccount current_balance = initial_balance + net PAID account flows - paid invoices
  for (const acc of accounts) {
    let bal = roundMoney(acc.initial_balance);
    for (const tx of transactions) {
      if (tx.card_id) continue; // Card expenses do not directly debit checking until invoice is paid
      if (tx.status !== 'PAID') continue;

      if (tx.type === 'TRANSFER') {
        if (tx.account_id === acc.id) bal = roundMoney(bal - tx.amount);
        if (tx.destination_account_id === acc.id) bal = roundMoney(bal + tx.amount);
      } else if (tx.type === 'INCOME' && tx.account_id === acc.id) {
        bal = roundMoney(bal + tx.amount);
      } else if (tx.type === 'EXPENSE' && tx.account_id === acc.id) {
        bal = roundMoney(bal - tx.amount);
      }
    }
    const invDebits = invoiceDebitByAccount.get(acc.id) || 0;
    acc.current_balance = roundMoney(bal - invDebits);
  }

  // Sort transactions by date descending
  transactions.sort((a, b) => b.date.localeCompare(a.date));

  // 7. Subscriptions
  const subscriptions: SubscriptionAndLoan[] = [
    {
      id: 'demo_sub_1',
      workspace_id: 'ws_personal',
      name: 'Netflix 4K Ultra',
      type: 'SUBSCRIPTION',
      amount: 59.9,
      billing_cycle: 'MONTHLY',
      next_billing_date: formatDateYMD(now.getFullYear(), now.getMonth() + 1, 9),
      category_id: catPSubs,
      payment_method: 'CARD',
      card_id: 'demo_card_nu'
    },
    {
      id: 'demo_sub_2',
      workspace_id: 'ws_personal',
      name: 'Spotify Duo',
      type: 'SUBSCRIPTION',
      amount: 27.9,
      billing_cycle: 'MONTHLY',
      next_billing_date: formatDateYMD(now.getFullYear(), now.getMonth() + 1, 9),
      category_id: catPSubs,
      payment_method: 'CARD',
      card_id: 'demo_card_nu'
    },
    {
      id: 'demo_sub_3',
      workspace_id: 'ws_personal',
      name: 'iCloud+ 2TB',
      type: 'SUBSCRIPTION',
      amount: 42.0,
      billing_cycle: 'MONTHLY',
      next_billing_date: formatDateYMD(now.getFullYear(), now.getMonth() + 1, 9),
      category_id: catPSubs,
      payment_method: 'CARD',
      card_id: 'demo_card_nu'
    },
    {
      id: 'demo_sub_pj_1',
      workspace_id: 'ws_business',
      name: 'Google Workspace Business',
      type: 'SUBSCRIPTION',
      amount: 420.0,
      billing_cycle: 'MONTHLY',
      next_billing_date: formatDateYMD(now.getFullYear(), now.getMonth() + 1, 12),
      category_id: catBCloud,
      payment_method: 'CARD',
      card_id: 'demo_card_pj'
    },
    // Financed Debts / Loans (type: 'LOAN')
    {
      id: 'demo_loan_1',
      workspace_id: 'ws_personal',
      name: 'Financiamento Veículo — Honda Civic',
      type: 'LOAN',
      creditor: 'Itaú Financiamentos',
      amount: 1850.0,
      initial_debt: 85000.0,
      total_debt: 42600.0,
      interest_rate: 1.15,
      interest_period: 'MONTHLY',
      total_installments: 48,
      paid_installments: 24,
      remaining_installments: 24,
      billing_cycle: 'MONTHLY',
      next_billing_date: formatDateYMD(now.getFullYear(), now.getMonth() + 1, 18),
      category_id: catPTransp,
      payment_method: 'ACCOUNT',
      account_id: 'demo_acc_itau',
      notes: 'Parcelas fixas via débito em conta Itaú'
    },
    {
      id: 'demo_loan_pj_1',
      workspace_id: 'ws_business',
      name: 'Linha Capital de Giro — Pronampe',
      type: 'LOAN',
      creditor: 'Banco do Brasil PJ',
      amount: 2450.0,
      initial_debt: 90000.0,
      total_debt: 58800.0,
      interest_rate: 12.5,
      interest_period: 'YEARLY',
      total_installments: 36,
      paid_installments: 12,
      remaining_installments: 24,
      billing_cycle: 'MONTHLY',
      next_billing_date: formatDateYMD(now.getFullYear(), now.getMonth() + 1, 20),
      category_id: catBAdmin,
      payment_method: 'ACCOUNT',
      account_id: 'demo_acc_pj_inter',
      notes: 'Linha subsidiada para expansão de infraestrutura'
    }
  ];

  // 7B. Patrimony Assets (Investments & Properties — values reported manually)
  const assets: PatrimonyAsset[] = [
    {
      id: 'demo_asset_1',
      workspace_id: 'ws_personal',
      kind: 'INVESTMENT',
      category: 'TESOURO',
      name: 'Tesouro IPCA+ 2035',
      institution: 'BTG Pactual',
      invested_amount: 28000.0,
      current_value: 32450.0,
      quantity: 12.4,
      purchase_date: formatDateYMD(now.getFullYear() - 1, 3, 15),
      reported_yield_pct: 15.89,
      notes: 'Aporte de longo prazo — valor informado manualmente'
    },
    {
      id: 'demo_asset_2',
      workspace_id: 'ws_personal',
      kind: 'INVESTMENT',
      category: 'FII',
      name: 'Carteira FIIs Logística & Papel (HGLG11 / MXRF11)',
      institution: 'XP Investimentos',
      invested_amount: 22000.0,
      current_value: 23760.0,
      quantity: 195,
      purchase_date: formatDateYMD(now.getFullYear() - 1, 7, 10),
      reported_yield_pct: 8.0,
      notes: 'Geração de dividendos mensais isentos'
    },
    {
      id: 'demo_asset_3',
      workspace_id: 'ws_personal',
      kind: 'INVESTMENT',
      category: 'ACOES',
      name: 'Ações Bancos & Energia (ITUB4 / TAEE11)',
      institution: 'BTG Pactual',
      invested_amount: 15000.0,
      current_value: 17100.0,
      quantity: 450,
      purchase_date: formatDateYMD(now.getFullYear() - 1, 10, 5),
      reported_yield_pct: 14.0
    },
    {
      id: 'demo_asset_4',
      workspace_id: 'ws_personal',
      kind: 'PROPERTY',
      category: 'VEICULO',
      name: 'Honda Civic Touring 2023',
      institution: 'Bem próprio (alienado)',
      invested_amount: 138000.0,
      current_value: 129000.0,
      purchase_date: formatDateYMD(now.getFullYear() - 2, 5, 20),
      notes: 'Valor de referência informado manualmente'
    },
    {
      id: 'demo_asset_5',
      workspace_id: 'ws_personal',
      kind: 'PROPERTY',
      category: 'IMOVEL',
      name: 'Apartamento Residencial 92m²',
      institution: 'Matrícula 48.210',
      invested_amount: 480000.0,
      current_value: 545000.0,
      purchase_date: formatDateYMD(now.getFullYear() - 3, 2, 12),
      notes: 'Avaliação patrimonial manual'
    },
    {
      id: 'demo_asset_pj_1',
      workspace_id: 'ws_business',
      kind: 'INVESTMENT',
      category: 'CDB',
      name: 'CDB Liquidez Diária 102% CDI (Caixa PJ)',
      institution: 'BTG Empresas',
      invested_amount: 60000.0,
      current_value: 64200.0,
      purchase_date: formatDateYMD(now.getFullYear() - 1, 4, 1),
      reported_yield_pct: 7.0,
      notes: 'Reserva operacional da empresa'
    }
  ];

  // 7C. Business PJ Entities (Clients, Suppliers & Cost Centers — strictly scoped to ws_business)
  const clients: BusinessClient[] = [
    {
      id: 'demo_cli_1',
      workspace_id: 'ws_business',
      name: 'Grupo Horizonte Logística Ltda',
      document: '34.812.904/0001-55',
      contact: 'financeiro@horizonte.com.br',
      contract_value: 14500.0,
      commission_pct: 8,
      commission_amount: 1160.0,
      billing_day: 5,
      status: 'ACTIVE',
      notes: 'Contrato anual de plataforma SaaS + suporte dedicado'
    },
    {
      id: 'demo_cli_2',
      workspace_id: 'ws_business',
      name: 'Vértice Saúde Digital S.A.',
      document: '41.209.611/0001-18',
      contact: 'contas@verticesaude.com.br',
      contract_value: 9800.0,
      commission_pct: 5,
      commission_amount: 490.0,
      billing_day: 10,
      status: 'ACTIVE',
      notes: 'Licenciamento enterprise + consultoria mensal'
    },
    {
      id: 'demo_cli_3',
      workspace_id: 'ws_business',
      name: 'NovaEra Varejo Integrado ME',
      document: '28.540.119/0001-09',
      contact: 'adm@novaeravarejo.com',
      contract_value: 6400.0,
      commission_pct: 10,
      commission_amount: 640.0,
      billing_day: 15,
      status: 'ACTIVE'
    },
    {
      id: 'demo_cli_4',
      workspace_id: 'ws_business',
      name: 'Atlântico Comércio Exterior',
      document: '19.442.301/0001-72',
      contact: 'diretoria@atlanticocomex.com.br',
      contract_value: 4200.0,
      commission_pct: 0,
      commission_amount: 0,
      billing_day: 20,
      status: 'INACTIVE',
      notes: 'Projeto encerrado no trimestre anterior'
    }
  ];

  const suppliers: BusinessSupplier[] = [
    {
      id: 'demo_sup_1',
      workspace_id: 'ws_business',
      name: 'Google Cloud Brasil Ltda',
      default_category_id: catBCloud,
      document_or_pix: '06.990.590/0001-23',
      contact: 'billing-cloud@google.com',
      notes: 'Hospedagem Firebase, Cloud Run e Storage'
    },
    {
      id: 'demo_sup_2',
      workspace_id: 'ws_business',
      name: 'Studio Ágil Engenharia & UX',
      default_category_id: catBPayroll,
      document_or_pix: 'pix@studioagil.dev',
      contact: '(11) 99210-4412',
      notes: 'Squad externa de desenvolvimento'
    },
    {
      id: 'demo_sup_3',
      workspace_id: 'ws_business',
      name: 'Contábil Prime Assessoria PJ',
      default_category_id: catBAdmin,
      document_or_pix: '22.310.884/0001-41',
      contact: 'atendimento@contabilprime.com.br',
      notes: 'Fechamento fiscal, DAS e folha pró-labore'
    }
  ];

  const costCenters: CostCenter[] = [
    {
      id: 'demo_cc_ops',
      workspace_id: 'ws_business',
      name: 'Operação & Engenharia',
      code: 'CC-01',
      monthly_budget: 13000.0,
      color: '#3B82F6'
    },
    {
      id: 'demo_cc_infra',
      workspace_id: 'ws_business',
      name: 'Infraestrutura Cloud',
      code: 'CC-02',
      monthly_budget: 3200.0,
      color: '#06B6D4'
    },
    {
      id: 'demo_cc_mkt',
      workspace_id: 'ws_business',
      name: 'Marketing & Comercial',
      code: 'CC-03',
      monthly_budget: 4500.0,
      color: '#8B5CF6'
    },
    {
      id: 'demo_cc_admin',
      workspace_id: 'ws_business',
      name: 'Administrativo & Jurídico',
      code: 'CC-04',
      monthly_budget: 2500.0,
      color: '#10B981'
    }
  ];

  // 8. Goals
  const goals: Goal[] = [
    {
      id: 'demo_goal_1',
      workspace_id: 'ws_personal',
      title: 'Reserva de Emergência (6 meses)',
      type: 'EMERGENCY_FUND',
      target_amount: 36000.0,
      current_amount: 31500.0,
      deadline: formatDateYMD(now.getFullYear() + 1, 6, 30),
      status: 'IN_PROGRESS',
      created_at: formatDateYMD(now.getFullYear(), now.getMonth() - 4, 1),
      auto_calculate_emergency_months: 6
    },
    {
      id: 'demo_goal_2',
      workspace_id: 'ws_personal',
      title: 'Viagem Europa 2027',
      type: 'PURCHASE',
      target_amount: 22000.0,
      current_amount: 9400.0,
      deadline: formatDateYMD(now.getFullYear() + 1, 9, 15),
      status: 'IN_PROGRESS',
      created_at: formatDateYMD(now.getFullYear(), now.getMonth() - 3, 1)
    },
    {
      id: 'demo_goal_f_1',
      workspace_id: 'ws_family',
      title: 'Fundo Educação & Faculdade',
      type: 'SAVINGS',
      target_amount: 50000.0,
      current_amount: 18500.0,
      deadline: formatDateYMD(now.getFullYear() + 3, 12, 31),
      status: 'IN_PROGRESS',
      created_at: formatDateYMD(now.getFullYear(), now.getMonth() - 5, 1)
    },
    {
      id: 'demo_goal_pj_1',
      workspace_id: 'ws_business',
      title: 'Capital de Giro PJ (6 meses)',
      type: 'EMERGENCY_FUND',
      target_amount: 120000.0,
      current_amount: 75000.0,
      deadline: formatDateYMD(now.getFullYear() + 1, 12, 31),
      status: 'IN_PROGRESS',
      created_at: formatDateYMD(now.getFullYear(), now.getMonth() - 5, 1)
    }
  ];

  // 9. Reminders (Contas a Pagar e Receber)
  const in3Days = new Date(now.getTime() + 3 * 86400000).toISOString().slice(0, 10);
  const in6Days = new Date(now.getTime() + 6 * 86400000).toISOString().slice(0, 10);
  const reminders: Reminder[] = [
    {
      id: 'demo_rem_1',
      workspace_id: 'ws_personal',
      title: 'Seguro Automotivo (Parcela Mensal)',
      amount: 310.0,
      due_date: in3Days,
      type: 'PAYABLE',
      status: 'PENDING',
      category_id: catPTransp,
      is_recurring: true
    },
    {
      id: 'demo_rem_2',
      workspace_id: 'ws_personal',
      title: 'Reembolso Consultoria Avulsa',
      amount: 1450.0,
      due_date: in6Days,
      type: 'RECEIVABLE',
      status: 'PENDING',
      category_id: catPSalary
    },
    {
      id: 'demo_rem_pj_1',
      workspace_id: 'ws_business',
      title: 'Recebimento NF #1084 — Cliente Enterprise',
      amount: 9800.0,
      due_date: in3Days,
      type: 'RECEIVABLE',
      status: 'PENDING',
      category_id: catBContracts
    },
    {
      id: 'demo_rem_pj_2',
      workspace_id: 'ws_business',
      title: 'Renovação Domínios & Certificados',
      amount: 640.0,
      due_date: in6Days,
      type: 'PAYABLE',
      status: 'PENDING',
      category_id: catBCloud
    }
  ];

  const gamification: GamificationProfile = {
    user_id: DEMO_USER_ID,
    xp_points: 1450,
    level: 5,
    level_title: 'Estrategista Financeiro',
    current_streak: 14,
    longest_streak: 21,
    financial_health_score: 840,
    score_factors: {
      savings_rate: 220,
      bill_punctuality: 230,
      credit_utilization: 195,
      emergency_fund: 195
    },
    badges_unlocked: ['b_first_log', 'b_streak_7', 'b_budget_master', 'b_investor_seed'],
    active_challenges: [
      {
        id: 'ch_demo_1',
        title: 'Constância de Conciliação',
        description: 'Mantenha seus lançamentos em dia por 14 dias consecutivos',
        target_days: 14,
        current_days: 14,
        xp_reward: 200,
        is_completed: true,
        type: 'DAILY_LOG'
      },
      {
        id: 'ch_demo_2',
        title: 'Controle de Restaurantes',
        description: 'Fique dentro do teto de Lazer e Restaurantes por 7 dias',
        target_days: 7,
        current_days: 5,
        xp_reward: 150,
        is_completed: false,
        type: 'BUDGET_DISCIPLINE'
      }
    ]
  };

  const notifications: NotificationItem[] = [
    {
      id: 'demo_notif_1',
      user_id: DEMO_USER_ID,
      title: 'Modo Demonstração Ativo',
      message: 'Explore 6 meses de dados Pessoais, Familiares e Empresariais PJ (com DRE Gerencial) sem risco.',
      trigger_date: todayStr,
      type: 'DAILY_SUMMARY',
      channel: 'APP',
      is_read: false,
      status: 'SENT'
    }
  ];

  const whatsappLogs: WhatsAppLog[] = [
    {
      id: 'demo_wa_1',
      user_id: DEMO_USER_ID,
      sender: 'USER',
      message: 'Gastei 180 no jantar hoje no C6 Carbon',
      timestamp: '19:42'
    },
    {
      id: 'demo_wa_2',
      user_id: DEMO_USER_ID,
      sender: 'AGENT',
      message: 'Lançamento registrado: R$ 180,00 em Lazer & Restaurantes no cartão C6 Carbon Black.',
      timestamp: '19:42'
    }
  ];

  return {
    user,
    accounts,
    cards,
    invoices,
    categories,
    transactions,
    subscriptions,
    assets,
    clients,
    suppliers,
    costCenters,
    goals,
    reminders,
    gamification,
    notifications,
    whatsappLogs,
    chatHistory: []
  };
}
