import {
  BankAccount,
  Category,
  CreditCard,
  Goal,
  InvoiceStatus,
  Reminder,
  Transaction
} from '../types';

export const roundMoney = (val: number): number => {
  return Math.round((Number(val) || 0) * 100) / 100;
};

export const belongsToWorkspace = (
  itemWorkspaceId: string | undefined,
  activeWorkspaceId: string
): boolean => {
  return (itemWorkspaceId || 'ws_personal') === activeWorkspaceId;
};

export const buildInvoiceId = (cardId: string, refYear: number, refMonth: number): string => {
  return `inv_${cardId}_${refYear}-${String(refMonth).padStart(2, '0')}`;
};

export interface ComputedInvoiceCycle {
  invoiceId: string;
  cardId: string;
  referenceYear: number;
  referenceMonth: number; // 1-12
  referenceKey: string; // YYYY-MM
  closingDate: string; // YYYY-MM-DD
  dueDate: string; // YYYY-MM-DD
  defaultStatus: InvoiceStatus;
}

/**
 * Calculates which monthly credit card invoice (YYYY-MM) a transaction date belongs to.
 * Purchases made ON or AFTER the card's closing_day enter the next month's invoice.
 */
export const computeCardInvoiceCycle = (
  txDateStr: string,
  card: Pick<CreditCard, 'id' | 'closing_day' | 'due_day'>
): ComputedInvoiceCycle => {
  const parts = (txDateStr || new Date().toISOString().slice(0, 10)).split('-').map(Number);
  const txYear = parts[0] || new Date().getFullYear();
  const txMonth = parts[1] || new Date().getMonth() + 1;
  const txDay = parts[2] || 1;

  const closingDay = Math.min(31, Math.max(1, Number(card.closing_day) || 25));
  const dueDay = Math.min(31, Math.max(1, Number(card.due_day) || 5));

  let refYear = txYear;
  let refMonth = txMonth;
  if (txDay >= closingDay) {
    const nextMonthDate = new Date(txYear, txMonth, 1);
    refYear = nextMonthDate.getFullYear();
    refMonth = nextMonthDate.getMonth() + 1;
  }

  const daysInClosingMonth = new Date(refYear, refMonth, 0).getDate();
  const clampedClosingDay = Math.min(closingDay, daysInClosingMonth);
  const closingDate = `${refYear}-${String(refMonth).padStart(2, '0')}-${String(clampedClosingDay).padStart(2, '0')}`;

  let dueYear = refYear;
  let dueMonth = refMonth;
  if (dueDay < closingDay) {
    const nextDueDate = new Date(refYear, refMonth, 1);
    dueYear = nextDueDate.getFullYear();
    dueMonth = nextDueDate.getMonth() + 1;
  }
  const daysInDueMonth = new Date(dueYear, dueMonth, 0).getDate();
  const clampedDueDay = Math.min(dueDay, daysInDueMonth);
  const dueDate = `${dueYear}-${String(dueMonth).padStart(2, '0')}-${String(clampedDueDay).padStart(2, '0')}`;

  const todayStr = new Date().toISOString().slice(0, 10);
  let defaultStatus: InvoiceStatus = 'OPEN';
  if (todayStr > dueDate) {
    defaultStatus = 'OVERDUE';
  } else if (todayStr >= closingDate) {
    defaultStatus = 'CLOSED';
  }

  const referenceKey = `${refYear}-${String(refMonth).padStart(2, '0')}`;
  const invoiceId = buildInvoiceId(card.id, refYear, refMonth);

  return {
    invoiceId,
    cardId: card.id,
    referenceYear: refYear,
    referenceMonth: refMonth,
    referenceKey,
    closingDate,
    dueDate,
    defaultStatus
  };
};

export const DEFAULT_SYSTEM_CATEGORIES: Omit<Category, 'id' | 'workspace_id'>[] = [
  // Receitas
  { name: 'Salário & Remuneração', type: 'INCOME', color: '#10B981', icon: 'DollarSign', is_system: true },
  { name: 'Freelance & Serviços', type: 'INCOME', color: '#059669', icon: 'Briefcase', is_system: true },
  { name: 'Rendimentos & Dividendos', type: 'INCOME', color: '#34D399', icon: 'TrendingUp', is_system: true },
  { name: 'Outras Receitas', type: 'INCOME', color: '#6EE7B7', icon: 'PlusCircle', is_system: true },

  // Despesas
  { name: 'Alimentação & Supermercado', type: 'EXPENSE', color: '#EF4444', icon: 'ShoppingBag', monthly_budget_limit: 1500, is_system: true },
  { name: 'Moradia & Contas Fixas', type: 'EXPENSE', color: '#F97316', icon: 'Home', monthly_budget_limit: 2200, is_system: true },
  { name: 'Transporte & Combustível', type: 'EXPENSE', color: '#EAB308', icon: 'Car', monthly_budget_limit: 800, is_system: true },
  { name: 'Lazer & Restaurantes', type: 'EXPENSE', color: '#8B5CF6', icon: 'Coffee', monthly_budget_limit: 600, is_system: true },
  { name: 'Saúde & Cuidados', type: 'EXPENSE', color: '#EC4899', icon: 'Heart', monthly_budget_limit: 400, is_system: true },
  { name: 'Assinaturas & Serviços', type: 'EXPENSE', color: '#06B6D4', icon: 'Tv', monthly_budget_limit: 300, is_system: true },
  { name: 'Educação & Cursos', type: 'EXPENSE', color: '#3B82F6', icon: 'BookOpen', monthly_budget_limit: 500, is_system: true },
  { name: 'Outras Despesas', type: 'EXPENSE', color: '#6B7280', icon: 'Tag', monthly_budget_limit: 400, is_system: true }
];

export const DEFAULT_BUSINESS_CATEGORIES: Omit<Category, 'id' | 'workspace_id'>[] = [
  // Receitas PJ
  { name: 'Receita de Contratos PJ', type: 'INCOME', color: '#10B981', icon: 'Briefcase', is_system: true },
  { name: 'Consultoria & Projetos', type: 'INCOME', color: '#059669', icon: 'TrendingUp', is_system: true },
  { name: 'Outras Receitas PJ', type: 'INCOME', color: '#34D399', icon: 'PlusCircle', is_system: true },
  // Impostos e Deduções (DRE)
  { name: 'Impostos (Simples / ISS)', type: 'EXPENSE', color: '#EF4444', icon: 'Landmark', monthly_budget_limit: 4500, is_system: true },
  { name: 'Deduções & Taxas Financeiras', type: 'EXPENSE', color: '#F97316', icon: 'Tag', monthly_budget_limit: 1200, is_system: true },
  // Custos & Despesas Operacionais (DRE)
  { name: 'Folha & Prestadores', type: 'EXPENSE', color: '#3B82F6', icon: 'Users', monthly_budget_limit: 12000, is_system: true },
  { name: 'Infraestrutura Cloud & SaaS', type: 'EXPENSE', color: '#06B6D4', icon: 'Server', monthly_budget_limit: 3000, is_system: true },
  { name: 'Marketing & Aquisição', type: 'EXPENSE', color: '#8B5CF6', icon: 'TrendingUp', monthly_budget_limit: 4000, is_system: true },
  { name: 'Despesas Administrativas', type: 'EXPENSE', color: '#6B7280', icon: 'Building2', monthly_budget_limit: 2500, is_system: true }
];

export interface DynamicHealthScoreResult {
  financial_health_score: number;
  score_factors: {
    savings_rate: number;
    bill_punctuality: number;
    credit_utilization: number;
    emergency_fund: number;
  };
}

/**
 * Dynamically computes the 4 Financial Health Score pillars (0-250 each, total 0-1000)
 * from real workspace data:
 * 1. savings_rate: Monthly savings margin (INCOME vs EXPENSE, ignoring TRANSFER)
 * 2. bill_punctuality: On-time vs overdue bills & reminders
 * 3. credit_utilization: Combined discipline of budget ceilings & credit card limit usage
 * 4. emergency_fund: Months of real average expense covered by liquid balance + emergency goals
 */
export function calculateFinancialHealthScore(params: {
  transactions: Transaction[];
  accounts: BankAccount[];
  cards: CreditCard[];
  categories: Category[];
  goals: Goal[];
  reminders?: Reminder[];
}): DynamicHealthScoreResult {
  const { transactions, accounts, cards, categories, goals, reminders = [] } = params;

  const now = new Date();
  const todayStr = now.toISOString().slice(0, 10);
  const currentMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  const currentMonthTxs = transactions.filter(t => t.date && t.date.startsWith(currentMonthKey));
  const monthIncome = roundMoney(
    currentMonthTxs.filter(t => t.type === 'INCOME').reduce((a, b) => a + b.amount, 0)
  );
  const monthExpense = roundMoney(
    currentMonthTxs.filter(t => t.type === 'EXPENSE').reduce((a, b) => a + b.amount, 0)
  );

  // Pillar 1: Monthly Savings Rate (0..250)
  let savingsScore = 125;
  if (monthIncome > 0) {
    const rate = (monthIncome - monthExpense) / monthIncome;
    if (rate >= 0.25) savingsScore = 250;
    else if (rate >= 0.15) savingsScore = Math.round(200 + ((rate - 0.15) / 0.1) * 50);
    else if (rate >= 0.05) savingsScore = Math.round(145 + ((rate - 0.05) / 0.1) * 55);
    else if (rate >= 0) savingsScore = Math.round(105 + (rate / 0.05) * 40);
    else savingsScore = Math.max(25, Math.round(105 + rate * 160));
  } else if (monthExpense > 0) {
    savingsScore = 60;
  }

  // Pillar 2: Bill Punctuality (0..250)
  const overdueTxs = transactions.filter(
    t => t.type === 'EXPENSE' && !t.card_id && t.status !== 'PAID' && t.date < todayStr
  ).length;
  const overdueReminders = reminders.filter(
    r => r.type === 'PAYABLE' && r.status === 'PENDING' && r.due_date < todayStr
  ).length;
  const totalOverdue = overdueTxs + overdueReminders;
  const billPunctualityScore = Math.max(25, 250 - totalOverdue * 45);

  // Pillar 3: Budget Ceilings & Credit Utilization (0..250)
  const totalCardLimit = cards.reduce((a, c) => a + (c.total_limit || 0), 0);
  const totalCardUsed = cards.reduce((a, c) => a + Math.max(0, (c.total_limit || 0) - (c.available_limit || 0)), 0);
  let cardSubScore = 125;
  if (totalCardLimit > 0) {
    const util = totalCardUsed / totalCardLimit;
    if (util <= 0.3) cardSubScore = 125;
    else if (util <= 0.6) cardSubScore = Math.round(125 - ((util - 0.3) / 0.3) * 45);
    else cardSubScore = Math.max(15, Math.round(80 - ((util - 0.6) / 0.4) * 65));
  }

  const budgetedCats = categories.filter(c => c.type === 'EXPENSE' && (c.monthly_budget_limit || 0) > 0);
  let budgetSubScore = 125;
  if (budgetedCats.length > 0) {
    let withinCount = 0;
    for (const cat of budgetedCats) {
      const spent = currentMonthTxs
        .filter(t => t.type === 'EXPENSE' && t.category_id === cat.id)
        .reduce((a, b) => a + b.amount, 0);
      if (spent <= (cat.monthly_budget_limit || 0)) withinCount++;
    }
    budgetSubScore = Math.round((withinCount / budgetedCats.length) * 125);
  }
  const creditAndBudgetScore = Math.min(250, Math.max(20, cardSubScore + budgetSubScore));

  // Pillar 4: Emergency Reserve Coverage in Months (0..250)
  // Average monthly real expenses over last 3 months
  const recentMonthKeys: string[] = [];
  for (let i = 0; i < 3; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    recentMonthKeys.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }
  const monthlyExps = recentMonthKeys
    .map(mk =>
      transactions
        .filter(t => t.type === 'EXPENSE' && t.date.startsWith(mk))
        .reduce((sum, t) => sum + t.amount, 0)
    )
    .filter(v => v > 0);

  const avgMonthlyExp =
    monthlyExps.length > 0
      ? monthlyExps.reduce((a, b) => a + b, 0) / monthlyExps.length
      : Math.max(monthExpense, 3000);

  const liquidBalance = accounts.reduce((sum, a) => sum + Math.max(0, a.current_balance || 0), 0);
  const emergencyGoalSaved = goals
    .filter(g => g.type === 'EMERGENCY_FUND')
    .reduce((sum, g) => sum + Math.max(0, g.current_amount || 0), 0);
  // Avoid double-counting if user keeps emergency fund inside an investment account
  const reserveCapital = Math.max(liquidBalance, emergencyGoalSaved);
  const monthsCovered = avgMonthlyExp > 0 ? reserveCapital / avgMonthlyExp : 0;

  let emergencyScore = 125;
  if (accounts.length === 0 && goals.length === 0) {
    emergencyScore = 100;
  } else if (monthsCovered >= 6) {
    emergencyScore = 250;
  } else if (monthsCovered >= 3) {
    emergencyScore = Math.round(175 + ((monthsCovered - 3) / 3) * 75);
  } else if (monthsCovered >= 1) {
    emergencyScore = Math.round(90 + ((monthsCovered - 1) / 2) * 85);
  } else {
    emergencyScore = Math.max(20, Math.round(monthsCovered * 90));
  }

  const totalScore = Math.min(
    1000,
    Math.max(0, savingsScore + billPunctualityScore + creditAndBudgetScore + emergencyScore)
  );

  return {
    financial_health_score: totalScore,
    score_factors: {
      savings_rate: savingsScore,
      bill_punctuality: billPunctualityScore,
      credit_utilization: creditAndBudgetScore,
      emergency_fund: emergencyScore
    }
  };
}

export interface MonthlyDREResult {
  monthKey: string;
  grossRevenue: number;
  taxesAndDeductions: number;
  netRevenue: number;
  operatingExpenses: number;
  netResult: number;
  netMarginPct: number;
}

const TAX_OR_DEDUCTION_REGEX = /(impost|tribut|simples|iss|das|irpj|csll|pis|cofins|deduç|deduc|taxa|tarifa|gateway)/i;

/**
 * Computes Managerial Income Statement (DRE Gerencial Mensal) for a BUSINESS workspace
 * exclusively from real INCOME and EXPENSE transactions (never counting TRANSFER).
 */
export function calculateBusinessDRE(
  transactions: Transaction[],
  categories: Category[],
  monthKey: string
): MonthlyDREResult {
  const monthTxs = transactions.filter(t => t.date && t.date.startsWith(monthKey));

  const grossRevenue = roundMoney(
    monthTxs.filter(t => t.type === 'INCOME').reduce((sum, t) => sum + t.amount, 0)
  );

  let taxesAndDeductions = 0;
  let operatingExpenses = 0;

  for (const tx of monthTxs) {
    if (tx.type !== 'EXPENSE') continue;
    const cat = categories.find(c => c.id === tx.category_id);
    const labelToTest = `${cat?.name || ''} ${tx.description || ''}`;
    if (TAX_OR_DEDUCTION_REGEX.test(labelToTest)) {
      taxesAndDeductions = roundMoney(taxesAndDeductions + tx.amount);
    } else {
      operatingExpenses = roundMoney(operatingExpenses + tx.amount);
    }
  }

  const netRevenue = roundMoney(grossRevenue - taxesAndDeductions);
  const netResult = roundMoney(netRevenue - operatingExpenses);
  const netMarginPct = grossRevenue > 0 ? roundMoney((netResult / grossRevenue) * 100) : 0;

  return {
    monthKey,
    grossRevenue,
    taxesAndDeductions,
    netRevenue,
    operatingExpenses,
    netResult,
    netMarginPct
  };
}
