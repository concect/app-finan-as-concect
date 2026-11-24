import React from 'react';
import {
  LayoutDashboard,
  CalendarDays,
  CreditCard,
  Target,
  LineChart,
  MessageSquare,
  Trophy,
  Settings,
  Plus,
  Eye,
  EyeOff,
  Lock,
  Sun,
  Moon,
  ChevronDown,
  Building2,
  Users,
  User as UserIcon,
  Calculator,
  Briefcase
} from 'lucide-react';
import { Workspace, WorkspaceType, User } from '../types';

interface SidebarProps {
  currentTab: string;
  setCurrentTab: (tab: string) => void;
  workspaces: Workspace[];
  activeWorkspaceId: string;
  onSelectWorkspace: (id: string) => void;
  onOpenNewTransaction: () => void;
  user: User;
  onTogglePrivacy: () => void;
  onLockPin: () => void;
  onToggleTheme: () => void;
  streak: number;
  level: number;
  unreadNotificationsCount: number;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentTab,
  setCurrentTab,
  workspaces,
  activeWorkspaceId,
  onSelectWorkspace,
  onOpenNewTransaction,
  user,
  onTogglePrivacy,
  onLockPin,
  onToggleTheme,
  streak,
  level
}) => {
  const [workspaceMenuOpen, setWorkspaceMenuOpen] = React.useState(false);

  const activeWs = workspaces.find(w => w.id === activeWorkspaceId) || workspaces[0];

  const primaryGroup = [
    { id: 'overview', label: 'Visão geral', icon: LayoutDashboard },
    { id: 'transactions', label: 'Lançamentos e agenda', icon: CalendarDays },
    { id: 'accounts', label: 'Contas e cartões', icon: CreditCard },
    ...(activeWs.type === 'BUSINESS'
      ? [{ id: 'business', label: 'Gestão Empresarial', icon: Building2 }]
      : []),
    { id: 'patrimony', label: 'Patrimônio & Dívidas', icon: Briefcase },
    { id: 'planning', label: 'Orçamento e simulador', icon: Calculator },
    { id: 'goals', label: 'Metas e reservas', icon: Target }
  ];

  const intelligenceGroup = [
    { id: 'ai', label: 'Consultor financeiro', icon: LineChart },
    {
      id: 'whatsapp',
      label: 'Assistente WhatsApp',
      icon: MessageSquare,
      statusDot: Boolean(user.whatsapp_connected)
    },
    { id: 'gamification', label: 'Saúde financeira', icon: Trophy },
    { id: 'settings', label: 'Configurações', icon: Settings }
  ];

  const getWsIcon = (type: WorkspaceType) => {
    switch (type) {
      case 'INDIVIDUAL': return UserIcon;
      case 'FAMILY': return Users;
      case 'BUSINESS': return Building2;
      default: return UserIcon;
    }
  };

  const CurrentWsIcon = getWsIcon(activeWs.type);

  const getInitials = (name?: string) => {
    if (!name) return 'CF';
    const parts = name.trim().split(/\s+/);
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
  };

  const renderNavRow = (item: { id: string; label: string; icon: any; statusDot?: boolean }) => {
    const Icon = item.icon;
    const isActive = currentTab === item.id;
    return (
      <button
        key={item.id}
        onClick={() => setCurrentTab(item.id)}
        className={`w-full h-9 flex items-center justify-between px-3 rounded-lg text-[13px] transition-colors ${
          isActive
            ? 'bg-raised text-primary font-medium'
            : 'text-secondary hover:text-primary hover:bg-surface-hover font-normal'
        }`}
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="w-4 h-4 flex items-center justify-center flex-shrink-0">
            <Icon className="w-4 h-4 stroke-[1.5]" />
          </span>
          <span className="truncate">{item.label}</span>
        </div>
        {item.statusDot && (
          <span className="w-1.5 h-1.5 rounded-full bg-[#10B981] flex-shrink-0" title="WhatsApp vinculado" />
        )}
      </button>
    );
  };

  return (
    <aside className="hidden lg:flex flex-col w-64 bg-deep border-r border-subtle h-screen sticky top-0 select-none z-30 shrink-0">
      {/* Brand Header */}
      <div className="h-14 px-4 border-b border-subtle flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <img
            src="/assets/logo/iconesite.webp"
            alt="Concect"
            className="w-6 h-6 rounded object-contain"
            onError={e => {
              (e.target as HTMLElement).style.display = 'none';
            }}
          />
          <span className="font-medium text-[15px] text-primary tracking-tight">
            Concect Finanças
          </span>
        </div>
        <span className="text-[11px] font-mono text-muted">
          Nível {level}
        </span>
      </div>

      {/* Workspace Switcher & Primary Action */}
      <div className="p-3 space-y-2 border-b border-subtle">
        <div className="relative">
          <button
            onClick={() => setWorkspaceMenuOpen(!workspaceMenuOpen)}
            className="w-full h-9 flex items-center justify-between px-3 bg-surface border border-subtle hover:border-border-focus rounded-lg text-[13px] text-primary transition-colors"
          >
            <div className="flex items-center gap-2.5 truncate">
              <CurrentWsIcon className="w-4 h-4 stroke-[1.5] text-muted flex-shrink-0" />
              <span className="truncate font-normal">{activeWs.name}</span>
            </div>
            <ChevronDown className="w-4 h-4 stroke-[1.5] text-muted" />
          </button>

          {workspaceMenuOpen && (
            <div className="absolute top-10 left-0 right-0 bg-surface border border-subtle rounded-lg shadow-xl z-40 p-1 space-y-0.5">
              <div className="px-2.5 py-1.5 text-xs text-muted">
                Carteira ativa
              </div>
              {workspaces.map(ws => {
                const Icon = getWsIcon(ws.type);
                const isSelected = ws.id === activeWorkspaceId;
                return (
                  <button
                    key={ws.id}
                    onClick={() => {
                      onSelectWorkspace(ws.id);
                      setWorkspaceMenuOpen(false);
                    }}
                    className={`w-full h-8 flex items-center gap-2.5 px-2.5 rounded-md text-xs transition-colors ${
                      isSelected
                        ? 'bg-raised text-primary font-medium'
                        : 'text-secondary hover:text-primary hover:bg-surface-hover'
                    }`}
                  >
                    <Icon className="w-4 h-4 stroke-[1.5]" />
                    <span className="truncate">{ws.name}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Quick Launch CTA with signature Keycap */}
        <button
          onClick={onOpenNewTransaction}
          className="w-full h-9 flex items-center justify-between px-3 bg-primary hover:opacity-90 text-canvas font-medium text-[13px] rounded-lg transition-opacity active:scale-[0.98]"
        >
          <span className="flex items-center gap-2">
            <Plus className="w-4 h-4 stroke-[1.75]" />
            <span>Novo lançamento</span>
          </span>
          <kbd className="font-mono text-[11px] px-1.5 py-0.5 rounded bg-canvas/15 text-canvas border border-canvas/20">
            N
          </kbd>
        </button>
      </div>

      {/* Navigation Links */}
      <nav className="flex-1 px-3 py-3 overflow-y-auto scrollbar-thin">
        <div className="px-3 mb-2 text-xs text-muted">
          Gestão
        </div>
        <div className="space-y-1">
          {primaryGroup.map(renderNavRow)}
        </div>

        <div className="px-3 mt-6 mb-2 text-xs text-muted">
          Consultoria e sistema
        </div>
        <div className="space-y-1">
          {intelligenceGroup.map(renderNavRow)}
        </div>
      </nav>

      {/* Quiet Discipline Metric Bar */}
      <div className="px-4 py-2.5 mx-3 mb-3 bg-surface border border-subtle rounded-lg flex items-center justify-between text-xs">
        <span className="text-secondary">Constância</span>
        <span className="font-mono text-primary tabular-nums">
          {streak} {streak === 1 ? 'dia ativo' : 'dias ativos'}
        </span>
      </div>

      {/* User Footer & Security Controls */}
      <div className="p-3 border-t border-subtle bg-canvas flex items-center justify-between">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-7 h-7 rounded-md bg-raised border border-subtle flex items-center justify-center text-xs font-mono font-medium text-primary flex-shrink-0">
            {getInitials(user.name)}
          </div>
          <div className="truncate">
            <p className="text-xs font-medium text-primary truncate">{user.name}</p>
            <p className="text-[11px] text-muted truncate">{user.email}</p>
          </div>
        </div>

        <div className="flex items-center gap-0.5 flex-shrink-0">
          <button
            onClick={onTogglePrivacy}
            className={`w-7 h-7 rounded-md flex items-center justify-center hover:bg-raised transition-colors ${
              user.privacy_mode ? 'text-[#D97706]' : 'text-muted hover:text-primary'
            }`}
            title={user.privacy_mode ? 'Revelar valores' : 'Modo privacidade'}
          >
            {user.privacy_mode ? <EyeOff className="w-4 h-4 stroke-[1.5]" /> : <Eye className="w-4 h-4 stroke-[1.5]" />}
          </button>

          <button
            onClick={onLockPin}
            className="w-7 h-7 rounded-md flex items-center justify-center text-muted hover:text-primary hover:bg-raised transition-colors"
            title="Bloquear com PIN"
          >
            <Lock className="w-4 h-4 stroke-[1.5]" />
          </button>

          <button
            onClick={onToggleTheme}
            className="w-7 h-7 rounded-md flex items-center justify-center text-muted hover:text-primary hover:bg-raised transition-colors"
            title="Alternar tema"
          >
            {user.theme_preference === 'dark' ? (
              <Sun className="w-4 h-4 stroke-[1.5]" />
            ) : (
              <Moon className="w-4 h-4 stroke-[1.5]" />
            )}
          </button>
        </div>
      </div>
    </aside>
  );
};
