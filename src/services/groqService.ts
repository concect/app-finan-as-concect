import {
  BankAccount,
  CreditCard,
  CreditCardInvoice,
  Category,
  Transaction,
  Goal,
  User,
  Reminder
} from '../types';

export const GROQ_CONFIG = {
  apiKey: (import.meta as any).env?.VITE_GROQ_API_KEY || "",
  endpoint: "https://api.groq.com/openai/v1/chat/completions",
  model: "llama-3.1-8b-instant"
};

export const STRICT_REFUSAL_MESSAGE =
  "Sou o assistente exclusivo do CONCECT FINANÇAS. Só posso ajudar com a gestão das suas finanças, lançamentos, metas e funcionalidades da plataforma.";

export const STRICT_SYSTEM_PROMPT = `Você é o CONCECT AI, o assistente e consultor financeiro oficial e exclusivo da plataforma CONCECT FINANÇAS.
REGRAS DE ESCOPO ABSOLUTAS E INQUEBRÁVEIS (GUARDRAILS):
1. ESCOPO EXCLUSIVO: Você SÓ pode responder perguntas e executar comandos relacionados a:
   - Finanças pessoais, familiares ou empresariais do usuário (gastos, receitas, saldos, cartões, faturas, metas, dívidas, orçamento, economia, planejamento e relatórios dentro da plataforma).
   - Lançamento, edição ou consulta de transações financeiras, lembretes de contas e metas.
   - Funcionalidades, uso, segurança e navegação do CONCECT FINANÇAS.
2. RECUSA DE ESCOPO EXTERNO (ZERO TOLERÂNCIA):
   - Se o usuário perguntar sobre QUALQUER assunto alheio (receitas culinárias, piadas, futebol, política, programação fora do contexto do app, conselhos amorosos, curiosidades gerais, redação escolar, etc.), você DEVE RECUSAR CATEGORICAMENTE e responder EXATAMENTE:
   '${STRICT_REFUSAL_MESSAGE}'
3. DADOS EM TEMPO REAL:
   - Baseie suas análises EXCLUSIVAMENTE nos dados financeiros reais injetados no contexto. Nunca invente valores fictícios.
4. FORMATO E TOM:
   - Tom executivo, objetivo, empático e de alto nível (padrão Private Banking).
   - Formate valores monetários rigorosamente em Real Brasileiro (R$ 1.250,50).
   - Use formatação Markdown (negrito, listas pontuadas) para clareza visual impecável.`;

export interface GroqChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface GroqActionPayload {
  type?: 'EXPENSE' | 'INCOME' | 'TRANSFER';
  amount?: number;
  description?: string;
  category_name?: string;
  category_id?: string;
  account_id?: string;
  card_id?: string;
  installments?: number;
  due_date?: string;
  goal_title?: string;
  goal_target?: number;
  reminder_title?: string;
  reminder_due_date?: string;
}

export interface GroqActionOption {
  label: string;
  actionPayload: any;
}

export interface GroqActionResponse {
  intent: 'CREATE_TRANSACTION' | 'CREATE_GOAL' | 'CREATE_REMINDER' | 'QUERY_DATA' | 'AMBIGUOUS_CONFIRMATION' | 'OUT_OF_SCOPE';
  reply_message: string;
  requires_confirmation: boolean;
  action_payload?: GroqActionPayload;
  options?: GroqActionOption[];
}

export class GroqService {
  public static getApiKey(): string {
    return localStorage.getItem('concect_custom_groq_api_key') || GROQ_CONFIG.apiKey;
  }

  public static setCustomApiKey(key: string): void {
    if (key.trim()) {
      localStorage.setItem('concect_custom_groq_api_key', key.trim());
    } else {
      localStorage.removeItem('concect_custom_groq_api_key');
    }
  }

  public static getActiveApiKey(): string {
    return this.getApiKey();
  }

  // 1. Injeção de Contexto Financeiro em Tempo Real (RAG Dinâmico)
  public static buildFinancialContext(
    user: User,
    accounts: BankAccount[],
    cards: CreditCard[],
    categories: Category[],
    transactions: Transaction[],
    goals: Goal[],
    invoices: CreditCardInvoice[] = [],
    reminders: Reminder[] = []
  ): string {
    const totalLiquid = accounts.reduce((acc, a) => acc + (a.current_balance || 0), 0);
    const totalCardLimit = cards.reduce((acc, c) => acc + (c.total_limit || 0), 0);
    const totalAvailableLimit = cards.reduce((acc, c) => acc + (c.available_limit || 0), 0);

    const now = new Date();
    const currentYearMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const todayStr = now.toISOString().slice(0, 10);

    // Current month transactions
    const monthTxs = transactions.filter(t => t.date && t.date.startsWith(currentYearMonth));
    const totalMonthIncome = monthTxs.filter(t => t.type === 'INCOME').reduce((a, b) => a + b.amount, 0);
    const totalMonthExpense = monthTxs.filter(t => t.type === 'EXPENSE').reduce((a, b) => a + b.amount, 0);

    // Month expenses by category
    const categoryTotals: Record<string, number> = {};
    for (const t of monthTxs.filter(t => t.type === 'EXPENSE')) {
      const cat = categories.find(c => c.id === t.category_id)?.name || 'Outras Despesas';
      categoryTotals[cat] = (categoryTotals[cat] || 0) + t.amount;
    }
    const categoryBreakdown = Object.entries(categoryTotals)
      .map(([cat, sum]) => `  • ${cat}: R$ ${sum.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`)
      .join('\n');

    // Due soon & Overdue accounts/bills
    const pendingBills = transactions
      .filter(t => t.type === 'EXPENSE' && t.status === 'PENDING')
      .slice(0, 8);
    const overdueBills = pendingBills.filter(t => t.date < todayStr);
    const upcomingBills = pendingBills.filter(t => t.date >= todayStr);

    // Active Goals & progress %
    const activeGoals = goals.map(g => {
      const pct = g.target_amount > 0 ? ((g.current_amount / g.target_amount) * 100).toFixed(1) : '0';
      return `  • ${g.title}: R$ ${g.current_amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} de R$ ${g.target_amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} (${pct}%) — Prazo: ${g.deadline}`;
    });

    // Last 20 transactions
    const last20Txs = transactions.slice(0, 20).map(t => {
      const cat = categories.find(c => c.id === t.category_id)?.name || 'Geral';
      const prefix = t.type === 'INCOME' ? '+' : t.type === 'EXPENSE' ? '-' : '⇄';
      const inst = t.installment_total ? ` (${t.installment_current || 1}/${t.installment_total}x)` : '';
      return `  • ${t.date}: ${t.description}${inst} [${cat}] ${prefix}R$ ${t.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} (${t.status})`;
    });

    return `
================ CONTEXTO FINANCEIRO EM TEMPO REAL DO USUÁRIO ================
Usuário: ${user.name || user.email} (ID: ${user.id})
Data Atual: ${todayStr} (Mês: ${currentYearMonth})

1. SALDOS & CONTAS BANCÁRIAS:
- Saldo Líquido Consolidado: R$ ${totalLiquid.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
${accounts.map(a => `  • Conta ${a.name} (${a.type}): R$ ${(a.current_balance || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`).join('\n') || '  (Nenhuma conta cadastrada)'}

2. CARTÕES DE CRÉDITO & LIMITES:
- Limite Total Consolidado: R$ ${totalCardLimit.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
- Limite Disponível Consolidado: R$ ${totalAvailableLimit.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
${cards.map(c => `  • ${c.name} (${c.brand}): Limite R$ ${c.total_limit.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}, Disponível R$ ${c.available_limit.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}, Fecha dia ${c.closing_day}, Vence dia ${c.due_day}`).join('\n') || '  (Nenhum cartão cadastrado)'}

3. RECEITAS & DESPESAS DO MÊS (${currentYearMonth}):
- Receitas Totais: R$ ${totalMonthIncome.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
- Despesas Totais: R$ ${totalMonthExpense.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
- Saldo Operacional do Mês: R$ ${(totalMonthIncome - totalMonthExpense).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
- Despesas por Categoria neste Mês:
${categoryBreakdown || '  (Nenhuma despesa no mês atual)'}

4. CONTAS ATRASADAS & PRÓXIMAS DO VENCIMENTO:
- Contas Atrasadas: ${overdueBills.length}
${overdueBills.map(b => `  • [ATRASADA] ${b.date}: ${b.description} — R$ ${b.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`).join('\n') || '  (Nenhuma conta atrasada)'}
- Próximos Vencimentos: ${upcomingBills.length}
${upcomingBills.map(b => `  • [A VENCER] ${b.date}: ${b.description} — R$ ${b.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`).join('\n') || '  (Nenhum vencimento próximo)'}

5. METAS ATIVAS & PROGRESSO:
${activeGoals.join('\n') || '  (Nenhuma meta ativa cadastrada)'}

6. ÚLTIMAS 20 TRANSAÇÕES REGISTRADAS NO FIRESTORE:
${last20Txs.join('\n') || '  (Nenhuma transação registrada ainda)'}
==============================================================================
`;
  }

  // 2. Client-Side Guardrail Pre-Check
  private static isBlatantlyOutOfScope(text: string): boolean {
    const lower = text.toLowerCase().trim();
    const bannedTopics = [
      'receita de bolo',
      'bolo de',
      'como cozinhar',
      'piada',
      'conte uma piada',
      'quem é o presidente',
      'política',
      'politica',
      'futebol',
      'quem ganhou a copa',
      'campeonato brasileiro',
      'escreva um poema',
      'poema',
      'poesia',
      'letra de música',
      'conselho amoroso',
      'como namorar',
      'programação python',
      'crie um script python',
      'quicksort',
      'resolva este exercicio',
      'redação escolar',
      'signo do zodíaco',
      'horóscopo'
    ];

    for (const topic of bannedTopics) {
      if (lower.includes(topic)) return true;
    }
    return false;
  }

  // 3. Motor de Ação e Diálogo Blindado (Groq LLaMA 3.3 70B com JSON Estruturado)
  public static async processAiAction(
    userInput: string,
    history: { sender: 'USER' | 'AI'; text: string }[],
    user: User,
    accounts: BankAccount[],
    cards: CreditCard[],
    categories: Category[],
    transactions: Transaction[],
    goals: Goal[],
    invoices: CreditCardInvoice[] = [],
    reminders: Reminder[] = [],
    isWhatsAppChannel: boolean = false
  ): Promise<GroqActionResponse> {
    const rawInput = userInput.trim();
    const lower = rawInput.toLowerCase();

    // Check pre-filter guardrail
    if (this.isBlatantlyOutOfScope(rawInput)) {
      return {
        intent: 'OUT_OF_SCOPE',
        reply_message: STRICT_REFUSAL_MESSAGE,
        requires_confirmation: false
      };
    }

    // Regra de Desambiguação de Cartão Obrigatória
    // Se o usuário disser "comprei no cartão de 3x 150 reais" e tiver mais de 1 cartão cadastrado sem especificar qual
    const mentionsGenericCard =
      lower.includes('no cartão') ||
      lower.includes('no cartao') ||
      lower.includes('no crédito') ||
      lower.includes('no credito') ||
      lower.includes('no debito') ||
      lower.includes('no débito');

    const specifiedCard = cards.some(
      c => lower.includes(c.name.toLowerCase()) || lower.includes(c.brand.toLowerCase())
    );

    if (mentionsGenericCard && !specifiedCard && cards.length > 1) {
      // Extrair valor e parcelas
      const amountMatch = rawInput.match(/(\d+[\.,]?\d*)/);
      const parsedVal = amountMatch ? parseFloat(amountMatch[1].replace(',', '.')) : 100;
      const installmentMatch = rawInput.match(/(\d+)\s*[xX]/);
      const instCount = installmentMatch ? parseInt(installmentMatch[1], 10) : 1;

      const options: GroqActionOption[] = [];
      for (const card of cards.slice(0, 3)) {
        options.push({
          label: `${card.name} (${instCount > 1 ? `${instCount}x` : 'À vista'})`,
          actionPayload: {
            card_id: card.id,
            installments: instCount,
            amount: parsedVal,
            description: 'Compra no Cartão'
          }
        });
      }

      return {
        intent: 'AMBIGUOUS_CONFIRMATION',
        requires_confirmation: true,
        reply_message: isWhatsAppChannel
          ? `⚠️ *Confirmação Necessária*\n\nIdentifiquei a compra de *R$ ${parsedVal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}* (${instCount > 1 ? `${instCount}x` : 'À vista'}).\n\nComo você possui múltiplos cartões cadastrados (${cards.map(c => `*${c.name}*`).join(', ')}), qual deles você deseja utilizar?`
          : `Identifiquei uma despesa com cartão de crédito de R$ ${parsedVal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}. Por favor, confirme qual dos seus ${cards.length} cartões foi utilizado:`,
        options
      };
    }

    const apiKey = this.getApiKey();
    if (!apiKey) {
      return {
        intent: 'QUERY_DATA',
        requires_confirmation: false,
        reply_message: isWhatsAppChannel
          ? '⚠️ *Chave Groq não configurada.* Defina `VITE_GROQ_API_KEY` no arquivo `.env` ou informe sua chave em *Configurações*.'
          : 'Chave de API Groq não configurada. Defina `VITE_GROQ_API_KEY` no `.env` ou salve uma chave pessoal em **Configurações → Chave de API do motor analítico**.'
      };
    }
    const financialContext = this.buildFinancialContext(
      user,
      accounts,
      cards,
      categories,
      transactions,
      goals,
      invoices,
      reminders
    );

    const fullSystemInstruction = `${STRICT_SYSTEM_PROMPT}

CATEGORIAS DISPONÍVEIS NO FIRESTORE:
${categories.map(c => `- "${c.name}" (ID: ${c.id}, Tipo: ${c.type})`).join('\n')}

CONTAS DISPONÍVEIS:
${accounts.map(a => `- "${a.name}" (ID: ${a.id})`).join('\n')}

CARTÕES DISPONÍVEIS:
${cards.map(c => `- "${c.name}" (ID: ${c.id})`).join('\n')}

${financialContext}

MISSÃO DE RESPOSTA E AÇÃO:
Você deve SEMPRE retornar um objeto JSON estrito com o formato exato:
{
  "intent": "CREATE_TRANSACTION" | "CREATE_GOAL" | "CREATE_REMINDER" | "QUERY_DATA" | "AMBIGUOUS_CONFIRMATION" | "OUT_OF_SCOPE",
  "reply_message": "Texto elegante formatado para o usuário (${isWhatsAppChannel ? 'estilo WhatsApp com emojis e negrito' : 'estilo Consultor Executivo Private Banking'})",
  "requires_confirmation": boolean,
  "action_payload": {
    "type": "EXPENSE" | "INCOME" | "TRANSFER",
    "amount": number,
    "description": "string",
    "category_name": "string",
    "category_id": "string",
    "account_id": "string ou null",
    "card_id": "string ou null",
    "installments": number,
    "due_date": "YYYY-MM-DD",
    "goal_title": "string ou null",
    "goal_target": number ou null,
    "reminder_title": "string ou null",
    "reminder_due_date": "YYYY-MM-DD ou null"
  }
}

REGRAS RÍGIDAS DE JSON:
1. Se a pergunta for fora de escopo financeiro, defina "intent": "OUT_OF_SCOPE", "requires_confirmation": false e "reply_message": "${STRICT_REFUSAL_MESSAGE}".
2. Se o usuário estiver registrando gasto/receita claro, defina "intent": "CREATE_TRANSACTION", "requires_confirmation": false, preencha "action_payload" com valor, descrição e ids corretos.
3. Se o usuário estiver pedindo uma meta, defina "intent": "CREATE_GOAL".
4. Se o usuário pedir um lembrete/aviso de conta, defina "intent": "CREATE_REMINDER".
5. Se for apenas consulta ("quanto tenho?", "quanto gastei?", "qual o maior gasto?"), defina "intent": "QUERY_DATA".
6. Retorne APENAS o JSON. Sem blocos markdown \`\`\`json.`;

    const messages: GroqChatMessage[] = [
      { role: 'system', content: fullSystemInstruction }
    ];

    for (const h of history.slice(-4)) {
      messages.push({
        role: h.sender === 'USER' ? 'user' : 'assistant',
        content: h.text
      });
    }

    messages.push({ role: 'user', content: rawInput });

    try {
      let response: Response | null = null;
      const candidateModels = [
        "openai/gpt-oss-120b",
        "openai/gpt-oss-20b",
        "qwen/qwen3.8-27b",
        "qwen-2.5-32b",
        "llama-3.1-8b-instant"
      ];

      for (const m of candidateModels) {
        try {
          response = await fetch(GROQ_CONFIG.endpoint, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${apiKey}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              model: m,
              messages,
              temperature: 0.1, // High precision
              response_format: { type: 'json_object' }
            })
          });

          if (response.ok) break;
        } catch (e) {
          // Tenta o próximo
        }
      }

      if (!response || !response.ok) {
        const errorData = await response?.json().catch(() => null);
        console.error('Groq API Error:', errorData);
        throw new Error(errorData?.error?.message || `Status HTTP ${response?.status}`);
      }

      const data = await response.json();
      const rawContent = data.choices?.[0]?.message?.content || '{}';
      const parsed: GroqActionResponse = JSON.parse(rawContent);

      // Enforce post-guardrail check
      if (parsed.intent === 'OUT_OF_SCOPE' || this.isBlatantlyOutOfScope(rawInput)) {
        return {
          intent: 'OUT_OF_SCOPE',
          reply_message: STRICT_REFUSAL_MESSAGE,
          requires_confirmation: false
        };
      }

      // Link category_id if missing but category_name is present
      if (parsed.action_payload && !parsed.action_payload.category_id && parsed.action_payload.category_name) {
        const matched = categories.find(
          c => c.name.toLowerCase() === parsed.action_payload?.category_name?.toLowerCase()
        );
        if (matched) {
          parsed.action_payload.category_id = matched.id;
        }
      }

      return parsed;
    } catch (err: any) {
      console.error('Groq processing error:', err);
      // Fallback response preserving security
      if (this.isBlatantlyOutOfScope(rawInput)) {
        return {
          intent: 'OUT_OF_SCOPE',
          reply_message: STRICT_REFUSAL_MESSAGE,
          requires_confirmation: false
        };
      }

      return {
        intent: 'QUERY_DATA',
        requires_confirmation: false,
        reply_message: isWhatsAppChannel
          ? `⚠️ *CONCECT AI Informa*\n\nNão foi possível processar a mensagem via Groq (${err.message || 'Erro de conexão'}). Seus dados no Firestore permanecem seguros.`
          : `⚠️ **CONCECT AI Informa:** Ocorreu uma oscilação na conexão com o modelo de IA (${err.message || 'Verifique sua conexão ou chave da Groq'}). Seus dados continuam seguros e sincronizados no Firestore.`
      };
    }
  }

  // 4. Backward Compatibility wrapper for Consultor AI
  public static async queryConsultant(
    prompt: string,
    history: { sender: 'USER' | 'AI'; text: string }[],
    user: User,
    accounts: BankAccount[],
    cards: CreditCard[],
    categories: Category[],
    transactions: Transaction[],
    goals: Goal[],
    invoices: CreditCardInvoice[] = [],
    reminders: Reminder[] = []
  ): Promise<string> {
    const result = await this.processAiAction(
      prompt,
      history,
      user,
      accounts,
      cards,
      categories,
      transactions,
      goals,
      invoices,
      reminders,
      false
    );
    return result.reply_message;
  }

  // 5. Backward Compatibility wrapper for WhatsApp Simulator
  public static async parseWhatsAppMessage(
    rawMessage: string,
    user: User,
    accounts: BankAccount[],
    cards: CreditCard[],
    categories: Category[],
    transactions: Transaction[] = [],
    goals: Goal[] = [],
    invoices: CreditCardInvoice[] = [],
    reminders: Reminder[] = []
  ): Promise<{
    intent: 'ADD_EXPENSE' | 'ADD_INCOME' | 'CREATE_GOAL' | 'CREATE_REMINDER' | 'QUERY_BALANCE' | 'QUERY_EXPENSES' | 'QUERY_DUE' | 'OUT_OF_SCOPE' | 'UNKNOWN';
    amount?: number;
    description?: string;
    categoryId?: string;
    cardId?: string;
    accountId?: string;
    installments?: number;
    requiresConfirmation?: boolean;
    confirmationPrompt?: string;
    options?: GroqActionOption[];
    replyText?: string;
    actionPayload?: GroqActionPayload;
  }> {
    const actionResult = await this.processAiAction(
      rawMessage,
      [],
      user,
      accounts,
      cards,
      categories,
      transactions,
      goals,
      invoices,
      reminders,
      true
    );

    if (actionResult.intent === 'OUT_OF_SCOPE') {
      return {
        intent: 'OUT_OF_SCOPE',
        replyText: STRICT_REFUSAL_MESSAGE,
        requiresConfirmation: false
      };
    }

    if (actionResult.intent === 'AMBIGUOUS_CONFIRMATION') {
      return {
        intent: 'ADD_EXPENSE',
        requiresConfirmation: true,
        confirmationPrompt: actionResult.reply_message,
        options: actionResult.options,
        replyText: actionResult.reply_message
      };
    }

    const payload = actionResult.action_payload;
    let mappedIntent: any = 'UNKNOWN';
    if (actionResult.intent === 'CREATE_TRANSACTION') {
      mappedIntent = payload?.type === 'INCOME' ? 'ADD_INCOME' : 'ADD_EXPENSE';
    } else if (actionResult.intent === 'CREATE_GOAL') {
      mappedIntent = 'CREATE_GOAL';
    } else if (actionResult.intent === 'CREATE_REMINDER') {
      mappedIntent = 'CREATE_REMINDER';
    } else if (actionResult.intent === 'QUERY_DATA') {
      mappedIntent = 'QUERY_BALANCE';
    }

    return {
      intent: mappedIntent,
      amount: payload?.amount,
      description: payload?.description,
      categoryId: payload?.category_id || (payload?.type === 'INCOME' ? categories.find(c => c.type === 'INCOME')?.id : categories.find(c => c.type === 'EXPENSE')?.id),
      cardId: payload?.card_id,
      accountId: payload?.account_id || accounts[0]?.id,
      installments: payload?.installments || 1,
      requiresConfirmation: actionResult.requires_confirmation,
      replyText: actionResult.reply_message,
      actionPayload: payload
    };
  }
}
