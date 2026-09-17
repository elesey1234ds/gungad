import React from 'react';
import { Currency } from '../types';
import { t, TranslationKey } from '../translations';
import { convertCurrencyToUSD, convertUSDToCurrency, CURRENCIES } from '../utils/currencies';
import { soundFx } from '../utils/sound';
import { RotateCcw, Zap } from 'lucide-react';

interface BetControlsProps {
  betAmountUSD: number;
  onBetAmountChangeUSD: (val: number) => void;
  userBalanceUSD: number;
  currency: Currency;
  lang: any;
  disabled?: boolean;
  minBetUSD?: number;
  maxBetUSD?: number;
  lastBetUSD?: number;
  actionButtonLabel?: string;
  onAction?: () => void;
  actionDisabled?: boolean;
  actionColor?: 'red' | 'green' | 'amber';
  secondaryAction?: {
    label: string;
    onClick: () => void;
    disabled?: boolean;
  };
  /** Tighter padding for mobile game layouts */
  compact?: boolean;
  /** Stretch to fill desktop bet column height */
  stretch?: boolean;
}

export const BetControls: React.FC<BetControlsProps> = ({
  betAmountUSD,
  onBetAmountChangeUSD,
  userBalanceUSD,
  currency,
  lang,
  disabled = false,
  minBetUSD = 0.1,
  maxBetUSD = 1000,
  lastBetUSD,
  actionButtonLabel,
  onAction,
  actionDisabled = false,
  actionColor = 'red',
  secondaryAction,
  compact = false,
  stretch = false,
}) => {
  const currentCurrencyConfig = CURRENCIES[currency];
  const displayAmount = convertUSDToCurrency(betAmountUSD, currency);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value) || 0;
    const usdVal = convertCurrencyToUSD(val, currency);
    onBetAmountChangeUSD(Math.max(0, usdVal));
  };

  const handleMin = () => {
    soundFx.playClick();
    onBetAmountChangeUSD(minBetUSD);
  };

  const handleHalf = () => {
    soundFx.playClick();
    onBetAmountChangeUSD(Math.max(minBetUSD, betAmountUSD / 2));
  };

  const handleDouble = () => {
    soundFx.playClick();
    onBetAmountChangeUSD(Math.min(maxBetUSD, Math.min(userBalanceUSD, betAmountUSD * 2)));
  };

  const handle5X = () => {
    soundFx.playClick();
    onBetAmountChangeUSD(Math.min(maxBetUSD, Math.min(userBalanceUSD, betAmountUSD * 5)));
  };

  const handleMax = () => {
    soundFx.playClick();
    onBetAmountChangeUSD(Math.min(maxBetUSD, userBalanceUSD));
  };

  const handleRepeat = () => {
    soundFx.playClick();
    if (lastBetUSD && lastBetUSD > 0) {
      onBetAmountChangeUSD(Math.min(maxBetUSD, Math.min(userBalanceUSD, lastBetUSD)));
    }
  };

  const buttonStyle =
    actionColor === 'red'
      ? 'gg-btn-primary'
      : actionColor === 'green'
      ? 'bg-emerald-700 hover:bg-emerald-600 text-white border border-emerald-800/70 shadow-[0_6px_18px_rgba(0,0,0,0.5)]'
      : 'bg-amber-700 hover:bg-amber-600 text-white border border-amber-800/70 shadow-[0_6px_18px_rgba(0,0,0,0.5)]';

  return (
    <div className={`bg-[#121218] border border-white/10 rounded-2xl shadow-[0_8px_24px_rgba(0,0,0,0.45)] flex flex-col ${
      compact ? 'p-3 gap-2.5' : 'p-4 md:p-5 gap-4'
    }${stretch ? ' lg:flex-1 lg:h-full' : ''}`}>
      {/* Label and Quick presets */}
      <div className="flex flex-row items-center justify-between gap-2">
        <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wider flex items-center gap-1.5">
          <Zap className="w-3.5 h-3.5 text-rose-500" />
          {t('betAmount', lang)} ({currentCurrencyConfig.symbol})
        </label>
        {lastBetUSD && lastBetUSD > 0 ? (
          <button
            onClick={handleRepeat}
            disabled={disabled}
            className="text-xs text-rose-400 hover:text-rose-300 flex items-center gap-1 font-medium transition-colors disabled:opacity-50"
          >
            <RotateCcw className="w-3 h-3" />
            {t('repeatBet', lang)}
          </button>
        ) : null}
      </div>

      {/* Console stepper + quick stakes */}
      <div className={`flex flex-col gap-2.5${stretch ? ' lg:flex-1' : ''}`}>
        <div className="flex items-stretch gap-2">
          <button
            type="button"
            onClick={() => { soundFx.playClick(); onBetAmountChangeUSD(Math.max(minBetUSD, betAmountUSD - minBetUSD)); }}
            disabled={disabled}
            aria-label="−"
            className="gg-console-btn w-12 shrink-0 rounded-2xl text-xl font-black text-zinc-200 disabled:opacity-50 touch-manipulation"
          >
            −
          </button>
          <div className="relative flex-1">
            <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-500 font-semibold">
              {currentCurrencyConfig.symbol}
            </span>
            <input
              type="number"
              step="any"
              inputMode="decimal"
              enterKeyHint="done"
              value={displayAmount ? Number(displayAmount.toFixed(2)) : ''}
              onChange={handleInputChange}
              disabled={disabled}
              placeholder="0.00"
              className={`w-full bg-[#0D0D11] border border-white/10 focus:border-[#991B1B] focus:ring-1 focus:ring-[#991B1B] text-white font-mono font-black rounded-2xl pl-9 pr-3 outline-none transition-all disabled:opacity-50 text-center ${
                compact ? 'text-lg py-2.5' : 'text-xl py-3'
              }`}
            />
          </div>
          <button
            type="button"
            onClick={() => { soundFx.playClick(); onBetAmountChangeUSD(Math.min(maxBetUSD, Math.min(userBalanceUSD, betAmountUSD + minBetUSD))); }}
            disabled={disabled}
            aria-label="+"
            className="gg-console-btn w-12 shrink-0 rounded-2xl text-xl font-black text-zinc-200 disabled:opacity-50 touch-manipulation"
          >
            +
          </button>
        </div>

        {/* Quick stakes */}
        <div className="grid grid-cols-5 gap-1.5 shrink-0">
          <button
            onClick={handleMin}
            disabled={disabled}
            className="gg-console-btn px-1 py-2 min-h-[44px] text-[11px] font-display font-bold uppercase text-zinc-300 rounded-xl disabled:opacity-50 touch-manipulation"
          >
            {t('min', lang)}
          </button>
          <button
            onClick={handleHalf}
            disabled={disabled}
            className="gg-console-btn px-1 py-2 min-h-[44px] text-[11px] font-display font-bold uppercase text-zinc-300 rounded-xl disabled:opacity-50 touch-manipulation"
          >
            {t('half', lang)}
          </button>
          <button
            onClick={handleDouble}
            disabled={disabled}
            className="gg-console-btn px-1 py-2 min-h-[44px] text-[11px] font-display font-bold uppercase text-zinc-300 rounded-xl disabled:opacity-50 touch-manipulation"
          >
            {t('double', lang)}
          </button>
          <button
            onClick={handle5X}
            disabled={disabled}
            className="gg-console-btn px-1 py-2 min-h-[44px] text-[11px] font-display font-bold uppercase text-zinc-300 rounded-xl disabled:opacity-50 touch-manipulation"
          >
            {t('fiveX', lang)}
          </button>
          <button
            onClick={handleMax}
            disabled={disabled}
            className="gg-console-btn gg-console-btn-selected px-1 py-2 min-h-[44px] text-[11px] font-display font-bold uppercase text-rose-200 rounded-xl disabled:opacity-50 touch-manipulation"
          >
            {t('max', lang)}
          </button>
        </div>
      </div>

      {/* Main Action Button */}
      {actionButtonLabel && onAction ? (
        <div className={`flex gap-2${stretch ? ' lg:mt-auto' : ''}`}>
          {secondaryAction ? (
            <button
              onClick={() => {
                soundFx.playClick();
                secondaryAction.onClick();
              }}
              disabled={secondaryAction.disabled}
              className={`flex-1 basis-0 min-w-0 font-display font-black tracking-wider uppercase rounded-xl border border-zinc-700 bg-zinc-800 hover:bg-zinc-700 text-white transition-all active:scale-[0.98] disabled:opacity-50 ${
                compact ? 'py-3 px-2 text-sm' : 'py-3.5 px-2 text-sm'
              }`}
            >
              {secondaryAction.label}
            </button>
          ) : null}

          <button
            onClick={() => {
              soundFx.playClick();
              onAction();
            }}
            disabled={actionDisabled}
            className={`${secondaryAction ? 'flex-1 basis-0 min-w-0' : 'w-full'} font-display font-black tracking-wider uppercase rounded-xl border transition-all transform active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed min-h-[48px] touch-manipulation ${
              compact ? 'py-3 px-2 text-sm' : 'py-3.5 px-2 text-sm'
            } ${buttonStyle}`}
          >
            {actionButtonLabel}
          </button>
        </div>
      ) : null}
    </div>
  );
};
