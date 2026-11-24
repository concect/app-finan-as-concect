import React, { useState } from 'react';
import {
  Shield,
  Plus,
  CheckCircle2,
  LogOut,
  Server,
  Smartphone,
  ExternalLink,
  Key,
  Pencil,
  Trash2,
  X
} from 'lucide-react';
import { User, Category, Workspace } from '../types';
import { FirestoreService, roundMoney } from '../services/firestoreService';
import { GroqService } from '../services/groqService';
import { useFeedback } from '../contexts/FeedbackContext';

interface SettingsViewProps {
  user: User;
  activeWorkspaceId?: string;
  categories: Category[];
  workspaces: Workspace[];
  onRefreshData: () => void;
  onToggleTheme: () => void;
  onLockPin: () => void;
  onLogout: () => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  user,
  activeWorkspaceId = 'ws_personal',
  categories,
  onRefreshData,
  onLockPin,
  onLogout
}) => {
  const { confirm, showToast } = useFeedback();
  const [newPin, setNewPin] = useState('');
  const [pinSuccess, setPinSuccess] = useState(false);

  const [userPhone, setUserPhone] = useState(user.whatsapp_number || '');
  const [phoneSaving, setPhoneSaving] = useState(false);

  const handleSavePhone = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userPhone.trim()) return;
    setPhoneSaving(true);
    try {
      const res = await FirestoreService.linkUserWhatsApp(user.id, userPhone);
      showToast({
        type: 'success',
        title: 'WhatsApp vinculado',
        message: `Número ${res.cleanNumber} atualizado`
      });
      onRefreshData();
    } catch (e) {
      showToast({
        type: 'error',
        title: 'Falha ao salvar',
        message: 'Não foi possível atualizar o número'
      });
    } finally {
      setPhoneSaving(false);
    }
  };

  const [groqKey, setGroqKey] = useState(GroqService.getActiveApiKey());
  const [groqKeySaved, setGroqKeySaved] = useState(false);

  const [catName, setCatName] = useState('');
  const [catType, setCatType] = useState<'INCOME' | 'EXPENSE'>('EXPENSE');
  const [catBudget, setCatBudget] = useState('');
  const [catColor] = useState('#10B981');

  // Edit category modal state
  const [editingCat, setEditingCat] = useState<Category | null>(null);
  const [editCatName, setEditCatName] = useState('');
  const [editCatType, setEditCatType] = useState<'INCOME' | 'EXPENSE'>('EXPENSE');
  const [editCatBudget, setEditCatBudget] = useState('');

  const handleUpdatePin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPin.length === 4) {
      await FirestoreService.updateUserPreferences(user.id, { pin_hash: newPin });
      setPinSuccess(true);
      setNewPin('');
      setTimeout(() => setPinSuccess(false), 3000);
      onRefreshData();
    }
  };

  const handleSaveGroqKey = (e: React.FormEvent) => {
    e.preventDefault();
    GroqService.setCustomApiKey(groqKey);
    setGroqKeySaved(true);
    setTimeout(() => setGroqKeySaved(false), 3000);
  };

  const handleAddCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!catName.trim()) return;

    const budget = roundMoney(parseFloat(catBudget.replace(',', '.')) || 0) || undefined;
    const newCat: Omit<Category, 'id'> = {
      workspace_id: activeWorkspaceId,
      name: catName.trim(),
      type: catType,
      monthly_budget_limit: catType === 'EXPENSE' ? budget : undefined,
      icon: 'Tag',
      color: catColor,
      is_system: false
    };

    await FirestoreService.addCategory(user.id, newCat);
    setCatName('');
    setCatBudget('');
    showToast({
      type: 'success',
      title: 'Categoria adicionada',
      message: `"${newCat.name}" cadastrada com sucesso`
    });
    onRefreshData();
  };

  const openEditCatModal = (c: Category) => {
    setEditingCat(c);
    setEditCatName(c.name);
    setEditCatType(c.type);
    setEditCatBudget(c.monthly_budget_limit ? String(c.monthly_budget_limit) : '');
  };

  const handleSaveEditCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCat || !editCatName.trim()) return;
    const budget = roundMoney(parseFloat(editCatBudget.replace(',', '.')) || 0);

    try {
      await FirestoreService.updateCategory(user.id, editingCat.id, {
        name: editCatName.trim(),
        type: editCatType,
        monthly_budget_limit: editCatType === 'EXPENSE' ? budget : 0
      });
      showToast({
        type: 'success',
        title: 'Categoria atualizada',
        message: `"${editCatName.trim()}" salva`
      });
      setEditingCat(null);
      onRefreshData();
    } catch (err) {
      showToast({
        type: 'error',
        title: 'Erro ao atualizar',
        message: 'Não foi possível salvar a categoria'
      });
    }
  };

  const handleDeleteCategory = async (c: Category) => {
    const confirmed = await confirm({
      title: 'Excluir categoria',
      description: `Deseja excluir a categoria "${c.name}"?`,
      confirmText: 'Excluir',
      cancelText: 'Cancelar',
      variant: 'danger',
      icon: 'trash'
    });

    if (confirmed) {
      try {
        await FirestoreService.deleteCategory(user.id, c.id);
        showToast({
          type: 'success',
          title: 'Categoria excluída',
          message: `"${c.name}" foi removida`
        });
        onRefreshData();
      } catch (err) {
        showToast({
          type: 'error',
          title: 'Erro ao excluir',
          message: 'Não foi possível remover a categoria'
        });
      }
    }
  };

  return (
    <div className="space-y-8 min-w-0">
      {/* Top Header */}
      <div className="bg-surface border border-subtle rounded-xl p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="min-w-0">
          <h2 className="text-[15px] font-medium text-primary">Configurações da conta</h2>
          <p className="text-xs text-muted mt-0.5">
            Segurança, integrações, categorias orçamentárias e sessão
          </p>
        </div>

        <button
          onClick={onLogout}
          className="h-9 flex items-center gap-2 px-3.5 bg-[#EF4444]/10 hover:bg-[#EF4444]/20 text-[#EF4444] border border-[#EF4444]/25 rounded-lg text-xs font-medium transition-colors self-start sm:self-auto shrink-0"
        >
          <LogOut className="w-4 h-4 stroke-[1.5]" />
          <span>Encerrar sessão</span>
        </button>
      </div>

      {/* SECTION 1: ACCOUNT & API KEY */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 min-w-0">
        <div className="bg-surface border border-subtle rounded-xl p-4 sm:p-5 space-y-4 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2.5 min-w-0">
              <Server className="w-4 h-4 stroke-[1.5] text-secondary shrink-0" />
              <h3 className="text-sm font-medium text-primary truncate">Identificação da carteira</h3>
            </div>
            <span className="text-xs font-mono px-2 py-0.5 rounded bg-[#10B981]/10 text-[#10B981] border border-[#10B981]/25 shrink-0">
              Sincronizada
            </span>
          </div>

          <div className="p-3.5 bg-canvas rounded-lg border border-subtle text-xs space-y-1.5 font-mono min-w-0">
            <p className="text-muted truncate">Titular: <span className="text-primary">{user.name || 'Investidor'}</span></p>
            <p className="text-muted truncate">E-mail: <span className="text-primary">{user.email}</span></p>
            <p className="text-muted truncate">ID: <span className="text-secondary">{user.id}</span></p>
          </div>
        </div>

        <div className="bg-surface border border-subtle rounded-xl p-4 sm:p-5 space-y-4 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2.5 min-w-0">
              <Key className="w-4 h-4 stroke-[1.5] text-secondary shrink-0" />
              <h3 className="text-sm font-medium text-primary truncate">Chave de API do motor analítico</h3>
            </div>
            <span className="text-xs font-mono px-2 py-0.5 rounded bg-raised text-secondary border border-subtle shrink-0">
              Groq Cloud
            </span>
          </div>

          <p className="text-xs text-muted">
            Credencial utilizada para processamento de linguagem natural no consultor e no WhatsApp
          </p>

          <form onSubmit={handleSaveGroqKey} className="space-y-2">
            <div className="flex items-center gap-2">
              <input
                type="password"
                value={groqKey}
                onChange={e => setGroqKey(e.target.value)}
                placeholder="gsk_..."
                className="flex-1 min-w-0 h-9 bg-canvas border border-subtle focus:border-[#10B981] rounded-lg px-3 text-xs font-mono text-primary outline-none"
              />
              <button
                type="submit"
                className="h-9 px-3.5 bg-raised hover:bg-surface-hover border border-subtle text-xs font-medium text-primary rounded-lg transition-colors shrink-0"
              >
                Salvar
              </button>
            </div>
            {groqKeySaved && (
              <p className="text-xs text-[#10B981] flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 stroke-[1.5]" />
                <span>Chave atualizada</span>
              </p>
            )}
          </form>
        </div>
      </div>

      {/* WhatsApp Integration Card */}
      <div className="bg-surface border border-subtle rounded-xl p-4 sm:p-5 space-y-4 min-w-0">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-lg bg-raised text-secondary border border-subtle flex items-center justify-center shrink-0">
              <Smartphone className="w-4 h-4 stroke-[1.5]" />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-medium text-primary truncate">Vínculo com assistente WhatsApp</h3>
              <p className="text-xs text-muted truncate">Canal oficial: <span className="text-primary font-mono">+55 62 9437-2561</span></p>
            </div>
          </div>

          <a
            href="https://wa.me/556294372561?text=Ol%C3%A1%20Concect%20Finan%C3%A7as%2C%20quero%20consultar%20meu%20saldo"
            target="_blank"
            rel="noopener noreferrer"
            className="h-9 flex items-center justify-center gap-1.5 px-3.5 bg-raised hover:bg-surface-hover border border-subtle text-primary font-medium text-xs rounded-lg transition-colors self-start sm:self-auto shrink-0"
          >
            <span>Abrir conversa</span>
            <ExternalLink className="w-3.5 h-3.5 stroke-[1.5]" />
          </a>
        </div>

        <form onSubmit={handleSavePhone} className="pt-3 border-t border-subtle">
          <div className="flex flex-col sm:flex-row sm:items-center gap-2.5">
            <label className="text-xs text-secondary">Número pessoal com DDD:</label>
            <input
              type="text"
              placeholder="(62) 99437-2561"
              value={userPhone}
              onChange={e => setUserPhone(e.target.value)}
              className="h-9 bg-canvas border border-subtle focus:border-[#10B981] rounded-lg px-3 text-xs font-mono text-primary outline-none w-full sm:w-56"
            />
            <button
              type="submit"
              disabled={phoneSaving}
              className="h-9 px-3.5 bg-primary hover:opacity-90 text-xs font-medium text-canvas rounded-lg transition-opacity"
            >
              {phoneSaving ? 'Salvando...' : 'Atualizar número'}
            </button>

            {user.whatsapp_connected && (
              <span className="text-xs text-[#10B981] flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5 stroke-[1.5]" />
                <span>Vinculado</span>
              </span>
            )}
          </div>
        </form>
      </div>

      {/* SECTION 2: SECURITY & PIN */}
      <div className="bg-surface border border-subtle rounded-xl p-4 sm:p-5 space-y-4">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <Shield className="w-4 h-4 stroke-[1.5] text-secondary shrink-0" />
            <h3 className="text-sm font-medium text-primary truncate">PIN de bloqueio de tela</h3>
          </div>
          <button
            onClick={onLockPin}
            className="h-8 px-3 bg-raised hover:bg-surface-hover text-xs font-medium text-secondary hover:text-primary rounded-lg border border-subtle transition-colors shrink-0"
          >
            Bloquear agora
          </button>
        </div>

        <form onSubmit={handleUpdatePin} className="space-y-3 pt-1">
          <div>
            <label className="block text-xs text-secondary mb-1.5">
              Definir novo PIN de 4 dígitos
            </label>
            <div className="flex items-center gap-2">
              <input
                type="password"
                maxLength={4}
                placeholder="0000"
                value={newPin}
                onChange={e => setNewPin(e.target.value.replace(/\D/g, ''))}
                className="h-9 bg-canvas border border-subtle focus:border-[#10B981] rounded-lg px-3 text-sm font-mono text-primary tracking-widest text-center w-28 outline-none"
              />
              <button
                type="submit"
                disabled={newPin.length !== 4}
                className="h-9 px-4 bg-raised hover:bg-surface-hover border border-subtle disabled:opacity-40 text-primary text-xs font-medium rounded-lg transition-colors"
              >
                Salvar PIN
              </button>
            </div>
          </div>

          {pinSuccess && (
            <p className="text-xs text-[#10B981] flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 stroke-[1.5]" />
              <span>PIN atualizado</span>
            </p>
          )}
        </form>
      </div>

      {/* SECTION 3: CATEGORIES CUSTOMIZATION */}
      <div className="bg-surface border border-subtle rounded-xl p-4 sm:p-6 space-y-5">
        <div>
          <h3 className="text-sm font-medium text-primary">Categorias e tetos mensais</h3>
          <p className="text-xs text-muted mt-0.5">
            Estrutura de classificação de receitas e despesas com limite orçamentário
          </p>
        </div>

        <form onSubmit={handleAddCategory} className="grid grid-cols-1 sm:grid-cols-5 gap-3 p-4 bg-canvas border border-subtle rounded-xl items-end">
          <div className="sm:col-span-2">
            <label className="block text-xs text-secondary mb-1.5">
              Nome da categoria
            </label>
            <input
              type="text"
              required
              placeholder="Ex: Educação, Impostos, Saúde"
              value={catName}
              onChange={e => setCatName(e.target.value)}
              className="w-full h-9 bg-surface border border-subtle rounded-lg px-3 text-xs text-primary outline-none"
            />
          </div>

          <div>
            <label className="block text-xs text-secondary mb-1.5">
              Natureza
            </label>
            <select
              value={catType}
              onChange={e => setCatType(e.target.value as any)}
              className="w-full h-9 bg-surface border border-subtle rounded-lg px-3 text-xs text-primary outline-none"
            >
              <option value="EXPENSE">Despesa</option>
              <option value="INCOME">Receita</option>
            </select>
          </div>

          <div>
            <label className="block text-xs text-secondary mb-1.5">
              Teto mensal (R$)
            </label>
            <input
              type="number"
              placeholder="1000"
              value={catBudget}
              onChange={e => setCatBudget(e.target.value)}
              className="w-full h-9 bg-surface border border-subtle rounded-lg px-3 text-xs font-mono text-primary outline-none tabular-nums"
            />
          </div>

          <div>
            <button
              type="submit"
              className="w-full h-9 bg-primary hover:opacity-90 text-canvas text-xs font-medium rounded-lg transition-opacity flex items-center justify-center gap-1.5"
            >
              <Plus className="w-3.5 h-3.5 stroke-[1.75]" />
              <span>Adicionar</span>
            </button>
          </div>
        </form>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {categories.map(c => (
            <div
              key={c.id}
              className="p-3.5 bg-canvas border border-subtle rounded-lg flex items-center justify-between text-xs gap-2"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <div
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{ backgroundColor: c.color }}
                />
                <div className="min-w-0">
                  <p className="font-medium text-primary truncate">{c.name}</p>
                  <p className="text-[11px] font-mono text-muted tabular-nums truncate">
                    {c.type === 'INCOME'
                      ? 'Receita'
                      : c.monthly_budget_limit
                      ? `Teto: R$ ${c.monthly_budget_limit.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
                      : 'Sem teto definido'}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-1 shrink-0">
                <button
                  onClick={() => openEditCatModal(c)}
                  className="p-1 rounded text-muted hover:text-primary transition-colors"
                  title="Editar categoria"
                >
                  <Pencil className="w-3.5 h-3.5 stroke-[1.5]" />
                </button>
                <button
                  onClick={() => handleDeleteCategory(c)}
                  className="p-1 rounded text-muted hover:text-[#EF4444] transition-colors"
                  title="Excluir categoria"
                >
                  <Trash2 className="w-3.5 h-3.5 stroke-[1.5]" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* MODAL: EDIT CATEGORY */}
      {editingCat && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
          <div className="w-full max-w-md bg-surface border border-subtle rounded-2xl p-6 space-y-4 relative">
            <button onClick={() => setEditingCat(null)} className="absolute top-5 right-5 text-muted hover:text-primary">
              <X className="w-4 h-4 stroke-[1.5]" />
            </button>
            <h3 className="text-[15px] font-medium text-primary">Editar categoria</h3>

            <form onSubmit={handleSaveEditCategory} className="space-y-4">
              <div>
                <label className="block text-xs text-secondary mb-1.5">Nome da categoria</label>
                <input
                  type="text"
                  required
                  value={editCatName}
                  onChange={e => setEditCatName(e.target.value)}
                  className="w-full h-10 bg-canvas border border-subtle focus:border-[#10B981] rounded-lg px-3 text-xs text-primary outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-secondary mb-1.5">Natureza</label>
                  <select
                    value={editCatType}
                    onChange={e => setEditCatType(e.target.value as any)}
                    className="w-full h-10 bg-canvas border border-subtle rounded-lg px-3 text-xs text-primary outline-none"
                  >
                    <option value="EXPENSE">Despesa</option>
                    <option value="INCOME">Receita</option>
                  </select>
                </div>

                {editCatType === 'EXPENSE' && (
                  <div>
                    <label className="block text-xs text-secondary mb-1.5">Teto mensal (R$)</label>
                    <input
                      type="number"
                      step="0.01"
                      placeholder="1000"
                      value={editCatBudget}
                      onChange={e => setEditCatBudget(e.target.value)}
                      className="w-full h-10 bg-canvas border border-subtle rounded-lg px-3 text-xs font-mono text-primary outline-none tabular-nums"
                    />
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-subtle">
                <button
                  type="button"
                  onClick={() => setEditingCat(null)}
                  className="h-9 px-3 text-xs text-secondary hover:text-primary"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="h-9 px-4 bg-primary hover:opacity-90 text-canvas font-medium text-xs rounded-lg transition-opacity"
                >
                  Salvar alterações
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
