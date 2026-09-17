import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Gift, Users, ChevronRight } from 'lucide-react';
import { t } from '../translations';
import { soundFx } from '../utils/sound';

interface PromoCarouselProps {
  lang: any;
  onPlaySlots: () => void;
  onOpenBonus: () => void;
  onInvite: () => void;
}

const AUTOPLAY_MS = 6000;
/** Quiet period after the user touches the carousel before autoplay resumes */
const RESUME_MS = 3000;

/**
 * Lobby promo slider: Jackpot / Daily bonus / Referral.
 * Pure presentational carousel — all CTAs reuse existing app handlers.
 *
 * Scroll math is measured from the DOM (slide centers), never assumed from
 * page width, so partial-width slides + gaps can't desync dots/autoplay.
 * Autoplay yields to the user: any scroll gesture pauses it for RESUME_MS,
 * so it never fights finger momentum (no overshoot / jerk-back).
 */
export const PromoCarousel: React.FC<PromoCarouselProps> = ({
  lang,
  onPlaySlots,
  onOpenBonus,
  onInvite,
}) => {
  const trackRef = useRef<HTMLDivElement>(null);
  const pausedRef = useRef(false);
  const lastTouchRef = useRef(0);
  const resumeTimer = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);
  const activeRef = useRef(0);
  const [active, setActive] = useState(0);

  const slides = [
    {
      id: 'jackpot',
      cls: 'gg-promo-jackpot',
      title: t('promoJackpotTitle', lang),
      sub: t('promoJackpotSub', lang),
      cta: t('promoJackpotCta', lang),
      onCta: onPlaySlots,
      art: (
        <img
          src="/assets/jackpot-orb.png"
          alt=""
          aria-hidden
          className="h-24 w-24 sm:h-28 sm:w-28 object-contain shrink-0"
          loading="eager"
        />
      ),
    },
    {
      id: 'bonus',
      cls: 'gg-promo-bonus',
      title: t('promoBonusTitle', lang),
      sub: t('promoBonusSub', lang),
      cta: t('promoBonusCta', lang),
      onCta: onOpenBonus,
      art: (
        <span className="flex h-20 w-20 sm:h-24 sm:w-24 items-center justify-center rounded-3xl bg-[#E50914]/15 border border-[#991B1B]/50 shrink-0">
          <Gift className="h-10 w-10 text-rose-400" />
        </span>
      ),
    },
    {
      id: 'referral',
      cls: 'gg-promo-ref',
      title: t('promoRefTitle', lang),
      sub: t('promoRefSub', lang),
      cta: t('promoRefCta', lang),
      onCta: onInvite,
      art: (
        <span className="flex h-20 w-20 sm:h-24 sm:w-24 items-center justify-center rounded-3xl bg-white/5 border border-white/10 shrink-0">
          <Users className="h-10 w-10 text-zinc-200" />
        </span>
      ),
    },
  ];

  const setActiveBoth = useCallback((idx: number) => {
    activeRef.current = idx;
    setActive(idx);
  }, []);

  /** Index of the slide whose center is nearest to the viewport center */
  const measureActive = useCallback(() => {
    const el = trackRef.current;
    if (!el || el.children.length === 0) return 0;
    const trackRect = el.getBoundingClientRect();
    const viewportCenter = trackRect.left + trackRect.width / 2;
    let best = 0;
    let bestDist = Infinity;
    for (let i = 0; i < el.children.length; i++) {
      const r = (el.children[i] as HTMLElement).getBoundingClientRect();
      const dist = Math.abs(r.left + r.width / 2 - viewportCenter);
      if (dist < bestDist) {
        bestDist = dist;
        best = i;
      }
    }
    return best;
  }, []);

  /** Scroll so slide `idx` is centered — lands exactly on its snap point */
  const goTo = useCallback((idx: number) => {
    const el = trackRef.current;
    const child = el?.children[idx] as HTMLElement | undefined;
    if (!el || !child) return;
    const trackRect = el.getBoundingClientRect();
    const childRect = child.getBoundingClientRect();
    const target =
      el.scrollLeft +
      (childRect.left - trackRect.left) -
      (trackRect.width - childRect.width) / 2;
    el.scrollTo({ left: target, behavior: 'smooth' });
  }, []);

  useEffect(() => {
    const id = window.setInterval(() => {
      if (pausedRef.current || document.hidden) return;
      if (Date.now() - lastTouchRef.current < RESUME_MS) return;
      const next = (activeRef.current + 1) % slides.length;
      goTo(next);
    }, AUTOPLAY_MS);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [goTo]);

  useEffect(() => {
    return () => {
      if (resumeTimer.current) window.clearTimeout(resumeTimer.current);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  const handleScroll = () => {
    // Any scroll = user (or momentum) is in control: pause autoplay...
    pausedRef.current = true;
    lastTouchRef.current = Date.now();
    if (resumeTimer.current) window.clearTimeout(resumeTimer.current);
    resumeTimer.current = window.setTimeout(() => {
      pausedRef.current = false;
    }, RESUME_MS);
    // ...and sync dots to the truly centered slide (rAF-throttled)
    if (rafRef.current) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      setActiveBoth(measureActive());
    });
  };

  return (
    <div className="flex flex-col gap-2">
      <div
        ref={trackRef}
        onScroll={handleScroll}
        className="flex gap-3 overflow-x-auto snap-x snap-mandatory scrollbar-none -mx-3 px-3 sm:mx-0 sm:px-0"
      >
        {slides.map((s) => (
          <div
            key={s.id}
            className={`relative snap-center shrink-0 w-[86%] sm:w-full overflow-hidden rounded-3xl border border-white/10 ${s.cls}`}
          >
            <div className="gg-promo-dots pointer-events-none absolute inset-0 opacity-60" aria-hidden />
            <div className="relative flex items-center justify-between gap-3 p-4 sm:p-5 min-h-[128px]">
              <div className="flex flex-col gap-1 min-w-0">
                <span className="font-display font-black text-lg sm:text-xl text-white uppercase tracking-wide leading-tight">
                  {s.title}
                </span>
                <span className="text-xs text-zinc-400 leading-snug">{s.sub}</span>
                <button
                  type="button"
                  onClick={() => { soundFx.playClick(); s.onCta(); }}
                  className="gg-btn-primary mt-2 inline-flex w-fit items-center gap-1 px-4 py-2 min-h-[40px] rounded-xl text-xs font-display font-bold uppercase touch-manipulation"
                >
                  {s.cta}
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
              {s.art}
            </div>
          </div>
        ))}
      </div>
      <div className="flex items-center justify-center gap-1.5" aria-hidden>
        {slides.map((s, i) => (
          <button
            key={s.id}
            type="button"
            tabIndex={-1}
            onClick={() => { soundFx.playClick(); setActiveBoth(i); goTo(i); }}
            className={`h-1.5 rounded-full transition-all ${
              active === i ? 'w-6 bg-[#E50914]' : 'w-1.5 bg-zinc-700'
            }`}
          />
        ))}
      </div>
    </div>
  );
};
