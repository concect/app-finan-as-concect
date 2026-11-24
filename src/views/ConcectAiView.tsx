import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  Send,
  TrendingUp,
  AlertTriangle,
  Printer,
  ShieldCheck,
  LineChart,
  Repeat,
  Clock,
  Sparkles
} from 'lucide-react';
import { GroqService, STRICT_REFUSAL_MESSAGE } from '../services/groqService';
import { FirestoreService, roundMoney, calculateBusinessDRE } from '../services/firestoreService';
import {
  User,
  BankAccount,
  CreditCard,
  Category,
  Transaction,
  Goal,
  Reminder,
  SubscriptionAndLoan,
  WorkspaceType
} from '../types';

interface ConcectAiViewProps {
  user: User;
  activeWorkspaceId?: string;
  workspaceType?: WorkspaceType;
  accounts: BankAccount[];
  cards: CreditCard[];
  categories: Category[];
  transactions: Transaction[];
  goals: Goal[];
  reminders?: Reminder[];
  subscriptions?: SubscriptionAndLoan[];
}

interface ChatMessage {
  id: string;
  sender: 'USER' | 'AI';
  text: string;
  suggestedAction?: string;
  timestamp: string;
}

const formatChatTime = (rawTime?: string, createdAt?: any): string => {
  if (typeof rawTime === 'string' && /^\d{1,2}:\d{2}(:\d{2})?$/.test(rawTime.trim())) {
    return rawTime.trim().slice(0, 5);
  }
  if (createdAt?.toDate && typeof createdAt.toDate === 'function') {
    try {
      return createdAt.toDate().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    } catch (e) {
      // ignore
    }
  }
  if (typeof createdAt?.seconds === 'number') {
    return new Date(createdAt.seconds * 1000).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  }
  if (rawTime) {
    const parsed = new Date(rawTime);
    if (!isNaN(parsed.getTime())) {
      return parsed.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    }
  }
  return new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
};

export const ConcectAiView: React.FC<ConcectAiViewProps> = ({
  user,
  activeWorkspaceId = 'ws_personal',
  workspaceType = 'INDIVIDUAL',
  accounts,
  cards,
  categories,
  transactions,
  goals,
  reminders = [],
  subscriptions = []
}) => {
  const isBusiness = workspaceType === 'BUSINESS';
  const [activeTab, setActiveTab] = useState<'CHAT' | 'INSIGHTS' | 'REPORTS'>('CHAT');
  const [periodFilter, setPeriodFilter] = useState<'1M' | '3M' | '6M'>('1M');
  const [deepAiAnalysis, setDeepAiAnalysis] = useState<string>('');
  const [deepAiLoading, setDeepAiLoading] = useState<boolean>(false);

  const [inputQuery, setInputQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    {
      id: 'msg_01',
      sender: 'AI',
      text: `Consultor financeiro ativo para a carteira de ${user.name || 'investidor'}.\n\nPosso analisar saldos, faturas de cartão, tetos de orçamento por categoria ou registrar novas despesas, receitas e metas.`,
      timestamp: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    }
  ]);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const formatMoney = (val: number) => {
    if (user.privacy_mode) return '••••••';
    return `R$ ${val.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const scrollToBottom = (behavior: ScrollBehavior = 'smooth') => {
    messagesEndRef.current?.scrollIntoView({ behavior });
  };

  useEffect(() => {
    scrollToBottom('smooth');
  }, [chatMessages, loading]);

  useEffect(() => {
    if (activeTab === 'CHAT') {
      const timer = setTimeout(() => scrollToBottom('auto'), 60);
      return () => clearTimeout(timer);
    }
  }, [activeTab]);

  useEffect(() => {
    const unsub = FirestoreService.subscribeChatHistory(user.id, 'CONSULTANT', msgs => {
      if (msgs.length > 0) {
        const sorted = [...msgs].sort((a: any, b: any) => {
          const tA = FirestoreService.parseTimeMillis(a);
          const tB = FirestoreService.parseTimeMillis(b);
          if (tA !== tB) return tA - tB;
          const isAUser = a.sender === 'USER';
          const isBUser = b.sender === 'USER';
          if (isAUser && !isBUser) return -1;
          if (!isAUser && isBUser) return 1;
          return 0;
        });

        setChatMessages(
          sorted.map(m => ({
            id: m.id,
            sender: m.sender,
            text: m.text,
            timestamp: formatChatTime(m.timestamp, (m as any).created_at)
          }))
        );
      }
    });
    return () => unsub();
  }, [user.id]);

  // --- REAL ANALYTICAL CALCULATIONS OVER ACTIVE WORKSPACE ---
  const totalBalance = roundMoney(accounts.reduce((acc, a) => acc + a.current_balance, 0));
  const now = new Date();
  const todayStr = now.toISOString().slice(0, 10);
  const currentMonthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  const periodMonthsCount = periodFilter === '1M' ? 1 : periodFilter === '3M' ? 3 : 6;
  const periodLabel =
    periodFilter === '1M' ? 'Mês atual' : periodFilter === '3M' ? 'Últimos 3 meses' : 'Últimos 6 meses';

  const periodMonthKeys = useMemo(() => {
    const keys: string[] = [];
    for (let i = 0; i < periodMonthsCount; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      keys.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
    }
    return keys;
  }, [periodMonthsCount, currentMonthStr]);

  const periodTxs = useMemo(
    () => transactions.filter(t => t.date && periodMonthKeys.some(mk => t.date.startsWith(mk))),
    [transactions, periodMonthKeys]
  );

  const periodIncome = roundMoney(
    periodTxs.filter(t => t.type === 'INCOME').reduce((a, b) => a + b.amount, 0)
  );
  const periodExpense = roundMoney(
    periodTxs.filter(t => t.type === 'EXPENSE').reduce((a, b) => a + b.amount, 0)
  );
  const periodNet = roundMoney(periodIncome - periodExpense);
  const periodSavingsRate = periodIncome > 0 ? roundMoney((periodNet / periodIncome) * 100) : 0;

  // 1. Categories above 3-month trailing average (comparing current month vs previous 3 months avg)
  const aboveAverageCategories = useMemo(() => {
    const trailingKeys: string[] = [];
    for (let i = 1; i <= 3; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      trailingKeys.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
    }

    const results: {
      id: string;
      name: string;
      currentSpent: number;
      avg3m: number;
      pctAbove: number;
    }[] = [];

    for (const cat of categories.filter(c => c.type === 'EXPENSE')) {
      const currentSpent = roundMoney(
        transactions
          .filter(t => t.type === 'EXPENSE' && t.category_id === cat.id && t.date.startsWith(currentMonthStr))
          .reduce((a, b) => a + b.amount, 0)
      );
      if (currentSpent <= 0) continue;

      const histMonths = trailingKeys
        .map(mk =>
          roundMoney(
            transactions
              .filter(t => t.type === 'EXPENSE' && t.category_id === cat.id && t.date.startsWith(mk))
              .reduce((a, b) => a + b.amount, 0)
          )
        )
        .filter(v => v > 0);

      if (histMonths.length === 0) continue;
      const avg3m = roundMoney(histMonths.reduce((a, b) => a + b, 0) / histMonths.length);
      if (currentSpent > avg3m * 1.1) {
        const pctAbove = Math.round(((currentSpent - avg3m) / avg3m) * 100);
        results.push({ id: cat.id, name: cat.name, currentSpent, avg3m, pctAbove });
      }
    }

    return results.sort((a, b) => b.pctAbove - a.pctAbove);
  }, [transactions, categories, currentMonthStr]);

  // 2. Recurring expenses & fixed cost commitment in current month
  const recurringSummary = useMemo(() => {
    const recurringTxsMonth = transactions.filter(
      t => t.type === 'EXPENSE' && t.is_recurring && t.date.startsWith(currentMonthStr)
    );
    const recurringTxsTotal = roundMoney(recurringTxsMonth.reduce((a, b) => a + b.amount, 0));
    const activeSubsMonthly = roundMoney(
      subscriptions
        .filter(s => s.type === 'SUBSCRIPTION')
        .reduce((a, s) => a + (s.billing_cycle === 'YEARLY' ? roundMoney(s.amount / 12) : s.amount), 0)
    );
    // Avoid double-counting subscriptions already generated in recurringTxsMonth
    const totalFixed = Math.max(recurringTxsTotal, activeSubsMonthly);
    const monthInc = roundMoney(
      transactions
        .filter(t => t.type === 'INCOME' && t.date.startsWith(currentMonthStr))
        .reduce((a, b) => a + b.amount, 0)
    );
    const fixedSharePct = monthInc > 0 ? Math.round((totalFixed / monthInc) * 100) : 0;

    return {
      totalFixed,
      count: recurringTxsMonth.length || subscriptions.length,
      fixedSharePct
    };
  }, [transactions, subscriptions, currentMonthStr]);

  // 3. Upcoming (next 7 days) & Overdue obligations (pending account bills + pending reminders)
  const upcomingAlerts = useMemo(() => {
    const in7DaysStr = new Date(now.getTime() + 7 * 86400000).toISOString().slice(0, 10);
    const alerts: { id: string; title: string; date: string; amount: number; isOverdue: boolean; source: string }[] = [];

    for (const tx of transactions) {
      if (tx.type === 'EXPENSE' && !tx.card_id && tx.status !== 'PAID' && tx.date <= in7DaysStr) {
        alerts.push({
          id: `tx_${tx.id}`,
          title: tx.description,
          date: tx.date,
          amount: tx.amount,
          isOverdue: tx.date < todayStr,
          source: 'Extrato'
        });
      }
    }

    for (const rem of reminders) {
      if (rem.type === 'PAYABLE' && rem.status === 'PENDING' && rem.due_date <= in7DaysStr) {
        alerts.push({
          id: `rem_${rem.id}`,
          title: rem.title,
          date: rem.due_date,
          amount: rem.amount || 0,
          isOverdue: rem.due_date < todayStr,
          source: 'Agenda'
        });
      }
    }

    return alerts.sort((a, b) => a.date.localeCompare(b.date));
  }, [transactions, reminders, todayStr]);

  // 4. Top spending categories in selected period (for Parecer)
  const topCategoriesInPeriod = useMemo(() => {
    return categories
      .filter(c => c.type === 'EXPENSE')
      .map(cat => {
        const sum = roundMoney(
          periodTxs
            .filter(t => t.type === 'EXPENSE' && t.category_id === cat.id)
            .reduce((a, b) => a + b.amount, 0)
        );
        return {
          id: cat.id,
          name: cat.name,
          amount: sum,
          share: periodExpense > 0 ? Math.round((sum / periodExpense) * 100) : 0
        };
      })
      .filter(c => c.amount > 0)
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 5);
  }, [categories, periodTxs, periodExpense]);

  // Business DRE for current month (used in Parecer when workspaceType === 'BUSINESS')
  const businessDre = isBusiness ? calculateBusinessDRE(transactions, categories, currentMonthStr) : null;

  const handleGenerateDeepAiAnalysis = async () => {
    setDeepAiLoading(true);
    try {
      const prompt = `Faça um diagnóstico executivo objetivo da carteira (${isBusiness ? 'Empresarial PJ' : 'Pessoal'}) considerando o recorte de ${periodLabel}. Destaque: 1) Margem de economia/lucro (${periodSavingsRate}%), 2) Categorias com gastos acima da média (${aboveAverageCategories.map(c => `${c.name} +${c.pctAbove}%`).join(', ') || 'nenhuma'}), 3) Peso dos custos recorrentes (${formatMoney(recurringSummary.totalFixed)}) e 4) Recomendações práticas para os próximos 30 dias.`;
      const reply = await GroqService.queryConsultant(
        prompt,
        [],
        user,
        accounts,
        cards,
        categories,
        periodTxs,
        goals,
        [],
        reminders
      );
      setDeepAiAnalysis(reply);
    } catch (err) {
      setDeepAiAnalysis('Não foi possível gerar a análise aprofundada via Groq no momento. Verifique sua chave de API em Configurações.');
    } finally {
      setDeepAiLoading(false);
    }
  };

  const handleSend = async (e?: React.FormEvent, customText?: string) => {
    if (e) e.preventDefault();
    const userText = (customText || inputQuery).trim();
    if (!userText || loading) return;

    const timeStr = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    const userMsg: ChatMessage = {
      id: `msg_${Date.now()}`,
      sender: 'USER',
      text: userText,
      timestamp: timeStr
    };

    setChatMessages(prev => [...prev, userMsg]);
    setInputQuery('');
    setLoading(true);

    await FirestoreService.saveChatMessage(user.id, {
      channel: 'CONSULTANT',
      sender: 'USER',
      text: userText,
      timestamp: new Date().toISOString()
    });

    try {
      const actionResult = await GroqService.processAiAction(
        userText,
        chatMessages,
        user,
        accounts,
        cards,
        categories,
        transactions,
        goals,
        [],
        reminders,
        false
      );

      let finalReply = actionResult.reply_message;

      if (actionResult.intent === 'CREATE_TRANSACTION' && actionResult.action_payload?.amount) {
        const payload = actionResult.action_payload;
        await FirestoreService.addTransaction(
          user.id,
          {
            workspace_id: activeWorkspaceId,
            account_id: payload.account_id || accounts[0]?.id,
            card_id: payload.card_id,
            category_id: payload.category_id || categories.find(c => c.type === (payload.type || 'EXPENSE'))?.id || 'cat_expense',
            type: payload.type || 'EXPENSE',
            amount: Number(payload.amount) || 0,
            description: payload.description || 'Lançamento via consultor',
            date: payload.due_date || new Date().toISOString().slice(0, 10),
            status: 'PAID',
            is_recurring: false,
            installment_current: payload.installments && payload.installments > 1 ? 1 : undefined,
            installment_total: payload.installments && payload.installments > 1 ? payload.installments : undefined,
            source: 'APP'
          },
          accounts,
          cards
        );
        finalReply += '\n\nLançamento registrado no extrato.';
      } else if (actionResult.intent === 'CREATE_GOAL' && (actionResult.action_payload?.goal_target || actionResult.action_payload?.amount)) {
        const payload = actionResult.action_payload;
        const target = payload.goal_target || payload.amount || 1000;
        await FirestoreService.addGoal(user.id, {
          workspace_id: activeWorkspaceId,
          title: payload.goal_title || payload.description || 'Nova meta',
          type: 'SAVINGS',
          target_amount: target,
          current_amount: 0,
          deadline: payload.due_date || new Date(Date.now() + 180 * 86400000).toISOString().slice(0, 10),
          status: 'IN_PROGRESS',
          created_at: new Date().toISOString().slice(0, 10)
        });
        finalReply += '\n\nMeta adicionada à carteira.';
      } else if (actionResult.intent === 'CREATE_REMINDER') {
        const payload = actionResult.action_payload;
        await FirestoreService.addReminder(user.id, {
          workspace_id: activeWorkspaceId,
          title: payload?.reminder_title || payload?.description || 'Lembrete de conta',
          amount: payload?.amount,
          due_date: payload?.reminder_due_date || payload?.due_date || new Date(Date.now() + 86400000).toISOString().slice(0, 10),
          type: 'PAYABLE',
          status: 'PENDING'
        });
        finalReply += '\n\nLembrete registrado na agenda financeira.';
      } else if (actionResult.intent === 'OUT_OF_SCOPE') {
        finalReply = STRICT_REFUSAL_MESSAGE;
      }

      const aiMsg: ChatMessage = {
        id: `msg_ai_${Date.now()}`,
        sender: 'AI',
        text: finalReply,
        timestamp: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
      };
      setChatMessages(prev => [...prev, aiMsg]);

      await FirestoreService.saveChatMessage(user.id, {
        channel: 'CONSULTANT',
        sender: 'AI',
        text: finalReply,
        timestamp: new Date().toISOString(),
        intent: actionResult.intent,
        action_payload: actionResult.action_payload
      });
    } catch (err: any) {
      console.error(err);
      const fallbackMsg = 'Ocorreu uma instabilidade na comunicação com o motor analítico. Tente novamente em instantes.';
      const aiMsg: ChatMessage = {
        id: `msg_ai_${Date.now()}`,
        sender: 'AI',
        text: fallbackMsg,
        timestamp: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
      };
      setChatMessages(prev => [...prev, aiMsg]);
      await FirestoreService.saveChatMessage(user.id, {
        channel: 'CONSULTANT',
        sender: 'AI',
        text: fallbackMsg,
        timestamp: new Date().toISOString()
      });
    } finally {
      setLoading(false);
    }
  };

  const handleQuickQuestion = (q: string) => {
    handleSend(undefined, q);
  };

  return (
    <div className="space-y-6 min-w-0">
      {/* Top Navigation Tabs */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between bg-surface border border-subtle rounded-xl p-4 gap-3 min-w-0">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 rounded-lg bg-raised border border-subtle flex items-center justify-center text-secondary shrink-0">
            <LineChart className="w-4 h-4 stroke-[1.5]" />
          </div>
          <div className="min-w-0">
            <h2 className="text-[15px] font-medium text-primary truncate">
              {isBusiness ? 'Consultor financeiro PJ' : 'Consultor financeiro'}
            </h2>
            <p className="text-xs text-muted truncate">Análise direta sobre contas, cartões, orçamento e metas</p>
          </div>
        </div>

        <div className="w-full sm:w-auto grid grid-cols-3 sm:flex bg-canvas p-1 rounded-lg border border-subtle gap-1">
          <button
            onClick={() => setActiveTab('CHAT')}
            className={`h-7 px-2 sm:px-3 rounded-md text-xs font-medium transition-colors truncate ${
              activeTab === 'CHAT'
                ? 'bg-raised text-primary'
                : 'text-muted hover:text-primary'
            }`}
          >
            Consultas
          </button>
          <button
            onClick={() => setActiveTab('INSIGHTS')}
            className={`h-7 px-2 sm:px-3 rounded-md text-xs font-medium transition-colors truncate ${
              activeTab === 'INSIGHTS'
                ? 'bg-raised text-primary'
                : 'text-muted hover:text-primary'
            }`}
          >
            Diagnóstico
          </button>
          <button
            onClick={() => setActiveTab('REPORTS')}
            className={`h-7 px-2 sm:px-3 rounded-md text-xs font-medium transition-colors truncate ${
              activeTab === 'REPORTS'
                ? 'bg-raised text-primary'
                : 'text-muted hover:text-primary'
            }`}
          >
            Parecer
          </button>
        </div>
      </div>

      {/* TAB 1: CHAT */}
      {activeTab === 'CHAT' && (
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 min-w-0">
          <div className="lg:col-span-3 bg-surface border border-subtle rounded-xl flex flex-col h-[540px] sm:h-[580px] min-w-0">
            <div className="flex-1 p-3 sm:p-5 overflow-y-auto space-y-4 scrollbar-thin">
              {chatMessages.map(msg => (
                <div
                  key={msg.id}
                  className={`flex gap-2.5 sm:gap-3 max-w-[90%] sm:max-w-[85%] ${
                    msg.sender === 'USER' ? 'ml-auto flex-row-reverse' : ''
                  }`}
                >
                  <div
                    className={`w-7 h-7 rounded-md flex items-center justify-center shrink-0 text-[11px] font-mono font-medium border ${
                      msg.sender === 'USER'
                        ? 'bg-raised text-primary border-subtle'
                        : 'bg-canvas text-[#10B981] border-subtle'
                    }`}
                  >
                    {msg.sender === 'USER' ? (user.name?.[0]?.toUpperCase() || 'U') : 'CF'}
                  </div>

                  <div className="space-y-1 min-w-0">
                    <div
                      className={`p-3 sm:p-3.5 rounded-xl text-xs leading-relaxed ${
                        msg.sender === 'USER'
                          ? 'bg-raised border border-subtle text-primary'
                          : 'bg-canvas border border-subtle text-primary'
                      }`}
                    >
                      <div className="whitespace-pre-line break-words">{msg.text}</div>
                    </div>
                    <span className="text-[10px] text-muted px-1 font-mono block">
                      {msg.timestamp}
                    </span>
                  </div>
                </div>
              ))}

              {loading && (
                <div className="flex items-center gap-2 p-3 bg-canvas border border-subtle rounded-xl w-44 text-xs text-secondary">
                  <span className="w-3.5 h-3.5 border-2 border-[#10B981] border-t-transparent rounded-full animate-spin" />
                  <span>Analisando carteira...</span>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>

            {/* Quick Suggestions */}
            <div className="p-3 bg-deep border-t border-subtle overflow-x-auto flex items-center gap-2 scrollbar-none">
              <span className="text-xs text-muted shrink-0 pr-1">
                Sugestões:
              </span>
              {[
                'Quanto tenho em saldo nas contas hoje?',
                'Qual foi meu maior gasto registrado?',
                'Quanto posso gastar por dia até o fim do mês?',
                'Como está o progresso das minhas metas?'
              ].map((q, idx) => (
                <button
                  key={idx}
                  onClick={() => handleQuickQuestion(q)}
                  disabled={loading}
                  className="h-7 px-2.5 bg-surface hover:bg-raised border border-subtle text-secondary hover:text-primary rounded-md text-xs whitespace-nowrap transition-colors shrink-0 disabled:opacity-50"
                >
                  {q}
                </button>
              ))}
            </div>

            {/* Chat Input */}
            <form onSubmit={handleSend} className="p-2.5 sm:p-3 bg-surface border-t border-subtle flex gap-2">
              <input
                type="text"
                placeholder="Perguntar sobre saldos, gastos ou registrar lançamento"
                value={inputQuery}
                onChange={e => setInputQuery(e.target.value)}
                disabled={loading}
                className="flex-1 min-w-0 h-10 bg-canvas border border-subtle focus:border-[#10B981] rounded-lg px-3 text-xs text-primary outline-none transition-colors disabled:opacity-50"
              />
              <button
                type="submit"
                disabled={loading || !inputQuery.trim()}
                className="h-10 px-3 sm:px-4 bg-primary hover:opacity-90 text-canvas font-medium text-xs rounded-lg transition-opacity flex items-center gap-1.5 active:scale-[0.98] disabled:opacity-50 shrink-0"
              >
                <Send className="w-3.5 h-3.5 stroke-[1.5]" />
                <span className="hidden sm:inline">Enviar</span>
              </button>
            </form>
          </div>

          {/* Side Info Cards */}
          <div className="space-y-4 min-w-0">
            <div className="bg-surface border border-subtle rounded-xl p-5 space-y-2.5">
              <span className="text-xs text-secondary">
                {isBusiness ? 'Caixa PJ em análise' : 'Patrimônio em análise'}
              </span>
              <p className="text-2xl font-medium font-mono text-primary tabular-nums truncate">
                {formatMoney(totalBalance)}
              </p>
              <p className="text-xs text-muted">
                {accounts.length} {accounts.length === 1 ? 'conta' : 'contas'} e {transactions.length} {transactions.length === 1 ? 'lançamento' : 'lançamentos'} no workspace
              </p>
            </div>

            <div className="bg-surface border border-subtle rounded-xl p-5 space-y-2.5">
              <div className="flex items-center gap-2 text-xs font-medium text-primary">
                <ShieldCheck className="w-4 h-4 stroke-[1.5] text-[#10B981]" />
                <span>Escopo estrito</span>
              </div>
              <p className="text-xs text-muted leading-relaxed">
                O consultor opera exclusivamente sobre os dados financeiros do workspace ativo para preservar foco analítico e sigilo patrimonial.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: REAL DIAGNOSTICS (Cálculos reais sobre transações + Análise Groq opcional) */}
      {activeTab === 'INSIGHTS' && (
        <div className="space-y-5 min-w-0">
          {/* Period Filter & Optional Deep AI Trigger */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-surface border border-subtle rounded-xl p-4">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs text-secondary">Período de análise:</span>
              <div className="inline-flex bg-canvas p-1 rounded-lg border border-subtle gap-1">
                {(['1M', '3M', '6M'] as const).map(p => (
                  <button
                    key={p}
                    onClick={() => setPeriodFilter(p)}
                    className={`h-7 px-2.5 rounded text-xs font-mono transition-colors ${
                      periodFilter === p
                        ? 'bg-raised text-primary font-medium'
                        : 'text-muted hover:text-primary'
                    }`}
                  >
                    {p === '1M' ? 'Mês atual' : p === '3M' ? '3 meses' : '6 meses'}
                  </button>
                ))}
              </div>
            </div>

            <button
              onClick={handleGenerateDeepAiAnalysis}
              disabled={deepAiLoading}
              className="h-9 flex items-center justify-center gap-1.5 px-3.5 bg-primary hover:opacity-90 text-canvas text-xs font-medium rounded-lg transition-opacity disabled:opacity-50"
            >
              <Sparkles className="w-3.5 h-3.5 stroke-[1.5]" />
              <span>{deepAiLoading ? 'Consultando Groq IA...' : 'Gerar análise aprofundada (IA)'}</span>
            </button>
          </div>

          {/* Optional AI Output Box */}
          {deepAiAnalysis && (
            <div className="bg-surface border border-[#10B981]/30 rounded-xl p-5 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-[#10B981] flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 stroke-[1.5]" />
                  Análise aprofundada — {periodLabel}
                </span>
                <button
                  onClick={() => setDeepAiAnalysis('')}
                  className="text-[11px] text-muted hover:text-primary"
                >
                  Ocultar
                </button>
              </div>
              <div className="text-xs text-primary leading-relaxed whitespace-pre-line">
                {deepAiAnalysis}
              </div>
            </div>
          )}

          {/* 4 Real Diagnostic Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* 1. Margem de Economia / Lucro */}
            <div className="bg-surface border border-subtle rounded-xl p-5 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium text-primary flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 stroke-[1.5] text-[#10B981]" />
                  {isBusiness ? 'Margem líquida operacional' : 'Margem de economia'} ({periodLabel})
                </span>
                <span
                  className={`text-xs font-mono px-2 py-0.5 rounded border shrink-0 ${
                    periodNet >= 0
                      ? 'bg-[#10B981]/10 text-[#10B981] border-[#10B981]/25'
                      : 'bg-[#EF4444]/10 text-[#EF4444] border-[#EF4444]/25'
                  }`}
                >
                  {periodSavingsRate.toFixed(1)}%
                </span>
              </div>
              <p className="text-sm font-mono font-medium text-primary tabular-nums">
                Entradas: {formatMoney(periodIncome)} • Saídas: {formatMoney(periodExpense)}
              </p>
              <p className="text-xs text-secondary leading-relaxed">
                Resultado líquido no recorte: <strong className="text-primary">{formatMoney(periodNet)}</strong>.
                Mantendo este ritmo médio, a projeção anualizada de acumulação é de{' '}
                <strong className="text-[#10B981]">
                  {formatMoney(roundMoney((periodNet / periodMonthsCount) * 12))}
                </strong>.
              </p>
            </div>

            {/* 2. Gastos Recorrentes e Peso Fixo */}
            <div className="bg-surface border border-subtle rounded-xl p-5 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium text-primary flex items-center gap-2">
                  <Repeat className="w-4 h-4 stroke-[1.5] text-[#C5A059]" />
                  Peso de gastos recorrentes
                </span>
                <span className="text-xs font-mono px-2 py-0.5 rounded bg-raised text-secondary border border-subtle shrink-0">
                  {recurringSummary.fixedSharePct}% da receita
                </span>
              </div>
              <p className="text-sm font-mono font-medium text-primary tabular-nums">
                {formatMoney(recurringSummary.totalFixed)} / mês
              </p>
              <p className="text-xs text-secondary leading-relaxed">
                {recurringSummary.count > 0
                  ? `${recurringSummary.count} compromisso(s) recorrente(s) e assinaturas identificados no mês atual (custo anualizado de ${formatMoney(roundMoney(recurringSummary.totalFixed * 12))}).`
                  : 'Nenhum gasto recorrente ou assinatura identificado neste workspace.'}
              </p>
            </div>

            {/* 3. Categorias Acima da Média dos Últimos 3 Meses */}
            <div className="bg-surface border border-subtle rounded-xl p-5 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium text-primary flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 stroke-[1.5] text-[#D97706]" />
                  Desvios acima da média (3 meses)
                </span>
                <span className="text-xs font-mono px-2 py-0.5 rounded bg-raised text-secondary border border-subtle shrink-0">
                  {aboveAverageCategories.length} {aboveAverageCategories.length === 1 ? 'alerta' : 'alertas'}
                </span>
              </div>

              {aboveAverageCategories.length === 0 ? (
                <p className="text-xs text-secondary leading-relaxed">
                  Todas as categorias do mês atual estão dentro ou abaixo da sua média dos últimos 3 meses.
                </p>
              ) : (
                <div className="divide-y divide-subtle">
                  {aboveAverageCategories.slice(0, 4).map(item => (
                    <div key={item.id} className="py-2 flex items-center justify-between gap-2 text-xs">
                      <div className="min-w-0">
                        <p className="font-medium text-primary truncate">{item.name}</p>
                        <p className="text-[11px] text-muted font-mono">
                          Média 3m: {formatMoney(item.avg3m)} → Atual: {formatMoney(item.currentSpent)}
                        </p>
                      </div>
                      <span className="font-mono text-[#EF4444] text-xs font-medium shrink-0">
                        +{item.pctAbove}%
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* 4. Alertas de Vencimentos Próximos e Atrasados */}
            <div className="bg-surface border border-subtle rounded-xl p-5 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium text-primary flex items-center gap-2">
                  <Clock className="w-4 h-4 stroke-[1.5] text-[#EF4444]" />
                  Vencimentos próximos (7 dias) e atrasos
                </span>
                <span className="text-xs font-mono px-2 py-0.5 rounded bg-raised text-secondary border border-subtle shrink-0">
                  {upcomingAlerts.length} {upcomingAlerts.length === 1 ? 'item' : 'itens'}
                </span>
              </div>

              {upcomingAlerts.length === 0 ? (
                <p className="text-xs text-secondary leading-relaxed">
                  Nenhuma conta atrasada ou vencendo nos próximos 7 dias neste workspace.
                </p>
              ) : (
                <div className="divide-y divide-subtle">
                  {upcomingAlerts.slice(0, 4).map(al => (
                    <div key={al.id} className="py-2 flex items-center justify-between gap-2 text-xs">
                      <div className="min-w-0">
                        <p className="font-medium text-primary truncate">{al.title}</p>
                        <p className="text-[11px] text-muted font-mono">
                          {al.date.split('-').reverse().join('/')} • {al.source}{' '}
                          {al.isOverdue && <span className="text-[#EF4444]">(Atrasada)</span>}
                        </p>
                      </div>
                      <span className="font-mono text-primary font-medium shrink-0 tabular-nums">
                        {formatMoney(al.amount)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: EXECUTIVE REPORTS (Parecer real com filtro de período + DRE PJ) */}
      {activeTab === 'REPORTS' && (
        <div className="bg-surface border border-subtle rounded-xl p-4 sm:p-6 space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-subtle pb-4">
            <div>
              <h3 className="text-[15px] font-medium text-primary">
                {isBusiness ? 'Parecer Executivo & DRE Gerencial PJ' : 'Demonstrativo Patrimonial Executivo'}
              </h3>
              <p className="text-xs text-muted mt-0.5">
                Recorte selecionado: {periodLabel} • Pronto para impressão ou exportação em PDF
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="inline-flex bg-canvas p-1 rounded-lg border border-subtle gap-1">
                {(['1M', '3M', '6M'] as const).map(p => (
                  <button
                    key={p}
                    onClick={() => setPeriodFilter(p)}
                    className={`h-7 px-2.5 rounded text-xs font-mono transition-colors ${
                      periodFilter === p
                        ? 'bg-raised text-primary font-medium'
                        : 'text-muted hover:text-primary'
                    }`}
                  >
                    {p}
                  </button>
                ))}
              </div>

              <button
                onClick={() => window.print()}
                className="h-9 flex items-center gap-1.5 px-3.5 bg-raised hover:bg-surface-hover border border-subtle text-xs font-medium text-primary rounded-lg transition-colors"
              >
                <Printer className="w-4 h-4 stroke-[1.5] text-secondary" />
                <span>Imprimir / PDF</span>
              </button>
            </div>
          </div>

          <div className="p-4 sm:p-5 bg-canvas border border-subtle rounded-xl font-mono text-xs leading-relaxed space-y-3 text-primary tabular-nums overflow-x-auto">
            <p className="font-medium text-sm text-primary pb-2 border-b border-subtle">
              Concect Finanças — Parecer Executivo ({periodLabel})
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <p className="text-secondary">Titular: <span className="text-primary">{user.name || user.email}</span></p>
              <p className="text-secondary">Perfil: <span className="text-primary">{isBusiness ? 'Empresarial PJ' : workspaceType === 'FAMILY' ? 'Familiar' : 'Pessoal'}</span></p>
              <p className="text-secondary">Saldo consolidado em contas: <span className="text-primary">{formatMoney(totalBalance)}</span></p>
              <p className="text-secondary">Taxa de economia / margem: <span className="text-[#10B981]">{periodSavingsRate.toFixed(1)}%</span></p>
              <p className="text-secondary">Entradas no período: <span className="text-[#10B981]">{formatMoney(periodIncome)}</span></p>
              <p className="text-secondary">Saídas no período: <span className="text-primary">{formatMoney(periodExpense)}</span></p>
              <p className="text-secondary">Resultado líquido: <span className={periodNet >= 0 ? 'text-[#10B981]' : 'text-[#EF4444]'}>{formatMoney(periodNet)}</span></p>
              <p className="text-secondary">Metas em acompanhamento: <span className="text-primary">{goals.length}</span></p>
            </div>

            {isBusiness && businessDre && (
              <div className="pt-3 mt-3 border-t border-subtle space-y-1.5">
                <p className="font-medium text-primary">Resumo DRE do Mês Atual ({currentMonthStr}):</p>
                <p className="text-secondary">(+) Receita Bruta: <span className="text-[#10B981]">{formatMoney(businessDre.grossRevenue)}</span></p>
                <p className="text-secondary">(-) Impostos e Deduções: <span className="text-[#EF4444]">-{formatMoney(businessDre.taxesAndDeductions)}</span></p>
                <p className="text-secondary">(=) Receita Líquida: <span className="text-primary">{formatMoney(businessDre.netRevenue)}</span></p>
                <p className="text-secondary">(-) Custos e Despesas Operacionais: <span className="text-primary">-{formatMoney(businessDre.operatingExpenses)}</span></p>
                <p className="text-secondary">(=) Lucro/Prejuízo Líquido: <span className={businessDre.netResult >= 0 ? 'text-[#10B981]' : 'text-[#EF4444]'}>{formatMoney(businessDre.netResult)} ({businessDre.netMarginPct.toFixed(1)}%)</span></p>
              </div>
            )}

            {topCategoriesInPeriod.length > 0 && (
              <div className="pt-3 mt-3 border-t border-subtle space-y-1.5">
                <p className="font-medium text-primary">Principais centros de custo ({periodLabel}):</p>
                {topCategoriesInPeriod.map((c, idx) => (
                  <p key={c.id} className="text-secondary">
                    {idx + 1}. {c.name}: <span className="text-primary">{formatMoney(c.amount)}</span> ({c.share}%)
                  </p>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
