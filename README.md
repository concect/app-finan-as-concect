# CONCECT FINANÇAS — Produção (Firebase + Groq AI Blindada)

> **Ecossistema Completo de Gestão Financeira Inteligente (PWA / Web App)**  
> 100% Funcional em Produção com **Firebase Authentication**, **Cloud Firestore (Tempo Real)** e **Groq API (LLaMA 3.3 70B com Guardrails)**.

---

## 🚀 Novidades da Versão de Produção

### 1. Eliminação Total de Mock Data
- **Sem Dados Fictícios:** O sistema não utiliza mais seeds estáticos. Novos usuários começam com o painel zerado e limpo.
- **Onboarding Rápido:** Ao cadastrar uma conta nova, o usuário passa por um fluxo inicial opcional de 2 passos para configurar sua primeira conta bancária e cartão de crédito, que já gravam instantaneamente no Firestore.

### 2. Autenticação Real com Firebase Auth
- **Login com Google (OAuth):** Autenticação em 1 clique com popup do Google.
- **Login e Cadastro com E-mail e Senha:** Validação de credenciais, tratamento de erros em português e recuperação de senha por e-mail.
- **Persistência de Sessão:** Detecção automática do estado de login via `onAuthStateChanged`.
- **Logout Seguro:** Encerramento de sessão com limpeza de estado em memória.

### 3. Banco de Dados Cloud Firestore em Tempo Real
- **Arquitetura Multi-Tenant Isolada:** Cada usuário possui sua árvore de coleções protegida sob `users/{userId}/...`:
  - `accounts` (Contas bancárias e carteiras físicas)
  - `cards` (Cartões de crédito com cálculo dinâmico de limites)
  - `invoices` (Faturas de cartão)
  - `categories` (Categorias e tetos orçamentários)
  - `transactions` (Lançamentos com parcelamento inteligente)
  - `subscriptions` (Assinaturas e empréstimos)
  - `goals` (Metas financeiras e aportes)
  - `gamification/profile` (Score de saúde, nível, streak e desafios)
  - `whatsapp_logs` (Histórico de conversas com a IA)
  - `notifications` (Alertas de vencimento e resumos)
- **Segurança Blindada:** Regras de segurança em [`firestore.rules`](./firestore.rules) garantindo que apenas o usuário autenticado acesse e altere seus próprios documentos (`request.auth.uid == userId`).

### 4. Inteligência Artificial com Groq API (LLaMA 3.3 70B Versatile)
- **Consultor Financeiro em Tempo Real:** Responde perguntas analíticas cruzando saldos, faturas e transações reais do usuário.
- **Guardrails Rígidos (Blindagem Total):** A IA é travada por System Prompt para responder **estritamente sobre dados financeiros do CONCECT FINANÇAS**. Qualquer pergunta fora de escopo (piadas, culinária, programação genérica, política, esportes, etc.) é educadamente recusada com a mensagem oficial de proteção.
- **WhatsApp NLP Function Calling:** Extrai comandos em linguagem natural e grava diretamente no Firestore:
  - *"Gastei 45 no almoço"*
  - *"Paguei 120 de gasolina no débito"*
  - *"Recebi 2500 de salário"*
  - **Desambiguação Inteligente:** Se o usuário disser *"Comprei um tênis de 300 reais no cartão"* e tiver mais de um cartão cadastrado, a IA coloca o lançamento em `PENDING_CONFIRMATION` e exibe botões clicáveis no chat para escolher o cartão e as parcelas antes de gravar no banco de dados.

---

## 🛠️ Configuração e Execução

### Variáveis de Ambiente (`.env`)
Copie o arquivo `.env.example` para `.env` na raiz do projeto e preencha suas credenciais:

```env
VITE_FIREBASE_API_KEY=sua_api_key_firebase
VITE_FIREBASE_AUTH_DOMAIN=seu-projeto.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=seu-projeto
VITE_FIREBASE_STORAGE_BUCKET=seu-projeto.firebasestorage.app
VITE_FIREBASE_MESSAGING_SENDER_ID=000000000000
VITE_FIREBASE_APP_ID=1:000000000000:web:xxxxxxxxxxxxxxxxxxxxxx
VITE_FIREBASE_MEASUREMENT_ID=G-XXXXXXXXXX

VITE_GROQ_API_KEY=gsk_sua_chave_groq_aqui
VITE_GROQ_MODEL=llama-3.3-70b-versatile
```

### Como Executar

```bash
# 1. Entrar na pasta do projeto
cd concect-financas

# 2. Iniciar servidor Vite de desenvolvimento
npm run dev

# 3. Ou rodar o preview de produção
npm run preview
```

Abra o navegador em `http://localhost:3000`.
