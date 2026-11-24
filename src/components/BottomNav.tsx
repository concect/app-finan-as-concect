import React from 'react';
import {
  LayoutDashboard,
  CalendarDays,
  Plus,
  MessageSquare,
  MoreHorizontal
} from 'lucide-react';

interface BottomNavProps {
  currentTab: string;
  setCurrentTab: (tab: string) => void;
  onOpenNewTransaction: () => void;
  onOpenMore: () => void;
}

export const BottomNav: React.FC<BottomNavProps> = ({
  currentTab,
  setCurrentTab,
  onOpenNewTransaction,
  onOpenMore
}) => {
  const isMoreTabActive = ['accounts', 'planning', 'goals', 'ai', 'gamification', 'settings'].includes(currentTab);

  return (
    <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-30 bg-deep/95 backdrop-blur-md border-t border-subtle px-2 pt-1.5 pb-safe">
      <div className="h-14 flex items-center justify-around max-w-md mx-auto">
        <button
          onClick={() => setCurrentTab('overview')}
          className={`flex flex-col items-center justify-center gap-1 min-w-[56px] py-1 text-[11px] transition-colors ${
            currentTab === 'overview' ? 'text-primary font-medium' : 'text-muted hover:text-primary'
          }`}
        >
          <LayoutDashboard className="w-4 h-4 stroke-[1.5]" />
          <span>Início</span>
        </button>

        <button
          onClick={() => setCurrentTab('transactions')}
          className={`flex flex-col items-center justify-center gap-1 min-w-[56px] py-1 text-[11px] transition-colors ${
            currentTab === 'transactions' ? 'text-primary font-medium' : 'text-muted hover:text-primary'
          }`}
        >
          <CalendarDays className="w-4 h-4 stroke-[1.5]" />
          <span>Extrato</span>
        </button>

        <button
          onClick={onOpenNewTransaction}
          className="w-10 h-10 rounded-lg bg-primary text-canvas flex items-center justify-center transition-transform active:scale-95 shrink-0"
          title="Novo lançamento"
        >
          <Plus className="w-5 h-5 stroke-[1.75]" />
        </button>

        <button
          onClick={() => setCurrentTab('whatsapp')}
          className={`flex flex-col items-center justify-center gap-1 min-w-[56px] py-1 text-[11px] transition-colors ${
            currentTab === 'whatsapp' ? 'text-primary font-medium' : 'text-muted hover:text-primary'
          }`}
        >
          <MessageSquare className="w-4 h-4 stroke-[1.5]" />
          <span>WhatsApp</span>
        </button>

        <button
          onClick={onOpenMore}
          className={`flex flex-col items-center justify-center gap-1 min-w-[56px] py-1 text-[11px] transition-colors ${
            isMoreTabActive ? 'text-primary font-medium' : 'text-muted hover:text-primary'
          }`}
        >
          <MoreHorizontal className="w-4 h-4 stroke-[1.5]" />
          <span>Mais</span>
        </button>
      </div>
    </nav>
  );
};
