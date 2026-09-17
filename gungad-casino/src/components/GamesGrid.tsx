import React, { useState } from 'react';
import { GameInfo, GameId } from '../types';
import { GAMES } from '../data/games';
import { t } from '../translations';
import { soundFx } from '../utils/sound';
import { PromoCarousel } from './PromoCarousel';
import {
  Play,
  Lock,
  LayoutGrid,
  Cherry,
  Zap,
  Spade,
  Dices,
} from 'lucide-react';

interface GamesGridProps {
  onSelectGame: (id: GameId) => void;
  lang: any;
  onlineCount?: number | null;
  onOpenBonus?: () => void;
  onInvite?: () => void;
}

const PROMO_STYLE: Record<string, string> = {
  hot: 'bg-[#E50914] text-white border-[#991B1B]/60',
  new: 'bg-white text-black border-white/60',
  top: 'bg-[#7F1D1D] text-white border-[#991B1B]/60',
};

type CategoryId = 'all' | 'slots' | 'quick' | 'poker' | 'board';

const CATEGORIES: { id: CategoryId; icon: React.ReactNode }[] = [
  { id: 'all', icon: <LayoutGrid className="w-4 h-4" /> },
  { id: 'slots', icon: <Cherry className="w-4 h-4" /> },
  { id: 'quick', icon: <Zap className="w-4 h-4" /> },
  { id: 'poker', icon: <Spade className="w-4 h-4" /> },
  { id: 'board', icon: <Dices className="w-4 h-4" /> },
];

function categoryLabel(id: CategoryId, lang: any): string {
  switch (id) {
    case 'all': return t('allCategories', lang);
    case 'slots': return t('slotsCategory', lang);
    case 'quick': return t('quickCategory', lang);
    case 'poker': return t('pokerName', lang);
    case 'board': return t('boardCategory', lang);
  }
}

function filterByCategory(cat: CategoryId): GameInfo[] {
  switch (cat) {
    case 'all': return GAMES;
    case 'slots': return GAMES.filter((g) => g.category === 'slots');
    case 'quick': return GAMES.filter((g) => g.category === 'crash' || g.category === 'instant' || g.category === 'arcade');
    case 'poker': return GAMES.filter((g) => g.locked);
    case 'board': return GAMES.filter((g) => !g.locked && (g.category === 'table' || g.category === 'cards'));
  }
}

/** Large 3D lobby card. Click anywhere → onSelectGame (same handler as before). */
const GameCard: React.FC<{
  game: GameInfo;
  lang: any;
  onSelectGame: (id: GameId) => void;
  slotBait?: boolean;
}> = ({ game, lang, onSelectGame, slotBait }) => {
  const titleKey = `${game.id}Name` as any;
  const gameTitle = t(titleKey, lang);
  const locked = Boolean(game.locked);

  return (
    <div
      onClick={() => {
        soundFx.playClick();
        onSelectGame(game.id);
      }}
      className="gg-card3d group relative cursor-pointer active:scale-[0.98] transition-transform"
    >
      <div
        className={`gg-card3d-inner relative overflow-hidden rounded-3xl border bg-[#121218] flex flex-col ${
          locked ? 'border-[#991B1B]/70' : 'border-white/10'
        }`}
      >
        {/* Art — 4:3 showcase */}
        <div className="relative w-full aspect-[4/3] overflow-hidden bg-zinc-900">
          <img
            src={game.image}
            alt={gameTitle}
            loading="lazy"
            className={`absolute inset-0 w-full h-full object-cover object-center group-hover:scale-108 transition-transform duration-500 ${locked ? 'grayscale-[.45] brightness-75' : ''}`}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-[#121218] via-[#121218]/20 to-transparent" />
          <div className="gg-card3d-glare" aria-hidden />

          {/* Promo tag */}
          {game.promo && (
            <span className={`absolute top-2.5 right-2.5 text-[10px] font-display font-black uppercase tracking-widest px-2.5 py-1 rounded-lg border shadow-[0_4px_14px_rgba(0,0,0,0.5)] ${PROMO_STYLE[game.promo]}`}>
              {game.promo}
            </span>
          )}

          {/* RTP chip */}
          <span className="absolute bottom-2.5 left-2.5 font-mono text-[10px] font-bold text-zinc-300 bg-black/60 border border-white/10 px-2 py-0.5 rounded-lg backdrop-blur-md">
            RTP {game.rtp}
          </span>

          {slotBait && (
            <span className="absolute bottom-2.5 right-2.5 font-display font-black italic text-sm text-white bg-[#7F1D1D]/90 border border-[#991B1B]/60 px-2.5 py-0.5 rounded-lg">
              100X
            </span>
          )}

          {locked && (
            <div className="absolute inset-0 bg-black/55 flex flex-col items-center justify-center gap-2">
              <div className="w-14 h-14 rounded-2xl bg-[#7F1D1D] border border-[#991B1B]/60 text-white flex items-center justify-center animate-lock-glow">
                <Lock className="w-7 h-7" strokeWidth={2.4} />
              </div>
              <span className="text-[10px] font-display font-black uppercase tracking-widest text-rose-200">
                {t('pokerLocked', lang)}
              </span>
            </div>
          )}
        </div>

        {/* Body */}
        <div className="flex items-center justify-between gap-2 px-3.5 py-3">
          <div className="min-w-0">
            <h3 className="font-display font-black text-sm sm:text-base text-white uppercase tracking-wide truncate group-hover:text-rose-200 transition-colors">
              {gameTitle}
            </h3>
            <p className="text-[11px] text-zinc-500 truncate mt-0.5">
              {t(game.descriptionKey as any, lang)}
            </p>
          </div>
          {!locked && (
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#E50914] text-white shadow-[0_6px_18px_rgba(0,0,0,0.5)] border border-[#991B1B]/60 group-hover:scale-105 transition-transform">
              <Play className="w-5 h-5 ml-0.5 fill-current" />
            </span>
          )}
        </div>
      </div>
    </div>
  );
};

export const GamesGrid: React.FC<GamesGridProps> = ({
  onSelectGame,
  lang,
  onlineCount = null,
  onOpenBonus,
  onInvite,
}) => {
  const [activeCategory, setActiveCategory] = useState<CategoryId>('all');
  const filteredGames = filterByCategory(activeCategory);

  return (
    <section className="flex flex-col gap-5 my-2">
      {/* ── Promo carousel ─────────────────────────────────────────── */}
      <PromoCarousel
        lang={lang}
        onPlaySlots={() => onSelectGame('slots')}
        onOpenBonus={() => onOpenBonus?.()}
        onInvite={() => onInvite?.()}
      />

      {/* ── Online + section title ─────────────────────────────────── */}
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-display font-black text-xl md:text-2xl text-white uppercase tracking-wider">
          {t('popularGames', lang)}
        </h2>
        {typeof onlineCount === 'number' && (
          <span className="flex items-center gap-1.5 text-xs font-mono font-bold text-zinc-400">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            {onlineCount}
          </span>
        )}
      </div>

      {/* ── Category rail: horizontal scroll with icons ────────────── */}
      <div className="flex items-center gap-2 overflow-x-auto scrollbar-none -mx-3 px-3 sm:mx-0 sm:px-0 pb-1">
        {CATEGORIES.map((cat) => (
          <button
            key={cat.id}
            type="button"
            onClick={() => {
              soundFx.playClick();
              setActiveCategory(cat.id);
            }}
            className={`flex items-center gap-1.5 px-4 py-2.5 min-h-[44px] rounded-2xl text-xs font-display font-bold uppercase shrink-0 touch-manipulation transition-all active:scale-[0.96] border ${
              activeCategory === cat.id
                ? 'bg-[#E50914] text-white border-[#991B1B]/60 shadow-[0_4px_14px_rgba(0,0,0,0.45)]'
                : 'bg-[#121218] text-zinc-400 border-white/10 hover:text-white'
            }`}
          >
            {cat.icon}
            {categoryLabel(cat.id, lang)}
          </button>
        ))}
      </div>

      {/* ── Games grid ─────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3.5 sm:gap-4">
        {filteredGames.map((game) => (
          <GameCard
            key={game.id}
            game={game}
            lang={lang}
            onSelectGame={onSelectGame}
            slotBait={game.category === 'slots'}
          />
        ))}
      </div>
    </section>
  );
};
