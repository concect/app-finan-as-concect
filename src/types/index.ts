export type WorkspaceType = 'INDIVIDUAL' | 'FAMILY' | 'BUSINESS';
export type MemberRole = 'ADMIN' | 'EDITOR' | 'VIEWER';
export type AccountType = 'CHECKING' | 'SAVINGS' | 'INVESTMENT' | 'CASH';
export type InvoiceStatus = 'OPEN' | 'CLOSED' | 'PAID' | 'OVERDUE';
export type TransactionType = 'INCOME' | 'EXPENSE' | 'TRANSFER';
export type TransactionStatus = 'PENDING' | 'PAID' | 'OVERDUE';
export type TransactionSource = 'APP' | 'WHATSAPP';
export type SubscriptionOrLoanType = 'SUBSCRIPTION' | 'LOAN';
export type BillingCycle = 'MONTHLY' | 'YEARLY' | 'WEEKLY';
export type GoalType = 
  | 'INCOME' 
  | 'SAVINGS' 
  | 'EXPENSE_REDUCTION' 
  | 'DEBT_PAYOFF' 
  | 'PURCHASE' 
  | 'EMERGENCY_FUND' 
  | 'INVESTMENT';
export type GoalStatus = 'IN_PROGRESS' | 'COMPLETED' | 'PAUSED';

export interface User {
  id: string;
  name: string;
  email: string;
  auth_provider?: string;
  authProvider?: string;
  pin_hash?: string;
  two_factor_enabled: boolean;
  whatsapp_number: string;
  whatsapp_variants?: string[];
  whatsapp_connected?: boolean;
  whatsapp_linked_at?: string;
  theme_preference: 'dark' | 'light';
  active_profile_type: WorkspaceType;
  privacy_mode: boolean; // hide sensitive balance values
}

export interface Workspace {
  id: string;
  name: string;
  type: WorkspaceType;
  owner_id: string;
  icon?: string;
  description?: string;
}

export interface WorkspaceMember {
  workspace_id: string;
  user_id: string;
  name: string;
  email: string;
  role: MemberRole;
  shared_categories: string[];
}

export interface BankAccount {
  id: string;
  workspace_id: string;
  name: string;
  institution: string;
  type: AccountType;
  initial_balance: number;
  current_balance: number;
  color: string;
  icon?: string;
}

export interface CreditCard {
  id: string;
  workspace_id: string;
  bank_account_id?: string;
  name: string;
  brand: 'Mastercard' | 'Visa' | 'Elo' | 'Amex' | 'Outros';
  total_limit: number;
  available_limit: number;
  closing_day: number;
  due_day: number;
  color: string;
  card_last_digits?: string;
}

export interface CreditCardInvoice {
  id: string;
  card_id: string;
  reference_month: number; // 1-12
  reference_year: number;
  reference_key?: string; // YYYY-MM
  total_amount: number;
  status: InvoiceStatus;
  due_date: string;
  closing_date: string;
  paid_at?: string;
  paid_account_id?: string;
}

export interface Category {
  id: string;
  workspace_id: string;
  name: string;
  type: 'INCOME' | 'EXPENSE';
  monthly_budget_limit?: number;
  icon: string;
  color: string;
  is_system?: boolean;
}

export interface Transaction {
  id: string;
  workspace_id: string;
  account_id?: string;
  destination_account_id?: string; // For transfers
  card_id?: string;
  invoice_id?: string;
  category_id: string;
  type: TransactionType;
  amount: number;
  description: string;
  date: string; // YYYY-MM-DD
  status: TransactionStatus;
  is_recurring: boolean;
  installment_current?: number;
  installment_total?: number;
  parent_transaction_id?: string;
  recurring_source_id?: string;
  reference_month?: string; // YYYY-MM
  cost_center_id?: string; // Exclusivo para workspace BUSINESS
  source: TransactionSource;
  notes?: string;
  tags?: string[];
}

export type AssetKind = 'INVESTMENT' | 'PROPERTY';
export type InvestmentCategory = 'CDB' | 'TESOURO' | 'ACOES' | 'FII' | 'FUNDOS' | 'CRIPTO' | 'OUTROS';
export type PropertyCategory = 'IMOVEL' | 'VEICULO' | 'OUTROS';

export interface PatrimonyAsset {
  id: string;
  workspace_id: string;
  kind: AssetKind;
  category: InvestmentCategory | PropertyCategory;
  name: string;
  institution?: string;
  invested_amount: number;
  current_value: number;
  quantity?: number;
  purchase_date?: string; // YYYY-MM-DD
  reported_yield_pct?: number;
  notes?: string;
}

export interface SubscriptionAndLoan {
  id: string;
  workspace_id: string;
  name: string;
  type: SubscriptionOrLoanType;
  amount: number;
  billing_cycle: BillingCycle;
  next_billing_date: string;
  creditor?: string;
  initial_debt?: number;
  remaining_installments?: number;
  paid_installments?: number;
  total_installments?: number;
  total_debt?: number;
  interest_rate?: number; // annual or monthly %
  interest_period?: 'MONTHLY' | 'YEARLY';
  notes?: string;
  category_id: string;
  payment_method: 'ACCOUNT' | 'CARD';
  card_id?: string;
  account_id?: string;
}

export interface GoalContribution {
  id: string;
  goal_id: string;
  amount: number;
  date: string;
  note?: string;
}

export interface Goal {
  id: string;
  workspace_id: string;
  title: string;
  type: GoalType;
  target_amount: number;
  current_amount: number;
  deadline: string; // YYYY-MM-DD
  status: GoalStatus;
  created_at: string;
  notes?: string;
  monthly_target_contribution?: number;
  auto_calculate_emergency_months?: number; // 3, 6, 12 months
}

export interface Badge {
  id: string;
  title: string;
  description: string;
  icon: string;
  unlocked_at?: string;
  category: 'STREAK' | 'SAVINGS' | 'BUDGET' | 'INVESTMENT' | 'ORGANIZATION';
}

export const SYSTEM_BADGES: Badge[] = [
  { id: 'b_first_log', title: 'Primeiro Passo', description: 'Cadastrou o primeiro lançamento no sistema', icon: 'Sparkles', category: 'ORGANIZATION' },
  { id: 'b_streak_7', title: 'Hábito de Ferro', description: 'Manteve 7 dias consecutivos de ofensiva', icon: 'Flame', category: 'STREAK' },
  { id: 'b_streak_30', title: 'Mestre da Consistência', description: 'Completou 30 dias de registro contínuo', icon: 'Trophy', category: 'STREAK' },
  { id: 'b_emergency_fund', title: 'Reserva Blindada', description: 'Atingiu a meta de Reserva de Emergência', icon: 'ShieldCheck', category: 'SAVINGS' },
  { id: 'b_budget_master', title: 'Controle Cirúrgico', description: 'Fechou o mês sem estourar nenhum teto orçamentário', icon: 'Target', category: 'BUDGET' },
  { id: 'b_investor_seed', title: 'Semente Plantada', description: 'Registrou o primeiro aporte em investimentos', icon: 'Zap', category: 'INVESTMENT' }
];

export interface Challenge {
  id: string;
  title: string;
  description: string;
  target_days: number;
  current_days: number;
  xp_reward: number;
  is_completed: boolean;
  type: 'ZERO_DELIVERY' | 'DAILY_LOG' | 'BUDGET_DISCIPLINE' | 'EXTRA_SAVING';
}

export interface GamificationProfile {
  user_id: string;
  xp_points: number;
  level: number;
  level_title: string;
  current_streak: number;
  longest_streak: number;
  financial_health_score: number; // 0 to 1000
  score_factors: {
    savings_rate: number; // 0-250
    bill_punctuality: number; // 0-250
    credit_utilization: number; // 0-250
    emergency_fund: number; // 0-250
  };
  badges_unlocked: string[];
  active_challenges: Challenge[];
}

export interface NotificationItem {
  id: string;
  user_id: string;
  title: string;
  message: string;
  trigger_date: string;
  type: 'DUE_SOON' | 'OVERDUE' | 'BUDGET_EXCEEDED' | 'ANOMALY' | 'DAILY_SUMMARY' | 'MONTH_CLOSING' | 'GOAL_MILESTONE';
  channel: 'APP' | 'WHATSAPP';
  is_read: boolean;
  status: 'PENDING' | 'SENT' | 'DISMISSED';
}

export interface WhatsAppMessageOption {
  label: string;
  actionPayload: any;
}

export interface WhatsAppLog {
  id: string;
  user_id: string;
  sender: 'USER' | 'AGENT';
  message: string;
  timestamp: string;
  raw_message?: string;
  parsed_intent?: 'ADD_EXPENSE' | 'ADD_INCOME' | 'QUERY_BALANCE' | 'QUERY_EXPENSES' | 'QUERY_DUE' | 'SET_REMINDER' | 'CREATE_GOAL' | 'UNKNOWN';
  extracted_json?: any;
  requires_confirmation?: boolean;
  confirmed_at?: string;
  options?: WhatsAppMessageOption[];
}

export interface Reminder {
  id: string;
  workspace_id?: string;
  title: string;
  amount?: number;
  due_date: string; // YYYY-MM-DD
  type: 'PAYABLE' | 'RECEIVABLE' | 'GENERAL';
  status: 'PENDING' | 'PAID' | 'DISMISSED';
  category_id?: string;
  is_recurring?: boolean;
  notes?: string;
  linked_transaction_id?: string;
  paid_account_id?: string;
  paid_at?: string;
  created_at?: string;
}

export interface WhatsAppSystemStatus {
  status: 'DISCONNECTED' | 'WAITING_QR' | 'CONNECTED';
  botNumber?: string;
  qr?: string | null;
  updatedAt?: string;
}

export interface ChatMessageRecord {
  id: string;
  channel: 'CONSULTANT' | 'WHATSAPP';
  source?: 'APP' | 'WHATSAPP';
  sender: 'USER' | 'AI';
  text: string;
  timestamp: string;
  created_at?: any;
  intent?: string;
  action_payload?: any;
  requires_confirmation?: boolean;
  options?: any[];
  is_audio?: boolean;
  audio_url?: string;
}

export interface CashFlowMonthProjection {
  month: string; // e.g. "2026-12"
  monthName: string;
  expectedIncome: number;
  fixedExpenses: number;
  creditCardInstallments: number;
  projectedNet: number;
  projectedBalance: number;
}

export interface BusinessClient {
  id: string;
  workspace_id: string;
  name: string;
  document?: string; // CNPJ/CPF
  contact?: string; // e-mail ou telefone
  contract_value: number;
  commission_pct?: number;
  commission_amount?: number;
  billing_day?: number;
  status: 'ACTIVE' | 'INACTIVE';
  notes?: string;
}

export interface BusinessSupplier {
  id: string;
  workspace_id: string;
  name: string;
  default_category_id?: string;
  document_or_pix?: string;
  contact?: string;
  notes?: string;
}

export interface CostCenter {
  id: string;
  workspace_id: string;
  name: string;
  code?: string;
  monthly_budget?: number;
  color?: string;
}
