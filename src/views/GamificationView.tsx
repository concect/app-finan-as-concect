import React from 'react';
import {
  Award,
  CheckCircle2,
  Lock
} from 'lucide-react';
import { GamificationProfile, Badge, Challenge, User, SYSTEM_BADGES } from '../types';
import { FirestoreService } from '../services/firestoreService';

interface GamificationViewProps {
  user: User;
  gamification: GamificationProfile;
  onRefreshData: () => void;
}

export const GamificationView: React.FC<GamificationViewProps> = ({
  user,
  gamification,
  onRefreshData
}) => {
  const allBadges: Badge[] = SYSTEM_BADGES;

  const currentLevelBaseXp = ((gamification.level || 1) - 1) * 300;
  const xpInCurrentLevel = (gamification.xp_points || 0) - currentLevelBaseXp;
  const xpRequiredForNext = 300;
  const levelProgressPct = Math.min(100, Math.max(0, Math.round((xpInCurrentLevel / xpRequiredForNext) * 100)));

  const handleCompleteChallenge = async (ch: Challenge) => {
    await FirestoreService.addXp(user.id, ch.xp_reward, `Desafio concluído: ${ch.title}`);
    onRefreshData();
  };

  const score = gamification.financial_health_score || 700;
  const scoreRating = score >= 800 ? 'Sólida' : score >= 600 ? 'Equilibrada' : 'Em ajuste';

  return (
    <div className="space-y-6 min-w-0">
      {/* Top 3-Card Row: Score, Maturity & Consistency */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Score de Saúde Financeira */}
        <div className="bg-surface border border-subtle rounded-xl p-4 sm:p-5 flex flex-col justify-between space-y-4">
          <div className="flex items-center justify-between text-xs text-secondary">
            <span>Índice de saúde financeira</span>
            <span className="font-mono text-[#10B981]">{scoreRating}</span>
          </div>

          <div>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-medium font-mono text-primary tabular-nums">
                {score}
              </span>
              <span className="text-xs font-mono text-muted">/ 1000</span>
            </div>
            <p className="text-xs text-muted mt-1">
              Calculado sobre taxa de poupança, pontualidade, crédito e reserva
            </p>
          </div>

          <div className="pt-3 border-t border-subtle space-y-1.5 text-xs">
            <div className="flex justify-between text-secondary">
              <span>Taxa de poupança</span>
              <span className="font-mono text-primary tabular-nums">
                {gamification.score_factors?.savings_rate ?? 175} / 250
              </span>
            </div>
            <div className="flex justify-between text-secondary">
              <span>Pontualidade de contas</span>
              <span className="font-mono text-primary tabular-nums">
                {gamification.score_factors?.bill_punctuality ?? 175} / 250
              </span>
            </div>
            <div className="flex justify-between text-secondary">
              <span>Uso do limite de cartão</span>
              <span className="font-mono text-primary tabular-nums">
                {gamification.score_factors?.credit_utilization ?? 175} / 250
              </span>
            </div>
            <div className="flex justify-between text-secondary">
              <span>Reserva de emergência</span>
              <span className="font-mono text-primary tabular-nums">
                {gamification.score_factors?.emergency_fund ?? 175} / 250
              </span>
            </div>
          </div>
        </div>

        {/* Nível e Experiência */}
        <div className="bg-surface border border-subtle rounded-xl p-4 sm:p-5 flex flex-col justify-between space-y-4">
          <div className="flex items-center justify-between text-xs text-secondary">
            <span>Maturidade de gestão</span>
            <span className="font-mono text-[#C5A059]">{gamification.level_title}</span>
          </div>

          <div>
            <span className="text-3xl font-medium font-mono text-primary tabular-nums block">
              Nível {gamification.level}
            </span>
            <p className="text-xs text-muted mt-1 font-mono tabular-nums">
              {gamification.xp_points} pontos acumulados
            </p>
          </div>

          <div className="space-y-2 pt-3 border-t border-subtle">
            <div className="flex justify-between text-xs text-secondary">
              <span>Progresso para o nível {gamification.level + 1}</span>
              <span className="font-mono text-primary tabular-nums">{levelProgressPct}%</span>
            </div>
            <div className="w-full bg-canvas h-1.5 rounded-full overflow-hidden">
              <div
                className="bg-[#C5A059] h-full rounded-full"
                style={{ width: `${levelProgressPct}%` }}
              />
            </div>
            <p className="text-[11px] text-muted text-right font-mono tabular-nums">
              Restam {Math.max(0, xpRequiredForNext - xpInCurrentLevel)} XP
            </p>
          </div>
        </div>

        {/* Constância (Streak) */}
        <div className="bg-surface border border-subtle rounded-xl p-4 sm:p-5 flex flex-col justify-between space-y-4">
          <div className="flex items-center justify-between text-xs text-secondary">
            <span>Constância de registros</span>
            <span className="font-mono text-muted">Histórico</span>
          </div>

          <div>
            <span className="text-3xl font-medium font-mono text-primary tabular-nums block">
              {gamification.current_streak} {gamification.current_streak === 1 ? 'dia' : 'dias'}
            </span>
            <p className="text-xs text-muted mt-1">
              Sequência atual de conciliação ativa
            </p>
          </div>

          <div className="pt-3 border-t border-subtle text-xs text-secondary space-y-1.5">
            <div className="flex justify-between">
              <span>Maior sequência registrada</span>
              <span className="font-mono text-primary tabular-nums">{gamification.longest_streak} dias</span>
            </div>
            <p className="text-[11px] text-muted">
              Cada lançamento pelo painel ou WhatsApp mantém a sequência diária
            </p>
          </div>
        </div>
      </div>

      {/* Desafios Financeiros Ativos */}
      <div className="bg-surface border border-subtle rounded-xl p-4 sm:p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-[15px] font-medium text-primary">Metas de hábito em andamento</h3>
            <p className="text-xs text-muted mt-0.5">
              Ciclos práticos de contenção de gastos variáveis e disciplina
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {gamification.active_challenges.map(ch => {
            const isCompleted = ch.is_completed || ch.current_days >= ch.target_days;
            const progress = Math.min(100, Math.round((ch.current_days / ch.target_days) * 100));

            return (
              <div
                key={ch.id}
                className={`p-4 rounded-xl border flex flex-col justify-between space-y-4 ${
                  isCompleted
                    ? 'bg-[#10B981]/5 border-[#10B981]/30'
                    : 'bg-canvas border-subtle'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between text-xs mb-1.5">
                    <span className="font-medium text-primary">{ch.title}</span>
                    <span className="font-mono text-[11px] text-[#C5A059]">
                      +{ch.xp_reward} XP
                    </span>
                  </div>
                  <p className="text-xs text-muted leading-relaxed">{ch.description}</p>
                </div>

                <div className="space-y-1.5">
                  <div className="flex justify-between text-[11px] text-muted font-mono tabular-nums">
                    <span>{ch.current_days} de {ch.target_days} dias</span>
                    <span>{progress}%</span>
                  </div>
                  <div className="w-full bg-raised h-1.5 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${
                        isCompleted ? 'bg-[#10B981]' : 'bg-[#C5A059]'
                      }`}
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                </div>

                <div className="pt-2.5 border-t border-subtle flex justify-end">
                  {isCompleted ? (
                    <span className="flex items-center gap-1.5 text-xs text-[#10B981] font-medium">
                      <CheckCircle2 className="w-3.5 h-3.5 stroke-[1.5]" />
                      <span>Concluído</span>
                    </span>
                  ) : (
                    <button
                      onClick={() => handleCompleteChallenge(ch)}
                      className="h-7 px-2.5 bg-raised hover:opacity-90 text-xs font-medium text-primary rounded-md border border-subtle transition-colors"
                    >
                      Registrar dia
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Marcos Patrimoniais */}
      <div className="bg-surface border border-subtle rounded-xl p-4 sm:p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-[15px] font-medium text-primary">Marcos alcançados</h3>
            <p className="text-xs text-muted mt-0.5">
              Registros de evolução patrimonial na plataforma
            </p>
          </div>
          <span className="text-xs text-muted font-mono tabular-nums">
            {gamification.badges_unlocked.length} / {allBadges.length}
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {allBadges.map(badge => {
            const isUnlocked = gamification.badges_unlocked.includes(badge.id);

            return (
              <div
                key={badge.id}
                className={`p-4 rounded-xl border flex items-start gap-3 transition-colors ${
                  isUnlocked
                    ? 'bg-canvas border-subtle'
                    : 'bg-canvas/50 border-subtle/60 opacity-55'
                }`}
              >
                <div
                  className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 border ${
                    isUnlocked
                      ? 'bg-raised text-[#C5A059] border-border-focus'
                      : 'bg-surface text-muted border-subtle'
                  }`}
                >
                  {isUnlocked ? <Award className="w-4 h-4 stroke-[1.5]" /> : <Lock className="w-4 h-4 stroke-[1.5]" />}
                </div>

                <div className="min-w-0">
                  <h4 className="text-xs font-medium text-primary truncate">{badge.title}</h4>
                  <p className="text-xs text-muted mt-0.5 leading-snug">
                    {badge.description}
                  </p>
                  {isUnlocked && badge.unlocked_at && (
                    <span className="text-[10px] text-[#10B981] font-mono mt-1.5 block">
                      {badge.unlocked_at.split('-').reverse().join('/')}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
