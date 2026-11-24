/**
 * ============================================================================
 * CONCECT FINANÇAS — SERVIDOR DO BOT OFICIAL DO WHATSAPP (BAILEYS + GROQ + FIRESTORE)
 * Número Oficial: +55 62 9437-2561 (556294372561 / 5562994372561)
 * ============================================================================
 */

import http from 'http';
import fs from 'fs';
import path from 'path';
import makeWASocketPkg, {
  useMultiFileAuthState,
  DisconnectReason,
  downloadMediaMessage
} from '@whiskeysockets/baileys';
import pino from 'pino';
import qrcode from 'qrcode';
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import {
  getFirestore,
  doc,
  getDoc,
  getDocs,
  setDoc,
  addDoc,
  updateDoc,
  collection,
  query,
  where,
  orderBy,
  limit,
  serverTimestamp
} from 'firebase/firestore';

const makeWASocket = makeWASocketPkg.default || makeWASocketPkg;

// Carregar variáveis de ambiente do .env local (se existir) sem dependências extras
try {
  const envPath = path.resolve(process.cwd(), '.env');
  if (fs.existsSync(envPath)) {
    const rawEnv = fs.readFileSync(envPath, 'utf-8');
    for (const line of rawEnv.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx > 0) {
        const key = trimmed.slice(0, eqIdx).trim();
        const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '');
        if (!process.env[key]) process.env[key] = val;
      }
    }
  }
} catch (envErr) {
  console.warn('[CONCECT BOT] Aviso ao ler .env:', envErr.message);
}

// 1. CONFIGURAÇÕES OFICIAIS
const BOT_CONFIG = {
  phoneDisplay: '+55 62 9437-2561',
  phoneClean: '556294372561',
  phoneWith9: '5562994372561',
  botEmail: process.env.BOT_EMAIL || 'bot@concectfinancas.com',
  botPassword: process.env.BOT_PASSWORD || ''
};

const firebaseConfig = {
  apiKey: "AIzaSyBacbJdf-jB8BTz2idVZ_nQmfACiQpniKE",
  authDomain: "concect-financas.firebaseapp.com",
  projectId: "concect-financas",
  storageBucket: "concect-financas.firebasestorage.app",
  messagingSenderId: "133313797605",
  appId: "1:133313797605:web:2ee211232ce7f7a1b7e30c",
  measurementId: "G-76T5ZM7MZM"
};

const GROQ_CONFIG = {
  apiKey: process.env.GROQ_API_KEY || process.env.VITE_GROQ_API_KEY || "",
  chatEndpoint: "https://api.groq.com/openai/v1/chat/completions",
  audioEndpoint: "https://api.groq.com/openai/v1/audio/transcriptions",
  whisperModel: "whisper-large-v3-turbo"
};

let detectedChatModels = [];

async function refreshAvailableGroqModels() {
  try {
    const res = await fetch("https://api.groq.com/openai/v1/models", {
      headers: {
        'Authorization': `Bearer ${GROQ_CONFIG.apiKey}`
      }
    });
    if (res.ok) {
      const data = await res.json();
      const allModels = (data.data || []).map(m => m.id);
      
      const chatOnly = allModels.filter(id => 
        !id.includes('whisper') && 
        !id.includes('tts') && 
        !id.includes('guard') && 
        !id.includes('embed') &&
        !id.includes('orpheus') &&
        !id.includes('canopylabs') &&
        !id.includes('playai')
      );

      // Priorizar os modelos de chat mais avançados
      chatOnly.sort((a, b) => {
        const score = (m) => {
          if (m.includes('gpt-oss-120b')) return 1;
          if (m.includes('qwen3.8')) return 2;
          if (m.includes('gpt-oss-20b')) return 3;
          if (m.includes('qwen')) return 4;
          if (m.includes('llama')) return 5;
          return 10;
        };
        return score(a) - score(b);
      });

      if (chatOnly.length > 0) {
        detectedChatModels = chatOnly;
        console.log(`[CONCECT BOT] 🤖 Modelos Groq ativos encontrados na sua chave (${chatOnly.length}):`, chatOnly.join(', '));
        console.log(`[CONCECT BOT] 🎯 Modelo primário selecionado: "${chatOnly[0]}"`);
      }
    }
  } catch (err) {
    console.warn('[CONCECT BOT] Aviso ao consultar modelos da Groq:', err.message);
  }
}

// Helper: Limpeza de campos undefined para evitar erros no Firestore
function cleanFirestoreData(data) {
  const clean = {};
  for (const [key, val] of Object.entries(data)) {
    if (val !== undefined) {
      clean[key] = val;
    }
  }
  return clean;
}

const STRICT_REFUSAL_MESSAGE = "Desculpe, sou o consultor de inteligência financeira do *CONCECT FINANÇAS*. Meu escopo de atuação é estritamente limitado à gestão das suas contas, despesas, receitas, cartões, metas e finanças pessoais. Como posso ajudar com suas finanças hoje?";

// 2. INICIALIZAÇÃO FIREBASE & AUTH
const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
const auth = getAuth(app);
const db = getFirestore(app);

// 3. ESTADO GLOBAL EM MEMÓRIA & SERVIDOR HTTP LOCAL (/api/whatsapp/status)
let currentWhatsAppStatus = {
  status: 'DISCONNECTED',
  botNumber: BOT_CONFIG.phoneClean,
  botNumberDisplay: BOT_CONFIG.phoneDisplay,
  qr: null,
  qrDataUrl: null,
  updatedAt: new Date().toISOString()
};

const httpServer = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    return res.end();
  }

  if (req.url === '/api/whatsapp/status' || req.url === '/status') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify(currentWhatsAppStatus));
  }

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Endpoint não encontrado. Acesse /api/whatsapp/status' }));
});

const HTTP_PORT = process.env.WHATSAPP_PORT || 3001;
httpServer.listen(HTTP_PORT, () => {
  console.log(`[CONCECT BOT] 🌐 Servidor HTTP ativo em http://localhost:${HTTP_PORT}/api/whatsapp/status`);
});

// 4. HELPER: NORMALIZAÇÃO DE NÚMERO BRASILEIRO (COM E SEM 9º DÍGITO)
function normalizeBrazilianPhone(raw) {
  let digits = String(raw || '').replace(/\D/g, '');
  if (digits.startsWith('0')) digits = digits.slice(1);
  if (!digits.startsWith('55')) digits = `55${digits}`;

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
}

// 5. BUSCAR USUÁRIO NO FIRESTORE POR NÚMERO DE WHATSAPP / LID
async function findUserByWhatsApp(variants) {
  const usersCol = collection(db, 'users');

  // Tentativa 1: array-contains-any no whatsapp_variants
  try {
    const q1 = query(usersCol, where('whatsapp_variants', 'array-contains-any', variants));
    const snap1 = await getDocs(q1);
    if (!snap1.empty) {
      return { id: snap1.docs[0].id, ...snap1.docs[0].data() };
    }
  } catch (e) {
    // Permissão ou índice
  }

  // Tentativa 2: whatsapp_number in variants
  try {
    const q2 = query(usersCol, where('whatsapp_number', 'in', variants));
    const snap2 = await getDocs(q2);
    if (!snap2.empty) {
      return { id: snap2.docs[0].id, ...snap2.docs[0].data() };
    }
  } catch (e) {
    // Permissão ou índice
  }

  // Tentativa 3: whatsapp_lid in variants
  try {
    const q3 = query(usersCol, where('whatsapp_lid', 'in', variants));
    const snap3 = await getDocs(q3);
    if (!snap3.empty) {
      return { id: snap3.docs[0].id, ...snap3.docs[0].data() };
    }
  } catch (e) {
    // Falha silenciosa
  }

  // Tentativa 4: Scan preventivo seguro (com try/catch blindado)
  try {
    const allSnap = await getDocs(usersCol);
    for (const docSnap of allSnap.docs) {
      const u = docSnap.data();
      if (u.whatsapp_number) {
        const uVars = normalizeBrazilianPhone(u.whatsapp_number).variants;
        if (uVars.some(v => variants.includes(v))) {
          return { id: docSnap.id, ...u };
        }
      }
      if (Array.isArray(u.whatsapp_variants)) {
        if (u.whatsapp_variants.some(v => variants.includes(v))) {
          return { id: docSnap.id, ...u };
        }
      }
      if (u.whatsapp_lid && variants.includes(u.whatsapp_lid)) {
        return { id: docSnap.id, ...u };
      }
    }
  } catch (scanErr) {
    console.warn('[CONCECT BOT] Aviso na busca preventiva de usuários Firestore:', scanErr.message);
  }

  return null;
}

// 6. TRANSCRIÇÃO DE ÁUDIO VIA GROQ WHISPER
async function transcribeAudioBuffer(audioBuffer) {
  try {
    const formData = new FormData();
    const blob = new Blob([audioBuffer], { type: 'audio/ogg' });
    formData.append('file', blob, 'audio.ogg');
    formData.append('model', GROQ_CONFIG.whisperModel);
    formData.append('language', 'pt');
    formData.append('response_format', 'json');

    const res = await fetch(GROQ_CONFIG.audioEndpoint, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${GROQ_CONFIG.apiKey}`
      },
      body: formData
    });

    if (!res.ok) {
      const err = await res.text();
      console.error('[GROQ WHISPER ERROR]', err);
      return null;
    }

    const data = await res.json();
    return data.text || '';
  } catch (err) {
    console.error('[GROQ WHISPER EXCEPTION]', err);
    return null;
  }
}

// 7. PROCESSAMENTO IA COM GROQ LLAMA 3.3 70B (COM GUARDRAIL ESTREITO)
async function processFinancialIntent(userText, userData, financialContext) {
  // Pre-filter blatant out of scope
  const lower = userText.toLowerCase();
  const outOfScopePhrases = [
    'receita de bolo', 'futebol', 'escalação', 'filme', 'série', 'clima', 'tempo amanhã',
    'política', 'presidente', 'deputado', 'quem ganhou', 'piada', 'história infantil',
    'python', 'javascript', 'react', 'código', 'programação', 'escreva uma redação'
  ];
  if (outOfScopePhrases.some(p => lower.includes(p))) {
    return {
      intent: 'OUT_OF_SCOPE',
      reply_message: STRICT_REFUSAL_MESSAGE,
      requires_confirmation: false
    };
  }

  const systemInstruction = `VOCÊ É O CONSULTOR FINANCEIRO PESSOAL EXECUTIVO DO USUÁRIO NO WHATSAPP PARA A PLATAFORMA "CONCECT FINANÇAS".
NÚMERO OFICIAL DO BOT: ${BOT_CONFIG.phoneDisplay}

USUÁRIO:
Nome: ${userData.name || 'Investidor'}
ID: ${userData.id}

DADOS FINANCEIROS REAIS DO USUÁRIO NO FIRESTORE:
${financialContext.summaryText}

CATEGORIAS DISPONÍVEIS:
${financialContext.categories.map(c => `- "${c.name}" (ID: ${c.id}, Tipo: ${c.type})`).join('\n')}

CONTAS DISPONÍVEIS:
${financialContext.accounts.map(a => `- "${a.name}" (ID: ${a.id}, Saldo Atual: R$ ${a.current_balance})`).join('\n')}

CARTÕES DISPONÍVEIS:
${financialContext.cards.map(c => `- "${c.name}" (ID: ${c.id}, Limite Disp: R$ ${c.available_limit})`).join('\n')}

REGRAS DE CLASSIFICAÇÃO E INTELIGÊNCIA FINANCEIRA:
1. CATEGORIZAÇÃO COERENTE:
   - Assinaturas de streaming, softwares ou serviços recorrentes (ex: Netflix, Spotify, Amazon Prime, iCloud, YouTube, ChatGPT) DEVEM ser categorizadas na categoria de Assinaturas/Serviços (ex: "Assinaturas & Serviços", "Serviços" ou "Outros"). NUNCA categorize Netflix ou streaming como Alimentação!
   - Alimentação/Supermercado: apenas refeições, compras em mercado, lanches, restaurantes, feira.
   - Transporte: combustível, Uber, 99, táxi, estacionamento, pedágio.

2. SELEÇÃO DE CARTÃO E CONTA:
   - Se o usuário tiver APENAS UM CARTÃO cadastrado (${financialContext.cards.length === 1 ? `o cartão "${financialContext.cards[0]?.name}"` : 'ver cartões acima'}), NÃO pergunte qual cartão usar! Selecione-o automaticamente!
   - Se o usuário mencionar o nome do cartão (ex: "C6", "C6 Black", "Nubank", "Black"), identifique o cartão correspondente e selecione seu ID diretamente no action_payload.card_id!
   - Se o usuário tiver múltiplos cartões e não especificou nem na mensagem atual nem no histórico recente, defina intent "AMBIGUOUS_CONFIRMATION" e pergunte amigavelmente qual cartão foi usado.

3. CONTEXTO DE DIÁLOGO MULTI-TURNO (MEMÓRIA CONVERSACIONAL):
   - Analise o histórico recente da conversa. Se você fez uma pergunta anteriormente (por exemplo, perguntando qual cartão usar para uma assinatura ou compra de R$ 40) e o usuário agora respondeu apenas o nome do cartão (ex: "C6 Black" ou "40 reais"), NÃO repita a pergunta e NÃO invente outro gasto!
   - Conclua o lançamento pendente unindo a descrição e o valor anteriores com a nova informação fornecida pelo usuário, gerando intent "CREATE_TRANSACTION" e confirmando com clareza e cordialidade!

REGRAS RÍGIDAS DE RETORNO JSON:
Você DEVE responder SEMPRE em JSON puro, sem blocos markdown:
{
  "intent": "CREATE_TRANSACTION" | "CREATE_GOAL" | "CREATE_REMINDER" | "QUERY_DATA" | "AMBIGUOUS_CONFIRMATION" | "OUT_OF_SCOPE",
  "reply_message": "Texto em português formatado para WhatsApp, com negritos (*texto*), emojis e tom consultivo executivo",
  "requires_confirmation": boolean,
  "action_payload": {
    "type": "EXPENSE" | "INCOME" | "TRANSFER",
    "amount": number,
    "description": "string",
    "category_id": "string",
    "category_name": "string",
    "account_id": "string ou null",
    "card_id": "string ou null",
    "installments": number,
    "due_date": "YYYY-MM-DD",
    "goal_title": "string ou null",
    "goal_target": number ou null,
    "reminder_title": "string ou null"
  }
}`;

  if (!detectedChatModels || detectedChatModels.length === 0) {
    await refreshAvailableGroqModels();
  }

  const modelsToTry = Array.from(new Set([
    ...detectedChatModels,
    'openai/gpt-oss-120b',
    'openai/gpt-oss-20b',
    'qwen/qwen3.8-27b',
    'qwen-2.5-32b',
    'llama-3.1-8b-instant'
  ]));

  const messages = [
    { role: 'system', content: systemInstruction }
  ];

  if (Array.isArray(financialContext.recentHistory)) {
    for (const h of financialContext.recentHistory) {
      if (h.sender && h.text) {
        messages.push({
          role: h.sender === 'USER' ? 'user' : 'assistant',
          content: h.text
        });
      }
    }
  }

  messages.push({ role: 'user', content: userText });

  for (const modelName of modelsToTry) {
    try {
      console.log(`[CONCECT BOT] 🤖 Processando com modelo Groq: ${modelName}...`);
      const res = await fetch(GROQ_CONFIG.chatEndpoint, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${GROQ_CONFIG.apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: modelName,
          messages,
          temperature: 0.1,
          response_format: { type: 'json_object' }
        })
      });

      if (!res.ok) {
        const errText = await res.text();
        console.warn(`[GROQ CHAT WARNING] Modelo ${modelName} falhou:`, errText);
        continue; // Tenta o próximo modelo candidato
      }

      const data = await res.json();
      const content = data.choices[0]?.message?.content || '{}';
      const parsed = JSON.parse(content);
      console.log(`[CONCECT BOT] ✅ Resposta gerada com sucesso pelo modelo: ${modelName}!`);

      return {
        intent: parsed.intent || 'QUERY_DATA',
        reply_message: parsed.reply_message || 'Entendido!',
        requires_confirmation: Boolean(parsed.requires_confirmation),
        action_payload: parsed.action_payload || null
      };
    } catch (err) {
      console.warn(`[GROQ CHAT EXCEPTION] Modelo ${modelName} disparou exceção:`, err.message);
    }
  }

  return {
    intent: 'QUERY_DATA',
    reply_message: '⚠️ Ocorreu uma instabilidade na conexão com o modelo de inteligência. Por favor, tente novamente.',
    requires_confirmation: false,
    action_payload: null
  };
}

// 8. INICIALIZAÇÃO DO BOT BAILEYS
let botSocket = null;

async function startWhatsAppBot() {
  console.log('\n============================================================');
  console.log(`🤖 INICIANDO CONCECT FINANÇAS WHATSAPP BOT (${BOT_CONFIG.phoneDisplay})`);
  console.log('============================================================\n');

  // Detectar modelos disponíveis na Groq dinamicamente
  if (!GROQ_CONFIG.apiKey) {
    console.warn('[CONCECT BOT] ⚠️ GROQ_API_KEY não definida no ambiente (.env). Configure GROQ_API_KEY para ativar respostas de IA.');
  } else {
    await refreshAvailableGroqModels();
  }

  // Autenticar bot no Firebase Auth
  if (!BOT_CONFIG.botPassword) {
    console.warn('[CONCECT BOT] ⚠️ BOT_PASSWORD não definida no ambiente (.env). Configure BOT_PASSWORD para autenticar o bot no Firebase.');
  } else {
    try {
      await signInWithEmailAndPassword(auth, BOT_CONFIG.botEmail, BOT_CONFIG.botPassword);
      console.log('[CONCECT BOT] 🔐 Autenticado no Firebase Auth com sucesso!');
    } catch (authErr) {
      console.warn('[CONCECT BOT] Aviso de autenticação Firebase Auth:', authErr.message);
    }
  }

  const { state, saveCreds } = await useMultiFileAuthState('whatsapp_auth');

  botSocket = makeWASocket({
    auth: state,
    printQRInTerminal: false,
    logger: pino({ level: 'silent' }),
    browser: ['CONCECT FINANÇAS', 'Chrome', '1.0.0']
  });

  botSocket.ev.on('creds.update', saveCreds);

  // Monitorar estado da conexão
  botSocket.ev.on('connection.update', async update => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      console.log('\n[CONCECT BOT] 📱 Novo QR Code gerado! Atualizando status...');
      try {
        const qrDataUrl = await qrcode.toDataURL(qr, { margin: 2, scale: 8 });
        const terminalQR = await qrcode.toString(qr, { type: 'terminal', small: true });
        console.log(terminalQR);

        // Atualizar estado em memória para a rota HTTP
        currentWhatsAppStatus = {
          status: 'WAITING_QR',
          qr: qr,
          qrDataUrl: qrDataUrl,
          botNumber: BOT_CONFIG.phoneClean,
          botNumberDisplay: BOT_CONFIG.phoneDisplay,
          updatedAt: new Date().toISOString()
        };

        // Atualizar Firestore se autenticado
        try {
          await setDoc(doc(db, 'system_config', 'whatsapp_status'), currentWhatsAppStatus, { merge: true });
          console.log('[CONCECT BOT] ✅ QR Code salvo no Firestore (system_config/whatsapp_status)!');
        } catch (fsErr) {
          console.warn('[CONCECT BOT] Aviso Firestore sync:', fsErr.message);
        }
      } catch (e) {
        console.error('[CONCECT BOT] Erro ao gerar QR Code:', e.message);
      }
    }

    if (connection === 'open') {
      console.log(`\n🎉 [CONCECT BOT] CONECTADO COM SUCESSO!`);
      console.log(`📱 WhatsApp Oficial: ${BOT_CONFIG.phoneDisplay}`);
      console.log(`⚡ Pronto para receber mensagens de texto e áudio.\n`);

      currentWhatsAppStatus = {
        status: 'CONNECTED',
        botNumber: BOT_CONFIG.phoneClean,
        botNumberDisplay: BOT_CONFIG.phoneDisplay,
        qr: null,
        qrDataUrl: null,
        connectedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      try {
        await setDoc(doc(db, 'system_config', 'whatsapp_status'), currentWhatsAppStatus, { merge: true });
      } catch (e) {}
    }

    if (connection === 'close') {
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
      console.log(`[CONCECT BOT] ⚠️ Conexão encerrada (Status: ${statusCode}). Reconectando? ${shouldReconnect}`);

      currentWhatsAppStatus = {
        status: 'DISCONNECTED',
        botNumber: BOT_CONFIG.phoneClean,
        botNumberDisplay: BOT_CONFIG.phoneDisplay,
        qr: null,
        qrDataUrl: null,
        updatedAt: new Date().toISOString()
      };

      try {
        await setDoc(doc(db, 'system_config', 'whatsapp_status'), currentWhatsAppStatus, { merge: true });
      } catch (e) {}

      if (shouldReconnect) {
        setTimeout(startWhatsAppBot, 5000);
      }
    }
  });

  // Recebimento de Mensagens
  botSocket.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;

    for (const msg of messages) {
      try {
        if (!msg.message || msg.key.fromMe) continue;
        const remoteJid = msg.key.remoteJid;
        if (!remoteJid || remoteJid.endsWith('@g.us')) continue; // Ignora grupos

        let senderNumber = remoteJid.replace(/@.*$/, '');
        let { variants } = normalizeBrazilianPhone(senderNumber);

        // Se for um LID (@lid) ou ID extenso, verificar se temos o mapeamento reverso para o telefone real
        let realPhone = null;
        if (remoteJid.endsWith('@lid') || senderNumber.length >= 14) {
          try {
            const lidMapFile = path.join('whatsapp_auth', `lid-mapping-${senderNumber}_reverse.json`);
            if (fs.existsSync(lidMapFile)) {
              const rawMap = fs.readFileSync(lidMapFile, 'utf8');
              const mapped = JSON.parse(rawMap);
              if (mapped) {
                realPhone = String(mapped);
                console.log(`[CONCECT BOT] 🔄 Mapeamento LID detectado (${senderNumber}) -> Telefone real: ${realPhone}`);
                const mappedNorm = normalizeBrazilianPhone(realPhone);
                variants = Array.from(new Set([...variants, ...mappedNorm.variants, realPhone, senderNumber]));
              }
            }
          } catch (lidErr) {
            console.warn('[CONCECT BOT] Aviso ao consultar mapeamento LID:', lidErr.message);
          }
        }
        if (!variants.includes(senderNumber)) {
          variants.push(senderNumber);
        }

        console.log(`\n[CONCECT BOT] 📩 Mensagem recebida de: ${senderNumber} ${realPhone ? `(Telefone: ${realPhone})` : ''} (Variações: ${variants.join(', ')})`);

        // 1. Verificar se o número pertence a algum usuário cadastrado
        const user = await findUserByWhatsApp(variants);

        if (!user) {
          console.log(`[CONCECT BOT] ❌ Número ${senderNumber} ${realPhone ? `(${realPhone})` : ''} não vinculado a nenhum usuário.`);
          const unlinkedNotice = `Olá! Sou o assistente oficial do *CONCECT FINANÇAS* (${BOT_CONFIG.phoneDisplay}).\n\nAinda não encontrei o seu número (*${realPhone || senderNumber}*) vinculado à sua conta na plataforma.\n\n👉 Acesse o site do CONCECT FINANÇAS, vá no menu *WhatsApp IA* e clique em *Vincular Meu WhatsApp* para começar a lançar seus gastos e consultar saldos por aqui! 🚀`;
          await botSocket.sendMessage(remoteJid, { text: unlinkedNotice });
          continue;
        }

        // Se o usuário foi encontrado e a mensagem veio de um LID, registrar o LID no perfil do usuário para buscas futuras
        if (remoteJid.endsWith('@lid') && user.whatsapp_lid !== senderNumber) {
          try {
            await updateDoc(doc(db, 'users', user.id), { whatsapp_lid: senderNumber });
          } catch (e) {}
        }

        console.log(`[CONCECT BOT] 👤 Usuário identificado: ${user.name} (${user.id})`);

      // 2. Extrair texto (direto ou transcrição de áudio)
      let isAudio = Boolean(msg.message.audioMessage);
      let userText = '';

      if (isAudio) {
        console.log('[CONCECT BOT] 🎙️ Áudio detectado! Baixando mídia...');
        try {
          const buffer = await downloadMediaMessage(
            msg,
            'buffer',
            {},
            { logger: pino({ level: 'silent' }) }
          );

          userText = await transcribeAudioBuffer(buffer);
          console.log(`[CONCECT BOT] 📝 Áudio transcrito via Groq Whisper: "${userText}"`);
        } catch (e) {
          console.error('[CONCECT BOT] Falha ao processar áudio:', e.message);
          await botSocket.sendMessage(remoteJid, {
            text: '⚠️ Não foi possível processar o áudio enviado. Por favor, envie novamente ou digite o texto.'
          });
          continue;
        }
      } else {
        userText = msg.message.conversation ||
                   msg.message.extendedTextMessage?.text ||
                   '';
      }

      userText = (userText || '').trim();
      if (!userText) continue;

      // 3. Coletar contexto financeiro real do Firestore
      const uid = user.id;
      const [accsSnap, cardsSnap, catsSnap, goalsSnap, remsSnap] = await Promise.all([
        getDocs(collection(db, 'users', uid, 'accounts')),
        getDocs(collection(db, 'users', uid, 'cards')),
        getDocs(collection(db, 'users', uid, 'categories')),
        getDocs(collection(db, 'users', uid, 'goals')),
        getDocs(collection(db, 'users', uid, 'reminders'))
      ]);

      const accounts = accsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      const cards = cardsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      const categories = catsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      const goals = goalsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      const reminders = remsSnap.docs.map(d => ({ id: d.id, ...d.data() }));

      const totalBalance = accounts.reduce((acc, a) => acc + (a.current_balance || 0), 0);
      const totalAvailableCardLimit = cards.reduce((acc, c) => acc + (c.available_limit || 0), 0);

      const summaryText = `
SALDO TOTAL LÍQUIDO EM CONTAS: R$ ${totalBalance.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
LIMITE TOTAL DISPONÍVEL EM CARTÕES: R$ ${totalAvailableCardLimit.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
CONTAS: ${accounts.map(a => `${a.name}: R$ ${a.current_balance}`).join(', ')}
CARTÕES: ${cards.map(c => `${c.name}: Limite Disp R$ ${c.available_limit}`).join(', ')}
METAS ATIVAS: ${goals.map(g => `${g.title} (${g.current_amount}/${g.target_amount})`).join(', ') || 'Nenhuma'}
LEMBRETES PENDENTES: ${reminders.filter(r => r.status === 'PENDING').map(r => `${r.title} (R$ ${r.amount || 0} em ${r.due_date})`).join(', ') || 'Nenhum'}
      `.trim();

      // 3.1 Histórico recente da conversa para memória multi-turno
      let recentHistory = [];
      try {
        const histSnap = await getDocs(
          query(
            collection(db, 'users', uid, 'chat_history'),
            where('channel', '==', 'WHATSAPP'),
            limit(10)
          )
        );
        recentHistory = histSnap.docs.map(d => d.data());
        recentHistory.sort((a, b) => (a.timestamp || '').localeCompare(b.timestamp || ''));
        recentHistory = recentHistory.slice(-6);
      } catch (hErr) {
        // Fallback sem histórico se índice estiver pendente
      }

      // 4. Processar com Groq IA (com memória conversacional)
      const aiResult = await processFinancialIntent(userText, user, {
        accounts,
        cards,
        categories,
        goals,
        reminders,
        recentHistory,
        summaryText
      });

      let finalReply = aiResult.reply_message;

      // 5. Execução de Ações no Firestore
      if (aiResult.intent === 'CREATE_TRANSACTION' && aiResult.action_payload?.amount) {
        const payload = aiResult.action_payload;
        const txAmount = payload.amount;
        const txType = payload.type || 'EXPENSE';

        // Resolver Cartão por ID ou Nome (ex: "C6 Black")
        let cardId = payload.card_id;
        if (cardId) {
          const matchedCard = cards.find(c => c.id === cardId || c.name.toLowerCase().includes(String(cardId).toLowerCase()));
          cardId = matchedCard ? matchedCard.id : cardId;
        } else if (cards.length === 1 && (userText.toLowerCase().includes('cartão') || userText.toLowerCase().includes('credito') || userText.toLowerCase().includes('crédito') || payload.description?.toLowerCase().includes('cartão'))) {
          cardId = cards[0].id;
        }

        // Resolver Conta por ID ou Nome
        let accountId = payload.account_id;
        if (accountId) {
          const matchedAcc = accounts.find(a => a.id === accountId || a.name.toLowerCase().includes(String(accountId).toLowerCase()));
          accountId = matchedAcc ? matchedAcc.id : accountId;
        }
        if (!cardId && !accountId && accounts.length > 0) {
          accountId = accounts[0].id;
        }

        // Resolver Categoria por ID ou Nome (evita colocar Netflix em Alimentação)
        let categoryId = payload.category_id;
        if (categoryId) {
          const matchedCat = categories.find(c => c.id === categoryId || c.name.toLowerCase().includes(String(categoryId).toLowerCase()));
          categoryId = matchedCat ? matchedCat.id : categoryId;
        }
        if (!categoryId) {
          const descLower = (payload.description || userText).toLowerCase();
          if (descLower.includes('netflix') || descLower.includes('spotify') || descLower.includes('assinatura') || descLower.includes('prime')) {
            categoryId = categories.find(c => c.name.toLowerCase().includes('assinatura') || c.name.toLowerCase().includes('serviço'))?.id;
          }
          if (!categoryId) {
            categoryId = categories.find(c => c.type === txType)?.id || 'cat_geral';
          }
        }

        // Atualizar saldo ou limite de cartão
        if (cardId) {
          const card = cards.find(c => c.id === cardId);
          if (card) {
            const newLim = Math.max(0, (card.available_limit || 0) - txAmount);
            await updateDoc(doc(db, 'users', uid, 'cards', card.id), { available_limit: newLim });
          }
        } else if (accountId) {
          const acc = accounts.find(a => a.id === accountId);
          if (acc) {
            const newBal = txType === 'INCOME' ? (acc.current_balance + txAmount) : (acc.current_balance - txAmount);
            await updateDoc(doc(db, 'users', uid, 'accounts', acc.id), { current_balance: newBal });
          }
        }

        // Adicionar transação no Firestore
        await addDoc(collection(db, 'users', uid, 'transactions'), cleanFirestoreData({
          workspace_id: 'ws_personal',
          account_id: accountId || null,
          card_id: cardId || null,
          category_id: categoryId,
          type: txType,
          amount: txAmount,
          description: payload.description || (isAudio ? 'Gasto registrado por Áudio WhatsApp' : 'Lançamento via WhatsApp'),
          date: payload.due_date || new Date().toISOString().slice(0, 10),
          status: 'PAID',
          is_recurring: false,
          installment_current: payload.installments && payload.installments > 1 ? 1 : null,
          installment_total: payload.installments && payload.installments > 1 ? payload.installments : null,
          source: 'WHATSAPP',
          created_at: serverTimestamp()
        }));

        // XP de Gamificação (+15 XP)
        const profileRef = doc(db, 'users', uid, 'gamification', 'profile');
        const profSnap = await getDoc(profileRef);
        if (profSnap.exists()) {
          const curXp = profSnap.data().xp_points || 0;
          await updateDoc(profileRef, { xp_points: curXp + 15 });
        }
      } else if (aiResult.intent === 'CREATE_GOAL' && (aiResult.action_payload?.goal_target || aiResult.action_payload?.amount)) {
        const payload = aiResult.action_payload;
        const target = payload.goal_target || payload.amount || 1000;
        await addDoc(collection(db, 'users', uid, 'goals'), cleanFirestoreData({
          workspace_id: 'ws_personal',
          title: payload.goal_title || payload.description || 'Nova Meta',
          type: 'SAVINGS',
          target_amount: target,
          current_amount: 0,
          deadline: payload.due_date || new Date(Date.now() + 180 * 86400000).toISOString().slice(0, 10),
          status: 'IN_PROGRESS',
          created_at: new Date().toISOString().slice(0, 10)
        }));
      } else if (aiResult.intent === 'CREATE_REMINDER') {
        const payload = aiResult.action_payload;
        await addDoc(collection(db, 'users', uid, 'reminders'), cleanFirestoreData({
          workspace_id: 'ws_personal',
          title: payload?.reminder_title || payload?.description || 'Lembrete de Conta',
          amount: payload?.amount || 0,
          due_date: payload?.due_date || new Date(Date.now() + 86400000).toISOString().slice(0, 10),
          type: 'PAYABLE',
          status: 'PENDING',
          created_at: serverTimestamp()
        }));
      }

      // 6. Gravar Histórico na subcoleção do usuário no Firestore
      const timeStr = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

      // Mensagem do Usuário
      await addDoc(collection(db, 'users', uid, 'chat_history'), cleanFirestoreData({
        channel: 'WHATSAPP',
        source: 'WHATSAPP',
        sender: 'USER',
        text: userText,
        is_audio: isAudio,
        timestamp: new Date().toISOString(),
        created_at: serverTimestamp()
      }));

      // Log para o simulador
      await addDoc(collection(db, 'users', uid, 'whatsapp_logs'), cleanFirestoreData({
        user_id: uid,
        sender: 'USER',
        message: isAudio ? `🎙️ [Áudio]: "${userText}"` : userText,
        timestamp: timeStr,
        created_at: serverTimestamp()
      }));

      // Envia apenas a resposta direta da IA, sem repetir o que foi falado no áudio
      const finalWhatsAppMessage = finalReply;

      // Resposta da IA no Firestore
      await addDoc(collection(db, 'users', uid, 'chat_history'), cleanFirestoreData({
        channel: 'WHATSAPP',
        source: 'WHATSAPP',
        sender: 'AI',
        text: finalReply,
        intent: aiResult.intent || 'QUERY_DATA',
        action_payload: aiResult.action_payload || null,
        timestamp: new Date().toISOString(),
        created_at: serverTimestamp()
      }));

      await addDoc(collection(db, 'users', uid, 'whatsapp_logs'), cleanFirestoreData({
        user_id: uid,
        sender: 'AGENT',
        message: finalReply,
        timestamp: timeStr,
        created_at: serverTimestamp()
      }));

      // 7. Enviar resposta para o WhatsApp do usuário
      await botSocket.sendMessage(remoteJid, { text: finalWhatsAppMessage });
      console.log(`[CONCECT BOT] 💬 Resposta enviada com sucesso para ${remoteJid}!`);
    } catch (msgErr) {
      console.error('[CONCECT BOT ERROR] Falha no processamento da mensagem:', msgErr.message || msgErr);
    }
  }
});
}

// Proteção global contra encerramento inesperado do processo
process.on('uncaughtException', (err) => {
  console.error('[CONCECT BOT CRITICAL] Exceção não capturada (mantendo bot ativo):', err.message || err);
});

process.on('unhandledRejection', (reason) => {
  console.error('[CONCECT BOT CRITICAL] Rejeição de Promise não tratada (mantendo bot ativo):', reason?.message || reason);
});

// Iniciar Bot
startWhatsAppBot().catch(err => {
  console.error('[FATAL ERROR IN WHATSAPP BOT]:', err);
});
