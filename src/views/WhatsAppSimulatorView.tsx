import React, { useState, useRef, useEffect } from 'react';
import {
  Send,
  CheckCheck,
  Smartphone,
  QrCode,
  ShieldCheck,
  ExternalLink,
  Mic,
  CheckCircle2,
  Radio
} from 'lucide-react';
import {
  WhatsAppLog,
  WhatsAppMessageOption,
  User,
  BankAccount,
  CreditCard,
  Category,
  Transaction,
  Goal,
  Reminder,
  WhatsAppSystemStatus,
  ChatMessageRecord
} from '../types';
import { FirestoreService } from '../services/firestoreService';
import { GroqService } from '../services/groqService';
import { useFeedback } from '../contexts/FeedbackContext';

interface WhatsAppSimulatorViewProps {
  user: User;
  activeWorkspaceId?: string;
  accounts: BankAccount[];
  cards: CreditCard[];
  categories: Category[];
  transactions?: Transaction[];
  goals?: Goal[];
  reminders?: Reminder[];
  whatsappLogs: WhatsAppLog[];
  onRefreshData: () => void;
}

const BOT_OFFICIAL = {
  display: '+55 62 9437-2561',
  canonical: '556294372561',
  with9: '5562994372561',
  waLink: 'https://wa.me/556294372561?text=Ol%C3%A1%20Concect%20Finan%C3%A7as%2C%20quero%20consultar%20meu%20saldo'
};

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

export const WhatsAppSimulatorView: React.FC<WhatsAppSimulatorViewProps> = ({
  user,
  activeWorkspaceId = 'ws_personal',
  accounts,
  cards,
  categories,
  transactions = [],
  goals = [],
  reminders = [],
  whatsappLogs,
  onRefreshData
}) => {
  const { showToast, confirm } = useFeedback();

  const [phoneNumberInput, setPhoneNumberInput] = useState(user.whatsapp_number || '');
  const [isLinking, setIsLinking] = useState(false);
  const [isEditingPhone, setIsEditingPhone] = useState(!user.whatsapp_connected && !user.whatsapp_number);

  const [systemStatus, setSystemStatus] = useState<WhatsAppSystemStatus>({
    status: 'DISCONNECTED',
    botNumber: BOT_OFFICIAL.canonical,
    qr: null
  });

  const [mirroredChat, setMirroredChat] = useState<ChatMessageRecord[]>([]);

  const [inputText, setInputText] = useState('');
  const [activePendingState, setActivePendingState] = useState<any | null>(null);
  const [isTyping, setIsTyping] = useState(false);
  const [activeTab, setActiveTab] = useState<'CHAT' | 'MIRROR'>('CHAT');

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [whatsappLogs, mirroredChat, isTyping, activeTab]);

  useEffect(() => {
    const unsub = FirestoreService.subscribeSystemWhatsAppStatus(status => {
      if (status && status.status) {
        setSystemStatus(status);
      }
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    let active = true;
    const checkLocalServer = async () => {
      try {
        const res = await fetch('http://localhost:3001/api/whatsapp/status');
        if (res.ok && active) {
          const data = await res.json();
          if (data && data.status) {
            setSystemStatus(data);
          }
        }
      } catch (e) {
        // Backend offline
      }
    };

    checkLocalServer();
    const interval = setInterval(checkLocalServer, 2500);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    const unsub = FirestoreService.subscribeChatHistory(user.id, 'WHATSAPP', msgs => {
      setMirroredChat(msgs);
    });
    return () => unsub();
  }, [user.id]);

  const handleLinkWhatsApp = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = phoneNumberInput.replace(/\D/g, '');
    if (clean.length < 10) {
      showToast({
        type: 'warning',
        title: 'Número inválido',
        message: 'Informe o DDD e número com pelo menos 10 dígitos'
      });
      return;
    }

    setIsLinking(true);
    try {
      const res = await FirestoreService.linkUserWhatsApp(user.id, phoneNumberInput);
      setIsEditingPhone(false);
      showToast({
        type: 'success',
        title: 'WhatsApp vinculado',
        message: `Número ${res.cleanNumber} associado à sua carteira`
      });
      onRefreshData();
    } catch (err: any) {
      console.error(err);
      showToast({
        type: 'error',
        title: 'Erro ao vincular',
        message: 'Não foi possível salvar o número'
      });
    } finally {
      setIsLinking(false);
    }
  };

  const handleUnlink = async () => {
    const confirmed = await confirm({
      title: 'Desvincular WhatsApp',
      description: 'Deseja remover o vínculo do seu número? Os lançamentos via áudio e texto ficarão pausados até novo vínculo.',
      confirmText: 'Desvincular',
      cancelText: 'Cancelar',
      variant: 'warning'
    });

    if (confirmed) {
      await FirestoreService.unlinkUserWhatsApp(user.id);
      setIsEditingPhone(true);
      showToast({
        type: 'info',
        title: 'Vínculo removido',
        message: 'Você pode associar um novo número a qualquer momento'
      });
      onRefreshData();
    }
  };

  const handleSendMessage = async (textToSend?: string) => {
    const text = (textToSend || inputText).trim();
    if (!text || isTyping) return;

    const timeStr = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    await FirestoreService.addWhatsAppLog(user.id, {
      user_id: user.id,
      sender: 'USER',
      message: text,
      timestamp: timeStr
    });
    await FirestoreService.saveChatMessage(user.id, {
      channel: 'WHATSAPP',
      source: 'WHATSAPP',
      sender: 'USER',
      text,
      timestamp: new Date().toISOString()
    });

    setInputText('');
    setIsTyping(true);

    try {
      const parseResult = await GroqService.parseWhatsAppMessage(
        text,
        user,
        accounts,
        cards,
        categories,
        transactions,
        goals,
        [],
        reminders
      );

      setIsTyping(false);

      if (parseResult.requiresConfirmation && parseResult.options) {
        await FirestoreService.addWhatsAppLog(user.id, {
          user_id: user.id,
          sender: 'AGENT',
          message: parseResult.replyText || 'Selecione uma opção abaixo para confirmar:',
          timestamp: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
          requires_confirmation: true,
          options: parseResult.options
        });
        setActivePendingState({
          ...parseResult.actionPayload,
          categoryId: parseResult.categoryId,
          requires_confirmation: true,
          options: parseResult.options
        });
        return;
      }

      if (parseResult.intent === 'ADD_EXPENSE' && parseResult.amount) {
        await FirestoreService.addTransaction(user.id, {
          workspace_id: activeWorkspaceId,
          account_id: parseResult.accountId,
          card_id: parseResult.cardId,
          category_id: parseResult.categoryId || categories.find(c => c.type === 'EXPENSE')?.id || 'cat_expense',
          type: 'EXPENSE',
          amount: parseResult.amount,
          description: parseResult.description || 'Despesa via WhatsApp',
          date: new Date().toISOString().slice(0, 10),
          status: 'PAID',
          is_recurring: false,
          installment_current: parseResult.installments && parseResult.installments > 1 ? 1 : undefined,
          installment_total: parseResult.installments && parseResult.installments > 1 ? parseResult.installments : undefined,
          source: 'WHATSAPP'
        }, accounts, cards);
      } else if (parseResult.intent === 'ADD_INCOME' && parseResult.amount) {
        await FirestoreService.addTransaction(user.id, {
          workspace_id: activeWorkspaceId,
          account_id: parseResult.accountId || accounts[0]?.id,
          category_id: parseResult.categoryId || categories.find(c => c.type === 'INCOME')?.id || 'cat_income',
          type: 'INCOME',
          amount: parseResult.amount,
          description: parseResult.description || 'Receita via WhatsApp',
          date: new Date().toISOString().slice(0, 10),
          status: 'PAID',
          is_recurring: false,
          source: 'WHATSAPP'
        }, accounts, cards);
      }

      const replyMessage = parseResult.replyText || 'Lançamento processado na carteira.';
      await FirestoreService.addWhatsAppLog(user.id, {
        user_id: user.id,
        sender: 'AGENT',
        message: replyMessage,
        timestamp: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
      });
      await FirestoreService.saveChatMessage(user.id, {
        channel: 'WHATSAPP',
        source: 'WHATSAPP',
        sender: 'AI',
        text: replyMessage,
        timestamp: new Date().toISOString(),
        intent: parseResult.intent,
        action_payload: parseResult.actionPayload
      });

      onRefreshData();
    } catch (err) {
      console.error(err);
      setIsTyping(false);
    }
  };

  const handleOptionClick = async (option: WhatsAppMessageOption) => {
    if (!activePendingState) return;
    const payload = option.actionPayload;

    await FirestoreService.addWhatsAppLog(user.id, {
      user_id: user.id,
      sender: 'USER',
      message: option.label,
      timestamp: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    });

    setIsTyping(true);

    try {
      const card = cards.find(c => c.id === payload.card_id);
      const amount = payload.amount || activePendingState.amount || 100;
      const installments = payload.installments || 1;
      const fmtVal = amount.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      const fmtInst = (amount / installments).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

      await FirestoreService.addTransaction(user.id, {
        workspace_id: activeWorkspaceId,
        card_id: payload.card_id,
        category_id: activePendingState.categoryId || categories.find(c => c.type === 'EXPENSE')?.id || 'cat_expense',
        type: 'EXPENSE',
        amount,
        description: activePendingState.description || 'Compra no cartão',
        date: new Date().toISOString().slice(0, 10),
        status: 'PAID',
        is_recurring: false,
        installment_current: installments > 1 ? 1 : undefined,
        installment_total: installments > 1 ? installments : undefined,
        source: 'WHATSAPP'
      }, accounts, cards);

      setIsTyping(false);
      setActivePendingState(null);

      const reply = `Lançamento confirmado\n\nItem: ${activePendingState.description}\nValor: R$ ${fmtVal}\nCartão: ${card?.name || 'Cartão selecionado'}\nCondição: ${installments > 1 ? `${installments}x de R$ ${fmtInst}` : 'À vista'}`;

      await FirestoreService.addWhatsAppLog(user.id, {
        user_id: user.id,
        sender: 'AGENT',
        message: reply,
        timestamp: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
      });

      onRefreshData();
    } catch (e) {
      console.error(e);
      setIsTyping(false);
    }
  };

  return (
    <div className="space-y-6 min-w-0">
      {/* BLOCO 1: NÚMERO OFICIAL & VÍNCULO DO USUÁRIO */}
      <div className="bg-surface border border-subtle rounded-xl p-4 sm:p-6 space-y-5 min-w-0">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-subtle gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-lg bg-raised text-secondary border border-subtle flex items-center justify-center shrink-0">
              <Smartphone className="w-4 h-4 stroke-[1.5]" />
            </div>
            <div className="min-w-0">
              <span className="text-xs text-secondary block truncate">Canal transacional WhatsApp</span>
              <h2 className="text-base font-medium text-primary font-mono tracking-tight flex items-center gap-2 mt-0.5 truncate">
                {BOT_OFFICIAL.display}
              </h2>
            </div>
          </div>

          <a
            href={BOT_OFFICIAL.waLink}
            target="_blank"
            rel="noopener noreferrer"
            className="h-9 flex items-center justify-center gap-2 px-4 bg-primary hover:opacity-90 text-canvas font-medium text-xs rounded-lg transition-opacity shrink-0"
          >
            <span>Abrir no WhatsApp</span>
            <ExternalLink className="w-3.5 h-3.5 stroke-[1.5]" />
          </a>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 min-w-0">
          <div className="lg:col-span-2 space-y-2 min-w-0">
            <h3 className="text-sm font-medium text-primary">Número vinculado à carteira</h3>
            <p className="text-xs text-muted leading-relaxed">
              Associe seu número com DDD para registrar despesas, receitas e consultar saldos por texto ou áudio.
            </p>

            {user.whatsapp_connected && !isEditingPhone ? (
              <div className="flex flex-wrap items-center gap-3 pt-2">
                <span className="inline-flex items-center gap-1.5 px-3 h-8 rounded-lg bg-raised border border-subtle text-xs font-mono text-primary">
                  <CheckCircle2 className="w-3.5 h-3.5 stroke-[1.5] text-[#10B981]" />
                  {user.whatsapp_number}
                </span>

                <button
                  type="button"
                  onClick={() => setIsEditingPhone(true)}
                  className="text-xs text-secondary hover:text-primary transition-colors"
                >
                  Alterar número
                </button>

                <button
                  type="button"
                  onClick={handleUnlink}
                  className="text-xs text-[#EF4444] hover:underline transition-colors"
                >
                  Desvincular
                </button>
              </div>
            ) : (
              <form onSubmit={handleLinkWhatsApp} className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 pt-2">
                <input
                  type="text"
                  placeholder="(62) 99437-2561"
                  value={phoneNumberInput}
                  onChange={e => setPhoneNumberInput(e.target.value)}
                  className="h-9 bg-canvas border border-subtle focus:border-[#10B981] rounded-lg px-3 text-xs text-primary outline-none transition-colors w-full sm:w-56 font-mono"
                  disabled={isLinking}
                />
                <button
                  type="submit"
                  disabled={isLinking}
                  className="h-9 px-4 bg-raised hover:bg-surface-hover text-primary border border-subtle rounded-lg text-xs font-medium transition-colors disabled:opacity-50"
                >
                  {isLinking ? 'Salvando...' : 'Vincular número'}
                </button>
                {user.whatsapp_connected && (
                  <button
                    type="button"
                    onClick={() => setIsEditingPhone(false)}
                    className="text-xs text-muted hover:text-primary py-1"
                  >
                    Cancelar
                  </button>
                )}
              </form>
            )}
          </div>

          {/* Bot Realtime Health Mini-Card */}
          <div className="bg-canvas border border-subtle rounded-xl p-4 flex flex-col justify-between min-w-0">
            <div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs text-muted truncate">Conexão do serviço</span>
                <span
                  className={`inline-flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded-md shrink-0 ${
                    systemStatus.status === 'CONNECTED'
                      ? 'bg-[#10B981]/10 text-[#10B981] border border-[#10B981]/25'
                      : systemStatus.status === 'WAITING_QR'
                      ? 'bg-[#D97706]/10 text-[#D97706] border border-[#D97706]/25'
                      : 'bg-raised text-muted border border-subtle'
                  }`}
                >
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${
                      systemStatus.status === 'CONNECTED' ? 'bg-[#10B981]' : 'bg-current'
                    }`}
                  />
                  {systemStatus.status === 'CONNECTED'
                    ? 'Conectado'
                    : systemStatus.status === 'WAITING_QR'
                    ? 'Aguardando leitura'
                    : 'Offline'}
                </span>
              </div>
              <p className="text-xs text-secondary mt-2 leading-relaxed">
                {systemStatus.status === 'CONNECTED'
                  ? 'Recebendo comandos por texto e voz no número oficial.'
                  : systemStatus.status === 'WAITING_QR'
                  ? 'Escaneie o código abaixo com o aparelho do bot.'
                  : 'Execute npm run whatsapp no terminal para iniciar o serviço.'}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* BLOCO 2: PAINEL DE PAREAMENTO VIA QR CODE */}
      {systemStatus.status !== 'CONNECTED' && (
        <div className="bg-surface border border-subtle rounded-xl p-4 sm:p-6 min-w-0">
          <div className="flex items-center gap-2.5 mb-4">
            <QrCode className="w-4 h-4 stroke-[1.5] text-secondary shrink-0" />
            <h3 className="text-sm font-medium text-primary truncate">
              Pareamento do serviço ({BOT_OFFICIAL.display})
            </h3>
          </div>

          {systemStatus.status === 'WAITING_QR' && (systemStatus as any).qrDataUrl ? (
            <div className="flex flex-col md:flex-row items-center gap-6 p-4 sm:p-5 bg-canvas border border-subtle rounded-xl">
              <div className="bg-white p-3 rounded-xl border border-subtle shrink-0">
                <img
                  src={(systemStatus as any).qrDataUrl}
                  alt="QR Code WhatsApp"
                  className="w-44 h-44 block"
                />
              </div>

              <div className="space-y-2.5 min-w-0">
                <span className="inline-flex items-center gap-1.5 text-xs font-medium text-[#D97706] px-2.5 py-0.5 rounded-md bg-[#D97706]/10 border border-[#D97706]/25">
                  Aguardando leitura do QR Code
                </span>
                <h4 className="text-sm font-medium text-primary">Instruções de conexão</h4>
                <ol className="text-xs text-secondary space-y-1.5 list-decimal list-inside leading-relaxed">
                  <li>Abra o WhatsApp no aparelho com a linha <span className="text-primary font-mono">{BOT_OFFICIAL.display}</span></li>
                  <li>Acesse <span className="text-primary">Configurações &gt; Aparelhos conectados</span></li>
                  <li>Selecione <span className="text-primary">Conectar um aparelho</span> e aponte a câmera</li>
                </ol>
              </div>
            </div>
          ) : (
            <div className="p-4 bg-canvas border border-subtle rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="min-w-0">
                <p className="text-xs font-medium text-primary">Serviço desconectado</p>
                <p className="text-xs text-muted mt-0.5">
                  Inicie o processo no terminal para habilitar o atendimento automático
                </p>
              </div>
              <div className="bg-surface border border-subtle px-3 py-1.5 rounded-lg text-xs font-mono text-primary self-start sm:self-auto shrink-0">
                npm run whatsapp
              </div>
            </div>
          )}
        </div>
      )}

      {/* BLOCO 3: ESPELHAMENTO & SIMULADOR (Mobile-safe 2-col grid on <640px) */}
      <div className="flex items-center justify-between min-w-0">
        <div className="w-full sm:w-auto grid grid-cols-2 sm:flex bg-surface p-1 rounded-lg border border-subtle gap-1">
          <button
            onClick={() => setActiveTab('CHAT')}
            className={`h-8 px-2.5 sm:px-3 rounded-md text-xs font-medium transition-colors flex items-center justify-center gap-1.5 min-w-0 ${
              activeTab === 'CHAT'
                ? 'bg-raised text-primary'
                : 'text-muted hover:text-primary'
            }`}
          >
            <Smartphone className="w-3.5 h-3.5 stroke-[1.5] shrink-0" />
            <span className="truncate">Simulador</span>
          </button>
          <button
            onClick={() => setActiveTab('MIRROR')}
            className={`h-8 px-2.5 sm:px-3 rounded-md text-xs font-medium transition-colors flex items-center justify-center gap-1.5 min-w-0 ${
              activeTab === 'MIRROR'
                ? 'bg-raised text-primary'
                : 'text-muted hover:text-primary'
            }`}
          >
            <Radio className="w-3.5 h-3.5 stroke-[1.5] shrink-0" />
            <span className="truncate">Histórico ({mirroredChat.length})</span>
          </button>
        </div>
      </div>

      {/* ABA 1: SIMULADOR INTERATIVO */}
      {activeTab === 'CHAT' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 min-w-0">
          <div className="lg:col-span-2 bg-surface border border-subtle rounded-xl overflow-hidden flex flex-col h-[540px] sm:h-[560px] min-w-0">
            {/* Header */}
            <div className="bg-deep px-4 h-14 flex items-center justify-between border-b border-subtle">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-8 h-8 rounded-md bg-raised border border-subtle flex items-center justify-center text-[#10B981] font-mono font-medium text-xs shrink-0">
                  CF
                </div>
                <div className="min-w-0">
                  <h3 className="text-xs font-medium text-primary flex items-center gap-1.5 truncate">
                    <span className="truncate">Assistente Concect</span>
                    <ShieldCheck className="w-3.5 h-3.5 stroke-[1.5] text-[#10B981] shrink-0" />
                  </h3>
                  <p className="text-[11px] font-mono text-muted truncate">
                    {isTyping ? 'Processando...' : BOT_OFFICIAL.display}
                  </p>
                </div>
              </div>
            </div>

            {/* Messages Area */}
            <div className="flex-1 p-3 sm:p-5 overflow-y-auto space-y-3 bg-canvas scrollbar-thin">
              {whatsappLogs.length === 0 ? (
                <div className="text-center py-16 text-muted text-xs px-4">
                  Nenhum comando enviado nesta sessão. Experimente &quot;Gastei 50 no almoço&quot; ou &quot;Quanto tenho em contas?&quot;
                </div>
              ) : (
                [...whatsappLogs]
                  .sort((a, b) => {
                    const tA = FirestoreService.parseTimeMillis(a);
                    const tB = FirestoreService.parseTimeMillis(b);
                    if (tA !== tB) return tA - tB;
                    const isAUser = a.sender === 'USER';
                    const isBUser = b.sender === 'USER';
                    if (isAUser && !isBUser) return -1;
                    if (!isAUser && isBUser) return 1;
                    return 0;
                  })
                  .map(msg => (
                    <div
                      key={msg.id}
                      className={`flex flex-col ${
                        msg.sender === 'USER' ? 'items-end' : 'items-start'
                      }`}
                    >
                      <div
                        className={`max-w-[88%] sm:max-w-[75%] rounded-xl px-3.5 py-2.5 text-xs border ${
                          msg.sender === 'USER'
                            ? 'bg-raised border-border-focus text-primary'
                            : 'bg-surface border-subtle text-primary'
                        }`}
                      >
                        <div className="whitespace-pre-line leading-relaxed break-words">{msg.message}</div>

                        {msg.options && msg.options.length > 0 && activePendingState && (
                          <div className="mt-3 pt-2.5 border-t border-subtle space-y-1.5">
                            <p className="text-[11px] text-secondary">
                              Selecione o cartão utilizado:
                            </p>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                              {msg.options.map((opt, idx) => (
                                <button
                                  key={idx}
                                  onClick={() => handleOptionClick(opt)}
                                  className="text-left px-2.5 py-1.5 bg-canvas hover:bg-raised border border-subtle rounded-md text-xs font-medium text-[#10B981] transition-colors"
                                >
                                  {opt.label}
                                </button>
                              ))}
                            </div>
                          </div>
                        )}

                        <div className="flex items-center justify-end gap-1 mt-1.5 text-[10px] text-muted font-mono">
                          <span>{formatChatTime(msg.timestamp, (msg as any).created_at)}</span>
                          {msg.sender === 'USER' && (
                            <CheckCheck className="w-3.5 h-3.5 stroke-[1.5] text-[#10B981]" />
                          )}
                        </div>
                      </div>
                    </div>
                  ))
              )}

              {isTyping && (
                <div className="text-xs text-muted font-mono px-3 py-2 bg-surface border border-subtle rounded-lg w-36">
                  Processando...
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>

            {/* Input Bar */}
            <div className="bg-surface p-2.5 sm:p-3 flex items-center gap-2 border-t border-subtle">
              <input
                type="text"
                placeholder="Digite um lançamento ou consulta"
                value={inputText}
                onChange={e => setInputText(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSendMessage()}
                disabled={isTyping}
                className="flex-1 min-w-0 h-10 bg-canvas border border-subtle focus:border-[#10B981] text-primary placeholder-muted text-xs rounded-lg px-3 outline-none"
              />
              <button
                onClick={() => handleSendMessage()}
                disabled={isTyping || !inputText.trim()}
                className="h-10 px-3 sm:px-4 rounded-lg bg-primary hover:opacity-90 flex items-center justify-center text-canvas font-medium text-xs disabled:opacity-50 transition-opacity shrink-0 gap-1.5"
              >
                <Send className="w-3.5 h-3.5 stroke-[1.5]" />
                <span className="hidden sm:inline">Enviar</span>
              </button>
            </div>
          </div>

          {/* Quick Commands & Audio Guide */}
          <div className="space-y-4 min-w-0">
            <div className="bg-surface border border-subtle rounded-xl p-4 sm:p-5 space-y-3">
              <h4 className="text-sm font-medium text-primary">
                Exemplos de comandos
              </h4>
              <div className="space-y-2">
                {[
                  'Gastei 68 no almoço hoje',
                  'Comprei equipamento de 400 no cartão em 4x',
                  'Recebi 3500 de honorários',
                  'Quanto tenho em saldo nas contas?',
                  'Criar meta de 5000 para reserva'
                ].map((cmd, idx) => (
                  <button
                    key={idx}
                    onClick={() => handleSendMessage(cmd)}
                    disabled={isTyping}
                    className="w-full text-left px-3 py-2.5 rounded-lg bg-canvas hover:bg-raised border border-subtle text-xs text-secondary hover:text-primary transition-colors"
                  >
                    {cmd}
                  </button>
                ))}
              </div>
            </div>

            <div className="bg-surface border border-subtle rounded-xl p-4 sm:p-5 space-y-2">
              <div className="flex items-center gap-2 text-xs font-medium text-primary">
                <Mic className="w-4 h-4 stroke-[1.5] text-secondary" />
                <span>Lançamentos por voz</span>
              </div>
              <p className="text-xs text-muted leading-relaxed">
                Envie áudios para <span className="text-primary font-mono">{BOT_OFFICIAL.display}</span> informando valor, descrição e meio de pagamento para conciliação automática.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ABA 2: ESPELHAMENTO DE CONVERSAS REAIS */}
      {activeTab === 'MIRROR' && (
        <div className="bg-surface border border-subtle rounded-xl p-4 sm:p-6 space-y-4 min-w-0">
          <div className="flex items-center justify-between gap-2 pb-3 border-b border-subtle">
            <div className="min-w-0">
              <h3 className="text-sm font-medium text-primary truncate">
                Histórico de mensagens do WhatsApp
              </h3>
              <p className="text-xs text-muted mt-0.5 truncate">
                Comandos recebidos pelo número {BOT_OFFICIAL.display}
              </p>
            </div>
            <span className="text-xs font-mono text-secondary bg-canvas px-2.5 py-1 rounded-md border border-subtle tabular-nums shrink-0">
              {mirroredChat.length} {mirroredChat.length === 1 ? 'registro' : 'registros'}
            </span>
          </div>

          <div className="space-y-3 max-h-[500px] overflow-y-auto scrollbar-thin p-1">
            {mirroredChat.length === 0 ? (
              <div className="text-center py-12 text-muted text-xs">
                Nenhuma mensagem recebida pelo serviço até o momento
              </div>
            ) : (
              mirroredChat.map(msg => (
                <div
                  key={msg.id}
                  className={`p-3.5 rounded-xl border text-xs space-y-1.5 ${
                    msg.sender === 'USER'
                      ? 'bg-raised border-subtle ml-auto max-w-xl text-primary'
                      : 'bg-canvas border-subtle mr-auto max-w-xl text-primary'
                  }`}
                >
                  <div className="flex items-center justify-between text-[11px] text-muted">
                    <span className="font-medium text-secondary flex items-center gap-2">
                      <span>{msg.sender === 'USER' ? 'Você' : 'Assistente Concect'}</span>
                      {msg.is_audio && (
                        <span className="px-1.5 py-0.5 rounded bg-surface border border-subtle text-secondary text-[10px] font-mono">
                          Áudio
                        </span>
                      )}
                    </span>
                    <span className="font-mono">{formatChatTime(msg.timestamp, (msg as any).created_at)}</span>
                  </div>

                  <div className="whitespace-pre-line leading-relaxed break-words">{msg.text}</div>

                  {msg.intent && (
                    <div className="text-[11px] text-muted font-mono pt-1">
                      Operação: {msg.intent}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};
