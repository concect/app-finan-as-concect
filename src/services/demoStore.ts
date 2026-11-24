import {
  BankAccount,
  Category,
  ChatMessageRecord,
  CreditCard,
  CreditCardInvoice,
  Goal,
  InvoiceStatus,
  PatrimonyAsset,
  BusinessClient,
  BusinessSupplier,
  CostCenter,
  Reminder,
  SubscriptionAndLoan,
  Transaction,
  User,
  WhatsAppLog
} from '../types';
import {
  buildMathematicallyClosedDemoState,
  DEMO_STORAGE_KEY,
  DEMO_USER_ID,
  DemoState
} from '../data/seedData';
import {
  computeCardInvoiceCycle,
  ComputedInvoiceCycle,
  roundMoney
} from './financeMath';

type DemoListener = (state: DemoState) => void;

const genDemoId = (prefix: string) =>
  `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

export class DemoStore {
  private static state: DemoState | null = null;
  private static listeners = new Set<DemoListener>();

  public static isDemoUid(uid: string): boolean {
    return uid === DEMO_USER_ID;
  }

  public static getState(): DemoState {
    if (this.state) return this.state;

    try {
      const saved = localStorage.getItem(DEMO_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as DemoState;
        if (parsed && parsed.user && Array.isArray(parsed.accounts) && Array.isArray(parsed.transactions)) {
          if (!Array.isArray(parsed.assets)) {
            const freshSeed = buildMathematicallyClosedDemoState();
            parsed.assets = freshSeed.assets;
            if (!parsed.subscriptions.some(s => s.type === 'LOAN')) {
              parsed.subscriptions.push(...freshSeed.subscriptions.filter(s => s.type === 'LOAN'));
            }
          }
          if (!Array.isArray(parsed.clients) || !Array.isArray(parsed.suppliers) || !Array.isArray(parsed.costCenters)) {
            const freshSeed = buildMathematicallyClosedDemoState();
            parsed.clients = parsed.clients || freshSeed.clients;
            parsed.suppliers = parsed.suppliers || freshSeed.suppliers;
            parsed.costCenters = parsed.costCenters || freshSeed.costCenters;
          }
          this.state = parsed;
          return this.state;
        }
      }
    } catch (e) {
      // Fallback to fresh demo seed
    }

    const fresh = buildMathematicallyClosedDemoState();
    this.saveState(fresh);
    return fresh;
  }

  private static saveState(next: DemoState): void {
    this.state = next;
    try {
      localStorage.setItem(DEMO_STORAGE_KEY, JSON.stringify(next));
    } catch (e) {
      console.warn('Demo state storage warning:', e);
    }
    this.listeners.forEach(fn => fn(next));
  }

  public static reset(): DemoState {
    const fresh = buildMathematicallyClosedDemoState();
    this.saveState(fresh);
    return fresh;
  }

  public static subscribe(listener: DemoListener): () => void {
    this.listeners.add(listener);
    listener(this.getState());
    return () => {
      this.listeners.delete(listener);
    };
  }

  private static applyTxImpact(
    tx: Partial<Transaction>,
    multiplier: 1 | -1,
    accounts: BankAccount[],
    cards: CreditCard[]
  ) {
    const amount = roundMoney(tx.amount || 0);
    if (amount <= 0) return;

    if (tx.card_id && tx.type === 'EXPENSE') {
      const card = cards.find(c => c.id === tx.card_id);
      if (card) {
        card.available_limit = Math.max(
          0,
          Math.min(card.total_limit, roundMoney(card.available_limit - amount * multiplier))
        );
      }
      return;
    }

    if (tx.status === 'PAID') {
      if (tx.type === 'TRANSFER') {
        const orig = accounts.find(a => a.id === tx.account_id);
        const dest = accounts.find(a => a.id === tx.destination_account_id);
        if (orig) orig.current_balance = roundMoney(orig.current_balance - amount * multiplier);
        if (dest) dest.current_balance = roundMoney(dest.current_balance + amount * multiplier);
      } else if (tx.type === 'INCOME' && tx.account_id) {
        const acc = accounts.find(a => a.id === tx.account_id);
        if (acc) acc.current_balance = roundMoney(acc.current_balance + amount * multiplier);
      } else if (tx.type === 'EXPENSE' && tx.account_id) {
        const acc = accounts.find(a => a.id === tx.account_id);
        if (acc) acc.current_balance = roundMoney(acc.current_balance - amount * multiplier);
      }
    }
  }

  private static applyInvoiceDelta(
    invoices: CreditCardInvoice[],
    cycle: ComputedInvoiceCycle,
    delta: number
  ) {
    if (delta === 0) return;
    const existing = invoices.find(inv => inv.id === cycle.invoiceId);
    if (existing) {
      existing.total_amount = Math.max(0, roundMoney(existing.total_amount + delta));
      if (existing.status === 'PAID' && delta > 0) {
        existing.status = cycle.defaultStatus as InvoiceStatus;
      }
    } else if (delta > 0) {
      invoices.push({
        id: cycle.invoiceId,
        card_id: cycle.cardId,
        reference_month: cycle.referenceMonth,
        reference_year: cycle.referenceYear,
        reference_key: cycle.referenceKey,
        total_amount: roundMoney(delta),
        status: cycle.defaultStatus,
        closing_date: cycle.closingDate,
        due_date: cycle.dueDate
      });
    }
  }

  public static addTransaction(tx: Omit<Transaction, 'id'>): string {
    const prev = this.getState();
    const next: DemoState = structuredClone(prev);
    const totalAmount = roundMoney(tx.amount);

    if (tx.card_id && tx.installment_total && tx.installment_total > 1) {
      const n = Math.max(2, Math.floor(tx.installment_total));
      const baseInst = Math.floor((totalAmount / n) * 100) / 100;
      const firstInst = roundMoney(totalAmount - roundMoney(baseInst * (n - 1)));
      const card = next.cards.find(c => c.id === tx.card_id);
      if (card) {
        card.available_limit = Math.max(0, roundMoney(card.available_limit - totalAmount));
      }
      const cardMeta = card || { id: tx.card_id, closing_day: 25, due_day: 5 };
      const parts = (tx.date || new Date().toISOString().slice(0, 10)).split('-').map(Number);
      const baseY = parts[0] || new Date().getFullYear();
      const baseM = (parts[1] || 1) - 1;
      const baseD = parts[2] || 1;
      const cleanDesc = tx.description.replace(/\s\(\d+\/\d+\)$/, '');
      const firstId = genDemoId('demo_tx');

      for (let i = 1; i <= n; i++) {
        const d = new Date(baseY, baseM + (i - 1), baseD);
        const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        const instAmt = i === 1 ? firstInst : roundMoney(baseInst);
        const cycle = computeCardInvoiceCycle(dateStr, cardMeta);
        this.applyInvoiceDelta(next.invoices, cycle, instAmt);
        next.transactions.unshift({
          ...tx,
          id: i === 1 ? firstId : `${firstId}_${i}`,
          date: dateStr,
          description: `${cleanDesc} (${i}/${n})`,
          amount: instAmt,
          installment_current: i,
          installment_total: n,
          parent_transaction_id: firstId,
          invoice_id: cycle.invoiceId,
          reference_month: cycle.referenceKey,
          status: 'PENDING'
        });
      }
      next.transactions.sort((a, b) => b.date.localeCompare(a.date));
      this.saveState(next);
      return firstId;
    }

    const id = genDemoId('demo_tx');
    const created: Transaction = { ...tx, id, amount: totalAmount };

    if (created.card_id && created.type === 'EXPENSE') {
      const cardMeta = next.cards.find(c => c.id === created.card_id) || {
        id: created.card_id,
        closing_day: 25,
        due_day: 5
      };
      const cycle = computeCardInvoiceCycle(created.date, cardMeta);
      created.invoice_id = cycle.invoiceId;
      created.reference_month = cycle.referenceKey;
      this.applyInvoiceDelta(next.invoices, cycle, totalAmount);
    }

    this.applyTxImpact(created, 1, next.accounts, next.cards);
    next.transactions.unshift(created);
    next.transactions.sort((a, b) => b.date.localeCompare(a.date));
    this.saveState(next);
    return id;
  }

  public static updateTransactionStatus(txId: string, status: 'PAID' | 'PENDING'): void {
    const next: DemoState = structuredClone(this.getState());
    const tx = next.transactions.find(t => t.id === txId);
    if (!tx || tx.status === status) return;
    this.applyTxImpact(tx, -1, next.accounts, next.cards);
    tx.status = status;
    this.applyTxImpact(tx, 1, next.accounts, next.cards);
    this.saveState(next);
  }

  public static updateTransaction(txId: string, updates: Partial<Omit<Transaction, 'id'>>): void {
    const next: DemoState = structuredClone(this.getState());
    const idx = next.transactions.findIndex(t => t.id === txId);
    if (idx === -1) return;

    const oldTx = next.transactions[idx];
    const updatedTx: Transaction = {
      ...oldTx,
      ...updates,
      id: txId,
      amount: updates.amount !== undefined ? roundMoney(updates.amount) : roundMoney(oldTx.amount)
    };

    this.applyTxImpact(oldTx, -1, next.accounts, next.cards);
    this.applyTxImpact(updatedTx, 1, next.accounts, next.cards);

    if (oldTx.card_id && oldTx.type === 'EXPENSE') {
      const cardMeta = next.cards.find(c => c.id === oldTx.card_id) || { id: oldTx.card_id, closing_day: 25, due_day: 5 };
      this.applyInvoiceDelta(next.invoices, computeCardInvoiceCycle(oldTx.date, cardMeta), -roundMoney(oldTx.amount));
    }
    if (updatedTx.card_id && updatedTx.type === 'EXPENSE') {
      const cardMeta = next.cards.find(c => c.id === updatedTx.card_id) || { id: updatedTx.card_id, closing_day: 25, due_day: 5 };
      const cycle = computeCardInvoiceCycle(updatedTx.date, cardMeta);
      updatedTx.invoice_id = cycle.invoiceId;
      updatedTx.reference_month = cycle.referenceKey;
      this.applyInvoiceDelta(next.invoices, cycle, roundMoney(updatedTx.amount));
    }

    next.transactions[idx] = updatedTx;
    next.transactions.sort((a, b) => b.date.localeCompare(a.date));
    this.saveState(next);
  }

  public static deleteTransaction(txId: string): void {
    const next: DemoState = structuredClone(this.getState());
    const idx = next.transactions.findIndex(t => t.id === txId);
    if (idx === -1) return;
    const tx = next.transactions[idx];

    this.applyTxImpact(tx, -1, next.accounts, next.cards);
    if (tx.card_id && tx.type === 'EXPENSE') {
      const cardMeta = next.cards.find(c => c.id === tx.card_id) || { id: tx.card_id, closing_day: 25, due_day: 5 };
      this.applyInvoiceDelta(next.invoices, computeCardInvoiceCycle(tx.date, cardMeta), -roundMoney(tx.amount));
    }

    next.transactions.splice(idx, 1);
    this.saveState(next);
  }

  public static payCardInvoice(
    invoiceId: string,
    accountId: string,
    paymentDate: string,
    fallbackInvoice?: CreditCardInvoice,
    linkedTxIds: string[] = []
  ): void {
    const next: DemoState = structuredClone(this.getState());
    let inv = next.invoices.find(i => i.id === invoiceId);
    if (!inv && fallbackInvoice) {
      inv = { ...fallbackInvoice };
      next.invoices.push(inv);
    }
    if (!inv || inv.status === 'PAID') return;

    const amountToPay = roundMoney(inv.total_amount);
    const acc = next.accounts.find(a => a.id === accountId);
    if (acc && amountToPay > 0) {
      acc.current_balance = roundMoney(acc.current_balance - amountToPay);
    }
    const card = next.cards.find(c => c.id === inv!.card_id);
    if (card && amountToPay > 0) {
      card.available_limit = Math.min(card.total_limit, roundMoney(card.available_limit + amountToPay));
    }

    inv.status = 'PAID';
    inv.paid_at = paymentDate;
    inv.paid_account_id = accountId;

    for (const txId of linkedTxIds) {
      const tx = next.transactions.find(t => t.id === txId);
      if (tx) {
        tx.status = 'PAID';
        tx.invoice_id = invoiceId;
      }
    }
    this.saveState(next);
  }

  public static addAccount(acc: Omit<BankAccount, 'id'>): string {
    const next: DemoState = structuredClone(this.getState());
    const id = genDemoId('demo_acc');
    next.accounts.push({
      ...acc,
      id,
      initial_balance: roundMoney(acc.initial_balance),
      current_balance: roundMoney(acc.current_balance)
    });
    this.saveState(next);
    return id;
  }

  public static updateAccount(id: string, updates: Partial<Omit<BankAccount, 'id'>>): void {
    const next: DemoState = structuredClone(this.getState());
    const acc = next.accounts.find(a => a.id === id);
    if (!acc) return;
    Object.assign(acc, updates);
    if (updates.current_balance !== undefined) acc.current_balance = roundMoney(updates.current_balance);
    this.saveState(next);
  }

  public static deleteAccount(id: string): void {
    const next: DemoState = structuredClone(this.getState());
    next.accounts = next.accounts.filter(a => a.id !== id);
    this.saveState(next);
  }

  public static addCard(card: Omit<CreditCard, 'id'>): string {
    const next: DemoState = structuredClone(this.getState());
    const id = genDemoId('demo_card');
    next.cards.push({
      ...card,
      id,
      total_limit: roundMoney(card.total_limit),
      available_limit: roundMoney(card.available_limit)
    });
    this.saveState(next);
    return id;
  }

  public static updateCard(id: string, updates: Partial<Omit<CreditCard, 'id'>>): void {
    const next: DemoState = structuredClone(this.getState());
    const card = next.cards.find(c => c.id === id);
    if (!card) return;
    if (updates.total_limit !== undefined && updates.available_limit === undefined) {
      const used = Math.max(0, roundMoney(card.total_limit - card.available_limit));
      card.available_limit = Math.max(0, roundMoney(updates.total_limit - used));
    }
    Object.assign(card, updates);
    this.saveState(next);
  }

  public static deleteCard(id: string): void {
    const next: DemoState = structuredClone(this.getState());
    next.cards = next.cards.filter(c => c.id !== id);
    this.saveState(next);
  }

  public static addGoal(goal: Omit<Goal, 'id'>): string {
    const next: DemoState = structuredClone(this.getState());
    const id = genDemoId('demo_goal');
    next.goals.push({
      ...goal,
      id,
      target_amount: roundMoney(goal.target_amount),
      current_amount: roundMoney(goal.current_amount)
    });
    this.saveState(next);
    return id;
  }

  public static updateGoal(id: string, updates: Partial<Omit<Goal, 'id'>>): void {
    const next: DemoState = structuredClone(this.getState());
    const goal = next.goals.find(g => g.id === id);
    if (!goal) return;
    Object.assign(goal, updates);
    this.saveState(next);
  }

  public static deleteGoal(id: string): void {
    const next: DemoState = structuredClone(this.getState());
    next.goals = next.goals.filter(g => g.id !== id);
    this.saveState(next);
  }

  public static contributeToGoal(
    goalId: string,
    currentAmount: number,
    targetAmount: number,
    amountToAdd: number,
    sourceAccountId?: string,
    goalTitle?: string
  ): void {
    const next: DemoState = structuredClone(this.getState());
    const goal = next.goals.find(g => g.id === goalId);
    if (!goal) return;
    const delta = roundMoney(amountToAdd);
    const newTotal = Math.max(0, roundMoney(currentAmount + delta));
    goal.current_amount = newTotal;
    goal.status = newTotal >= targetAmount ? 'COMPLETED' : 'IN_PROGRESS';

    if (sourceAccountId && delta !== 0) {
      const acc = next.accounts.find(a => a.id === sourceAccountId);
      if (acc) {
        acc.current_balance = roundMoney(acc.current_balance - delta);
        const isAporte = delta > 0;
        next.transactions.unshift({
          id: genDemoId('demo_tx'),
          workspace_id: goal.workspace_id || 'ws_personal',
          account_id: sourceAccountId,
          category_id: 'cat_goal',
          type: isAporte ? 'EXPENSE' : 'INCOME',
          amount: Math.abs(delta),
          description: `${isAporte ? 'Aporte em meta' : 'Resgate de meta'}: ${goalTitle || goal.title}`,
          date: new Date().toISOString().slice(0, 10),
          status: 'PAID',
          is_recurring: false,
          source: 'APP'
        });
      }
    }
    this.saveState(next);
  }

  public static addCategory(cat: Omit<Category, 'id'>): string {
    const next: DemoState = structuredClone(this.getState());
    const id = genDemoId('demo_cat');
    next.categories.push({ ...cat, id });
    this.saveState(next);
    return id;
  }

  public static updateCategory(id: string, updates: Partial<Omit<Category, 'id'>>): void {
    const next: DemoState = structuredClone(this.getState());
    const cat = next.categories.find(c => c.id === id);
    if (!cat) return;
    Object.assign(cat, updates);
    this.saveState(next);
  }

  public static deleteCategory(id: string): void {
    const next: DemoState = structuredClone(this.getState());
    next.categories = next.categories.filter(c => c.id !== id);
    this.saveState(next);
  }

  public static addSubscription(sub: Omit<SubscriptionAndLoan, 'id'>): string {
    const next: DemoState = structuredClone(this.getState());
    const id = genDemoId('demo_sub');
    next.subscriptions.push({ ...sub, id, amount: roundMoney(sub.amount) });
    this.saveState(next);
    return id;
  }

  public static updateSubscription(id: string, updates: Partial<Omit<SubscriptionAndLoan, 'id'>>): void {
    const next: DemoState = structuredClone(this.getState());
    const sub = next.subscriptions.find(s => s.id === id);
    if (!sub) return;
    Object.assign(sub, updates);
    this.saveState(next);
  }

  public static deleteSubscription(id: string): void {
    const next: DemoState = structuredClone(this.getState());
    next.subscriptions = next.subscriptions.filter(s => s.id !== id);
    this.saveState(next);
  }

  public static addReminder(reminder: Omit<Reminder, 'id'>): string {
    const next: DemoState = structuredClone(this.getState());
    const id = genDemoId('demo_rem');
    next.reminders.push({ ...reminder, id });
    this.saveState(next);
    return id;
  }

  public static updateReminderStatus(id: string, status: 'PENDING' | 'PAID' | 'DISMISSED'): void {
    const next: DemoState = structuredClone(this.getState());
    const rem = next.reminders.find(r => r.id === id);
    if (!rem) return;
    rem.status = status;
    this.saveState(next);
  }

  public static markReminderAsPaid(
    reminder: Reminder,
    accountId?: string,
    createLedgerTx: boolean = true,
    paymentDate: string = new Date().toISOString().slice(0, 10)
  ): void {
    const next: DemoState = structuredClone(this.getState());
    const rem = next.reminders.find(r => r.id === reminder.id);
    if (!rem) return;
    const amount = roundMoney(rem.amount || 0);

    if (createLedgerTx && accountId && amount > 0 && !rem.linked_transaction_id) {
      const txType = rem.type === 'RECEIVABLE' ? 'INCOME' : 'EXPENSE';
      const acc = next.accounts.find(a => a.id === accountId);
      if (acc) {
        acc.current_balance = roundMoney(acc.current_balance + (txType === 'INCOME' ? amount : -amount));
      }
      const newTxId = genDemoId('demo_tx');
      next.transactions.unshift({
        id: newTxId,
        workspace_id: rem.workspace_id || 'ws_personal',
        account_id: accountId,
        category_id: rem.category_id || (txType === 'INCOME' ? 'cat_income' : 'cat_expense'),
        type: txType,
        amount,
        description: rem.title,
        date: paymentDate,
        status: 'PAID',
        is_recurring: Boolean(rem.is_recurring),
        source: 'APP',
        notes: rem.notes
      });
      rem.linked_transaction_id = newTxId;
    }

    rem.status = 'PAID';
    rem.paid_at = paymentDate;
    rem.paid_account_id = accountId;
    this.saveState(next);
  }

  public static deleteReminder(id: string): void {
    const next: DemoState = structuredClone(this.getState());
    next.reminders = next.reminders.filter(r => r.id !== id);
    this.saveState(next);
  }

  public static updateUserPreferences(updates: Partial<User>): void {
    const next: DemoState = structuredClone(this.getState());
    next.user = { ...next.user, ...updates };
    this.saveState(next);
  }

  public static markNotificationRead(id: string): void {
    const next: DemoState = structuredClone(this.getState());
    const n = next.notifications.find(x => x.id === id);
    if (n) n.is_read = true;
    this.saveState(next);
  }

  public static addWhatsAppLog(log: Omit<WhatsAppLog, 'id'>): string {
    const next: DemoState = structuredClone(this.getState());
    const id = genDemoId('demo_wa');
    next.whatsappLogs.push({ ...log, id });
    this.saveState(next);
    return id;
  }

  public static saveChatMessage(message: Omit<ChatMessageRecord, 'id'>): string {
    const next: DemoState = structuredClone(this.getState());
    const id = genDemoId('demo_chat');
    next.chatHistory.push({ ...message, id });
    this.saveState(next);
    return id;
  }

  public static addXp(amount: number): void {
    const next: DemoState = structuredClone(this.getState());
    next.gamification.xp_points = (next.gamification.xp_points || 0) + amount;
    next.gamification.level = Math.floor(next.gamification.xp_points / 300) + 1;
    this.saveState(next);
  }

  public static addAsset(asset: Omit<PatrimonyAsset, 'id'>): string {
    const next: DemoState = structuredClone(this.getState());
    const id = genDemoId('demo_asset');
    next.assets.push({
      ...asset,
      id,
      invested_amount: roundMoney(asset.invested_amount),
      current_value: roundMoney(asset.current_value)
    });
    this.saveState(next);
    return id;
  }

  public static updateAsset(id: string, updates: Partial<Omit<PatrimonyAsset, 'id'>>): void {
    const next: DemoState = structuredClone(this.getState());
    const item = next.assets.find(a => a.id === id);
    if (!item) return;
    Object.assign(item, updates);
    if (updates.invested_amount !== undefined) item.invested_amount = roundMoney(updates.invested_amount);
    if (updates.current_value !== undefined) item.current_value = roundMoney(updates.current_value);
    this.saveState(next);
  }

  public static deleteAsset(id: string): void {
    const next: DemoState = structuredClone(this.getState());
    next.assets = next.assets.filter(a => a.id !== id);
    this.saveState(next);
  }

  public static payLoanInstallment(
    loan: SubscriptionAndLoan,
    paymentAmount: number,
    accountId?: string,
    paymentDate: string = new Date().toISOString().slice(0, 10)
  ): void {
    const next: DemoState = structuredClone(this.getState());
    const target = next.subscriptions.find(s => s.id === loan.id);
    if (!target) return;

    const amt = roundMoney(paymentAmount);
    if (amt <= 0) return;

    target.total_debt = Math.max(0, roundMoney((target.total_debt ?? 0) - amt));
    target.paid_installments = (target.paid_installments ?? 0) + 1;
    if (target.remaining_installments !== undefined) {
      target.remaining_installments = Math.max(0, target.remaining_installments - 1);
    } else if (target.total_installments !== undefined) {
      target.remaining_installments = Math.max(0, target.total_installments - target.paid_installments);
    }

    if (accountId) {
      const acc = next.accounts.find(a => a.id === accountId);
      if (acc) {
        acc.current_balance = roundMoney(acc.current_balance - amt);
      }
      next.transactions.unshift({
        id: genDemoId('demo_tx'),
        workspace_id: target.workspace_id || 'ws_personal',
        account_id: accountId,
        category_id: target.category_id || 'cat_expense',
        type: 'EXPENSE',
        amount: amt,
        description: `Parcela dívida: ${target.name} (${target.paid_installments}/${target.total_installments || '?'})`,
        date: paymentDate,
        status: 'PAID',
        is_recurring: false,
        source: 'APP'
      });
      next.transactions.sort((a, b) => b.date.localeCompare(a.date));
    }

    this.saveState(next);
  }

  public static importTransactionsBatch(
    accountId: string,
    items: Array<{
      date: string;
      description: string;
      amount: number;
      type: 'INCOME' | 'EXPENSE';
      category_id: string;
    }>,
    workspaceId: string
  ): number {
    if (items.length === 0) return 0;
    const next: DemoState = structuredClone(this.getState());
    let netDelta = 0;

    for (const item of items) {
      const amt = roundMoney(Math.abs(item.amount));
      if (amt <= 0) continue;
      netDelta = roundMoney(netDelta + (item.type === 'INCOME' ? amt : -amt));
      next.transactions.unshift({
        id: genDemoId('demo_imp'),
        workspace_id: workspaceId,
        account_id: accountId,
        category_id: item.category_id,
        type: item.type,
        amount: amt,
        description: item.description.trim(),
        date: item.date,
        status: 'PAID',
        is_recurring: false,
        source: 'APP'
      });
    }

    const acc = next.accounts.find(a => a.id === accountId);
    if (acc && netDelta !== 0) {
      acc.current_balance = roundMoney(acc.current_balance + netDelta);
    }

    next.transactions.sort((a, b) => b.date.localeCompare(a.date));
    this.saveState(next);
    return items.length;
  }

  public static addClient(client: Omit<BusinessClient, 'id'>): string {
    const next: DemoState = structuredClone(this.getState());
    const id = genDemoId('demo_cli');
    next.clients.push({
      ...client,
      id,
      contract_value: roundMoney(client.contract_value),
      commission_amount: client.commission_amount !== undefined ? roundMoney(client.commission_amount) : undefined
    });
    this.saveState(next);
    return id;
  }

  public static updateClient(id: string, updates: Partial<Omit<BusinessClient, 'id'>>): void {
    const next: DemoState = structuredClone(this.getState());
    const item = next.clients.find(c => c.id === id);
    if (!item) return;
    Object.assign(item, updates);
    if (updates.contract_value !== undefined) item.contract_value = roundMoney(updates.contract_value);
    if (updates.commission_amount !== undefined) item.commission_amount = roundMoney(updates.commission_amount);
    this.saveState(next);
  }

  public static deleteClient(id: string): void {
    const next: DemoState = structuredClone(this.getState());
    next.clients = next.clients.filter(c => c.id !== id);
    this.saveState(next);
  }

  public static addSupplier(supplier: Omit<BusinessSupplier, 'id'>): string {
    const next: DemoState = structuredClone(this.getState());
    const id = genDemoId('demo_sup');
    next.suppliers.push({ ...supplier, id });
    this.saveState(next);
    return id;
  }

  public static updateSupplier(id: string, updates: Partial<Omit<BusinessSupplier, 'id'>>): void {
    const next: DemoState = structuredClone(this.getState());
    const item = next.suppliers.find(s => s.id === id);
    if (!item) return;
    Object.assign(item, updates);
    this.saveState(next);
  }

  public static deleteSupplier(id: string): void {
    const next: DemoState = structuredClone(this.getState());
    next.suppliers = next.suppliers.filter(s => s.id !== id);
    this.saveState(next);
  }

  public static addCostCenter(cc: Omit<CostCenter, 'id'>): string {
    const next: DemoState = structuredClone(this.getState());
    const id = genDemoId('demo_cc');
    next.costCenters.push({
      ...cc,
      id,
      monthly_budget: cc.monthly_budget !== undefined ? roundMoney(cc.monthly_budget) : undefined
    });
    this.saveState(next);
    return id;
  }

  public static updateCostCenter(id: string, updates: Partial<Omit<CostCenter, 'id'>>): void {
    const next: DemoState = structuredClone(this.getState());
    const item = next.costCenters.find(c => c.id === id);
    if (!item) return;
    Object.assign(item, updates);
    if (updates.monthly_budget !== undefined) item.monthly_budget = roundMoney(updates.monthly_budget);
    this.saveState(next);
  }

  public static deleteCostCenter(id: string): void {
    const next: DemoState = structuredClone(this.getState());
    next.costCenters = next.costCenters.filter(c => c.id !== id);
    this.saveState(next);
  }
}
