import React, { useState, useEffect, useMemo } from 'react';
import { X, RotateCcw, LogOut, Sparkles } from 'lucide-react';
import { User as FirebaseUser } from 'firebase/auth';
import { AuthService } from './services/authService';
import {
  FirestoreService,
  belongsToWorkspace,
  calculateFinancialHealthScore
} from './services/firestoreService';
import { DemoStore } from './services/demoStore';
import { DEMO_USER_ID } from './data/seedData';
import {
  User,
  Workspace,
  BankAccount,
  CreditCard,
  CreditCardInvoice,
  Category,
  Transaction,
  SubscriptionAndLoan,
  PatrimonyAsset,
  Goal,
  GamificationProfile,
  NotificationItem,
  WhatsAppLog,
  Reminder,
  BusinessClient,
  BusinessSupplier,
  CostCenter
} from './types';

// Components
import { AuthScreen } from './components/AuthScreen';
import { OnboardingModal } from './components/OnboardingModal';
import { Sidebar } from './components/Sidebar';
import { Navbar } from './components/Navbar';
import { BottomNav } from './components/BottomNav';
import { PinLockModal } from './components/PinLockModal';
import { QuickTransactionModal } from './components/QuickTransactionModal';

// Views
import { DashboardOverview } from './views/DashboardOverview';
import { TransactionsView } from './views/TransactionsView';
import { AccountsCardsView } from './views/AccountsCardsView';
import { BusinessOperationsView } from './views/BusinessOperationsView';
import { PatrimonyView } from './views/PatrimonyView';
import { BudgetPlanningView } from './views/BudgetPlanningView';
import { GoalsView } from './views/GoalsView';
import { ConcectAiView } from './views/ConcectAiView';
import { WhatsAppSimulatorView } from './views/WhatsAppSimulatorView';
import { GamificationView } from './views/GamificationView';
import { SettingsView } from './views/SettingsView';

const PIN_LOCK_SESSION_KEY = 'concect_pin_locked';
const DEMO_SESSION_KEY = 'concect_demo_active';

export function App() {
  const [currentUser, setCurrentUser] = useState<FirebaseUser | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [isDemoMode, setIsDemoMode] = useState<boolean>(
    () => sessionStorage.getItem(DEMO_SESSION_KEY) === 'true'
  );

  // Realtime State (Firestore or isolated DemoStore)
  const [userData, setUserData] = useState<User | null>(null);
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [cards, setCards] = useState<CreditCard[]>([]);
  const [invoices, setInvoices] = useState<CreditCardInvoice[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [subscriptions, setSubscriptions] = useState<SubscriptionAndLoan[]>([]);
  const [assets, setAssets] = useState<PatrimonyAsset[]>([]);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [gamification, setGamification] = useState<GamificationProfile>({
    user_id: '',
    xp_points: 0,
    level: 1,
    level_title: 'Iniciante Consciente',
    current_streak: 1,
    longest_streak: 1,
    financial_health_score: 700,
    score_factors: {
      savings_rate: 175,
      bill_punctuality: 175,
      credit_utilization: 175,
      emergency_fund: 175
    },
    badges_unlocked: [],
    active_challenges: []
  });
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [whatsappLogs, setWhatsAppLogs] = useState<WhatsAppLog[]>([]);
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [clients, setClients] = useState<BusinessClient[]>([]);
  const [suppliers, setSuppliers] = useState<BusinessSupplier[]>([]);
  const [costCenters, setCostCenters] = useState<CostCenter[]>([]);

  // Navigation & UI State
  const [currentTab, setCurrentTab] = useState<string>('overview');
  const [isPinLocked, setIsPinLocked] = useState<boolean>(
    () => sessionStorage.getItem(PIN_LOCK_SESSION_KEY) === 'true'
  );
  const [isTransactionModalOpen, setIsTransactionModalOpen] = useState<boolean>(false);
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
  const [isOnboardingOpen, setIsOnboardingOpen] = useState<boolean>(false);
  const [hasDismissedOnboarding, setHasDismissedOnboarding] = useState<boolean>(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState<boolean>(false);
  const [txsLoaded, setTxsLoaded] = useState<boolean>(false);
  const [subsLoaded, setSubsLoaded] = useState<boolean>(false);

  const activeUid = isDemoMode ? DEMO_USER_ID : currentUser?.uid || '';

  // Workspaces
  const workspaces: Workspace[] = [
    {
      id: 'ws_personal',
      name: 'Finanças Pessoais',
      type: 'INDIVIDUAL',
      owner_id: activeUid
    },
    {
      id: 'ws_family',
      name: 'Residência & Família',
      type: 'FAMILY',
      owner_id: activeUid
    },
    {
      id: 'ws_business',
      name: 'CONCECT Digital PJ',
      type: 'BUSINESS',
      owner_id: activeUid
    }
  ];
  const [activeWorkspaceId, setActiveWorkspaceId] = useState<string>('ws_personal');
  const activeWorkspace = workspaces.find(w => w.id === activeWorkspaceId) || workspaces[0];

  // 1. Firebase Auth Listener
  useEffect(() => {
    const unsubscribeAuth = AuthService.onAuthChanged(async fbUser => {
      setCurrentUser(fbUser);
      setAuthLoading(false);

      if (fbUser) {
        // Real login exits demo mode cleanly
        sessionStorage.removeItem(DEMO_SESSION_KEY);
        setIsDemoMode(false);
        const providerId =
          fbUser.providerData[0]?.providerId === 'apple.com'
            ? 'apple'
            : fbUser.providerData[0]?.providerId === 'google.com'
            ? 'google'
            : 'email';
        const initializedUser = await FirestoreService.ensureUserInitialized(
          fbUser.uid,
          fbUser.email || '',
          fbUser.displayName || undefined,
          providerId
        );
        setUserData(initializedUser);
      } else if (sessionStorage.getItem(DEMO_SESSION_KEY) !== 'true') {
        setUserData(null);
      }
    });

    return () => unsubscribeAuth();
  }, []);

  // 2. Realtime Subscriptions (Firestore for real users, DemoStore for Demo Mode)
  useEffect(() => {
    if (!activeUid) return;

    const unsubUser = FirestoreService.subscribeUser(activeUid, user => setUserData(user));
    const unsubAccounts = FirestoreService.subscribeAccounts(activeUid, accs => {
      setAccounts(accs);
      if (!isDemoMode && accs.length === 0 && !hasDismissedOnboarding) {
        setIsOnboardingOpen(true);
      }
    });
    const unsubCards = FirestoreService.subscribeCards(activeUid, setCards);
    const unsubInvoices = FirestoreService.subscribeInvoices(activeUid, setInvoices);
    const unsubCategories = FirestoreService.subscribeCategories(activeUid, setCategories);
    const unsubTransactions = FirestoreService.subscribeTransactions(activeUid, txs => {
      setTransactions(txs);
      setTxsLoaded(true);
    });
    const unsubSubscriptions = FirestoreService.subscribeSubscriptions(activeUid, subs => {
      setSubscriptions(subs);
      setSubsLoaded(true);
    });
    const unsubAssets = FirestoreService.subscribeAssets(activeUid, setAssets);
    const unsubGoals = FirestoreService.subscribeGoals(activeUid, setGoals);
    const unsubGamification = FirestoreService.subscribeGamification(activeUid, setGamification);
    const unsubNotifications = FirestoreService.subscribeNotifications(activeUid, setNotifications);
    const unsubWhatsApp = FirestoreService.subscribeWhatsAppLogs(activeUid, setWhatsAppLogs);
    const unsubReminders = FirestoreService.subscribeReminders(activeUid, setReminders);
    const unsubClients = FirestoreService.subscribeClients(activeUid, setClients);
    const unsubSuppliers = FirestoreService.subscribeSuppliers(activeUid, setSuppliers);
    const unsubCostCenters = FirestoreService.subscribeCostCenters(activeUid, setCostCenters);

    return () => {
      unsubUser();
      unsubAccounts();
      unsubCards();
      unsubInvoices();
      unsubCategories();
      unsubTransactions();
      unsubSubscriptions();
      unsubAssets();
      unsubGoals();
      unsubGamification();
      unsubNotifications();
      unsubWhatsApp();
      unsubReminders();
      unsubClients();
      unsubSuppliers();
      unsubCostCenters();
    };
  }, [activeUid, isDemoMode, hasDismissedOnboarding]);

  // 3. Auto-seed PJ Categories when a real user enters Business workspace for the first time
  useEffect(() => {
    if (!activeUid || isDemoMode) return;
    if (activeWorkspaceId === 'ws_business' && categories.length > 0) {
      FirestoreService.ensureBusinessCategoriesSeeded(activeUid, categories);
    }
  }, [activeUid, isDemoMode, activeWorkspaceId, categories]);

  // 4. Idempotent Monthly Recurrence Engine (real accounts only)
  useEffect(() => {
    if (!activeUid || isDemoMode || !txsLoaded || !subsLoaded) return;
    if (transactions.length === 0 && subscriptions.length === 0) return;

    FirestoreService.processRecurringItems(
      activeUid,
      transactions,
      subscriptions,
      accounts,
      cards
    );
  }, [
    activeUid,
    isDemoMode,
    txsLoaded,
    subsLoaded,
    transactions.length,
    subscriptions.length,
    accounts.length,
    cards.length
  ]);

  // 5. Workspace-Scoped Data Filtering (Legacy docs without workspace_id default to 'ws_personal')
  const wsAccounts = useMemo(
    () => accounts.filter(a => belongsToWorkspace(a.workspace_id, activeWorkspaceId)),
    [accounts, activeWorkspaceId]
  );
  const wsCards = useMemo(
    () => cards.filter(c => belongsToWorkspace(c.workspace_id, activeWorkspaceId)),
    [cards, activeWorkspaceId]
  );
  const wsCardIds = useMemo(() => new Set(wsCards.map(c => c.id)), [wsCards]);
  const wsInvoices = useMemo(
    () => invoices.filter(inv => wsCardIds.has(inv.card_id)),
    [invoices, wsCardIds]
  );
  const wsCategories = useMemo(() => {
    const exact = categories.filter(c => belongsToWorkspace(c.workspace_id, activeWorkspaceId));
    // For Family workspace without custom categories yet, fallback gracefully to personal categories for tagging
    if (exact.length === 0 && activeWorkspaceId === 'ws_family') {
      return categories.filter(c => belongsToWorkspace(c.workspace_id, 'ws_personal'));
    }
    return exact;
  }, [categories, activeWorkspaceId]);
  const wsTransactions = useMemo(
    () => transactions.filter(t => belongsToWorkspace(t.workspace_id, activeWorkspaceId)),
    [transactions, activeWorkspaceId]
  );
  const wsSubscriptions = useMemo(
    () => subscriptions.filter(s => belongsToWorkspace(s.workspace_id, activeWorkspaceId)),
    [subscriptions, activeWorkspaceId]
  );
  const wsAssets = useMemo(
    () => assets.filter(a => belongsToWorkspace(a.workspace_id, activeWorkspaceId)),
    [assets, activeWorkspaceId]
  );
  const wsGoals = useMemo(
    () => goals.filter(g => belongsToWorkspace(g.workspace_id, activeWorkspaceId)),
    [goals, activeWorkspaceId]
  );
  const wsReminders = useMemo(
    () => reminders.filter(r => belongsToWorkspace(r.workspace_id, activeWorkspaceId)),
    [reminders, activeWorkspaceId]
  );
  const wsClients = useMemo(
    () => clients.filter(c => belongsToWorkspace(c.workspace_id, activeWorkspaceId)),
    [clients, activeWorkspaceId]
  );
  const wsSuppliers = useMemo(
    () => suppliers.filter(s => belongsToWorkspace(s.workspace_id, activeWorkspaceId)),
    [suppliers, activeWorkspaceId]
  );
  const wsCostCenters = useMemo(
    () => costCenters.filter(cc => belongsToWorkspace(cc.workspace_id, activeWorkspaceId)),
    [costCenters, activeWorkspaceId]
  );

  // Guard: never keep business-only tab open if user switches to Personal or Family profile
  useEffect(() => {
    if (activeWorkspace.type !== 'BUSINESS' && currentTab === 'business') {
      setCurrentTab('overview');
    }
  }, [activeWorkspace.type, currentTab]);

  // 6. Dynamic Financial Health Score computed from active workspace real data
  const effectiveGamification: GamificationProfile = useMemo(() => {
    const computed = calculateFinancialHealthScore({
      transactions: wsTransactions,
      accounts: wsAccounts,
      cards: wsCards,
      categories: wsCategories,
      goals: wsGoals,
      reminders: wsReminders
    });
    return {
      ...gamification,
      financial_health_score: computed.financial_health_score,
      score_factors: computed.score_factors
    };
  }, [gamification, wsTransactions, wsAccounts, wsCards, wsCategories, wsGoals, wsReminders]);

  // Sync HTML .dark class with user theme preference
  const activeTheme = userData?.theme_preference || 'dark';
  useEffect(() => {
    if (activeTheme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [activeTheme]);

  // Keyboard shortcut "N" for quick transaction
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.key === 'n' || e.key === 'N') && !['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement).tagName)) {
        e.preventDefault();
        setEditingTransaction(null);
        setIsTransactionModalOpen(true);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Handlers
  const handleEnterDemo = () => {
    sessionStorage.setItem(DEMO_SESSION_KEY, 'true');
    setIsDemoMode(true);
    setHasDismissedOnboarding(true);
    setIsOnboardingOpen(false);
    setActiveWorkspaceId('ws_personal');
    setCurrentTab('overview');
  };

  const handleResetDemo = () => {
    DemoStore.reset();
    setActiveWorkspaceId('ws_personal');
  };

  const handleExitDemo = () => {
    sessionStorage.removeItem(DEMO_SESSION_KEY);
    sessionStorage.removeItem(PIN_LOCK_SESSION_KEY);
    setIsPinLocked(false);
    setIsDemoMode(false);
    setUserData(null);
  };

  const handleLockPin = () => {
    sessionStorage.setItem(PIN_LOCK_SESSION_KEY, 'true');
    setIsPinLocked(true);
  };

  const handleUnlockPin = () => {
    sessionStorage.removeItem(PIN_LOCK_SESSION_KEY);
    setIsPinLocked(false);
  };

  const handleTogglePrivacy = async () => {
    if (!activeUid || !userData) return;
    const updated = !userData.privacy_mode;
    setUserData({ ...userData, privacy_mode: updated });
    await FirestoreService.updateUserPreferences(activeUid, { privacy_mode: updated });
  };

  const handleToggleTheme = async () => {
    if (!activeUid || !userData) return;
    const nextTheme = userData.theme_preference === 'dark' ? 'light' : 'dark';
    setUserData({ ...userData, theme_preference: nextTheme });
    await FirestoreService.updateUserPreferences(activeUid, { theme_preference: nextTheme });
  };

  const handleLogout = async () => {
    if (isDemoMode) {
      handleExitDemo();
      return;
    }
    sessionStorage.removeItem(PIN_LOCK_SESSION_KEY);
    setIsPinLocked(false);
    await AuthService.logout();
    setCurrentUser(null);
    setUserData(null);
  };

  const getScreenTitle = () => {
    const suffix = activeWorkspace.type === 'BUSINESS' ? ' — PJ' : '';
    switch (currentTab) {
      case 'overview': return `Visão geral${suffix}`;
      case 'transactions': return `Lançamentos e agenda${suffix}`;
      case 'accounts': return `Contas, cartões e faturas${suffix}`;
      case 'business': return 'Gestão Empresarial — PJ';
      case 'patrimony': return `Patrimônio, investimentos e dívidas${suffix}`;
      case 'planning': return `Orçamento e simulador${suffix}`;
      case 'goals': return `Metas e reservas${suffix}`;
      case 'ai': return `Consultor financeiro${suffix}`;
      case 'whatsapp': return 'Assistente WhatsApp';
      case 'gamification': return 'Saúde financeira';
      case 'settings': return 'Configurações';
      default: return 'Concect Finanças';
    }
  };

  if (authLoading && !isDemoMode) {
    return (
      <div className="min-h-screen bg-canvas flex flex-col items-center justify-center text-primary">
        <div className="w-8 h-8 border-2 border-[#10B981] border-t-transparent rounded-full animate-spin mb-3" />
        <p className="text-xs text-muted font-mono">Sincronizando carteira</p>
      </div>
    );
  }

  if (!currentUser && !isDemoMode) {
    return <AuthScreen onSuccess={() => {}} onEnterDemo={handleEnterDemo} />;
  }

  const safeUser: User = userData || {
    id: activeUid,
    name: currentUser?.displayName || currentUser?.email?.split('@')[0] || 'Investidor',
    email: currentUser?.email || '',
    pin_hash: '1234',
    two_factor_enabled: false,
    whatsapp_number: '',
    theme_preference: 'dark',
    active_profile_type: 'INDIVIDUAL',
    privacy_mode: false
  };

  return (
    <div className={`min-h-screen ${safeUser.theme_preference === 'dark' ? 'dark' : ''} bg-canvas text-primary transition-colors flex flex-col`}>
      {/* Discreet Demo Mode Top Bar */}
      {isDemoMode && (
        <div className="bg-surface border-b border-[#10B981]/30 px-3 sm:px-6 py-2 flex flex-wrap items-center justify-between gap-2 text-xs z-40">
          <div className="flex items-center gap-2 min-w-0">
            <Sparkles className="w-3.5 h-3.5 text-[#10B981] shrink-0" />
            <span className="font-medium text-primary truncate">
              Modo Demonstração <span className="text-muted font-normal">(dados fictícios isolados)</span>
            </span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={handleResetDemo}
              className="h-7 px-2.5 bg-raised hover:bg-surface-hover border border-subtle text-[11px] font-medium text-primary rounded-md flex items-center gap-1.5 transition-colors"
            >
              <RotateCcw className="w-3 h-3 stroke-[1.5]" />
              <span>Restaurar dados originais</span>
            </button>
            <button
              onClick={handleExitDemo}
              className="h-7 px-2.5 bg-primary hover:opacity-90 text-canvas text-[11px] font-medium rounded-md flex items-center gap-1.5 transition-opacity"
            >
              <LogOut className="w-3 h-3 stroke-[1.5]" />
              <span>Sair / Criar conta real</span>
            </button>
          </div>
        </div>
      )}

      {/* PIN Lock Screen Overlay */}
      <PinLockModal
        isOpen={isPinLocked}
        onUnlock={handleUnlockPin}
        correctPin={safeUser.pin_hash || '1234'}
      />

      {/* Onboarding Modal for New Empty Real Accounts */}
      <OnboardingModal
        isOpen={!isDemoMode && isOnboardingOpen}
        userId={activeUid}
        activeWorkspaceId={activeWorkspaceId}
        onClose={() => {
          setIsOnboardingOpen(false);
          setHasDismissedOnboarding(true);
        }}
        onSuccess={() => {
          setIsOnboardingOpen(false);
          setHasDismissedOnboarding(true);
        }}
      />

      {/* Quick Transaction Modal */}
      <QuickTransactionModal
        isOpen={isTransactionModalOpen}
        userId={activeUid}
        activeWorkspaceId={activeWorkspaceId}
        workspaceType={activeWorkspace.type}
        costCenters={wsCostCenters}
        accounts={wsAccounts}
        cards={wsCards}
        categories={wsCategories}
        initialTransaction={editingTransaction}
        onClose={() => {
          setIsTransactionModalOpen(false);
          setEditingTransaction(null);
        }}
        onSuccess={() => {
          setEditingTransaction(null);
        }}
      />

      <div className="flex flex-1 min-h-0 overflow-hidden min-w-0">
        {/* Desktop Sidebar */}
        <Sidebar
          currentTab={currentTab}
          setCurrentTab={setCurrentTab}
          workspaces={workspaces}
          activeWorkspaceId={activeWorkspaceId}
          onSelectWorkspace={setActiveWorkspaceId}
          onOpenNewTransaction={() => {
            setEditingTransaction(null);
            setIsTransactionModalOpen(true);
          }}
          user={safeUser}
          onTogglePrivacy={handleTogglePrivacy}
          onLockPin={handleLockPin}
          onToggleTheme={handleToggleTheme}
          streak={effectiveGamification.current_streak || 1}
          level={effectiveGamification.level || 1}
          unreadNotificationsCount={notifications.filter(n => !n.is_read).length}
        />

        {/* Main Application Area */}
        <div className="flex-1 min-w-0 flex flex-col h-screen overflow-hidden">
          {/* Top Navbar */}
          <Navbar
            user={safeUser}
            onTogglePrivacy={handleTogglePrivacy}
            onLockPin={handleLockPin}
            onOpenNewTransaction={() => {
              setEditingTransaction(null);
              setIsTransactionModalOpen(true);
            }}
            onOpenMobileMenu={() => setIsMobileMenuOpen(true)}
            notifications={notifications}
            onRefreshNotifications={() => {}}
            title={getScreenTitle()}
          />

          {/* View Container */}
          <main className="flex-1 min-w-0 overflow-y-auto px-3 sm:px-6 lg:px-8 py-4 sm:py-6 lg:py-8 pb-24 lg:pb-8 scrollbar-thin">
            <div className="max-w-[1440px] mx-auto w-full min-w-0">
              {currentTab === 'overview' && (
                <DashboardOverview
                  user={safeUser}
                  activeWorkspaceId={activeWorkspaceId}
                  workspaceType={activeWorkspace.type}
                  accounts={wsAccounts}
                  cards={wsCards}
                  transactions={wsTransactions}
                  categories={wsCategories}
                  goals={wsGoals}
                  gamification={effectiveGamification}
                  onNavigateTab={setCurrentTab}
                  onOpenNewTransaction={() => {
                    setEditingTransaction(null);
                    setIsTransactionModalOpen(true);
                  }}
                  onRefreshData={() => {}}
                />
              )}

              {currentTab === 'transactions' && (
                <TransactionsView
                  user={safeUser}
                  activeWorkspaceId={activeWorkspaceId}
                  workspaceType={activeWorkspace.type}
                  transactions={wsTransactions}
                  categories={wsCategories}
                  accounts={wsAccounts}
                  cards={wsCards}
                  reminders={wsReminders}
                  onOpenNewTransaction={() => {
                    setEditingTransaction(null);
                    setIsTransactionModalOpen(true);
                  }}
                  onEditTransaction={tx => {
                    setEditingTransaction(tx);
                    setIsTransactionModalOpen(true);
                  }}
                  onRefreshData={() => {}}
                />
              )}

              {currentTab === 'accounts' && (
                <AccountsCardsView
                  user={safeUser}
                  activeWorkspaceId={activeWorkspaceId}
                  workspaceType={activeWorkspace.type}
                  accounts={wsAccounts}
                  cards={wsCards}
                  invoices={wsInvoices}
                  subscriptions={wsSubscriptions}
                  transactions={wsTransactions}
                  onRefreshData={() => {}}
                  onOpenNewTransaction={() => {
                    setEditingTransaction(null);
                    setIsTransactionModalOpen(true);
                  }}
                />
              )}

              {currentTab === 'business' && activeWorkspace.type === 'BUSINESS' && (
                <BusinessOperationsView
                  user={safeUser}
                  activeWorkspaceId={activeWorkspaceId}
                  accounts={wsAccounts}
                  cards={wsCards}
                  categories={wsCategories}
                  transactions={wsTransactions}
                  clients={wsClients}
                  suppliers={wsSuppliers}
                  costCenters={wsCostCenters}
                  onRefreshData={() => {}}
                />
              )}

              {currentTab === 'patrimony' && (
                <PatrimonyView
                  user={safeUser}
                  activeWorkspaceId={activeWorkspaceId}
                  workspaceType={activeWorkspace.type}
                  accounts={wsAccounts}
                  cards={wsCards}
                  invoices={wsInvoices}
                  transactions={wsTransactions}
                  categories={wsCategories}
                  assets={wsAssets}
                  subscriptions={wsSubscriptions}
                  onRefreshData={() => {}}
                />
              )}

              {currentTab === 'planning' && (
                <BudgetPlanningView
                  user={safeUser}
                  activeWorkspaceId={activeWorkspaceId}
                  workspaceType={activeWorkspace.type}
                  categories={wsCategories}
                  transactions={wsTransactions}
                  accounts={wsAccounts}
                />
              )}

              {currentTab === 'goals' && (
                <GoalsView
                  user={safeUser}
                  activeWorkspaceId={activeWorkspaceId}
                  workspaceType={activeWorkspace.type}
                  goals={wsGoals}
                  transactions={wsTransactions}
                  accounts={wsAccounts}
                  onRefreshData={() => {}}
                />
              )}

              {currentTab === 'ai' && (
                <ConcectAiView
                  user={safeUser}
                  activeWorkspaceId={activeWorkspaceId}
                  workspaceType={activeWorkspace.type}
                  accounts={wsAccounts}
                  cards={wsCards}
                  categories={wsCategories}
                  transactions={wsTransactions}
                  goals={wsGoals}
                  reminders={wsReminders}
                  subscriptions={wsSubscriptions}
                />
              )}

              {currentTab === 'whatsapp' && (
                <WhatsAppSimulatorView
                  user={safeUser}
                  activeWorkspaceId={activeWorkspaceId}
                  accounts={wsAccounts}
                  cards={wsCards}
                  categories={wsCategories}
                  transactions={wsTransactions}
                  goals={wsGoals}
                  reminders={wsReminders}
                  whatsappLogs={whatsappLogs}
                  onRefreshData={() => {}}
                />
              )}

              {currentTab === 'gamification' && (
                <GamificationView
                  user={safeUser}
                  gamification={effectiveGamification}
                  onRefreshData={() => {}}
                />
              )}

              {currentTab === 'settings' && (
                <SettingsView
                  user={safeUser}
                  activeWorkspaceId={activeWorkspaceId}
                  categories={wsCategories}
                  workspaces={workspaces}
                  onRefreshData={() => {}}
                  onToggleTheme={handleToggleTheme}
                  onLockPin={handleLockPin}
                  onLogout={handleLogout}
                />
              )}
            </div>
          </main>
        </div>
      </div>

      {/* Mobile Bottom Navigation */}
      <BottomNav
        currentTab={currentTab}
        setCurrentTab={setCurrentTab}
        onOpenNewTransaction={() => {
          setEditingTransaction(null);
          setIsTransactionModalOpen(true);
        }}
        onOpenMore={() => setIsMobileMenuOpen(true)}
      />

      {/* Mobile Drawer (including Workspace Switcher) */}
      {isMobileMenuOpen && (
        <div className="fixed inset-0 z-50 flex bg-black/70 backdrop-blur-sm lg:hidden">
          <div className="w-72 max-w-[85vw] bg-deep border-r border-subtle h-full p-4 flex flex-col justify-between overflow-y-auto">
            <div>
              <div className="flex items-center justify-between pb-3 border-b border-subtle">
                <div className="flex items-center gap-2.5 min-w-0">
                  <img src="/assets/logo/iconesite.webp" alt="Concect" className="w-6 h-6 rounded shrink-0" />
                  <span className="font-medium text-sm text-primary truncate">Concect Finanças</span>
                </div>
                <button
                  onClick={() => setIsMobileMenuOpen(false)}
                  className="p-1.5 rounded-lg text-muted hover:text-primary transition-colors"
                >
                  <X className="w-4 h-4 stroke-[1.5]" />
                </button>
              </div>

              {/* Mobile Workspace Switcher */}
              <div className="mt-3 pb-3 border-b border-subtle space-y-1.5">
                <span className="text-[11px] text-muted px-1">Carteira ativa</span>
                <div className="grid grid-cols-1 gap-1">
                  {workspaces.map(ws => (
                    <button
                      key={ws.id}
                      onClick={() => {
                        setActiveWorkspaceId(ws.id);
                        setIsMobileMenuOpen(false);
                      }}
                      className={`w-full text-left px-3 h-8 rounded-lg text-xs font-medium transition-colors ${
                        activeWorkspaceId === ws.id
                          ? 'bg-raised text-primary border border-subtle'
                          : 'text-secondary hover:text-primary'
                      }`}
                    >
                      {ws.name}
                    </button>
                  ))}
                </div>
              </div>

              <div className="mt-3 space-y-1">
                {[
                  { id: 'overview', label: 'Visão geral' },
                  { id: 'transactions', label: 'Lançamentos e agenda' },
                  { id: 'accounts', label: 'Contas e cartões' },
                  ...(activeWorkspace.type === 'BUSINESS'
                    ? [{ id: 'business', label: 'Gestão Empresarial' }]
                    : []),
                  { id: 'patrimony', label: 'Patrimônio & Dívidas' },
                  { id: 'planning', label: 'Orçamento e simulador' },
                  { id: 'goals', label: 'Metas e reservas' },
                  { id: 'ai', label: 'Consultor financeiro' },
                  { id: 'whatsapp', label: 'Assistente WhatsApp' },
                  { id: 'gamification', label: 'Saúde financeira' },
                  { id: 'settings', label: 'Configurações' }
                ].map(item => (
                  <button
                    key={item.id}
                    onClick={() => {
                      setCurrentTab(item.id);
                      setIsMobileMenuOpen(false);
                    }}
                    className={`w-full text-left px-3 h-9 rounded-lg text-[13px] font-medium transition-colors ${
                      currentTab === item.id
                        ? 'bg-raised text-primary'
                        : 'text-secondary hover:text-primary'
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="pt-3 mt-4 border-t border-subtle text-xs text-secondary flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="font-medium text-primary truncate">{safeUser.name}</p>
                <p className="text-[11px] text-muted truncate">{safeUser.email}</p>
              </div>
              <button
                onClick={handleLogout}
                className="text-xs text-[#EF4444] hover:underline shrink-0"
              >
                Sair
              </button>
            </div>
          </div>

          <div className="flex-1" onClick={() => setIsMobileMenuOpen(false)} />
        </div>
      )}
    </div>
  );
}

export default App;
