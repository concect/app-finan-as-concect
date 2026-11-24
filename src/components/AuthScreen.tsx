import React, { useState } from 'react';
import { Lock, Mail, User as UserIcon, ArrowRight, AlertCircle, CheckCircle2, Play } from 'lucide-react';
import { AuthService } from '../services/authService';
import { FirestoreService } from '../services/firestoreService';

interface AuthScreenProps {
  onSuccess: () => void;
  onEnterDemo?: () => void;
}

export const AuthScreen: React.FC<AuthScreenProps> = ({ onSuccess, onEnterDemo }) => {
  const [isRegister, setIsRegister] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [googleLoading, setGoogleLoading] = useState(false);
  const [appleLoading, setAppleLoading] = useState(false);
  const [emailLoading, setEmailLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resetSuccess, setResetSuccess] = useState<string | null>(null);

  const handleGoogleLogin = async () => {
    setError(null);
    setGoogleLoading(true);
    try {
      const user = await AuthService.loginWithGoogle();
      await FirestoreService.ensureUserInitialized(
        user.uid,
        user.email || '',
        user.displayName || undefined,
        'google'
      );
      onSuccess();
    } catch (err: any) {
      console.error('Google Login Error:', err);
      if (err.code === 'auth/popup-closed-by-user' || err.code === 'auth/cancelled-popup-request') {
        // Popup closed
      } else if (err.code === 'auth/account-exists-with-different-credential') {
        setError('Já existe uma conta cadastrada com este e-mail por outro método de acesso');
      } else if (err.code === 'auth/operation-not-allowed') {
        setError('O login com Google não está habilitado no projeto');
      } else {
        setError('Falha ao autenticar com Google');
      }
    } finally {
      setGoogleLoading(false);
    }
  };

  const handleAppleLogin = async () => {
    setError(null);
    setAppleLoading(true);
    try {
      const user = await AuthService.loginWithApple();
      await FirestoreService.ensureUserInitialized(
        user.uid,
        user.email || '',
        user.displayName || 'Usuário Apple',
        'apple'
      );
      onSuccess();
    } catch (err: any) {
      console.error('Apple Login Error:', err);
      if (err.code === 'auth/popup-closed-by-user' || err.code === 'auth/cancelled-popup-request') {
        // Popup closed
      } else if (err.code === 'auth/account-exists-with-different-credential') {
        setError('Já existe uma conta cadastrada com este e-mail por outro método de acesso');
      } else if (err.code === 'auth/operation-not-allowed') {
        setError('O login com a Apple não está habilitado no projeto');
      } else if (err.code === 'auth/user-disabled') {
        setError('Esta conta foi desativada temporariamente');
      } else {
        setError(err.message || 'Falha ao autenticar com a Apple');
      }
    } finally {
      setAppleLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setResetSuccess(null);
    setEmailLoading(true);

    try {
      if (isRegister) {
        if (!name.trim()) {
          setError('Informe seu nome para continuar');
          setEmailLoading(false);
          return;
        }
        const user = await AuthService.registerWithEmail(email, password, name);
        await FirestoreService.ensureUserInitialized(
          user.uid,
          user.email || email,
          name.trim(),
          'email'
        );
      } else {
        const user = await AuthService.loginWithEmail(email, password);
        await FirestoreService.ensureUserInitialized(
          user.uid,
          user.email || email,
          user.displayName || undefined,
          'email'
        );
      }
      onSuccess();
    } catch (err: any) {
      console.error(err);
      if (err.code === 'auth/invalid-credential' || err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password') {
        setError('E-mail ou senha incorretos');
      } else if (err.code === 'auth/email-already-in-use') {
        setError('Este e-mail já está cadastrado');
      } else if (err.code === 'auth/weak-password') {
        setError('A senha deve ter no mínimo 6 caracteres');
      } else {
        setError(err.message || 'Erro ao processar autenticação');
      }
    } finally {
      setEmailLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    if (!email.trim()) {
      setError('Informe seu e-mail para receber o link de recuperação');
      return;
    }
    setError(null);
    try {
      await AuthService.sendPasswordReset(email);
      setResetSuccess('Link de recuperação enviado para o seu e-mail');
    } catch (err: any) {
      setError('Não foi possível enviar o link de recuperação');
    }
  };

  return (
    <div className="min-h-screen bg-canvas flex items-center justify-center p-4 sm:p-6 selection:bg-[#10B981] selection:text-black">
      <div className="w-full max-w-md bg-surface border border-subtle rounded-2xl p-5 sm:p-8 relative">
        {/* Brand Header */}
        <div className="flex flex-col items-center text-center mb-6">
          <div className="w-10 h-10 rounded-lg bg-raised border border-subtle p-2 flex items-center justify-center mb-3">
            <img
              src="/assets/logo/iconesite.webp"
              alt="Concect"
              className="w-full h-full object-contain"
              onError={e => ((e.target as HTMLElement).style.display = 'none')}
            />
          </div>
          <h1 className="text-lg font-medium text-primary tracking-tight">
            Concect Finanças
          </h1>
          <p className="text-[13px] text-secondary mt-1">
            Controle patrimonial, faturas e conciliação via WhatsApp
          </p>
        </div>

        {/* Tab Switcher */}
        <div className="grid grid-cols-2 bg-canvas p-1 rounded-lg border border-subtle mb-6">
          <button
            type="button"
            onClick={() => { setIsRegister(false); setError(null); }}
            className={`h-8 text-xs font-medium rounded-md transition-colors ${
              !isRegister
                ? 'bg-raised text-primary'
                : 'text-muted hover:text-primary'
            }`}
          >
            Entrar
          </button>
          <button
            type="button"
            onClick={() => { setIsRegister(true); setError(null); }}
            className={`h-8 text-xs font-medium rounded-md transition-colors ${
              isRegister
                ? 'bg-raised text-primary'
                : 'text-muted hover:text-primary'
            }`}
          >
            Criar conta
          </button>
        </div>

        {/* Error / Success Notifications */}
        {error && (
          <div className="p-3 bg-[#EF4444]/10 border border-[#EF4444]/30 rounded-lg text-xs text-[#EF4444] flex items-center gap-2.5 mb-4">
            <AlertCircle className="w-4 h-4 stroke-[1.5] flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {resetSuccess && (
          <div className="p-3 bg-[#10B981]/10 border border-[#10B981]/30 rounded-lg text-xs text-[#10B981] flex items-center gap-2.5 mb-4">
            <CheckCircle2 className="w-4 h-4 stroke-[1.5] flex-shrink-0" />
            <span>{resetSuccess}</span>
          </div>
        )}

        {/* Social Logins */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-5">
          <button
            type="button"
            onClick={handleGoogleLogin}
            disabled={googleLoading || appleLoading || emailLoading}
            className="w-full h-10 px-3 bg-raised hover:bg-surface-hover border border-subtle text-xs font-medium text-primary rounded-lg flex items-center justify-center gap-2 transition-colors active:scale-[0.98] disabled:opacity-50"
          >
            {googleLoading ? (
              <div className="w-4 h-4 border-2 border-[#10B981] border-t-transparent rounded-full animate-spin" />
            ) : (
              <svg className="w-4 h-4 flex-shrink-0" viewBox="0 0 24 24">
                <path
                  fill="#4285F4"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="#34A853"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                />
                <path
                  fill="#EA4335"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                />
              </svg>
            )}
            <span className="truncate">Google</span>
          </button>

          <button
            type="button"
            onClick={handleAppleLogin}
            disabled={googleLoading || appleLoading || emailLoading}
            className="w-full h-10 px-3 bg-raised hover:bg-surface-hover border border-subtle text-xs font-medium text-primary rounded-lg flex items-center justify-center gap-2 transition-colors active:scale-[0.98] disabled:opacity-50"
          >
            {appleLoading ? (
              <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
            ) : (
              <svg className="w-4 h-4 flex-shrink-0 fill-current" viewBox="0 0 170 170">
                <path d="M150.37 130.25c-2.45 5.66-5.35 10.87-8.71 15.66-4.58 6.53-8.33 11.05-11.22 13.56-4.48 4.12-9.28 6.23-14.42 6.35-3.69 0-8.14-1.05-13.32-3.18-5.19-2.12-9.97-3.17-14.34-3.17-4.58 0-9.49 1.05-14.75 3.17-5.26 2.13-9.5 3.24-12.74 3.35-4.35.13-9.16-1.9-14.42-6.08-3.7-3.04-7.58-7.7-11.64-13.98-6.19-9.5-11.04-20.44-14.55-32.83-3.51-12.39-5.26-23.77-5.26-34.13 0-14.42 3.65-26.4 10.96-35.95 7.31-9.56 16.59-14.43 27.84-14.62 5.07 0 10.59 1.33 16.56 3.99 5.97 2.66 9.87 4.05 11.71 4.17 1.84 0 5.86-1.42 12.06-4.26 6.2-2.84 11.66-4.13 16.38-3.87 12.63.76 22.84 5.28 30.64 13.56-11.02 6.64-16.38 15.82-16.08 27.53.3 11.39 4.87 20.73 13.71 28.02 4.02 3.34 8.78 5.82 14.28 7.44-2.88 8.64-6.43 17.18-10.66 25.62zM119.22 31.84c0-7.39 2.66-14.33 7.97-20.82 5.31-6.49 11.83-10.49 19.56-12.02.26 1.32.39 2.45.39 3.39 0 7.39-2.73 14.33-8.19 20.82-5.46 6.49-11.88 10.36-19.26 11.6-.13-1.06-.47-2.05-.47-2.97z" />
              </svg>
            )}
            <span className="truncate">Apple</span>
          </button>
        </div>

        <div className="flex items-center gap-3 my-5">
          <div className="flex-1 h-px bg-subtle" />
          <span className="text-xs text-muted">
            ou continue com e-mail
          </span>
          <div className="flex-1 h-px bg-subtle" />
        </div>

        {/* Credentials Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {isRegister && (
            <div>
              <label className="block text-xs font-normal text-secondary mb-1.5">
                Nome completo
              </label>
              <div className="relative">
                <UserIcon className="w-4 h-4 stroke-[1.5] absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
                <input
                  type="text"
                  required
                  placeholder="Seu nome"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  className="w-full h-10 bg-canvas border border-subtle focus:border-[#10B981] rounded-lg pl-9 pr-3 text-xs text-primary outline-none transition-colors"
                />
              </div>
            </div>
          )}

          <div>
            <label className="block text-xs font-normal text-secondary mb-1.5">
              E-mail
            </label>
            <div className="relative">
              <Mail className="w-4 h-4 stroke-[1.5] absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
              <input
                type="email"
                required
                placeholder="nome@empresa.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
                className="w-full h-10 bg-canvas border border-subtle focus:border-[#10B981] rounded-lg pl-9 pr-3 text-xs text-primary outline-none transition-colors"
              />
            </div>
          </div>

          <div>
            <div className="flex justify-between items-center mb-1.5">
              <label className="text-xs font-normal text-secondary">
                Senha
              </label>
              {!isRegister && (
                <button
                  type="button"
                  onClick={handleForgotPassword}
                  className="text-xs text-secondary hover:text-primary transition-colors"
                >
                  Recuperar senha
                </button>
              )}
            </div>
            <div className="relative">
              <Lock className="w-4 h-4 stroke-[1.5] absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
              <input
                type="password"
                required
                placeholder="Mínimo de 6 caracteres"
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="w-full h-10 bg-canvas border border-subtle focus:border-[#10B981] rounded-lg pl-9 pr-3 text-xs text-primary outline-none transition-colors"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={emailLoading || googleLoading || appleLoading}
            className="w-full h-10 px-4 bg-primary hover:opacity-90 text-canvas font-medium text-[13px] rounded-lg flex items-center justify-center gap-2 transition-opacity active:scale-[0.98] disabled:opacity-50 mt-2"
          >
            {emailLoading ? (
              <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
            ) : (
              <>
                <span>{isRegister ? 'Criar conta' : 'Acessar carteira'}</span>
                <ArrowRight className="w-4 h-4 stroke-[1.5]" />
              </>
            )}
          </button>
        </form>

        {onEnterDemo && (
          <div className="mt-5 pt-5 border-t border-subtle space-y-2.5">
            <button
              type="button"
              onClick={onEnterDemo}
              className="w-full h-10 px-4 bg-canvas hover:bg-raised border border-subtle hover:border-border-focus text-primary font-medium text-xs rounded-lg flex items-center justify-center gap-2 transition-colors active:scale-[0.98]"
            >
              <Play className="w-3.5 h-3.5 stroke-[1.75] text-[#10B981]" />
              <span>Explorar Modo Demonstração</span>
            </button>
            <p className="text-[11px] text-muted text-center">
              6 meses de dados fictícios isolados (Pessoal, Família e PJ com DRE) — sem cadastro
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
