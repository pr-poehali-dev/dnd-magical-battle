import React from 'react';
import { Quest } from '@/game/types';

interface Props {
  quests: Quest[];
  onBack: () => void;
}

const GRADE_COLORS: Record<string, string> = {
  S: '#ff0040', A: '#ff6b35', B: '#ffd700', C: '#00d4ff', D: '#888',
};

export default function QuestsScreen({ quests, onBack }: Props) {
  const active = quests.filter(q => q.active && !q.completed);
  const completed = quests.filter(q => q.completed);
  const locked = quests.filter(q => !q.active && !q.completed);

  const renderQuest = (q: Quest, dimmed = false) => (
    <div
      key={q.id}
      className="p-4 rounded-2xl border transition-all duration-200"
      style={{
        borderColor: q.completed ? '#22c55e40' : q.active ? `${GRADE_COLORS[q.grade]}40` : '#333',
        backgroundColor: q.completed ? '#14532d10' : q.active ? `${GRADE_COLORS[q.grade]}08` : 'rgba(255,255,255,0.02)',
        opacity: dimmed ? 0.4 : 1,
      }}
    >
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-lg flex items-center justify-center font-black text-lg flex-shrink-0"
            style={{
              backgroundColor: `${GRADE_COLORS[q.grade]}20`,
              color: GRADE_COLORS[q.grade],
              border: `1px solid ${GRADE_COLORS[q.grade]}60`,
            }}
          >
            {q.grade}
          </div>
          <div>
            <div className="text-white font-black text-base">{q.title}</div>
            <div className="text-gray-500 text-xs">{q.description}</div>
          </div>
        </div>
        {q.completed && (
          <div className="text-green-400 text-2xl flex-shrink-0">✓</div>
        )}
      </div>

      <div className="ml-13 ml-[52px]">
        <div className="text-purple-300 text-sm mb-2">
          📋 {q.objective}
        </div>

        {q.active && !q.completed && (
          <div className="space-y-1 mb-3">
            <div className="flex justify-between text-xs text-gray-400">
              <span>Прогресс</span>
              <span>{q.progress}/{q.required}</span>
            </div>
            <div className="h-2 bg-white/10 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{
                  width: `${(q.progress / q.required) * 100}%`,
                  backgroundColor: GRADE_COLORS[q.grade],
                }}
              />
            </div>
          </div>
        )}

        <div className="flex items-center gap-3 text-sm">
          <div className="flex items-center gap-1">
            <span className="text-yellow-400">✨</span>
            <span className="text-yellow-300 font-bold">{q.reward.exp} EXP</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="text-yellow-500">💰</span>
            <span className="text-yellow-200 font-bold">{q.reward.gold}</span>
          </div>
          {q.reward.items.length > 0 && (
            <div className="flex items-center gap-1">
              <span>{q.reward.items[0].emoji}</span>
              <span className="text-gray-400 text-xs">{q.reward.items[0].name}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#050510] flex flex-col" style={{ fontFamily: 'Rajdhani, sans-serif' }}>
      <div className="border-b border-purple-900/40 px-6 py-3 flex items-center gap-4">
        <button onClick={onBack} className="text-purple-400 hover:text-white text-sm font-mono tracking-widest transition-colors">
          ← НАЗАД
        </button>
        <h2 className="text-white font-black text-xl tracking-widest uppercase">📋 Задания</h2>
        <div className="ml-auto flex gap-2 text-xs font-mono">
          <span className="text-green-400">{completed.length} выполнено</span>
          <span className="text-purple-400">{active.length} активных</span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {active.length > 0 && (
          <section>
            <h3 className="text-purple-400 font-mono text-xs tracking-widest uppercase mb-3">
              — Активные задания ({active.length}) —
            </h3>
            <div className="space-y-3">
              {active.map(q => renderQuest(q))}
            </div>
          </section>
        )}

        {completed.length > 0 && (
          <section>
            <h3 className="text-green-600 font-mono text-xs tracking-widest uppercase mb-3">
              — Выполненные ({completed.length}) —
            </h3>
            <div className="space-y-3">
              {completed.map(q => renderQuest(q))}
            </div>
          </section>
        )}

        {locked.length > 0 && (
          <section>
            <h3 className="text-gray-600 font-mono text-xs tracking-widest uppercase mb-3">
              — Недоступные ({locked.length}) —
            </h3>
            <div className="space-y-3">
              {locked.map(q => renderQuest(q, true))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
