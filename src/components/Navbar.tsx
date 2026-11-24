import React, { useState } from 'react';
import {
  Bell,
  Eye,
  EyeOff,
  Lock,
  Plus,
  Menu,
  CheckCircle,
  AlertTriangle,
  Info
} from 'lucide-react';
import { User, NotificationItem } from '../types';
import { FirestoreService } from '../services/firestoreService';

interface NavbarProps {
  user: User;
  onTogglePrivacy: () => void;
  onLockPin: () => void;
  onOpenNewTransaction: () => void;
  onOpenMobileMenu: () => void;
  notifications: NotificationItem[];
  onRefreshNotifications: () => void;
  title?: string;
}

export const Navbar: React.FC<NavbarProps> = ({
  user,
  onTogglePrivacy,
  onLockPin,
  onOpenNewTransaction,
  onOpenMobileMenu,
  notifications,
  onRefreshNotifications,
  title = 'Visão geral'
}) => {
  const [showNotifications, setShowNotifications] = useState(false);

  const unreadCount = notifications.filter(n => !n.is_read).length;

  const now = new Date();
  const monthLabel = now.toLocaleString('pt-BR', { month: 'long' });
  const formattedPeriod = `${monthLabel.charAt(0).toUpperCase() + monthLabel.slice(1)} ${now.getFullYear()}`;

  const handleMarkAsRead = async (id: string) => {
    await FirestoreService.markNotificationRead(user.id, id);
    onRefreshNotifications();
  };

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case 'DUE_SOON':
      case 'OVERDUE':
        return <AlertTriangle className="w-4 h-4 stroke-[1.5] text-[#D97706]" />;
      case 'BUDGET_EXCEEDED':
        return <AlertTriangle className="w-4 h-4 stroke-[1.5] text-[#EF4444]" />;
      case 'GOAL_MILESTONE':
        return <CheckCircle className="w-4 h-4 stroke-[1.5] text-[#10B981]" />;
      default:
        return <Info className="w-4 h-4 stroke-[1.5] text-secondary" />;
    }
  };

  return (
    <header className="sticky top-0 z-20 h-14 bg-canvas/95 backdrop-blur-md border-b border-subtle px-3 sm:px-6 flex items-center justify-between gap-2 min-w-0">
      {/* Left: Mobile Menu toggle + Screen Title */}
      <div className="flex items-center gap-2.5 min-w-0">
        <button
          onClick={onOpenMobileMenu}
          className="lg:hidden w-9 h-9 rounded-lg flex items-center justify-center text-secondary hover:text-primary hover:bg-surface border border-subtle transition-colors shrink-0"
        >
          <Menu className="w-4 h-4 stroke-[1.5]" />
        </button>

        <div className="flex items-center gap-3 min-w-0">
          <h1 className="text-sm sm:text-[15px] font-medium text-primary truncate">
            {title}
          </h1>
          <span className="hidden md:inline-block text-xs text-muted font-mono border-l border-subtle pl-3 shrink-0">
            {formattedPeriod}
          </span>
        </div>
      </div>

      {/* Right: Security & Quick Action buttons */}
      <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
        <button
          onClick={onTogglePrivacy}
          className={`w-9 h-9 rounded-lg border flex items-center justify-center transition-colors ${
            user.privacy_mode
              ? 'text-[#D97706] border-[#D97706]/40 bg-[#D97706]/10'
              : 'border-subtle bg-surface text-secondary hover:text-primary'
          }`}
          title={user.privacy_mode ? 'Revelar saldos' : 'Ocultar saldos'}
        >
          {user.privacy_mode ? <EyeOff className="w-4 h-4 stroke-[1.5]" /> : <Eye className="w-4 h-4 stroke-[1.5]" />}
        </button>

        <button
          onClick={onLockPin}
          className="w-9 h-9 rounded-lg border border-subtle bg-surface text-secondary hover:text-primary flex items-center justify-center transition-colors"
          title="Bloquear com PIN"
        >
          <Lock className="w-4 h-4 stroke-[1.5]" />
        </button>

        {/* Notifications Bell */}
        <div className="relative">
          <button
            onClick={() => setShowNotifications(!showNotifications)}
            className="w-9 h-9 rounded-lg border border-subtle bg-surface text-secondary hover:text-primary flex items-center justify-center transition-colors relative"
            title="Notificações"
          >
            <Bell className="w-4 h-4 stroke-[1.5]" />
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 px-1 min-w-[16px] h-4 rounded bg-[#10B981] text-black font-mono font-medium text-[10px] flex items-center justify-center">
                {unreadCount}
              </span>
            )}
          </button>

          {showNotifications && (
            <div className="absolute right-0 top-11 w-72 sm:w-96 max-w-[calc(100vw-24px)] bg-surface border border-subtle rounded-xl shadow-2xl p-3 z-50">
              <div className="flex items-center justify-between pb-2.5 mb-2.5 border-b border-subtle">
                <span className="text-xs font-medium text-primary">Alertas e notificações</span>
                <span className="text-xs font-mono text-muted">{unreadCount} não lidas</span>
              </div>

              <div className="max-h-72 overflow-y-auto space-y-2 pr-1 scrollbar-thin">
                {notifications.length === 0 ? (
                  <p className="text-xs text-muted text-center py-6">Nenhum alerta pendente</p>
                ) : (
                  notifications.map(item => (
                    <div
                      key={item.id}
                      onClick={() => handleMarkAsRead(item.id)}
                      className={`p-3 rounded-lg border transition-colors cursor-pointer ${
                        item.is_read
                          ? 'bg-canvas border-subtle opacity-60'
                          : 'bg-raised border-border-focus'
                      }`}
                    >
                      <div className="flex items-start gap-2.5">
                        <div className="mt-0.5">{getNotificationIcon(item.type)}</div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium text-primary">{item.title}</p>
                          <p className="text-xs text-secondary mt-0.5 leading-snug">{item.message}</p>
                          <div className="flex items-center gap-2 mt-1.5 text-[11px] text-muted font-mono">
                            <span>{item.channel === 'WHATSAPP' ? 'WhatsApp' : 'Sistema'}</span>
                            <span>•</span>
                            <span>{item.trigger_date}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        {/* Quick Transaction Action Button */}
        <button
          onClick={onOpenNewTransaction}
          className="h-9 flex items-center gap-1.5 px-3 bg-[#10B981] hover:bg-[#059669] text-black font-medium text-xs sm:text-[13px] rounded-lg transition-colors active:scale-[0.98]"
        >
          <Plus className="w-4 h-4 stroke-[1.75]" />
          <span className="hidden sm:inline">Lançar</span>
        </button>
      </div>
    </header>
  );
};
