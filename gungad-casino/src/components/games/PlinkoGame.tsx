import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { Currency, UserProfile, BetHistoryItem } from '../../types';
import { t } from '../../translations';
import { BetControls } from '../BetControls';
import { soundFx } from '../../utils/sound';
import confetti from 'canvas-confetti';
import { keepLiveWin, nearestLosingPlinkoBucket, plinkoMultipliers } from '../../game/demoOdds';

interface PlinkoGameProps {
  user: UserProfile;
  currency: Currency;
  lang: any;
  playMode?: 'real' | 'demo';
  onUpdateBalance: (newBalanceUSD: number) => void;
  onAddHistory: (item: BetHistoryItem) => void;
}

const ROW_COUNT = 8;
const MAX_FLASHES = 12;
const STEP_MS = 100;
const FLASH_MS = 350;

interface BallState {
  id: number;
  x: number;
  y: number;
}

/** A peg that just got hit — rendered as a glow on the peg itself (no extra layers). */
interface PegFlash {
  id: number;
  key: string;
}

interface ActiveBall {
  id: number;
  path: { x: number; y: number; peg: boolean; row: number; pegIdx: number }[];
  step: number;
  nextAt: number;
  stake: number;
  bucketIndex: number;
  buckets: number[];
}

export const PlinkoGame: React.FC<PlinkoGameProps> = ({
  user,
  currency,
  lang,
  playMode = 'real',
  onUpdateBalance,
  onAddHistory,
}) => {
  const [betAmountUSD, setBetAmountUSD] = useState<number>(10);
  const [risk, setRisk] = useState<'low' | 'medium' | 'high'>('medium');
  const [balls, setBalls] = useState<BallState[]>([]);
  const [flashes, setFlashes] = useState<PegFlash[]>([]);
  const [lastMultiplier, setLastMultiplier] = useState<number | null>(null);
  const [hitBuckets, setHitBuckets] = useState<Record<number, number>>({});
  const [lastBetUSD, setLastBetUSD] = useState<number>(10);

  const mountedRef = useRef(true);
  const ballIdRef = useRef(0);
  const flashIdRef = useRef(0);
  const balanceRef = useRef(user.balanceUSD);
  const bucketsRef = useRef<number[]>([]);
  const activeRef = useRef<Map<number, ActiveBall>>(new Map());
  const rafRef = useRef<number | null>(null);
  const positionsDirty = useRef(false);
  const pendingFlashes = useRef<PegFlash[]>([]);
  const settleQueue = useRef<Array<() => void>>([]);

  /** Pegs hit in the last FLASH_MS — looked up while rendering the peg grid. */
  const flashSet = useMemo(() => new Set(flashes.map((f) => f.key)), [flashes]);

  useEffect(() => {
    if (activeRef.current.size > 0) return;
    balanceRef.current = user.balanceUSD;
  }, [user.balanceUSD]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      activeRef.current.clear();
    };
  }, []);

  const buckets = plinkoMultipliers(risk, playMode === 'demo');
  bucketsRef.current = buckets;
  const BUCKET_COUNT = buckets.length;

  const pegRows = useMemo(() => {
    return Array.from({ length: ROW_COUNT }, (_, i) => 3 + i);
  }, []);

  const bottomPegs = pegRows[pegRows.length - 1];
  const pegStep = 92 / (bottomPegs - 1);
  const boardCenter = 50;

  const getPegX = (rowIdx: number, pegIdx: number) => {
    const count = pegRows[rowIdx];
    const rowWidth = pegStep * (count - 1);
    const startX = boardCenter - rowWidth / 2;
    return startX + pegIdx * pegStep;
  };

  const getRowY = (rowIdx: number) => {
    return 6 + (rowIdx / (ROW_COUNT - 1)) * 76;
  };

  const flushUi = useCallback(() => {
    if (!mountedRef.current) return;

    if (positionsDirty.current) {
      positionsDirty.current = false;
      const next: BallState[] = [];
      activeRef.current.forEach((b) => {
        const pt = b.path[Math.min(b.step, b.path.length - 1)];
        next.push({ id: b.id, x: pt.x, y: pt.y });
      });
      setBalls(next);
    }

    if (pendingFlashes.current.length) {
      const add = pendingFlashes.current.splice(0, pendingFlashes.current.length);
      setFlashes((prev) => {
        const merged = [...prev, ...add];
        return merged.length > MAX_FLASHES ? merged.slice(-MAX_FLASHES) : merged;
      });
      // Auto-remove after flash
      add.forEach((f) => {
        window.setTimeout(() => {
          if (!mountedRef.current) return;
          setFlashes((prev) => prev.filter((x) => x.id !== f.id));
        }, FLASH_MS);
      });
    }

    while (settleQueue.current.length) {
      const fn = settleQueue.current.shift();
      fn?.();
    }
  }, []);

  const ensureLoop = useCallback(() => {
    if (rafRef.current != null) return;

    const tick = (now: number) => {
      if (!mountedRef.current) {
        rafRef.current = null;
        return;
      }

      let any = false;
      activeRef.current.forEach((ball, id) => {
        any = true;
        if (now < ball.nextAt) return;

        ball.step += 1;
        ball.nextAt = now + STEP_MS;

        if (ball.step >= ball.path.length) {
          activeRef.current.delete(id);
          positionsDirty.current = true;

          const winMult = ball.buckets[ball.bucketIndex];
          const payoutUSD = ball.stake * winMult;
          const bucketIndex = ball.bucketIndex;

          settleQueue.current.push(() => {
            setHitBuckets((prev) => ({ ...prev, [bucketIndex]: Date.now() }));
            setLastMultiplier(winMult);
            if (winMult >= 5) confetti({ particleCount: 40, spread: 50 });
            soundFx[winMult > 1.0 ? 'playWin' : 'playLoss']();
            const nextBal = balanceRef.current + payoutUSD;
            balanceRef.current = nextBal;
            onUpdateBalance(nextBal);
            onAddHistory({
              id: `${Date.now()}-${id}`,
              gameId: 'plinko',
              gameName: t('plinkoName', lang),
              timestamp: new Date(),
              betAmountUSD: ball.stake,
              multiplier: winMult,
              payoutUSD,
              win: winMult >= 1.0,
              currency,
            });
          });
          return;
        }

        const pt = ball.path[ball.step];
        positionsDirty.current = true;
        if (pt.peg) {
          soundFx.playChip();
          pendingFlashes.current.push({
            id: ++flashIdRef.current,
            key: `${pt.row}-${pt.pegIdx}`,
          });
        }
      });

      flushUi();

      if (any || activeRef.current.size > 0) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        rafRef.current = null;
        flushUi();
      }
    };

    rafRef.current = requestAnimationFrame(tick);
  }, [flushUi, onUpdateBalance, onAddHistory, lang, currency]);

  const handleDrop = () => {
    if (betAmountUSD <= 0 || betAmountUSD > balanceRef.current) return;

    const stake = betAmountUSD;
    const riskBuckets = bucketsRef.current;

    soundFx.playClick();
    const afterBet = balanceRef.current - stake;
    balanceRef.current = afterBet;
    onUpdateBalance(afterBet);
    setLastBetUSD(stake);

    const id = ++ballIdRef.current;
    const isDemo = playMode === 'demo';

    const goRight: boolean[] = Array.from({ length: ROW_COUNT }, () => Math.random() < 0.5);

    let rights = 0;
    const path: { x: number; y: number; peg: boolean; row: number; pegIdx: number }[] = [];
    path.push({ x: boardCenter, y: 2, peg: false, row: -1, pegIdx: -1 });

    for (let r = 0; r < ROW_COUNT; r++) {
      if (goRight[r]) rights++;
      const count = pegRows[r];
      const rowWidth = pegStep * (count - 1);
      const startX = boardCenter - rowWidth / 2;
      const idx = Math.min(Math.max(0, rights), count - 1);
      path.push({ x: startX + idx * pegStep, y: getRowY(r), peg: true, row: r, pegIdx: idx });
    }

    let bucketIndex = Math.max(0, Math.min(BUCKET_COUNT - 1, rights));
    if (riskBuckets[bucketIndex] > 1 && !keepLiveWin(true, isDemo)) {
      bucketIndex = nearestLosingPlinkoBucket(riskBuckets, bucketIndex);
    }
    const bucketX = (100 / BUCKET_COUNT) * (bucketIndex + 0.5);
    path.push({ x: bucketX, y: 92, peg: false, row: -1, pegIdx: -1 });

    activeRef.current.set(id, {
      id,
      path,
      step: 0,
      nextAt: performance.now() + 40,
      stake,
      bucketIndex,
      buckets: riskBuckets,
    });
    positionsDirty.current = true;
    flushUi();
    ensureLoop();
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-3">
      <div className="lg:col-span-4 order-1 lg:order-2 flex flex-col gap-2.5">
        <div className="gg-console-btn rounded-2xl p-2.5 flex flex-col gap-1.5 shrink-0">
          <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">{t('riskLevel', lang)}</label>
          <div className="grid grid-cols-3 gap-1.5">
            {(['low', 'medium', 'high'] as const).map((r) => (
              <button
                key={r}
                onClick={() => { soundFx.playClick(); setRisk(r); }}
                className={`py-2 min-h-[44px] text-[11px] font-display font-bold uppercase rounded-xl border transition-all touch-manipulation active:scale-[0.97] ${
                  risk === r
                    ? r === 'low' ? 'bg-emerald-950/70 border-emerald-700/70 text-emerald-300'
                    : r === 'medium' ? 'bg-amber-950/60 border-amber-700/70 text-amber-200'
                    : 'bg-rose-950/70 border-[#E50914] text-rose-200'
                    : 'bg-[#0D0D11] border-white/10 text-zinc-400'
                }`}
              >
                {t(r as any, lang)}
              </button>
            ))}
          </div>
        </div>

        <BetControls
          betAmountUSD={betAmountUSD}
          onBetAmountChangeUSD={setBetAmountUSD}
          userBalanceUSD={user.balanceUSD}
          currency={currency}
          lang={lang}
          disabled={false}
          lastBetUSD={lastBetUSD}
          actionButtonLabel={t('dropBall', lang)}
          onAction={handleDrop}
          actionDisabled={betAmountUSD > user.balanceUSD || betAmountUSD <= 0}
          compact
        />
      </div>

      <div className="lg:col-span-8 order-2 lg:order-1 flex flex-col gap-2">
        <div
          className="gg-felt relative border border-white/10 rounded-3xl overflow-hidden shadow-[0_8px_24px_rgba(0,0,0,0.45)] w-full mx-auto max-h-[min(52vh,480px)] max-w-[480px]"
          style={{ aspectRatio: '1 / 1' }}
        >
          <div className="absolute inset-0 z-10 pointer-events-none">
            {pegRows.map((count, rowIdx) =>
              Array.from({ length: count }).map((_, pegIdx) => {
                const flashed = flashSet.has(`${rowIdx}-${pegIdx}`);
                return (
                  <div
                    key={`${rowIdx}-${pegIdx}`}
                    className={`absolute w-2 h-2 rounded-full transition-all duration-150 ${
                      flashed
                        ? 'bg-gradient-to-b from-rose-200 to-[#E50914] shadow-[0_0_10px_rgba(229,9,20,0.9)]'
                        : 'bg-gradient-to-b from-zinc-100 to-zinc-500 shadow-[0_1px_3px_rgba(0,0,0,0.6)]'
                    }`}
                    style={{
                      left: `${getPegX(rowIdx, pegIdx)}%`,
                      top: `${getRowY(rowIdx)}%`,
                      transform: `translate(-50%, -50%) scale(${flashed ? 2 : 1})`,
                    }}
                  />
                );
              }),
            )}
          </div>

          {balls.map((b) => (
            <div
              key={b.id}
              className="absolute w-3 h-3 rounded-full bg-gradient-to-b from-[#ff4d57] to-[#B00710] border border-[#7f0d14] shadow-[0_2px_8px_rgba(0,0,0,0.5)] z-20 will-change-transform"
              style={{
                left: `${b.x}%`,
                top: `${b.y}%`,
                transform: 'translate(-50%, -50%)',
                transition: 'left 90ms linear, top 90ms linear',
              }}
            />
          ))}

          <div
            className="absolute bottom-1 z-10 flex"
            style={{
              left: `${boardCenter - (pegStep * (bottomPegs - 1)) / 2 - pegStep / 2}%`,
              width: `${pegStep * bottomPegs}%`,
            }}
          >
            {buckets.map((m, idx) => {
              const recentlyHit = hitBuckets[idx] && Date.now() - hitBuckets[idx] < 600;
              const distCenter = Math.abs(idx - (buckets.length - 1) / 2) / ((buckets.length - 1) / 2);
              const edgeGlow = distCenter > 0.75 ? 'border-[#E50914]/70' : distCenter > 0.4 ? 'border-[#991B1B]/50' : 'border-white/10';
              return (
                <div
                  key={idx}
                  className={`gg-paycell flex-1 mx-px h-8 flex items-center justify-center font-mono font-bold text-[9px] rounded-lg transition-all ${
                    recentlyHit
                      ? 'gg-win-in bg-amber-300 text-black scale-105'
                      : m >= 10
                      ? `bg-gradient-to-b from-[#E50914] to-[#7f0d14] text-white ${edgeGlow}`
                      : m >= 2
                      ? `bg-gradient-to-b from-[#7f1d2d] to-[#2a0d13] text-rose-200 ${edgeGlow}`
                      : m >= 1
                      ? 'bg-gradient-to-b from-zinc-700 to-zinc-900 text-zinc-200'
                      : 'bg-gradient-to-b from-zinc-800 to-[#0D0D11] text-zinc-500'
                  }`}
                >
                  {m}x
                </div>
              );
            })}
          </div>
        </div>

        {lastMultiplier !== null && (
          <div className="gg-win-in text-center font-display font-black text-xl text-rose-300 bg-[#121218] border border-[#991B1B]/50 rounded-2xl py-1.5 mx-auto w-full max-w-[480px]">
            {lastMultiplier}x
          </div>
        )}
      </div>
    </div>
  );
};
