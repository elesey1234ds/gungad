import React, { useEffect, useRef, useState } from 'react';
import { Currency, UserProfile } from '../types';
import { BottomSheet } from './ui/BottomSheet';
import { t } from '../translations';
import { formatStars } from '../utils/currencies';
import { soundFx } from '../utils/sound';
import {
  X,
  Copy,
  Check,
  ArrowDownRight,
  ArrowUpRight,
  ShieldCheck,
  RefreshCw,
  Bot,
  Gem,
  ExternalLink,
  Loader2,
  AlertTriangle,
  Star,
} from 'lucide-react';

const API_BASE = import.meta.env.VITE_API_URL || 'https://gungad-production.up.railway.app';

const CRYPTOBOT_ASSETS = ['USDT', 'TON', 'BTC', 'ETH', 'SOL'] as const;
type CryptoBotAsset = (typeof CRYPTOBOT_ASSETS)[number];
const TRC20_FALLBACK_ADDRESS = 'TLPse2NpkveCockTAwt9brFNdaz8EsxzyN';
const STAR_WITHDRAW_AMOUNTS = [25, 50, 75, 100, 500, 1000, 5000] as const;
const PAY_METHODS = [
  { id: 'stars', img: null, labelKey: 'payStars' },
  { id: 'cryptobot', img: '/pay/cryptobot.png', labelKey: 'payCryptoBot' },
  { id: 'tonkeeper', img: '/pay/tonkeeper.png', labelKey: 'payTonkeeper' },
  { id: 'trc20', img: '/assets/trc20.png', labelKey: 'payTrc20' },
] as const;

interface DepositModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: UserProfile;
  currency: Currency;
  lang: any;
  onRefillDemo: () => void;
  onUpdateBalance: (newBalance: number) => void;
  playMode?: 'real' | 'demo';
  profileId?: string | null;
  onWalletRefresh?: () => Promise<void> | void;
  onStarsBalance?: (stars: number) => void;
}

interface TonInvoice {
  deposit_id: string;
  asset: 'TON' | 'USDT_TON';
  address: string;
  memo: string;
  ton_amount: number | null;
  token_amount: number | null;
  usd_amount: number;
  tonkeeper_url: string;
  tonkeeper_web_url: string;
}

function getInitData(): string | null {
  try {
    const early = (window as any).__GG_INIT_DATA;
    if (early && String(early).length > 10) return String(early);
    const value = (window as any).Telegram?.WebApp?.initData;
    return value && String(value).length > 10 ? String(value) : null;
  } catch {
    return null;
  }
}

function openTgLink(url: string) {
  try {
    const tg = (window as any).Telegram?.WebApp;
    if (tg?.openTelegramLink && url.startsWith('https://t.me')) {
      tg.openTelegramLink(url);
      return;
    }
    if (tg?.openLink) {
      tg.openLink(url);
      return;
    }
  } catch {
    /* ignore */
  }
  window.open(url, '_blank', 'noopener,noreferrer');
}

function openStarsInvoice(url: string, onPaid: () => void) {
  try {
    const tg = (window as any).Telegram?.WebApp;
    if (typeof tg?.openInvoice === 'function') {
      tg.openInvoice(url, (status: string) => {
        if (status === 'paid') onPaid();
      });
      return;
    }
  } catch {
    /* fall through */
  }
  openTgLink(url);
}

export const DepositModal: React.FC<DepositModalProps> = ({
  isOpen,
  onClose,
  user,
  currency: _currency,
  lang,
  onRefillDemo,
  onUpdateBalance,
  playMode = 'real',
  profileId = null,
  onWalletRefresh,
  onStarsBalance,
}) => {
  const [tab, setTab] = useState<'deposit' | 'withdraw'>('deposit');
  const [method, setMethod] = useState<'cryptobot' | 'tonkeeper' | 'stars' | 'trc20'>('cryptobot');

  // Deposit state
  const [depositAmount, setDepositAmount] = useState<number>(10);
  const [creating, setCreating] = useState(false);
  const [invoiceUrl, setInvoiceUrl] = useState<string | null>(null);
  const [cryptoDepositId, setCryptoDepositId] = useState<string | null>(null);
  const [trc20Txid, setTrc20Txid] = useState('');
  const [trc20DepositId, setTrc20DepositId] = useState<string | null>(null);
  const [trc20Address, setTrc20Address] = useState(TRC20_FALLBACK_ADDRESS);
  const [tonAsset, setTonAsset] = useState<'TON' | 'USDT'>('TON');
  const [tonInvoice, setTonInvoice] = useState<TonInvoice | null>(null);
  const [depositDone, setDepositDone] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedCoin, setSelectedCoin] = useState<CryptoBotAsset>('USDT');
  const [starsAmount, setStarsAmount] = useState<number>(25);
  const [starsInvoiceUrl, setStarsInvoiceUrl] = useState<string | null>(null);
  const [starsAwaitingCredit, setStarsAwaitingCredit] = useState(false);
  const starsBaselineRef = useRef<number>(0);

  // Withdraw state
  const [withdrawAsset, setWithdrawAsset] = useState<'TON' | 'USDT' | 'TRC20' | 'STARS'>('TON');
  const [withdrawStars, setWithdrawStars] = useState<number>(25);
  const [withdrawAddress, setWithdrawAddress] = useState<string>('');
  const [withdrawAmountUSD, setWithdrawAmountUSD] = useState<number>(10);
  const [withdrawSubmitting, setWithdrawSubmitting] = useState(false);
  const [withdrawSuccess, setWithdrawSuccess] = useState<boolean>(false);
  const [withdrawError, setWithdrawError] = useState<string | null>(null);
  const [pendingWds, setPendingWds] = useState<Array<{
    id: string;
    amount_usd_cents: number;
    asset: string;
    status: string;
  }>>([]);
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  const pollRef = useRef<number | null>(null);

  const loadPendingWds = async () => {
    if (!profileId) return;
    try {
      const res = await fetch(`${API_BASE}/api/withdraw/list?profile_id=${encodeURIComponent(profileId)}`);
      const json = await res.json();
      const rows = Array.isArray(json.withdrawals) ? json.withdrawals : [];
      setPendingWds(rows.filter((w: { status: string }) => w.status === 'pending'));
    } catch {
      /* ignore */
    }
  };

  useEffect(() => {
    if (!isOpen || tab !== 'withdraw' || !profileId) return;
    void loadPendingWds();
  }, [isOpen, tab, profileId]);

  useEffect(() => {
    if (!isOpen || method !== 'trc20') return;
    fetch(`${API_BASE}/api/deposit/trc20/info`)
      .then((res) => res.json())
      .then((json) => {
        if (json?.receiving_address) setTrc20Address(String(json.receiving_address));
      })
      .catch(() => { /* keep fallback */ });
  }, [isOpen, method]);

  // Poll deposit status (TON or Crypto Bot) while modal open
  useEffect(() => {
    const depositId = tonInvoice?.deposit_id || cryptoDepositId;
    const statusPath = tonInvoice
      ? `/api/deposit/ton/status?deposit_id=${depositId}`
      : cryptoDepositId
        ? `/api/deposit/cryptobot/status?deposit_id=${depositId}`
        : null;

    if (!isOpen || !statusPath || depositDone) return;

    const poll = async () => {
      try {
        const res = await fetch(`${API_BASE}${statusPath}`);
        const json = await res.json();
        if (json.ok && json.status === 'completed') {
          setDepositDone(true);
          if (typeof json.balance_cents === 'number') {
            onUpdateBalance(json.balance_cents / 100);
          }
          soundFx.playWin();
        }
      } catch {
        /* keep polling */
      }
    };

    poll();
    pollRef.current = window.setInterval(poll, 8_000);
    return () => {
      if (pollRef.current) window.clearInterval(pollRef.current);
    };
  }, [isOpen, tonInvoice, cryptoDepositId, depositDone, onUpdateBalance]);

  useEffect(() => {
    if (!isOpen || method !== 'stars' || !starsInvoiceUrl || depositDone || !profileId) return;

    const poll = async () => {
      try {
        const res = await fetch(`${API_BASE}/api/wallet?profile_id=${encodeURIComponent(profileId)}`);
        const json = await res.json();
        const stars = json?.wallet?.stars_balance;
        if (typeof stars === 'number' && stars > starsBaselineRef.current) {
          setDepositDone(true);
          setStarsAwaitingCredit(false);
          onStarsBalance?.(stars);
          soundFx.playWin();
          await onWalletRefresh?.();
        }
      } catch {
        /* keep polling */
      }
    };

    void poll();
    const id = window.setInterval(() => { void poll(); }, starsAwaitingCredit ? 500 : 1200);
    return () => window.clearInterval(id);
  }, [isOpen, method, starsInvoiceUrl, depositDone, profileId, starsAwaitingCredit, onWalletRefresh, onStarsBalance]);

  if (!isOpen) return null;

  const isReal = playMode === 'real' && Boolean(profileId);

  const copyText = (text: string, field: string) => {
    soundFx.playClick();
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const resetDepositFlow = () => {
    setInvoiceUrl(null);
    setCryptoDepositId(null);
    setTrc20DepositId(null);
    setTrc20Txid('');
    setTonInvoice(null);
    setStarsInvoiceUrl(null);
    setDepositDone(false);
    setStarsAwaitingCredit(false);
    setError(null);
  };

  const handleCreateCryptoBot = async () => {
    if (!isReal || creating) return;
    soundFx.playClick();
    setError(null);
    if (!Number.isFinite(depositAmount) || depositAmount < 1) {
      setError(t('minDepositNote', lang));
      return;
    }
    setCreating(true);
    try {
      const res = await fetch(`${API_BASE}/api/deposit/cryptobot/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profile_id: profileId, amount_usd: depositAmount, asset: selectedCoin }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || 'fail');
      setInvoiceUrl(json.invoice_url);
      setCryptoDepositId(json.deposit_id);
      openTgLink(json.invoice_url);
    } catch {
      setError(t('errorGeneric', lang));
    } finally {
      setCreating(false);
    }
  };

  const handleCreateTrc20 = async () => {
    if (!isReal || creating) return;
    soundFx.playClick();
    setError(null);
    if (!Number.isFinite(depositAmount) || depositAmount < 1 || !trc20Txid.trim()) {
      setError(t('minDepositNote', lang));
      return;
    }
    setCreating(true);
    try {
      const res = await fetch(`${API_BASE}/api/deposit/trc20/create`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profile_id: profileId, initData: getInitData(), amount_usd: depositAmount, txid: trc20Txid.trim() }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || 'fail');
      setTrc20DepositId(json.deposit_id);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('errorGeneric', lang));
    } finally {
      setCreating(false);
    }
  };
  const handleCreateTon = async () => {
    if (!isReal || creating) return;
    soundFx.playClick();
    setError(null);
    if (!Number.isFinite(depositAmount) || depositAmount < 1) {
      setError(t('minDepositNote', lang));
      return;
    }
    setCreating(true);
    try {
      const res = await fetch(`${API_BASE}/api/deposit/ton/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profile_id: profileId, initData: getInitData(), amount_usd: depositAmount, asset: tonAsset }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || 'fail');
      setTonInvoice(json as TonInvoice);
      if (json.tonkeeper_web_url) openTgLink(json.tonkeeper_web_url);
    } catch {
      setError(t('errorGeneric', lang));
    } finally {
      setCreating(false);
    }
  };

  const handleCreateStars = async () => {
    if (!isReal || creating) return;
    soundFx.playClick();
    setError(null);
    if (!Number.isInteger(starsAmount) || starsAmount < 1 || starsAmount > 10000) {
      setError(t('minStarsNote', lang));
      return;
    }
    setCreating(true);
    try {
      starsBaselineRef.current = user.starsBalance ?? 0;
      const res = await fetch(`${API_BASE}/api/stars/invoice`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profile_id: profileId, stars_amount: starsAmount }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok || !json.invoice_url) throw new Error(json.error || 'fail');
      setStarsInvoiceUrl(json.invoice_url);
      openStarsInvoice(json.invoice_url, () => {
        setStarsAwaitingCredit(true);
        onStarsBalance?.(starsBaselineRef.current + starsAmount * 100);
      });
    } catch {
      setError(t('errorGeneric', lang));
    } finally {
      setCreating(false);
    }
  };

  const handleWithdraw = async () => {
    if (!isReal || withdrawSubmitting) return;
    soundFx.playClick();
    setWithdrawError(null);

    if (withdrawAsset === 'STARS') {
      if (!STAR_WITHDRAW_AMOUNTS.includes(withdrawStars as typeof STAR_WITHDRAW_AMOUNTS[number])) {
        setWithdrawError(t('withdrawStarsMinNote', lang));
        return;
      }
      if (withdrawStars * 100 > (user.starsBalance ?? 0)) {
        setWithdrawError(t('insufficientFunds', lang));
        return;
      }
      setWithdrawSubmitting(true);
      try {
        const res = await fetch(`${API_BASE}/api/withdraw/request`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            profile_id: profileId,
            asset: 'STARS',
            stars_amount: withdrawStars,
          }),
        });
        const json = await res.json();
        if (!res.ok || !json.ok) {
          setWithdrawError(json.error || t('errorGeneric', lang));
          return;
        }
        soundFx.playWin();
        setWithdrawSuccess(true);
        if (typeof json.stars_balance === 'number') onStarsBalance?.(json.stars_balance);
        else onStarsBalance?.(Math.max(0, (user.starsBalance ?? 0) - withdrawStars * 100));
        await onWalletRefresh?.();
        await loadPendingWds();
        setTimeout(() => setWithdrawSuccess(false), 6000);
      } catch {
        setWithdrawError(t('errorGeneric', lang));
      } finally {
        setWithdrawSubmitting(false);
      }
      return;
    }

    if (!Number.isFinite(withdrawAmountUSD) || withdrawAmountUSD < 7) {
      setWithdrawError(t('withdrawMinNote', lang));
      return;
    }
    if (withdrawAmountUSD > user.balanceUSD) {
      setWithdrawError(t('insufficientFunds', lang));
      return;
    }
    if (!withdrawAddress || withdrawAddress.trim().length < 10) {
      setWithdrawError(t('enterDestination', lang));
      return;
    }
    setWithdrawSubmitting(true);
    try {
      const res = await fetch(`${API_BASE}/api/withdraw/request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          profile_id: profileId,
          amount_usd: withdrawAmountUSD,
          asset: withdrawAsset,
          address: withdrawAddress.trim(),
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setWithdrawError(json.error || t('errorGeneric', lang));
        return;
      }
      soundFx.playWin();
      setWithdrawSuccess(true);
      onUpdateBalance(Math.max(0, user.balanceUSD - withdrawAmountUSD));
      setWithdrawAddress('');
      await loadPendingWds();
      setTimeout(() => setWithdrawSuccess(false), 6000);
    } catch {
      setWithdrawError(t('errorGeneric', lang));
    } finally {
      setWithdrawSubmitting(false);
    }
  };

  const handleCancelWithdraw = async (id: string, amountCents: number, asset: string) => {
    if (!profileId || cancellingId) return;
    soundFx.playClick();
    setCancellingId(id);
    setWithdrawError(null);
    try {
      const res = await fetch(`${API_BASE}/api/withdraw/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profile_id: profileId, withdrawal_id: id }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setWithdrawError(json.error || t('errorGeneric', lang));
        return;
      }
      setPendingWds((prev) => prev.filter((w) => w.id !== id));
      if (String(asset).toUpperCase() === 'STARS' || json.asset === 'STARS') {
        if (typeof json.stars_balance === 'number') onStarsBalance?.(json.stars_balance);
        else onStarsBalance?.((user.starsBalance ?? 0) + amountCents);
        await onWalletRefresh?.();
      } else {
        onUpdateBalance(user.balanceUSD + amountCents / 100);
      }
    } catch {
      setWithdrawError(t('errorGeneric', lang));
    } finally {
      setCancellingId(null);
    }
  };

  const inputCls =
    'w-full bg-[#121218] border border-white/10 focus:border-[#991B1B] focus:ring-1 focus:ring-[#991B1B] text-white font-mono text-base font-bold rounded-xl px-3 py-2.5 outline-none transition-colors';

  return (
    <BottomSheet onClose={onClose}>
        {/* Modal Header */}
        <div className="flex items-center justify-between px-4 sm:px-5 py-3 sm:py-4 border-b border-zinc-800 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <ShieldCheck className="w-5 h-5 text-rose-500 shrink-0" />
            <h3 className="font-display font-black text-base sm:text-lg uppercase tracking-wider text-white truncate">
              {t('tacticalCashier', lang)}
            </h3>
          </div>
          <button
            type="button"
            onClick={() => {
              soundFx.playClick();
              onClose();
            }}
            className="p-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-white shrink-0 touch-manipulation"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-4 sm:px-5 py-3 sm:py-4 flex flex-col gap-3 sm:gap-4 pb-[calc(1rem+env(safe-area-inset-bottom,0px))]">
          {/* Tab Switcher */}
          <div className="grid grid-cols-2 gap-2 bg-[#14141a] p-1 rounded-xl border border-zinc-800">
            <button
              onClick={() => { soundFx.playClick(); setTab('deposit'); }}
              className={`py-2 text-xs font-display font-bold uppercase rounded-lg flex items-center justify-center gap-1.5 transition-all ${
                tab === 'deposit'
                  ? 'bg-[#E50914] text-white shadow-[0_4px_14px_rgba(0,0,0,0.45)] active:scale-[0.98]'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              <ArrowDownRight className="w-4 h-4" />
              {t('depositCrypto', lang)}
            </button>
            <button
              onClick={() => { soundFx.playClick(); setTab('withdraw'); }}
              className={`py-2 text-xs font-display font-bold uppercase rounded-lg flex items-center justify-center gap-1.5 transition-all ${
                tab === 'withdraw'
                  ? 'bg-[#E50914] text-white shadow-[0_4px_14px_rgba(0,0,0,0.45)] active:scale-[0.98]'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              <ArrowUpRight className="w-4 h-4" />
              {t('withdrawCrypto', lang)}
            </button>
          </div>

          {/* Demo refill */}
          {playMode === 'demo' && (
            <div className="bg-rose-950/40 border border-rose-900/60 p-4 rounded-xl flex items-center justify-between">
              <div>
                <span className="text-xs font-bold text-rose-300 block">{t('demoBalance', lang)}</span>
                <span className="text-xs text-zinc-400">{t('refillDemoSub', lang)}</span>
              </div>
              <button
                onClick={() => { soundFx.playClick(); onRefillDemo(); }}
                className="px-3.5 py-2 bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold rounded-lg flex items-center gap-1.5 shadow-md transition-all active:scale-95 shrink-0"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                {t('refillDemoBtn', lang)}
              </button>
            </div>
          )}

          {/* Real-mode required notice */}
          {!isReal && (
            <div className="p-3 bg-amber-950/40 border border-amber-800/60 text-amber-300 text-xs font-bold rounded-xl flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              {t('realModeOnly', lang)}
            </div>
          )}

          {tab === 'deposit' ? (
            <div className="flex flex-col gap-4">
              {/* Payment methods — large tiles with descriptive ribbons */}
              <div className="grid grid-cols-2 gap-2">
                {PAY_METHODS.map((item) => {
                  const active = method === item.id;
                  const hint =
                    item.id === 'stars' ? 'Telegram' :
                    item.id === 'cryptobot' ? 'USDT · TON · BTC · ETH · SOL' :
                    item.id === 'tonkeeper' ? 'TON · USDT · Memo' : 'Ручной · по TXID';
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => { soundFx.playClick(); setMethod(item.id); resetDepositFlow(); }}
                      className={`gg-console-btn flex items-center gap-3 p-3 min-h-[68px] rounded-2xl text-left touch-manipulation ${
                        active ? 'gg-console-btn-selected gg-win-in' : ''
                      }`}
                    >
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-[#0D0D11] border border-white/10">
                        {item.img ? (
                          <img src={item.img} alt="" className="h-full w-full object-cover" />
                        ) : (
                          <Star className="h-6 w-6 text-amber-400 fill-amber-400" />
                        )}
                      </span>
                      <span className="flex flex-col min-w-0">
                        <span className={`text-xs font-bold truncate ${active ? 'text-white' : 'text-zinc-200'}`}>
                          {t(item.labelKey as any, lang)}
                        </span>
                        <span className="text-[10px] font-mono text-zinc-500 truncate">{hint}</span>
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* Amount */}
              {method !== 'stars' && (
              <>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold text-zinc-400 uppercase">{t('depositAmountLabel', lang)}</label>
                <input
                  type="number"
                  min={1}
                  inputMode="decimal"
                  enterKeyHint="done"
                  value={depositAmount}
                  onChange={(e) => { setDepositAmount(parseFloat(e.target.value) || 0); resetDepositFlow(); }}
                  className={inputCls}
                />
                <div className="flex gap-2">
                  {[5, 10, 25, 50, 100].map((v) => (
                    <button
                      key={v}
                      onClick={() => { soundFx.playClick(); setDepositAmount(v); resetDepositFlow(); }}
                      className={`gg-console-btn flex-1 py-2 min-h-[44px] text-xs font-mono font-bold rounded-xl touch-manipulation ${
                        depositAmount === v ? 'gg-console-btn-selected text-rose-200' : 'text-zinc-300'
                      }`}
                    >
                      ${v}
                    </button>
                  ))}
                </div>
                <span className="text-[10px] text-zinc-500">{t('minDepositNote', lang)}</span>
              </div>

              {method === 'trc20' && (
                <div className="flex flex-col gap-3 p-3 rounded-xl bg-emerald-950/20 border border-emerald-800/60">
                  {trc20DepositId ? (
                    <div className="text-center text-sm font-bold text-emerald-300">{t('trc20Submitted', lang)}</div>
                  ) : (
                    <>
                      <div className="text-xs text-zinc-400">{t('trc20SendNote', lang)}</div>
                      <div className="flex items-center justify-between gap-2 bg-[#0a0a0d] border border-emerald-900/50 rounded-lg p-2.5">
                        <div className="font-mono text-[11px] break-all text-emerald-300">{trc20Address}</div>
                        <button
                          type="button"
                          onClick={() => copyText(trc20Address, 'trc20')}
                          className="px-2 py-1 min-h-[32px] bg-emerald-700 hover:bg-emerald-600 text-white text-xs font-bold rounded-md flex items-center gap-1 shrink-0 touch-manipulation transition-colors"
                        >
                          {copiedField === 'trc20' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                      <input value={trc20Txid} onChange={(e) => setTrc20Txid(e.target.value)} placeholder={t('trc20TxidPlaceholder', lang)} autoCapitalize="none" autoCorrect="off" spellCheck={false} enterKeyHint="done" className={inputCls} />
                      <button onClick={handleCreateTrc20} disabled={!isReal || creating || !trc20Txid.trim()} className="w-full py-3 min-h-[48px] bg-emerald-700 hover:bg-emerald-600 active:scale-[0.98] text-white font-display font-bold uppercase text-sm rounded-xl disabled:opacity-50 transition-all touch-manipulation">
                        {creating ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : t('trc20Submit', lang)}
                      </button>
                    </>
                  )}
                </div>
              )}

              {method === 'cryptobot' && (
                <div className="flex flex-col gap-3">
                  <div className="flex flex-col gap-2">
                    <label className="text-xs font-bold text-zinc-400 uppercase">{t('selectCryptoAsset', lang)}</label>
                    <div className="grid grid-cols-5 gap-1.5">
                      {CRYPTOBOT_ASSETS.map((coin) => (
                        <button
                          key={coin}
                          onClick={() => { soundFx.playClick(); setSelectedCoin(coin); resetDepositFlow(); }}
                          className={`py-2 rounded-xl border text-[11px] font-mono font-bold transition-all ${
                            selectedCoin === coin
                              ? 'bg-rose-950 border-[#E50914] text-rose-200'
                              : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-white'
                          }`}
                        >
                          {coin}
                        </button>
                      ))}
                    </div>
                  </div>

                  {depositDone ? (
                    <div className="gg-win-in p-4 bg-emerald-950/60 border border-emerald-800/70 text-emerald-300 text-sm font-bold rounded-xl text-center">
                      ✅ {t('depositCredited', lang)}
                    </div>
                  ) : invoiceUrl ? (
                    <div className="flex flex-col gap-2">
                      <button
                        onClick={() => { soundFx.playClick(); openTgLink(invoiceUrl); }}
                        className="gg-btn-primary w-full py-3 min-h-[48px] font-display font-bold uppercase text-sm rounded-xl flex items-center justify-center gap-2 touch-manipulation"
                      >
                        <ExternalLink className="w-4 h-4" />
                        {t('openInvoice', lang)}
                      </button>
                      <div className="flex items-center justify-center gap-2 text-xs text-zinc-500 font-mono">
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        {t('waitingPayment', lang)}
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={handleCreateCryptoBot}
                      disabled={!isReal || creating || depositAmount < 1}
                      className="gg-btn-primary w-full py-3 min-h-[48px] font-display font-bold uppercase text-sm rounded-xl disabled:opacity-50 flex items-center justify-center gap-2 touch-manipulation"
                    >
                      {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Bot className="w-4 h-4" />}
                      {creating ? t('creatingInvoice', lang) : t('createInvoice', lang)}
                    </button>
                  )}
                </div>
              )}

              {method === 'tonkeeper' && (
                <div className="flex flex-col gap-3">
                  <div className="grid grid-cols-2 gap-2">
                    {(['TON', 'USDT'] as const).map((asset) => (
                      <button
                        key={asset}
                        type="button"
                        onClick={() => { soundFx.playClick(); setTonAsset(asset); resetDepositFlow(); }}
                        className={`py-2 min-h-[44px] rounded-xl border text-xs font-mono font-bold touch-manipulation transition-all active:scale-[0.97] ${tonAsset === asset ? 'bg-rose-950 border-[#E50914] text-rose-200' : 'bg-zinc-900 border-zinc-800 text-zinc-400'}`}
                      >
                        {asset === 'TON' ? t('tonAssetGram', lang) : t('tonAssetUsdt', lang)}
                      </button>
                    ))}
                  </div>
                  {!tonInvoice ? (
                    <button
                      onClick={handleCreateTon}
                      disabled={!isReal || creating || depositAmount < 1}
                      className="gg-btn-primary w-full py-3 min-h-[48px] font-display font-bold uppercase text-sm rounded-xl disabled:opacity-50 flex items-center justify-center gap-2 touch-manipulation"
                    >
                      {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Gem className="w-4 h-4" />}
                      {creating ? t('creatingInvoice', lang) : t('createInvoice', lang)}
                    </button>
                  ) : depositDone ? (
                    <div className="gg-win-in p-4 bg-emerald-950/60 border border-emerald-800/70 text-emerald-300 text-sm font-bold rounded-xl text-center">
                      ✅ {t('depositCredited', lang)}
                    </div>
                  ) : (
                    <div className="flex flex-col gap-3">
                      {/* TON amount */}
                      <div className="bg-[#121217] border border-zinc-800 rounded-xl p-3.5 flex flex-col gap-1">
                        <span className="text-[10px] text-zinc-500 font-bold uppercase">{tonInvoice.asset === 'TON' ? t('tonSendExact', lang) : t('usdtTonSendExact', lang)}</span>
                        <div className="flex items-center justify-between">
                          <span className="font-mono text-lg font-black text-white">
                          {tonInvoice.asset === 'TON' ? `${tonInvoice.ton_amount} TON` : `${tonInvoice.token_amount} USDT`}
                        </span>
                          <span className="text-xs text-zinc-500 font-mono">≈ ${tonInvoice.usd_amount}</span>
                        </div>
                      </div>

                      {/* Address */}
                      <div className="bg-[#121217] border border-zinc-800 rounded-xl p-3.5 flex flex-col gap-1.5">
                        <span className="text-[10px] text-zinc-500 font-bold uppercase">{t('depositAddress', lang)}</span>
                        <div className="flex items-center justify-between gap-2 bg-[#0a0a0d] border border-zinc-800 rounded-lg p-2.5">
                          <span className="font-mono text-[11px] text-zinc-300 break-all">{tonInvoice.address}</span>
                          <button
                            onClick={() => copyText(tonInvoice.address, 'addr')}
                            className="px-2 py-1 bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold rounded-md flex items-center gap-1 shrink-0"
                          >
                            {copiedField === 'addr' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                          </button>
                        </div>
                      </div>

                      {/* Memo */}
                      <div className="bg-amber-950/30 border border-amber-700/60 rounded-xl p-3.5 flex flex-col gap-1.5">
                        <span className="text-[10px] text-amber-400 font-bold uppercase">{t('memoLabel', lang)}</span>
                        <div className="flex items-center justify-between gap-2 bg-[#0a0a0d] border border-amber-900/50 rounded-lg p-2.5">
                          <span className="font-mono text-sm font-black text-amber-300">{tonInvoice.memo}</span>
                          <button
                            onClick={() => copyText(tonInvoice.memo, 'memo')}
                            className="px-2 py-1 bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold rounded-md flex items-center gap-1 shrink-0"
                          >
                            {copiedField === 'memo' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                          </button>
                        </div>
                        <span className="text-[10px] text-amber-500/90 leading-tight">⚠️ {t('memoWarning', lang)}</span>
                      </div>

                      <button
                        onClick={() => { soundFx.playClick(); openTgLink(tonInvoice.tonkeeper_web_url); }}
                        className="gg-btn-primary w-full py-3 min-h-[48px] font-display font-bold uppercase text-sm rounded-xl flex items-center justify-center gap-2 touch-manipulation"
                      >
                        <ExternalLink className="w-4 h-4" />
                        {t('openTonkeeper', lang)}
                      </button>

                      <div className="flex items-center justify-center gap-2 text-xs text-zinc-500 font-mono">
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        {t('waitingPayment', lang)}
                      </div>
                    </div>
                  )}
                </div>
              )}
              </>
              )}

              {method === 'stars' && (
                <div className="flex flex-col gap-3">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-bold text-zinc-400 uppercase">{t('starsAmountLabel', lang)}</label>
                    <input
                      type="number"
                      min={1}
                      max={10000}
                      step={1}
                      inputMode="numeric"
                      enterKeyHint="done"
                      value={starsAmount}
                      onChange={(e) => { setStarsAmount(parseInt(e.target.value, 10) || 0); resetDepositFlow(); }}
                      className={inputCls}
                    />
                    <div className="grid grid-cols-5 gap-1.5">
                      {[50, 100, 250, 500, 1000].map((v) => (
                        <button
                          key={v}
                          onClick={() => { soundFx.playClick(); setStarsAmount(v); resetDepositFlow(); }}
                          className={`gg-console-btn py-2 min-h-[44px] text-[11px] font-mono font-bold rounded-xl touch-manipulation ${
                            starsAmount === v ? 'gg-console-btn-selected text-rose-200' : 'text-zinc-300'
                          }`}
                        >
                          ⭐{v}
                        </button>
                      ))}
                    </div>
                    <span className="text-[10px] text-zinc-500">{t('minStarsNote', lang)}</span>
                    <span className="text-[10px] text-amber-300 font-mono">{formatStars((user.starsBalance ?? 0) / 100)}</span>
                  </div>

                  {depositDone ? (
                    <div className="gg-win-in p-4 bg-emerald-950/60 border border-emerald-800/70 text-emerald-300 text-sm font-bold rounded-xl text-center">
                      ✅ {t('starsCredited', lang)}
                    </div>
                  ) : starsInvoiceUrl ? (
                    <div className="flex flex-col gap-2">
                      <button
                        onClick={() => {
                          soundFx.playClick();
                          openStarsInvoice(starsInvoiceUrl, () => {
                            setStarsAwaitingCredit(true);
                            onStarsBalance?.(starsBaselineRef.current + starsAmount * 100);
                          });
                        }}
                        className="gg-btn-primary w-full py-3 min-h-[48px] font-display font-bold uppercase text-sm rounded-xl flex items-center justify-center gap-2 touch-manipulation"
                      >
                        <ExternalLink className="w-4 h-4" />
                        {t('openInvoice', lang)}
                      </button>
                      <div className="flex items-center justify-center gap-2 text-xs text-zinc-500 font-mono">
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        {t('waitingPayment', lang)}
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={handleCreateStars}
                      disabled={!isReal || creating || starsAmount < 1}
                      className="gg-btn-primary w-full py-3 min-h-[48px] font-display font-bold uppercase text-sm rounded-xl disabled:opacity-50 flex items-center justify-center gap-2 touch-manipulation"
                    >
                      {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Star className="w-4 h-4 fill-current" />}
                      {creating ? t('creatingInvoice', lang) : t('payWithStars', lang)}
                    </button>
                  )}
                </div>
              )}

              {error && (
                <div className="p-3 bg-rose-950/60 border border-rose-800 text-rose-300 text-xs font-bold rounded-xl text-center">
                  {error}
                </div>
              )}
            </div>
          ) : (
            /* Withdraw Tab */
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold text-zinc-400 uppercase">{t('withdrawAsset', lang)}</label>
                <div className="grid grid-cols-4 gap-2">
                  {(['TON', 'USDT', 'TRC20', 'STARS'] as const).map((a) => (
                    <button
                      key={a}
                      onClick={() => { soundFx.playClick(); setWithdrawAsset(a); }}
                      className={`py-2 rounded-xl border text-xs font-mono font-bold transition-all ${
                        withdrawAsset === a
                          ? a === 'STARS'
                            ? 'bg-amber-950/60 border-amber-600/70 text-amber-200'
                            : 'bg-rose-950 border-[#E50914] text-rose-200'
                          : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-white'
                      }`}
                    >
                      {a === 'STARS' ? '⭐ Stars' : a}
                    </button>
                  ))}
                </div>
              </div>

              {withdrawAsset !== 'STARS' && (
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold text-zinc-400 uppercase">{t('cryptoAddress', lang)}</label>
                <input
                  type="text"
                  placeholder={t('enterDestination', lang)}
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  enterKeyHint="done"
                  value={withdrawAddress}
                  onChange={(e) => setWithdrawAddress(e.target.value)}
                  className="w-full bg-[#121217] border border-zinc-800 focus:border-rose-600 text-white font-mono text-xs rounded-xl px-3 py-2.5 outline-none"
                />
              </div>
              )}

              {withdrawAsset === 'STARS' ? (
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold text-zinc-400 uppercase">{t('starsAmountLabel', lang)}</label>
                    <div className="grid grid-cols-4 gap-2">
                      {[...STAR_WITHDRAW_AMOUNTS].map((v) => (
                        <button
                          key={v}
                          onClick={() => { soundFx.playClick(); setWithdrawStars(v); }}
                          className={`gg-console-btn py-2 min-h-[44px] text-[11px] font-mono font-bold rounded-xl touch-manipulation ${withdrawStars === v ? 'gg-console-btn-selected text-rose-200' : 'text-zinc-300'}`}
                        >
                          ⭐{v}
                        </button>
                      ))}
                    </div>
                <span className="text-[10px] text-zinc-500">{t('withdrawStarsNote', lang)}</span>
                <span className="text-[10px] text-amber-300 font-mono">{formatStars((user.starsBalance ?? 0) / 100)}</span>
              </div>
              ) : (
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold text-zinc-400 uppercase">{t('amountUSD', lang)}</label>
                <input
                  type="number"
                  min={7}
                  inputMode="decimal"
                  enterKeyHint="done"
                  value={withdrawAmountUSD}
                  onChange={(e) => setWithdrawAmountUSD(parseFloat(e.target.value) || 0)}
                  className={inputCls}
                />
                <span className="text-[10px] text-zinc-500">{t('withdrawMinNote', lang)}</span>
              </div>
              )}

              {pendingWds.length > 0 && (
                <div className="flex flex-col gap-2">
                  <label className="text-xs font-bold text-zinc-400 uppercase">{t('pendingWithdrawals', lang)}</label>
                  {pendingWds.map((w) => (
                    <div key={w.id} className="flex items-center gap-2 p-2.5 rounded-xl bg-zinc-900 border border-zinc-800">
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-mono text-white">
                          {w.asset === 'STARS'
                            ? `⭐ ${(w.amount_usd_cents / 100).toFixed(2).replace(/\.00$/, '')}`
                            : `$${(w.amount_usd_cents / 100).toFixed(2)}`} · {w.asset}
                        </div>
                        <div className="text-[10px] text-zinc-500 truncate">{w.id.slice(0, 8)}…</div>
                      </div>
                      <button
                        disabled={cancellingId === w.id}
                        onClick={() => void handleCancelWithdraw(w.id, w.amount_usd_cents, w.asset)}
                        className="px-2.5 py-1.5 rounded-lg bg-zinc-800 text-rose-300 text-[11px] font-bold uppercase disabled:opacity-50"
                      >
                        {cancellingId === w.id ? '…' : t('cancelWithdraw', lang)}
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {withdrawSuccess && (
                <div className="gg-win-in p-3 bg-emerald-950/60 border border-emerald-800/70 text-emerald-300 text-xs font-bold rounded-xl text-center">
                  ✅ {t('withdrawRequested', lang)}
                </div>
              )}
              {withdrawError && (
                <div className="p-3 bg-rose-950/60 border border-rose-800 text-rose-300 text-xs font-bold rounded-xl text-center">
                  {withdrawError}
                </div>
              )}

              <button
                onClick={handleWithdraw}
                disabled={
                  !isReal ||
                  withdrawSubmitting ||
                  (withdrawAsset === 'STARS'
                    ? withdrawStars < 1 || withdrawStars * 100 > (user.starsBalance ?? 0)
                    : withdrawAmountUSD < 7 || withdrawAmountUSD > user.balanceUSD || !withdrawAddress)
                }
                className="gg-btn-primary w-full py-3 min-h-[48px] font-display font-bold uppercase text-sm rounded-xl disabled:opacity-50 flex items-center justify-center gap-2 touch-manipulation"
              >
                {withdrawSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
                {t('requestWithdraw', lang)}
              </button>

              <span className="text-[10px] text-zinc-500 text-center leading-tight">
                {t('withdrawPendingNote', lang)}
              </span>
            </div>
          )}
        </div>
    </BottomSheet>
  );
};
