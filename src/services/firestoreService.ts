import {
  collection,
  doc,
  getDoc,
  setDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  orderBy,
  onSnapshot,
  writeBatch,
  serverTimestamp
} from 'firebase/firestore';
import { db } from './firebase';
import {
  User,
  BankAccount,
  CreditCard,
  CreditCardInvoice,
  InvoiceStatus,
  Category,
  Transaction,
  SubscriptionAndLoan,
  PatrimonyAsset,
  BusinessClient,
  BusinessSupplier,
  CostCenter,
  Goal,
  GamificationProfile,
  NotificationItem,
  WhatsAppLog,
  Reminder,
  ChatMessageRecord,
  WhatsAppSystemStatus
} from '../types';
import {
  roundMoney,
  buildInvoiceId,
  computeCardInvoiceCycle,
  ComputedInvoiceCycle,
  belongsToWorkspace,
  DEFAULT_SYSTEM_CATEGORIES,
  DEFAULT_BUSINESS_CATEGORIES,
  calculateFinancialHealthScore,
  calculateBusinessDRE
} from './financeMath';
import { DemoStore } from './demoStore';

export {
  roundMoney,
  buildInvoiceId,
  computeCardInvoiceCycle,
  belongsToWorkspace,
  DEFAULT_SYSTEM_CATEGORIES,
  DEFAULT_BUSINESS_CATEGORIES,
  calculateFinancialHealthScore,
  calculateBusinessDRE
};
export type { ComputedInvoiceCycle };

export const normalizeBrazilianWhatsAppNumber = (raw: string): { cleanNumber: string; variants: string[] } => {
  let digits = raw.replace(/\D/g, '');
  if (digits.startsWith('0')) {
    digits = digits.slice(1);
  }
  if (!digits.startsWith('55')) {
    digits = `55${digits}`;
  }

  const ddi = digits.slice(0, 2);
  const ddd = digits.slice(2, 4);
  const rest = digits.slice(4);

  let with9 = digits;
  let without9 = digits;

  if (rest.length === 9 && rest.startsWith('9')) {
    with9 = `${ddi}${ddd}${rest}`;
    without9 = `${ddi}${ddd}${rest.slice(1)}`;
  } else if (rest.length === 8) {
    without9 = `${ddi}${ddd}${rest}`;
    with9 = `${ddi}${ddd}9${rest}`;
  }

  const variants = Array.from(new Set([with9, without9, digits]));
  return { cleanNumber: with9, variants };
};

const stripUndefined = <T extends Record<string, any>>(obj: T): T => {
  const clean: Record<string, any> = {};
  Object.keys(obj).forEach(key => {
    if (obj[key] !== undefined) {
      clean[key] = obj[key];
    }
  });
  return clean as T;
};

export class FirestoreService {
  private static recurringExecutionLocks = new Set<string>();
  private static seededBusinessUsers = new Set<string>();

  private static accumulateTransactionImpact(
    tx: Partial<Transaction>,
    multiplier: 1 | -1,
    accountDeltas: Map<string, number>,
    cardDeltas: Map<string, number>
  ) {
    const amount = roundMoney(tx.amount || 0);
    if (amount <= 0) return;

    if (tx.card_id && tx.type === 'EXPENSE') {
      const prev = cardDeltas.get(tx.card_id) || 0;
      cardDeltas.set(tx.card_id, roundMoney(prev - amount * multiplier));
      return;
    }

    if (tx.status === 'PAID') {
      if (tx.type === 'TRANSFER') {
        if (tx.account_id) {
          const prevOrig = accountDeltas.get(tx.account_id) || 0;
          accountDeltas.set(tx.account_id, roundMoney(prevOrig - amount * multiplier));
        }
        if (tx.destination_account_id) {
          const prevDest = accountDeltas.get(tx.destination_account_id) || 0;
          accountDeltas.set(tx.destination_account_id, roundMoney(prevDest + amount * multiplier));
        }
      } else if (tx.type === 'INCOME' && tx.account_id) {
        const prev = accountDeltas.get(tx.account_id) || 0;
        accountDeltas.set(tx.account_id, roundMoney(prev + amount * multiplier));
      } else if (tx.type === 'EXPENSE' && tx.account_id) {
        const prev = accountDeltas.get(tx.account_id) || 0;
        accountDeltas.set(tx.account_id, roundMoney(prev - amount * multiplier));
      }
    }
  }

  private static async applyInvoiceDeltasInBatch(
    uid: string,
    batch: ReturnType<typeof writeBatch>,
    invoiceDeltas: Map<string, { cycle: ComputedInvoiceCycle; delta: number }>
  ) {
    for (const [invId, { cycle, delta }] of invoiceDeltas.entries()) {
      if (delta === 0) continue;
      const invRef = doc(db, 'users', uid, 'invoices', invId);
      const invSnap = await getDoc(invRef);

      if (invSnap.exists()) {
        const existing = invSnap.data() as CreditCardInvoice;
        const nextTotal = Math.max(0, roundMoney((existing.total_amount || 0) + delta));
        const nextStatus: InvoiceStatus =
          existing.status === 'PAID' && delta > 0 ? cycle.defaultStatus : existing.status;

        batch.update(invRef, {
          total_amount: nextTotal,
          status: nextStatus,
          closing_date: cycle.closingDate,
          due_date: cycle.dueDate,
          reference_key: cycle.referenceKey
        });
      } else if (delta > 0) {
        batch.set(invRef, {
          card_id: cycle.cardId,
          reference_month: cycle.referenceMonth,
          reference_year: cycle.referenceYear,
          reference_key: cycle.referenceKey,
          total_amount: Math.max(0, roundMoney(delta)),
          status: cycle.defaultStatus,
          closing_date: cycle.closingDate,
          due_date: cycle.dueDate,
          created_at: serverTimestamp()
        });
      }
    }
  }

  // Seed Business PJ categories for real Firebase users when entering PJ workspace for the first time
  public static async ensureBusinessCategoriesSeeded(uid: string, allCategories: Category[]): Promise<void> {
    if (DemoStore.isDemoUid(uid)) return;
    if (this.seededBusinessUsers.has(uid)) return;

    const hasBusinessCats = allCategories.some(c => c.workspace_id === 'ws_business');
    if (hasBusinessCats) {
      this.seededBusinessUsers.add(uid);
      return;
    }

    this.seededBusinessUsers.add(uid);
    try {
      const catCol = collection(db, 'users', uid, 'categories');
      for (const cat of DEFAULT_BUSINESS_CATEGORIES) {
        await addDoc(catCol, {
          ...cat,
          workspace_id: 'ws_business',
          created_at: serverTimestamp()
        });
      }
    } catch (err) {
      this.seededBusinessUsers.delete(uid);
      console.warn('Business categories seed notice:', err);
    }
  }

  // 1. Initial Multi-tenant Setup & Verification
  public static async ensureUserInitialized(
    uid: string,
    email: string,
    displayName?: string,
    authProvider: string = 'google'
  ): Promise<User> {
    if (DemoStore.isDemoUid(uid)) {
      return DemoStore.getState().user;
    }

    const userDocRef = doc(db, 'users', uid);
    const userSnap = await getDoc(userDocRef);

    if (userSnap.exists()) {
      const data = userSnap.data();
      return {
        id: uid,
        name: data.name || displayName || 'Investidor',
        email: data.email || email,
        auth_provider: data.auth_provider || authProvider,
        two_factor_enabled: data.two_factor_enabled || false,
        whatsapp_number: data.whatsapp_number || '',
        whatsapp_variants: data.whatsapp_variants || [],
        whatsapp_connected: data.whatsapp_connected || false,
        whatsapp_linked_at: data.whatsapp_linked_at,
        theme_preference: data.theme_preference || 'dark',
        active_profile_type: data.active_profile_type || 'INDIVIDUAL',
        privacy_mode: data.privacy_mode || false,
        pin_hash: data.pin_hash
      };
    }

    const defaultUser: User = {
      id: uid,
      name: displayName || email.split('@')[0] || 'Investidor',
      email: email,
      auth_provider: authProvider,
      two_factor_enabled: false,
      whatsapp_number: '',
      whatsapp_variants: [],
      whatsapp_connected: false,
      theme_preference: 'dark',
      active_profile_type: 'INDIVIDUAL',
      privacy_mode: false
    };

    await setDoc(userDocRef, {
      ...defaultUser,
      created_at: serverTimestamp()
    });

    const gamificationRef = doc(db, 'users', uid, 'gamification', 'profile');
    const defaultGamification: GamificationProfile = {
      user_id: uid,
      xp_points: 0,
      level: 1,
      level_title: 'Iniciante Financeiro',
      current_streak: 1,
      longest_streak: 1,
      financial_health_score: 500,
      score_factors: {
        savings_rate: 125,
        bill_punctuality: 125,
        credit_utilization: 125,
        emergency_fund: 125
      },
      badges_unlocked: ['b_first_log'],
      active_challenges: [
        {
          id: 'ch_streak_3',
          title: 'Hábito Inicial',
          description: 'Registre suas finanças por 3 dias seguidos',
          target_days: 3,
          current_days: 1,
          xp_reward: 100,
          is_completed: false,
          type: 'DAILY_LOG'
        }
      ]
    };
    await setDoc(gamificationRef, {
      ...defaultGamification,
      created_at: serverTimestamp()
    });

    const catCol = collection(db, 'users', uid, 'categories');
    for (const cat of DEFAULT_SYSTEM_CATEGORIES) {
      await addDoc(catCol, {
        ...cat,
        workspace_id: 'ws_personal',
        created_at: serverTimestamp()
      });
    }

    return defaultUser;
  }

  // 2. Realtime Subscriptions with onSnapshot (or DemoStore subscription)
  public static subscribeUser(uid: string, callback: (user: User) => void) {
    if (DemoStore.isDemoUid(uid)) return DemoStore.subscribe(s => callback(s.user));
    const userRef = doc(db, 'users', uid);
    return onSnapshot(
      userRef,
      snap => {
        if (snap.exists()) {
          callback({ id: snap.id, ...snap.data() } as User);
        }
      },
      err => console.warn('User subscription notice:', err.message)
    );
  }

  public static subscribeAccounts(uid: string, callback: (accounts: BankAccount[]) => void) {
    if (DemoStore.isDemoUid(uid)) return DemoStore.subscribe(s => callback(s.accounts));
    const q = collection(db, 'users', uid, 'accounts');
    return onSnapshot(
      q,
      snap => {
        const list = snap.docs.map(d => ({ id: d.id, ...d.data() } as BankAccount));
        callback(list);
      },
      err => console.warn('Accounts subscription notice:', err.message)
    );
  }

  public static subscribeCards(uid: string, callback: (cards: CreditCard[]) => void) {
    if (DemoStore.isDemoUid(uid)) return DemoStore.subscribe(s => callback(s.cards));
    const q = collection(db, 'users', uid, 'cards');
    return onSnapshot(
      q,
      snap => {
        const list = snap.docs.map(d => ({ id: d.id, ...d.data() } as CreditCard));
        callback(list);
      },
      err => console.warn('Cards subscription notice:', err.message)
    );
  }

  public static subscribeInvoices(uid: string, callback: (invoices: CreditCardInvoice[]) => void) {
    if (DemoStore.isDemoUid(uid)) return DemoStore.subscribe(s => callback(s.invoices));
    const q = collection(db, 'users', uid, 'invoices');
    return onSnapshot(
      q,
      snap => {
        const list = snap.docs.map(d => ({ id: d.id, ...d.data() } as CreditCardInvoice));
        callback(list);
      },
      err => console.warn('Invoices subscription notice:', err.message)
    );
  }

  public static subscribeCategories(uid: string, callback: (categories: Category[]) => void) {
    if (DemoStore.isDemoUid(uid)) return DemoStore.subscribe(s => callback(s.categories));
    const q = collection(db, 'users', uid, 'categories');
    return onSnapshot(
      q,
      snap => {
        const list = snap.docs.map(d => {
          const raw = d.data() as any;
          return {
            id: d.id,
            ...raw,
            monthly_budget_limit: raw.monthly_budget_limit ?? raw.budget_limit
          } as Category;
        });
        callback(list);
      },
      err => console.warn('Categories subscription notice:', err.message)
    );
  }

  public static subscribeTransactions(uid: string, callback: (transactions: Transaction[]) => void) {
    if (DemoStore.isDemoUid(uid)) return DemoStore.subscribe(s => callback(s.transactions));
    const q = query(collection(db, 'users', uid, 'transactions'), orderBy('date', 'desc'));
    return onSnapshot(
      q,
      snap => {
        const list = snap.docs.map(d => ({ id: d.id, ...d.data() } as Transaction));
        callback(list);
      },
      err => console.warn('Transactions subscription notice:', err.message)
    );
  }

  public static subscribeSubscriptions(uid: string, callback: (subs: SubscriptionAndLoan[]) => void) {
    if (DemoStore.isDemoUid(uid)) return DemoStore.subscribe(s => callback(s.subscriptions));
    const q = collection(db, 'users', uid, 'subscriptions');
    return onSnapshot(
      q,
      snap => {
        const list = snap.docs.map(d => ({ id: d.id, ...d.data() } as SubscriptionAndLoan));
        callback(list);
      },
      err => console.warn('Subscriptions subscription notice:', err.message)
    );
  }

  public static subscribeAssets(uid: string, callback: (assets: PatrimonyAsset[]) => void) {
    if (DemoStore.isDemoUid(uid)) return DemoStore.subscribe(s => callback(s.assets || []));
    const q = collection(db, 'users', uid, 'assets');
    return onSnapshot(
      q,
      snap => {
        const list = snap.docs.map(d => ({ id: d.id, ...d.data() } as PatrimonyAsset));
        callback(list);
      },
      err => console.warn('Assets subscription notice:', err.message)
    );
  }

  public static subscribeClients(uid: string, callback: (clients: BusinessClient[]) => void) {
    if (DemoStore.isDemoUid(uid)) return DemoStore.subscribe(s => callback(s.clients || []));
    const q = collection(db, 'users', uid, 'clients');
    return onSnapshot(
      q,
      snap => {
        const list = snap.docs.map(d => ({ id: d.id, ...d.data() } as BusinessClient));
        callback(list);
      },
      err => console.warn('Clients subscription notice:', err.message)
    );
  }

  public static subscribeSuppliers(uid: string, callback: (suppliers: BusinessSupplier[]) => void) {
    if (DemoStore.isDemoUid(uid)) return DemoStore.subscribe(s => callback(s.suppliers || []));
    const q = collection(db, 'users', uid, 'suppliers');
    return onSnapshot(
      q,
      snap => {
        const list = snap.docs.map(d => ({ id: d.id, ...d.data() } as BusinessSupplier));
        callback(list);
      },
      err => console.warn('Suppliers subscription notice:', err.message)
    );
  }

  public static subscribeCostCenters(uid: string, callback: (costCenters: CostCenter[]) => void) {
    if (DemoStore.isDemoUid(uid)) return DemoStore.subscribe(s => callback(s.costCenters || []));
    const q = collection(db, 'users', uid, 'cost_centers');
    return onSnapshot(
      q,
      snap => {
        const list = snap.docs.map(d => ({ id: d.id, ...d.data() } as CostCenter));
        callback(list);
      },
      err => console.warn('CostCenters subscription notice:', err.message)
    );
  }

  public static subscribeGoals(uid: string, callback: (goals: Goal[]) => void) {
    if (DemoStore.isDemoUid(uid)) return DemoStore.subscribe(s => callback(s.goals));
    const q = collection(db, 'users', uid, 'goals');
    return onSnapshot(
      q,
      snap => {
        const list = snap.docs.map(d => ({ id: d.id, ...d.data() } as Goal));
        callback(list);
      },
      err => console.warn('Goals subscription notice:', err.message)
    );
  }

  public static subscribeGamification(uid: string, callback: (profile: GamificationProfile) => void) {
    if (DemoStore.isDemoUid(uid)) return DemoStore.subscribe(s => callback(s.gamification));
    const docRef = doc(db, 'users', uid, 'gamification', 'profile');
    return onSnapshot(
      docRef,
      snap => {
        if (snap.exists()) {
          callback({ user_id: uid, ...snap.data() } as GamificationProfile);
        }
      },
      err => console.warn('Gamification subscription notice:', err.message)
    );
  }

  public static subscribeNotifications(uid: string, callback: (notifs: NotificationItem[]) => void) {
    if (DemoStore.isDemoUid(uid)) return DemoStore.subscribe(s => callback(s.notifications));
    const q = collection(db, 'users', uid, 'notifications');
    return onSnapshot(
      q,
      snap => {
        const list = snap.docs.map(d => ({ id: d.id, ...d.data() } as NotificationItem));
        list.sort((a, b) => FirestoreService.parseTimeMillis(b) - FirestoreService.parseTimeMillis(a));
        callback(list);
      },
      err => console.warn('Notifications subscription notice:', err.message)
    );
  }

  public static parseTimeMillis(item: any): number {
    if (!item) return 0;
    if (item.created_at && typeof item.created_at.toDate === 'function') {
      try {
        return item.created_at.toDate().getTime();
      } catch (e) {
        // ignore
      }
    }
    if (item.created_at && typeof item.created_at.seconds === 'number') {
      return item.created_at.seconds * 1000 + Math.round((item.created_at.nanoseconds || 0) / 1000000);
    }
    if (item.created_at) {
      const t = new Date(item.created_at).getTime();
      if (!isNaN(t) && t > 1000) return t;
    }
    if (item.timestamp) {
      const t = new Date(item.timestamp).getTime();
      if (!isNaN(t) && t > 1000) return t;
      if (typeof item.timestamp === 'string') {
        const parts = item.timestamp.split(':');
        if (parts.length >= 2) {
          const d = new Date();
          d.setHours(parseInt(parts[0], 10) || 0, parseInt(parts[1], 10) || 0, parseInt(parts[2] || '0', 10) || 0, 0);
          return d.getTime();
        }
      }
    }
    return 0;
  }

  public static subscribeWhatsAppLogs(uid: string, callback: (logs: WhatsAppLog[]) => void) {
    if (DemoStore.isDemoUid(uid)) return DemoStore.subscribe(s => callback(s.whatsappLogs));
    const q = collection(db, 'users', uid, 'whatsapp_logs');
    return onSnapshot(
      q,
      snap => {
        const list = snap.docs.map(d => ({ id: d.id, ...d.data() } as WhatsAppLog));
        list.sort((a, b) => {
          const timeA = FirestoreService.parseTimeMillis(a);
          const timeB = FirestoreService.parseTimeMillis(b);
          if (timeA !== timeB) return timeA - timeB;
          const isAUser = a.sender === 'USER';
          const isBUser = b.sender === 'USER';
          if (isAUser && !isBUser) return -1;
          if (!isAUser && isBUser) return 1;
          return 0;
        });
        callback(list);
      },
      err => console.warn('WhatsApp logs subscription notice:', err.message)
    );
  }

  public static subscribeReminders(uid: string, callback: (reminders: Reminder[]) => void) {
    if (DemoStore.isDemoUid(uid)) return DemoStore.subscribe(s => callback(s.reminders));
    const q = collection(db, 'users', uid, 'reminders');
    return onSnapshot(
      q,
      snap => {
        const list = snap.docs.map(d => ({ id: d.id, ...d.data() } as Reminder));
        list.sort((a, b) => (a.due_date || '').localeCompare(b.due_date || ''));
        callback(list);
      },
      err => console.warn('Reminders subscription notice:', err.message)
    );
  }

  public static subscribeChatHistory(uid: string, channel: 'CONSULTANT' | 'WHATSAPP' | 'ALL', callback: (messages: ChatMessageRecord[]) => void) {
    if (DemoStore.isDemoUid(uid)) {
      return DemoStore.subscribe(s => {
        const list =
          channel === 'ALL'
            ? s.chatHistory
            : s.chatHistory.filter(m => m.channel === channel || m.source === channel);
        callback(list);
      });
    }
    const q = collection(db, 'users', uid, 'chat_history');
    return onSnapshot(
      q,
      snap => {
        let list = snap.docs.map(d => ({ id: d.id, ...d.data() } as ChatMessageRecord));
        if (channel !== 'ALL') {
          list = list.filter(m => m.channel === channel || m.source === channel);
        }
        list.sort((a, b) => {
          const timeA = FirestoreService.parseTimeMillis(a);
          const timeB = FirestoreService.parseTimeMillis(b);
          if (timeA !== timeB) return timeA - timeB;
          const isAUser = a.sender === 'USER';
          const isBUser = b.sender === 'USER';
          if (isAUser && !isBUser) return -1;
          if (!isAUser && isBUser) return 1;
          return 0;
        });
        callback(list);
      },
      err => console.warn('Chat history subscription notice:', err.message)
    );
  }

  // 3. Transactions CRUD, Smart Credit Card Installments & Automatic Invoices
  public static async addTransaction(
    uid: string,
    tx: Omit<Transaction, 'id'>,
    accounts: BankAccount[] = [],
    cards: CreditCard[] = []
  ): Promise<string> {
    if (DemoStore.isDemoUid(uid)) {
      return DemoStore.addTransaction(tx);
    }

    const txCol = collection(db, 'users', uid, 'transactions');
    const batch = writeBatch(db);
    const totalPurchaseAmount = roundMoney(tx.amount);
    const invoiceDeltas = new Map<string, { cycle: ComputedInvoiceCycle; delta: number }>();

    const resolveCardMeta = async (cardId: string): Promise<CreditCard> => {
      const cardRef = doc(db, 'users', uid, 'cards', cardId);
      const cardSnap = await getDoc(cardRef);
      if (cardSnap.exists()) {
        return { id: cardSnap.id, ...(cardSnap.data() as Omit<CreditCard, 'id'>) };
      }
      const fallback = cards.find(c => c.id === cardId);
      return (
        fallback || {
          id: cardId,
          workspace_id: tx.workspace_id || 'ws_personal',
          name: 'Cartão',
          brand: 'Mastercard',
          total_limit: 5000,
          available_limit: 5000,
          closing_day: 25,
          due_day: 5,
          color: '#1F1F1D'
        }
      );
    };

    // CASE 1: Credit Card purchase with installments
    if (tx.card_id && tx.installment_total && tx.installment_total > 1) {
      const n = Math.max(2, Math.floor(tx.installment_total));
      const baseInstallment = Math.floor((totalPurchaseAmount / n) * 100) / 100;
      const firstInstallment = roundMoney(totalPurchaseAmount - roundMoney(baseInstallment * (n - 1)));

      const cardMeta = await resolveCardMeta(tx.card_id);
      const cardRef = doc(db, 'users', uid, 'cards', tx.card_id);
      const newLimit = Math.max(0, roundMoney(cardMeta.available_limit - totalPurchaseAmount));
      batch.update(cardRef, { available_limit: newLimit });

      const baseDateParts = (tx.date || new Date().toISOString().slice(0, 10)).split('-').map(Number);
      const baseYear = baseDateParts[0] || new Date().getFullYear();
      const baseMonth = (baseDateParts[1] || 1) - 1;
      const baseDay = baseDateParts[2] || 1;
      const cleanDesc = tx.description.replace(/\s\(\d+\/\d+\)$/, '');

      const firstDocRef = doc(txCol);

      for (let i = 1; i <= n; i++) {
        const instDateObj = new Date(baseYear, baseMonth + (i - 1), baseDay);
        const yyyy = instDateObj.getFullYear();
        const mm = String(instDateObj.getMonth() + 1).padStart(2, '0');
        const dd = String(instDateObj.getDate()).padStart(2, '0');
        const formattedDate = `${yyyy}-${mm}-${dd}`;
        const instAmount = i === 1 ? firstInstallment : roundMoney(baseInstallment);

        const cycle = computeCardInvoiceCycle(formattedDate, cardMeta);
        const existingDelta = invoiceDeltas.get(cycle.invoiceId)?.delta || 0;
        invoiceDeltas.set(cycle.invoiceId, {
          cycle,
          delta: roundMoney(existingDelta + instAmount)
        });

        const targetDocRef = i === 1 ? firstDocRef : doc(txCol);
        batch.set(
          targetDocRef,
          stripUndefined({
            ...tx,
            date: formattedDate,
            description: `${cleanDesc} (${i}/${n})`,
            amount: instAmount,
            installment_current: i,
            installment_total: n,
            parent_transaction_id: firstDocRef.id,
            invoice_id: cycle.invoiceId,
            reference_month: cycle.referenceKey,
            status: 'PENDING',
            created_at: serverTimestamp()
          })
        );
      }

      await this.applyInvoiceDeltasInBatch(uid, batch, invoiceDeltas);
      await batch.commit();
      await this.addXp(uid, 15, 'Lançamento parcelado registrado');
      return firstDocRef.id;
    }

    // CASE 2: Single transaction
    const newTxRef = doc(txCol);
    let computedInvoiceId = tx.invoice_id;
    let computedRefMonth = tx.reference_month;

    if (tx.card_id && tx.type === 'EXPENSE') {
      const cardMeta = await resolveCardMeta(tx.card_id);
      const cycle = computeCardInvoiceCycle(tx.date, cardMeta);
      computedInvoiceId = cycle.invoiceId;
      computedRefMonth = cycle.referenceKey;
      invoiceDeltas.set(cycle.invoiceId, {
        cycle,
        delta: totalPurchaseAmount
      });
    }

    const normalizedTx: Omit<Transaction, 'id'> = {
      ...tx,
      amount: totalPurchaseAmount,
      invoice_id: computedInvoiceId,
      reference_month: computedRefMonth
    };

    const accountDeltas = new Map<string, number>();
    const cardDeltas = new Map<string, number>();
    this.accumulateTransactionImpact(normalizedTx, 1, accountDeltas, cardDeltas);

    for (const [accId, delta] of accountDeltas.entries()) {
      if (delta === 0) continue;
      const accRef = doc(db, 'users', uid, 'accounts', accId);
      const accSnap = await getDoc(accRef);
      const currentBal = accSnap.exists()
        ? Number((accSnap.data() as BankAccount).current_balance)
        : (accounts.find(a => a.id === accId)?.current_balance ?? 0);
      batch.update(accRef, { current_balance: roundMoney(currentBal + delta) });
    }

    for (const [cId, delta] of cardDeltas.entries()) {
      if (delta === 0) continue;
      const cardRef = doc(db, 'users', uid, 'cards', cId);
      const cardSnap = await getDoc(cardRef);
      if (cardSnap.exists()) {
        const cardData = cardSnap.data() as CreditCard;
        const updatedAvail = Math.max(0, Math.min(cardData.total_limit, roundMoney(cardData.available_limit + delta)));
        batch.update(cardRef, { available_limit: updatedAvail });
      } else {
        const fallbackCard = cards.find(c => c.id === cId);
        if (fallbackCard) {
          const updatedAvail = Math.max(0, Math.min(fallbackCard.total_limit, roundMoney(fallbackCard.available_limit + delta)));
          batch.update(cardRef, { available_limit: updatedAvail });
        }
      }
    }

    await this.applyInvoiceDeltasInBatch(uid, batch, invoiceDeltas);

    batch.set(
      newTxRef,
      stripUndefined({
        ...normalizedTx,
        created_at: serverTimestamp()
      })
    );

    await batch.commit();
    await this.addXp(uid, 15, 'Transação registrada no Firestore');
    return newTxRef.id;
  }

  public static async updateTransactionStatus(uid: string, txId: string, status: 'PAID' | 'PENDING'): Promise<void> {
    if (DemoStore.isDemoUid(uid)) {
      DemoStore.updateTransactionStatus(txId, status);
      return;
    }

    const txRef = doc(db, 'users', uid, 'transactions', txId);
    const txSnap = await getDoc(txRef);
    if (!txSnap.exists()) return;

    const oldTx = txSnap.data() as Transaction;
    if (oldTx.status === status) return;

    const batch = writeBatch(db);
    const accountDeltas = new Map<string, number>();
    const cardDeltas = new Map<string, number>();

    this.accumulateTransactionImpact(oldTx, -1, accountDeltas, cardDeltas);
    this.accumulateTransactionImpact({ ...oldTx, status }, 1, accountDeltas, cardDeltas);

    for (const [accId, delta] of accountDeltas.entries()) {
      if (delta === 0) continue;
      const accRef = doc(db, 'users', uid, 'accounts', accId);
      const accSnap = await getDoc(accRef);
      if (accSnap.exists()) {
        const accData = accSnap.data() as BankAccount;
        batch.update(accRef, {
          current_balance: roundMoney(accData.current_balance + delta)
        });
      }
    }

    batch.update(txRef, { status });
    await batch.commit();
  }

  public static async updateTransaction(
    uid: string,
    txId: string,
    updates: Partial<Omit<Transaction, 'id'>>
  ): Promise<void> {
    if (DemoStore.isDemoUid(uid)) {
      DemoStore.updateTransaction(txId, updates);
      return;
    }

    const txRef = doc(db, 'users', uid, 'transactions', txId);
    const txSnap = await getDoc(txRef);
    if (!txSnap.exists()) return;

    const oldTx = txSnap.data() as Transaction;
    const updatedTx: Transaction = {
      ...oldTx,
      ...updates,
      id: txId,
      amount: updates.amount !== undefined ? roundMoney(updates.amount) : roundMoney(oldTx.amount)
    };

    const batch = writeBatch(db);
    const accountDeltas = new Map<string, number>();
    const cardDeltas = new Map<string, number>();
    const invoiceDeltas = new Map<string, { cycle: ComputedInvoiceCycle; delta: number }>();

    this.accumulateTransactionImpact(oldTx, -1, accountDeltas, cardDeltas);
    this.accumulateTransactionImpact(updatedTx, 1, accountDeltas, cardDeltas);

    if (oldTx.card_id && oldTx.type === 'EXPENSE') {
      const oldCardSnap = await getDoc(doc(db, 'users', uid, 'cards', oldTx.card_id));
      const oldCardMeta = oldCardSnap.exists()
        ? ({ id: oldCardSnap.id, ...oldCardSnap.data() } as CreditCard)
        : { id: oldTx.card_id, closing_day: 25, due_day: 5 };
      const oldCycle = computeCardInvoiceCycle(oldTx.date, oldCardMeta);
      const prev = invoiceDeltas.get(oldCycle.invoiceId)?.delta || 0;
      invoiceDeltas.set(oldCycle.invoiceId, {
        cycle: oldCycle,
        delta: roundMoney(prev - roundMoney(oldTx.amount))
      });
    }

    let nextInvoiceId = updatedTx.invoice_id;
    let nextRefMonth = updatedTx.reference_month;
    if (updatedTx.card_id && updatedTx.type === 'EXPENSE') {
      const newCardSnap = await getDoc(doc(db, 'users', uid, 'cards', updatedTx.card_id));
      const newCardMeta = newCardSnap.exists()
        ? ({ id: newCardSnap.id, ...newCardSnap.data() } as CreditCard)
        : { id: updatedTx.card_id, closing_day: 25, due_day: 5 };
      const newCycle = computeCardInvoiceCycle(updatedTx.date, newCardMeta);
      nextInvoiceId = newCycle.invoiceId;
      nextRefMonth = newCycle.referenceKey;
      const prev = invoiceDeltas.get(newCycle.invoiceId)?.delta || 0;
      invoiceDeltas.set(newCycle.invoiceId, {
        cycle: newCycle,
        delta: roundMoney(prev + roundMoney(updatedTx.amount))
      });
    } else {
      nextInvoiceId = '';
    }

    for (const [accId, delta] of accountDeltas.entries()) {
      if (delta === 0) continue;
      const accRef = doc(db, 'users', uid, 'accounts', accId);
      const accSnap = await getDoc(accRef);
      if (accSnap.exists()) {
        const accData = accSnap.data() as BankAccount;
        batch.update(accRef, {
          current_balance: roundMoney(accData.current_balance + delta)
        });
      }
    }

    for (const [cId, delta] of cardDeltas.entries()) {
      if (delta === 0) continue;
      const cardRef = doc(db, 'users', uid, 'cards', cId);
      const cardSnap = await getDoc(cardRef);
      if (cardSnap.exists()) {
        const cardData = cardSnap.data() as CreditCard;
        const nextAvail = Math.max(0, Math.min(cardData.total_limit, roundMoney(cardData.available_limit + delta)));
        batch.update(cardRef, { available_limit: nextAvail });
      }
    }

    await this.applyInvoiceDeltasInBatch(uid, batch, invoiceDeltas);

    const cleanUpdates: Record<string, any> = stripUndefined({
      ...updates,
      amount: updatedTx.amount,
      invoice_id: nextInvoiceId,
      reference_month: nextRefMonth
    });
    batch.update(txRef, cleanUpdates);
    await batch.commit();
  }

  public static async deleteTransaction(uid: string, txId: string): Promise<void> {
    if (DemoStore.isDemoUid(uid)) {
      DemoStore.deleteTransaction(txId);
      return;
    }

    const txRef = doc(db, 'users', uid, 'transactions', txId);
    const txSnap = await getDoc(txRef);
    if (!txSnap.exists()) return;

    const tx = txSnap.data() as Transaction;
    const batch = writeBatch(db);
    const accountDeltas = new Map<string, number>();
    const cardDeltas = new Map<string, number>();
    const invoiceDeltas = new Map<string, { cycle: ComputedInvoiceCycle; delta: number }>();

    this.accumulateTransactionImpact(tx, -1, accountDeltas, cardDeltas);

    if (tx.card_id && tx.type === 'EXPENSE') {
      const cardSnap = await getDoc(doc(db, 'users', uid, 'cards', tx.card_id));
      const cardMeta = cardSnap.exists()
        ? ({ id: cardSnap.id, ...cardSnap.data() } as CreditCard)
        : { id: tx.card_id, closing_day: 25, due_day: 5 };
      const cycle = computeCardInvoiceCycle(tx.date, cardMeta);
      invoiceDeltas.set(cycle.invoiceId, {
        cycle,
        delta: -roundMoney(tx.amount)
      });
    }

    for (const [accId, delta] of accountDeltas.entries()) {
      if (delta === 0) continue;
      const accRef = doc(db, 'users', uid, 'accounts', accId);
      const accSnap = await getDoc(accRef);
      if (accSnap.exists()) {
        const accData = accSnap.data() as BankAccount;
        batch.update(accRef, {
          current_balance: roundMoney(accData.current_balance + delta)
        });
      }
    }

    for (const [cId, delta] of cardDeltas.entries()) {
      if (delta === 0) continue;
      const cardRef = doc(db, 'users', uid, 'cards', cId);
      const cardSnap = await getDoc(cardRef);
      if (cardSnap.exists()) {
        const cardData = cardSnap.data() as CreditCard;
        const restoredLimit = Math.max(0, Math.min(cardData.total_limit, roundMoney(cardData.available_limit + delta)));
        batch.update(cardRef, { available_limit: restoredLimit });
      }
    }

    await this.applyInvoiceDeltasInBatch(uid, batch, invoiceDeltas);

    batch.delete(txRef);
    await batch.commit();
  }

  public static async payCardInvoice(
    uid: string,
    invoiceId: string,
    accountId: string,
    paymentDate: string = new Date().toISOString().slice(0, 10),
    fallbackInvoice?: CreditCardInvoice,
    linkedTransactionIds: string[] = []
  ): Promise<void> {
    if (DemoStore.isDemoUid(uid)) {
      DemoStore.payCardInvoice(invoiceId, accountId, paymentDate, fallbackInvoice, linkedTransactionIds);
      return;
    }

    const invRef = doc(db, 'users', uid, 'invoices', invoiceId);
    const invSnap = await getDoc(invRef);

    const invoiceData: CreditCardInvoice | undefined = invSnap.exists()
      ? ({ id: invSnap.id, ...(invSnap.data() as Omit<CreditCardInvoice, 'id'>) })
      : fallbackInvoice;

    if (!invoiceData || invoiceData.status === 'PAID') return;

    const amountToPay = roundMoney(invoiceData.total_amount);
    const batch = writeBatch(db);

    if (accountId && amountToPay > 0) {
      const accRef = doc(db, 'users', uid, 'accounts', accountId);
      const accSnap = await getDoc(accRef);
      if (accSnap.exists()) {
        const accData = accSnap.data() as BankAccount;
        batch.update(accRef, {
          current_balance: roundMoney(accData.current_balance - amountToPay)
        });
      }
    }

    if (invoiceData.card_id && amountToPay > 0) {
      const cardRef = doc(db, 'users', uid, 'cards', invoiceData.card_id);
      const cardSnap = await getDoc(cardRef);
      if (cardSnap.exists()) {
        const cardData = cardSnap.data() as CreditCard;
        const restoredLimit = Math.min(
          roundMoney(cardData.total_limit),
          roundMoney(cardData.available_limit + amountToPay)
        );
        batch.update(cardRef, { available_limit: restoredLimit });
      }
    }

    batch.set(
      invRef,
      stripUndefined({
        card_id: invoiceData.card_id,
        reference_month: invoiceData.reference_month,
        reference_year: invoiceData.reference_year,
        reference_key:
          invoiceData.reference_key ||
          `${invoiceData.reference_year}-${String(invoiceData.reference_month).padStart(2, '0')}`,
        total_amount: amountToPay,
        closing_date: invoiceData.closing_date,
        due_date: invoiceData.due_date,
        status: 'PAID',
        paid_at: paymentDate,
        paid_account_id: accountId
      }),
      { merge: true }
    );

    for (const txId of linkedTransactionIds) {
      const txRef = doc(db, 'users', uid, 'transactions', txId);
      batch.update(txRef, {
        status: 'PAID',
        invoice_id: invoiceId
      });
    }

    await batch.commit();
    await this.addXp(uid, 50, 'Fatura de cartão liquidada');
  }

  // 4. Accounts & Cards CRUD
  public static async addAccount(uid: string, acc: Omit<BankAccount, 'id'>): Promise<string> {
    if (DemoStore.isDemoUid(uid)) return DemoStore.addAccount(acc);
    const docRef = await addDoc(collection(db, 'users', uid, 'accounts'), {
      ...acc,
      initial_balance: roundMoney(acc.initial_balance),
      current_balance: roundMoney(acc.current_balance)
    });
    await this.addXp(uid, 50, 'Nova conta bancária cadastrada');
    return docRef.id;
  }

  public static async updateAccount(uid: string, accountId: string, updates: Partial<Omit<BankAccount, 'id'>>): Promise<void> {
    if (DemoStore.isDemoUid(uid)) {
      DemoStore.updateAccount(accountId, updates);
      return;
    }
    const payload: Record<string, any> = stripUndefined({ ...updates });
    if (payload.current_balance !== undefined) payload.current_balance = roundMoney(payload.current_balance);
    if (payload.initial_balance !== undefined) payload.initial_balance = roundMoney(payload.initial_balance);
    await updateDoc(doc(db, 'users', uid, 'accounts', accountId), payload);
  }

  public static async deleteAccount(uid: string, accountId: string): Promise<void> {
    if (DemoStore.isDemoUid(uid)) {
      DemoStore.deleteAccount(accountId);
      return;
    }
    await deleteDoc(doc(db, 'users', uid, 'accounts', accountId));
  }

  public static async addCard(uid: string, card: Omit<CreditCard, 'id'>): Promise<string> {
    if (DemoStore.isDemoUid(uid)) return DemoStore.addCard(card);
    const docRef = await addDoc(collection(db, 'users', uid, 'cards'), {
      ...card,
      total_limit: roundMoney(card.total_limit),
      available_limit: roundMoney(card.available_limit)
    });
    await this.addXp(uid, 50, 'Novo cartão de crédito cadastrado');
    return docRef.id;
  }

  public static async updateCard(uid: string, cardId: string, updates: Partial<Omit<CreditCard, 'id'>>): Promise<void> {
    if (DemoStore.isDemoUid(uid)) {
      DemoStore.updateCard(cardId, updates);
      return;
    }
    const cardRef = doc(db, 'users', uid, 'cards', cardId);
    const payload: Record<string, any> = stripUndefined({ ...updates });

    if (payload.total_limit !== undefined) {
      const newTotal = roundMoney(payload.total_limit);
      payload.total_limit = newTotal;
      if (payload.available_limit === undefined) {
        const snap = await getDoc(cardRef);
        if (snap.exists()) {
          const oldCard = snap.data() as CreditCard;
          const used = Math.max(0, roundMoney(oldCard.total_limit - oldCard.available_limit));
          payload.available_limit = Math.max(0, roundMoney(newTotal - used));
        }
      }
    }
    if (payload.available_limit !== undefined) {
      payload.available_limit = roundMoney(payload.available_limit);
    }

    await updateDoc(cardRef, payload);
  }

  public static async deleteCard(uid: string, cardId: string): Promise<void> {
    if (DemoStore.isDemoUid(uid)) {
      DemoStore.deleteCard(cardId);
      return;
    }
    await deleteDoc(doc(db, 'users', uid, 'cards', cardId));
  }

  // 5. Goals CRUD & Atomic Account Contribution
  public static async addGoal(uid: string, goal: Omit<Goal, 'id'>): Promise<string> {
    if (DemoStore.isDemoUid(uid)) return DemoStore.addGoal(goal);
    const docRef = await addDoc(
      collection(db, 'users', uid, 'goals'),
      stripUndefined({
        ...goal,
        target_amount: roundMoney(goal.target_amount),
        current_amount: roundMoney(goal.current_amount)
      })
    );
    await this.addXp(uid, 50, 'Nova meta estipulada');
    return docRef.id;
  }

  public static async updateGoal(uid: string, goalId: string, updates: Partial<Omit<Goal, 'id'>>): Promise<void> {
    if (DemoStore.isDemoUid(uid)) {
      DemoStore.updateGoal(goalId, updates);
      return;
    }
    const payload: Record<string, any> = stripUndefined({ ...updates });
    if (payload.target_amount !== undefined) payload.target_amount = roundMoney(payload.target_amount);
    if (payload.current_amount !== undefined) payload.current_amount = roundMoney(payload.current_amount);
    await updateDoc(doc(db, 'users', uid, 'goals', goalId), payload);
  }

  public static async deleteGoal(uid: string, goalId: string): Promise<void> {
    if (DemoStore.isDemoUid(uid)) {
      DemoStore.deleteGoal(goalId);
      return;
    }
    await deleteDoc(doc(db, 'users', uid, 'goals', goalId));
  }

  public static async contributeToGoal(
    uid: string,
    goalId: string,
    currentAmount: number,
    targetAmount: number,
    amountToAdd: number,
    sourceAccountId?: string,
    goalTitle?: string,
    workspaceId: string = 'ws_personal'
  ): Promise<void> {
    if (DemoStore.isDemoUid(uid)) {
      DemoStore.contributeToGoal(goalId, currentAmount, targetAmount, amountToAdd, sourceAccountId, goalTitle);
      return;
    }

    const delta = roundMoney(amountToAdd);
    const newTotal = Math.max(0, roundMoney(currentAmount + delta));
    const isCompleted = newTotal >= targetAmount;

    const batch = writeBatch(db);
    const goalRef = doc(db, 'users', uid, 'goals', goalId);

    batch.update(goalRef, {
      current_amount: newTotal,
      status: isCompleted ? 'COMPLETED' : 'IN_PROGRESS'
    });

    if (sourceAccountId && delta !== 0) {
      const accRef = doc(db, 'users', uid, 'accounts', sourceAccountId);
      const accSnap = await getDoc(accRef);
      if (accSnap.exists()) {
        const accData = accSnap.data() as BankAccount;
        const updatedBalance = roundMoney(accData.current_balance - delta);
        batch.update(accRef, { current_balance: updatedBalance });

        const txRef = doc(collection(db, 'users', uid, 'transactions'));
        const isAporte = delta > 0;
        batch.set(txRef, {
          workspace_id: workspaceId,
          account_id: sourceAccountId,
          category_id: 'cat_goal',
          type: isAporte ? 'EXPENSE' : 'INCOME',
          amount: Math.abs(delta),
          description: `${isAporte ? 'Aporte em meta' : 'Resgate de meta'}: ${goalTitle || 'Reserva'}`,
          date: new Date().toISOString().slice(0, 10),
          status: 'PAID',
          is_recurring: false,
          source: 'APP',
          created_at: serverTimestamp()
        });
      }
    }

    await batch.commit();
    await this.addXp(uid, isCompleted ? 250 : 50, isCompleted ? 'Meta Concluída!' : 'Aporte em meta');
  }

  // 6. Categories CRUD
  public static async addCategory(uid: string, cat: Omit<Category, 'id'>): Promise<string> {
    if (DemoStore.isDemoUid(uid)) return DemoStore.addCategory(cat);
    const payload = stripUndefined({
      ...cat,
      monthly_budget_limit: cat.monthly_budget_limit !== undefined ? roundMoney(cat.monthly_budget_limit) : undefined
    });
    const docRef = await addDoc(collection(db, 'users', uid, 'categories'), payload);
    return docRef.id;
  }

  public static async updateCategory(uid: string, categoryId: string, updates: Partial<Omit<Category, 'id'>>): Promise<void> {
    if (DemoStore.isDemoUid(uid)) {
      DemoStore.updateCategory(categoryId, updates);
      return;
    }
    const payload: Record<string, any> = stripUndefined({ ...updates });
    if (payload.monthly_budget_limit !== undefined) {
      payload.monthly_budget_limit = roundMoney(payload.monthly_budget_limit);
    }
    await updateDoc(doc(db, 'users', uid, 'categories', categoryId), payload);
  }

  public static async deleteCategory(uid: string, categoryId: string): Promise<void> {
    if (DemoStore.isDemoUid(uid)) {
      DemoStore.deleteCategory(categoryId);
      return;
    }
    await deleteDoc(doc(db, 'users', uid, 'categories', categoryId));
  }

  // 7. Subscriptions & Loans CRUD
  public static async addSubscription(uid: string, sub: Omit<SubscriptionAndLoan, 'id'>): Promise<string> {
    if (DemoStore.isDemoUid(uid)) return DemoStore.addSubscription(sub);
    const docRef = await addDoc(
      collection(db, 'users', uid, 'subscriptions'),
      stripUndefined({
        ...sub,
        amount: roundMoney(sub.amount)
      })
    );
    return docRef.id;
  }

  public static async updateSubscription(
    uid: string,
    subId: string,
    updates: Partial<Omit<SubscriptionAndLoan, 'id'>>
  ): Promise<void> {
    if (DemoStore.isDemoUid(uid)) {
      DemoStore.updateSubscription(subId, updates);
      return;
    }
    const payload: Record<string, any> = stripUndefined({ ...updates });
    if (payload.amount !== undefined) payload.amount = roundMoney(payload.amount);
    await updateDoc(doc(db, 'users', uid, 'subscriptions', subId), payload);
  }

  public static async deleteSubscription(uid: string, subId: string): Promise<void> {
    if (DemoStore.isDemoUid(uid)) {
      DemoStore.deleteSubscription(subId);
      return;
    }
    await deleteDoc(doc(db, 'users', uid, 'subscriptions', subId));
  }

  // 7B. Patrimony Assets CRUD (Investments & Properties)
  public static async addAsset(uid: string, asset: Omit<PatrimonyAsset, 'id'>): Promise<string> {
    if (DemoStore.isDemoUid(uid)) return DemoStore.addAsset(asset);
    const docRef = await addDoc(
      collection(db, 'users', uid, 'assets'),
      stripUndefined({
        ...asset,
        invested_amount: roundMoney(asset.invested_amount),
        current_value: roundMoney(asset.current_value),
        created_at: serverTimestamp()
      })
    );
    await this.addXp(uid, 50, 'Ativo patrimonial registrado');
    return docRef.id;
  }

  public static async updateAsset(
    uid: string,
    assetId: string,
    updates: Partial<Omit<PatrimonyAsset, 'id'>>
  ): Promise<void> {
    if (DemoStore.isDemoUid(uid)) {
      DemoStore.updateAsset(assetId, updates);
      return;
    }
    const payload: Record<string, any> = stripUndefined({ ...updates });
    if (payload.invested_amount !== undefined) payload.invested_amount = roundMoney(payload.invested_amount);
    if (payload.current_value !== undefined) payload.current_value = roundMoney(payload.current_value);
    await updateDoc(doc(db, 'users', uid, 'assets', assetId), payload);
  }

  public static async deleteAsset(uid: string, assetId: string): Promise<void> {
    if (DemoStore.isDemoUid(uid)) {
      DemoStore.deleteAsset(assetId);
      return;
    }
    await deleteDoc(doc(db, 'users', uid, 'assets', assetId));
  }

  // 7C. Atomic Debt / Loan Installment Payment
  public static async payLoanInstallment(
    uid: string,
    loan: SubscriptionAndLoan,
    paymentAmount: number,
    accountId?: string,
    paymentDate: string = new Date().toISOString().slice(0, 10)
  ): Promise<void> {
    if (DemoStore.isDemoUid(uid)) {
      DemoStore.payLoanInstallment(loan, paymentAmount, accountId, paymentDate);
      return;
    }

    const amt = roundMoney(paymentAmount);
    if (amt <= 0) return;

    const batch = writeBatch(db);
    const loanRef = doc(db, 'users', uid, 'subscriptions', loan.id);
    const loanSnap = await getDoc(loanRef);
    const latestLoan = loanSnap.exists() ? (loanSnap.data() as SubscriptionAndLoan) : loan;

    const nextDebt = Math.max(0, roundMoney((latestLoan.total_debt ?? 0) - amt));
    const nextPaid = (latestLoan.paid_installments ?? 0) + 1;
    const nextRemaining =
      latestLoan.remaining_installments !== undefined
        ? Math.max(0, latestLoan.remaining_installments - 1)
        : latestLoan.total_installments !== undefined
        ? Math.max(0, latestLoan.total_installments - nextPaid)
        : 0;

    batch.update(loanRef, {
      total_debt: nextDebt,
      paid_installments: nextPaid,
      remaining_installments: nextRemaining
    });

    if (accountId) {
      const accRef = doc(db, 'users', uid, 'accounts', accountId);
      const accSnap = await getDoc(accRef);
      if (accSnap.exists()) {
        const accData = accSnap.data() as BankAccount;
        batch.update(accRef, {
          current_balance: roundMoney(accData.current_balance - amt)
        });
      }

      const txRef = doc(collection(db, 'users', uid, 'transactions'));
      batch.set(
        txRef,
        stripUndefined({
          workspace_id: latestLoan.workspace_id || 'ws_personal',
          account_id: accountId,
          category_id: latestLoan.category_id || 'cat_expense',
          type: 'EXPENSE',
          amount: amt,
          description: `Parcela dívida: ${latestLoan.name} (${nextPaid}/${latestLoan.total_installments || '?'})`,
          date: paymentDate,
          status: 'PAID',
          is_recurring: false,
          source: 'APP',
          created_at: serverTimestamp()
        })
      );
    }

    await batch.commit();
    await this.addXp(uid, 40, 'Parcela de dívida amortizada');
  }

  // 7D. Atomic Statement Batch Import (CSV / OFX)
  public static async importTransactionsBatch(
    uid: string,
    accountId: string,
    items: Array<{
      date: string;
      description: string;
      amount: number;
      type: 'INCOME' | 'EXPENSE';
      category_id: string;
    }>,
    workspaceId: string = 'ws_personal'
  ): Promise<number> {
    if (items.length === 0) return 0;

    if (DemoStore.isDemoUid(uid)) {
      return DemoStore.importTransactionsBatch(accountId, items, workspaceId);
    }

    const txCol = collection(db, 'users', uid, 'transactions');
    let netDelta = 0;
    let importedCount = 0;

    // Chunk into batches of 450 operations to stay well below Firestore's 500-write batch limit
    const CHUNK_SIZE = 450;
    for (let start = 0; start < items.length; start += CHUNK_SIZE) {
      const chunk = items.slice(start, start + CHUNK_SIZE);
      const batch = writeBatch(db);
      let chunkDelta = 0;

      for (const item of chunk) {
        const amt = roundMoney(Math.abs(item.amount));
        if (amt <= 0) continue;
        chunkDelta = roundMoney(chunkDelta + (item.type === 'INCOME' ? amt : -amt));
        const txRef = doc(txCol);
        batch.set(
          txRef,
          stripUndefined({
            workspace_id: workspaceId,
            account_id: accountId,
            category_id: item.category_id,
            type: item.type,
            amount: amt,
            description: item.description.trim().slice(0, 240),
            date: item.date,
            status: 'PAID',
            is_recurring: false,
            source: 'APP',
            created_at: serverTimestamp()
          })
        );
        importedCount++;
      }

      if (accountId && chunkDelta !== 0) {
        const accRef = doc(db, 'users', uid, 'accounts', accountId);
        const accSnap = await getDoc(accRef);
        if (accSnap.exists()) {
          const accData = accSnap.data() as BankAccount;
          batch.update(accRef, {
            current_balance: roundMoney(accData.current_balance + chunkDelta)
          });
        }
      }

      netDelta = roundMoney(netDelta + chunkDelta);
      await batch.commit();
    }

    if (importedCount > 0) {
      await this.addXp(uid, Math.min(200, importedCount * 5), 'Extrato bancário importado');
    }

    return importedCount;
  }

  // 7E. Business PJ Entities CRUD (Clients, Suppliers, Cost Centers)
  public static async addClient(uid: string, client: Omit<BusinessClient, 'id'>): Promise<string> {
    if (DemoStore.isDemoUid(uid)) return DemoStore.addClient(client);
    const docRef = await addDoc(
      collection(db, 'users', uid, 'clients'),
      stripUndefined({
        ...client,
        contract_value: roundMoney(client.contract_value),
        commission_amount: client.commission_amount !== undefined ? roundMoney(client.commission_amount) : undefined,
        created_at: serverTimestamp()
      })
    );
    return docRef.id;
  }

  public static async updateClient(uid: string, clientId: string, updates: Partial<Omit<BusinessClient, 'id'>>): Promise<void> {
    if (DemoStore.isDemoUid(uid)) {
      DemoStore.updateClient(clientId, updates);
      return;
    }
    const payload: Record<string, any> = stripUndefined({ ...updates });
    if (payload.contract_value !== undefined) payload.contract_value = roundMoney(payload.contract_value);
    if (payload.commission_amount !== undefined) payload.commission_amount = roundMoney(payload.commission_amount);
    await updateDoc(doc(db, 'users', uid, 'clients', clientId), payload);
  }

  public static async deleteClient(uid: string, clientId: string): Promise<void> {
    if (DemoStore.isDemoUid(uid)) {
      DemoStore.deleteClient(clientId);
      return;
    }
    await deleteDoc(doc(db, 'users', uid, 'clients', clientId));
  }

  public static async addSupplier(uid: string, supplier: Omit<BusinessSupplier, 'id'>): Promise<string> {
    if (DemoStore.isDemoUid(uid)) return DemoStore.addSupplier(supplier);
    const docRef = await addDoc(
      collection(db, 'users', uid, 'suppliers'),
      stripUndefined({
        ...supplier,
        created_at: serverTimestamp()
      })
    );
    return docRef.id;
  }

  public static async updateSupplier(uid: string, supplierId: string, updates: Partial<Omit<BusinessSupplier, 'id'>>): Promise<void> {
    if (DemoStore.isDemoUid(uid)) {
      DemoStore.updateSupplier(supplierId, updates);
      return;
    }
    await updateDoc(doc(db, 'users', uid, 'suppliers', supplierId), stripUndefined({ ...updates }));
  }

  public static async deleteSupplier(uid: string, supplierId: string): Promise<void> {
    if (DemoStore.isDemoUid(uid)) {
      DemoStore.deleteSupplier(supplierId);
      return;
    }
    await deleteDoc(doc(db, 'users', uid, 'suppliers', supplierId));
  }

  public static async addCostCenter(uid: string, cc: Omit<CostCenter, 'id'>): Promise<string> {
    if (DemoStore.isDemoUid(uid)) return DemoStore.addCostCenter(cc);
    const docRef = await addDoc(
      collection(db, 'users', uid, 'cost_centers'),
      stripUndefined({
        ...cc,
        monthly_budget: cc.monthly_budget !== undefined ? roundMoney(cc.monthly_budget) : undefined,
        created_at: serverTimestamp()
      })
    );
    return docRef.id;
  }

  public static async updateCostCenter(uid: string, ccId: string, updates: Partial<Omit<CostCenter, 'id'>>): Promise<void> {
    if (DemoStore.isDemoUid(uid)) {
      DemoStore.updateCostCenter(ccId, updates);
      return;
    }
    const payload: Record<string, any> = stripUndefined({ ...updates });
    if (payload.monthly_budget !== undefined) payload.monthly_budget = roundMoney(payload.monthly_budget);
    await updateDoc(doc(db, 'users', uid, 'cost_centers', ccId), payload);
  }

  public static async deleteCostCenter(uid: string, ccId: string): Promise<void> {
    if (DemoStore.isDemoUid(uid)) {
      DemoStore.deleteCostCenter(ccId);
      return;
    }
    await deleteDoc(doc(db, 'users', uid, 'cost_centers', ccId));
  }

  // 8. Notifications
  public static async markNotificationRead(uid: string, notifId: string): Promise<void> {
    if (DemoStore.isDemoUid(uid)) {
      DemoStore.markNotificationRead(notifId);
      return;
    }
    await updateDoc(doc(db, 'users', uid, 'notifications', notifId), { is_read: true });
  }

  // 9. WhatsApp Logs
  public static async addWhatsAppLog(uid: string, log: Omit<WhatsAppLog, 'id'>): Promise<string> {
    if (DemoStore.isDemoUid(uid)) return DemoStore.addWhatsAppLog(log);
    try {
      const docRef = await addDoc(collection(db, 'users', uid, 'whatsapp_logs'), {
        ...log,
        timestamp: log.timestamp || new Date().toISOString(),
        created_at: serverTimestamp()
      });
      return docRef.id;
    } catch (err: any) {
      console.warn('WhatsApp log warning (verifique regras do Firestore):', err.message);
      return '';
    }
  }

  // 10. Gamification XP Engine
  public static async addXp(uid: string, amount: number, _reason: string): Promise<void> {
    if (DemoStore.isDemoUid(uid)) {
      DemoStore.addXp(amount);
      return;
    }
    const profileRef = doc(db, 'users', uid, 'gamification', 'profile');
    const snap = await getDoc(profileRef);

    if (snap.exists()) {
      const data = snap.data() as GamificationProfile;
      const newXp = (data.xp_points || 0) + amount;
      const newLevel = Math.floor(newXp / 300) + 1;
      let newTitle = data.level_title;

      if (newLevel >= 10) newTitle = 'Mestre dos Investimentos';
      else if (newLevel >= 8) newTitle = 'Guardião do Patrimônio';
      else if (newLevel >= 5) newTitle = 'Estrategista Financeiro';
      else if (newLevel >= 2) newTitle = 'Organizador Diligente';

      await updateDoc(profileRef, {
        xp_points: newXp,
        level: newLevel,
        level_title: newTitle
      });
    }
  }

  // 11. User Preferences
  public static async updateUserPreferences(uid: string, updates: Partial<User>): Promise<void> {
    if (DemoStore.isDemoUid(uid)) {
      DemoStore.updateUserPreferences(updates);
      return;
    }
    await updateDoc(doc(db, 'users', uid), updates);
  }

  // 12. Reminders CRUD & Atomic Settlement
  public static async addReminder(uid: string, reminder: Omit<Reminder, 'id'>): Promise<string> {
    if (DemoStore.isDemoUid(uid)) return DemoStore.addReminder(reminder);
    const docRef = await addDoc(
      collection(db, 'users', uid, 'reminders'),
      stripUndefined({
        ...reminder,
        amount: reminder.amount !== undefined ? roundMoney(reminder.amount) : undefined,
        created_at: serverTimestamp()
      })
    );
    await this.addXp(uid, 25, 'Lembrete financeiro agendado');
    return docRef.id;
  }

  public static async updateReminderStatus(uid: string, reminderId: string, status: 'PENDING' | 'PAID' | 'DISMISSED'): Promise<void> {
    if (DemoStore.isDemoUid(uid)) {
      DemoStore.updateReminderStatus(reminderId, status);
      return;
    }
    await updateDoc(doc(db, 'users', uid, 'reminders', reminderId), { status });
  }

  public static async markReminderAsPaid(
    uid: string,
    reminder: Reminder,
    accountId?: string,
    createLedgerTx: boolean = true,
    paymentDate: string = new Date().toISOString().slice(0, 10)
  ): Promise<void> {
    if (DemoStore.isDemoUid(uid)) {
      DemoStore.markReminderAsPaid(reminder, accountId, createLedgerTx, paymentDate);
      return;
    }

    const remRef = doc(db, 'users', uid, 'reminders', reminder.id);
    const batch = writeBatch(db);
    const amount = roundMoney(reminder.amount || 0);

    let linkedTxId = reminder.linked_transaction_id;

    if (createLedgerTx && accountId && amount > 0 && !linkedTxId) {
      const accRef = doc(db, 'users', uid, 'accounts', accountId);
      const accSnap = await getDoc(accRef);
      const txType = reminder.type === 'RECEIVABLE' ? 'INCOME' : 'EXPENSE';

      if (accSnap.exists()) {
        const accData = accSnap.data() as BankAccount;
        const delta = txType === 'INCOME' ? amount : -amount;
        batch.update(accRef, {
          current_balance: roundMoney(accData.current_balance + delta)
        });
      }

      const newTxRef = doc(collection(db, 'users', uid, 'transactions'));
      linkedTxId = newTxRef.id;

      batch.set(
        newTxRef,
        stripUndefined({
          workspace_id: reminder.workspace_id || 'ws_personal',
          account_id: accountId,
          category_id: reminder.category_id || (txType === 'INCOME' ? 'cat_income' : 'cat_expense'),
          type: txType,
          amount,
          description: reminder.title,
          date: paymentDate,
          status: 'PAID',
          is_recurring: Boolean(reminder.is_recurring),
          source: 'APP',
          notes: reminder.notes,
          created_at: serverTimestamp()
        })
      );
    }

    batch.update(
      remRef,
      stripUndefined({
        status: 'PAID',
        paid_at: paymentDate,
        paid_account_id: accountId,
        linked_transaction_id: linkedTxId
      })
    );

    await batch.commit();
    await this.addXp(uid, 25, 'Compromisso agendado liquidado');
  }

  public static async deleteReminder(uid: string, reminderId: string): Promise<void> {
    if (DemoStore.isDemoUid(uid)) {
      DemoStore.deleteReminder(reminderId);
      return;
    }
    await deleteDoc(doc(db, 'users', uid, 'reminders', reminderId));
  }

  // 13. Idempotent Recurrence Engine
  public static async processRecurringItems(
    uid: string,
    transactions: Transaction[],
    subscriptions: SubscriptionAndLoan[],
    accounts: BankAccount[] = [],
    cards: CreditCard[] = []
  ): Promise<number> {
    if (!uid || DemoStore.isDemoUid(uid)) return 0;

    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1;
    const currentMonthKey = `${currentYear}-${String(currentMonth).padStart(2, '0')}`;
    const todayDay = now.getDate();
    const daysInCurrentMonth = new Date(currentYear, currentMonth, 0).getDate();

    const lockKey = `${uid}_${currentMonthKey}`;
    if (this.recurringExecutionLocks.has(lockKey)) {
      return 0;
    }
    this.recurringExecutionLocks.add(lockKey);

    try {
      const batch = writeBatch(db);
      const accountDeltas = new Map<string, number>();
      const cardDeltas = new Map<string, number>();
      const invoiceDeltas = new Map<string, { cycle: ComputedInvoiceCycle; delta: number }>();
      let generatedCount = 0;

      const existingCurrentMonthKeys = new Set<string>();
      for (const tx of transactions) {
        const txMonth = tx.reference_month || (tx.date ? tx.date.slice(0, 7) : '');
        if (tx.recurring_source_id && txMonth === currentMonthKey) {
          existingCurrentMonthKeys.add(`${tx.recurring_source_id}::${currentMonthKey}`);
        }
        if (tx.date && tx.date.startsWith(currentMonthKey)) {
          existingCurrentMonthKeys.add(`${tx.id}::${currentMonthKey}`);
        }
      }

      const recurringTemplates = new Map<string, Transaction>();
      for (const tx of transactions) {
        if (!tx.is_recurring) continue;
        if (tx.installment_total && tx.installment_total > 1) continue;
        const sourceId = tx.recurring_source_id || tx.id;
        if (!recurringTemplates.has(sourceId)) {
          recurringTemplates.set(sourceId, tx);
        }
      }

      for (const [sourceId, template] of recurringTemplates.entries()) {
        const idempotencyKey = `${sourceId}::${currentMonthKey}`;
        if (existingCurrentMonthKeys.has(idempotencyKey)) continue;
        if (template.date && template.date.startsWith(currentMonthKey)) continue;

        const deterministicId = `rec_tx_${sourceId}_${currentMonthKey}`;
        const detRef = doc(db, 'users', uid, 'transactions', deterministicId);
        const detSnap = await getDoc(detRef);
        if (detSnap.exists()) {
          existingCurrentMonthKeys.add(idempotencyKey);
          continue;
        }

        const origDay = parseInt((template.date || '').split('-')[2] || '1', 10) || 1;
        const targetDay = Math.min(origDay, daysInCurrentMonth);
        const targetDate = `${currentMonthKey}-${String(targetDay).padStart(2, '0')}`;
        const amount = roundMoney(template.amount);
        if (amount <= 0) continue;

        const status: 'PAID' | 'PENDING' =
          template.card_id ? 'PENDING' : targetDay <= todayDay ? 'PAID' : 'PENDING';

        let invoiceId: string | undefined = undefined;
        let refMonth = currentMonthKey;

        if (template.card_id && template.type === 'EXPENSE') {
          const cardMeta = cards.find(c => c.id === template.card_id) || {
            id: template.card_id,
            closing_day: 25,
            due_day: 5
          };
          const cycle = computeCardInvoiceCycle(targetDate, cardMeta);
          invoiceId = cycle.invoiceId;
          refMonth = cycle.referenceKey;
          const prev = invoiceDeltas.get(cycle.invoiceId)?.delta || 0;
          invoiceDeltas.set(cycle.invoiceId, {
            cycle,
            delta: roundMoney(prev + amount)
          });
        }

        const newRecurringTx: Omit<Transaction, 'id'> = {
          workspace_id: template.workspace_id || 'ws_personal',
          account_id: template.account_id,
          destination_account_id: template.destination_account_id,
          card_id: template.card_id,
          invoice_id: invoiceId,
          category_id: template.category_id,
          type: template.type,
          amount,
          description: template.description,
          date: targetDate,
          status,
          is_recurring: true,
          recurring_source_id: sourceId,
          reference_month: refMonth,
          source: 'APP',
          notes: template.notes
        };

        this.accumulateTransactionImpact(newRecurringTx, 1, accountDeltas, cardDeltas);
        batch.set(
          detRef,
          stripUndefined({
            ...newRecurringTx,
            created_at: serverTimestamp()
          })
        );
        existingCurrentMonthKeys.add(idempotencyKey);
        generatedCount++;
      }

      for (const sub of subscriptions) {
        if (sub.type !== 'SUBSCRIPTION') continue;
        const sourceId = `sub_${sub.id}`;
        const idempotencyKey = `${sourceId}::${currentMonthKey}`;
        if (existingCurrentMonthKeys.has(idempotencyKey)) continue;

        const alreadyByDesc = transactions.some(
          t =>
            t.date.startsWith(currentMonthKey) &&
            (t.recurring_source_id === sourceId ||
              t.recurring_source_id === sub.id ||
              t.description.trim().toLowerCase() === sub.name.trim().toLowerCase())
        );
        if (alreadyByDesc) {
          existingCurrentMonthKeys.add(idempotencyKey);
          continue;
        }

        const deterministicId = `rec_sub_${sub.id}_${currentMonthKey}`;
        const detRef = doc(db, 'users', uid, 'transactions', deterministicId);
        const detSnap = await getDoc(detRef);
        if (detSnap.exists()) {
          existingCurrentMonthKeys.add(idempotencyKey);
          continue;
        }

        const billDay = parseInt((sub.next_billing_date || '').split('-')[2] || '1', 10) || 1;
        const targetDay = Math.min(billDay, daysInCurrentMonth);
        const targetDate = `${currentMonthKey}-${String(targetDay).padStart(2, '0')}`;
        const monthlyAmount =
          sub.billing_cycle === 'YEARLY' ? roundMoney(sub.amount / 12) : roundMoney(sub.amount);
        if (monthlyAmount <= 0) continue;

        const targetCardId =
          sub.card_id || (sub.payment_method === 'CARD' && cards.length > 0 ? cards[0].id : undefined);
        const targetAccountId =
          !targetCardId ? (sub.account_id || accounts[0]?.id) : undefined;

        const status: 'PAID' | 'PENDING' =
          targetCardId ? 'PENDING' : targetDay <= todayDay ? 'PAID' : 'PENDING';

        let invoiceId: string | undefined = undefined;
        let refMonth = currentMonthKey;

        if (targetCardId) {
          const cardMeta = cards.find(c => c.id === targetCardId) || {
            id: targetCardId,
            closing_day: 25,
            due_day: 5
          };
          const cycle = computeCardInvoiceCycle(targetDate, cardMeta);
          invoiceId = cycle.invoiceId;
          refMonth = cycle.referenceKey;
          const prev = invoiceDeltas.get(cycle.invoiceId)?.delta || 0;
          invoiceDeltas.set(cycle.invoiceId, {
            cycle,
            delta: roundMoney(prev + monthlyAmount)
          });
        }

        const subTx: Omit<Transaction, 'id'> = {
          workspace_id: sub.workspace_id || 'ws_personal',
          account_id: targetAccountId,
          card_id: targetCardId,
          invoice_id: invoiceId,
          category_id: sub.category_id || 'cat_assinaturas',
          type: 'EXPENSE',
          amount: monthlyAmount,
          description: sub.name,
          date: targetDate,
          status,
          is_recurring: true,
          recurring_source_id: sourceId,
          reference_month: refMonth,
          source: 'APP'
        };

        this.accumulateTransactionImpact(subTx, 1, accountDeltas, cardDeltas);
        batch.set(
          detRef,
          stripUndefined({
            ...subTx,
            created_at: serverTimestamp()
          })
        );
        existingCurrentMonthKeys.add(idempotencyKey);
        generatedCount++;
      }

      if (generatedCount > 0) {
        for (const [accId, delta] of accountDeltas.entries()) {
          if (delta === 0) continue;
          const accRef = doc(db, 'users', uid, 'accounts', accId);
          const accSnap = await getDoc(accRef);
          if (accSnap.exists()) {
            const accData = accSnap.data() as BankAccount;
            batch.update(accRef, {
              current_balance: roundMoney(accData.current_balance + delta)
            });
          }
        }

        for (const [cId, delta] of cardDeltas.entries()) {
          if (delta === 0) continue;
          const cardRef = doc(db, 'users', uid, 'cards', cId);
          const cardSnap = await getDoc(cardRef);
          if (cardSnap.exists()) {
            const cardData = cardSnap.data() as CreditCard;
            const nextAvail = Math.max(
              0,
              Math.min(cardData.total_limit, roundMoney(cardData.available_limit + delta))
            );
            batch.update(cardRef, { available_limit: nextAvail });
          }
        }

        await this.applyInvoiceDeltasInBatch(uid, batch, invoiceDeltas);
        await batch.commit();
      }

      return generatedCount;
    } catch (err) {
      console.warn('Recurrence engine notice:', err);
      this.recurringExecutionLocks.delete(lockKey);
      return 0;
    }
  }

  // 14. Chat History
  public static async saveChatMessage(uid: string, message: Omit<ChatMessageRecord, 'id'>): Promise<string> {
    if (DemoStore.isDemoUid(uid)) return DemoStore.saveChatMessage(message);
    try {
      const docRef = await addDoc(
        collection(db, 'users', uid, 'chat_history'),
        stripUndefined({
          ...message,
          timestamp: message.timestamp || new Date().toISOString(),
          created_at: serverTimestamp()
        })
      );
      return docRef.id;
    } catch (err: any) {
      console.warn('Chat message save warning (verifique regras do Firestore):', err.message);
      return '';
    }
  }

  // 15. WhatsApp Official Bot & User Linking
  public static async linkUserWhatsApp(uid: string, rawNumber: string): Promise<{ cleanNumber: string; variants: string[] }> {
    const { cleanNumber, variants } = normalizeBrazilianWhatsAppNumber(rawNumber);
    if (DemoStore.isDemoUid(uid)) {
      DemoStore.updateUserPreferences({
        whatsapp_number: cleanNumber,
        whatsapp_variants: variants,
        whatsapp_connected: true,
        whatsapp_linked_at: new Date().toISOString()
      });
      return { cleanNumber, variants };
    }
    await updateDoc(doc(db, 'users', uid), {
      whatsapp_number: cleanNumber,
      whatsapp_variants: variants,
      whatsapp_connected: true,
      whatsapp_linked_at: new Date().toISOString()
    });
    await this.addXp(uid, 50, 'WhatsApp Oficial vinculado');
    return { cleanNumber, variants };
  }

  public static async unlinkUserWhatsApp(uid: string): Promise<void> {
    if (DemoStore.isDemoUid(uid)) {
      DemoStore.updateUserPreferences({ whatsapp_connected: false });
      return;
    }
    await updateDoc(doc(db, 'users', uid), {
      whatsapp_connected: false
    });
  }

  public static subscribeSystemWhatsAppStatus(callback: (status: WhatsAppSystemStatus) => void) {
    const docRef = doc(db, 'system_config', 'whatsapp_status');
    return onSnapshot(
      docRef,
      snap => {
        if (snap.exists()) {
          callback(snap.data() as WhatsAppSystemStatus);
        } else {
          callback({
            status: 'DISCONNECTED',
            botNumber: '556294372561',
            qr: null
          });
        }
      },
      err => console.warn('WhatsApp system status notice:', err.message)
    );
  }

  public static async updateSystemWhatsAppStatus(status: Partial<WhatsAppSystemStatus>): Promise<void> {
    const docRef = doc(db, 'system_config', 'whatsapp_status');
    await setDoc(docRef, {
      ...status,
      updatedAt: new Date().toISOString()
    }, { merge: true });
  }
}
