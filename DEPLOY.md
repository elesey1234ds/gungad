# GunGad — карта деплоя и настроек (читать первым в новом чате)

> Документ для будущего себя/ассистента: куда что заливать, как всё связано,
> где лежат секреты и как чинить типовые поломки. Обновлён: 2026-09-16.

---

## 1. Что где лежит (репозиторий)

Монорепо, ветка `main` везде:

| Путь | Что это | Куда деплоится |
|---|---|---|
| `src/` (корень, `package.json`, `npm start` → `node src/index.js`) | Бэкенд: Telegram-бот (Telegraf) + Express API (`/api/*`) | Railway |
| `gungad-casino/` (`npm run build` → `dist/`) | Фронт: React мини-апп Telegram | Vercel, проект `webapp` |
| `supabase/migrations/` (25 файлов `*.sql`) | Схема БД: таблицы `gg_*` + RPC | Supabase, применять вручную |
| `jackpot.jpg`, `jackpot2.jpg`, `*.jpg` в корне | Исходники картинок от заказчика, **в прод не едут** | никуда (в git висят как хлам, в сборку попадает только то, что скопировано в `gungad-casino/public/`) |

`node_modules/`, `.env`, `logsrailway.txt` — в git не коммитить (проверять `git status` перед коммитом).

---

## 2. GitHub: два remote — не перепутай

```
elesey  → https://github.com/elesey1234ds/gungad.git   (ОСНОВНОЙ)
origin  → https://github.com/projectik9-cpu/gungad.git (легаси)
```

- **Railway деплоит бэкенд с `elesey`**. Пушить бэкенд-фиксы — в `elesey main`.
- **`origin` отстал** (нет коммитов `3c4ad48`, `1a3141b` — только фронт, бэкенду не важно). Если понадобится — переключи акк (раздел 3) и допush.
- Vercel-проект исторически привязан к `origin`, но **деплоим фронт через CLI токеном** (раздел 5) — гит-привязка для деплоя не нужна.

Проверить синхрон:

```powershell
git rev-parse main
git ls-remote elesey main
git ls-remote origin main
```

### 3. Переключение git-аккаунта (Windows Credential Manager)

Пуш по HTTPS авторизуется **токеном из Credential Manager**, а не `user.name`.
Токен нужен Classic PAT с галкой `repo` (GitHub → Settings → Developer settings →
Personal access tokens → Tokens (classic) → Generate).

```powershell
cmdkey /delete:git:https://github.com   # снести закэшированный токен
git push elesey main                     # спросит логин+пароль: elesey1234ds + PAT как пароль
# или для origin:
git push origin main                     # projectik9-cpu + его PAT
```

Симптомы чужого акка: `Permission to XXX denied to YYY` + `403`.

---

## 4. Бэкенд — Railway

- URL: **`https://web-production-28c30.up.railway.app`**
- Деплой: автодеплой с `elesey main`. `PORT` не задавать — выставляет Railway.
- Старт: `npm start`. Healthcheck: `GET /api/health` → `{"status":"ok"}`.
- Диагностика всего сразу: **`GET /api/auth/ping`** →

```json
{"has_bot_token": true, "telegram": {"ok": true, "username": "gungad_bot"},
 "supabase": {"client_ok": true, "using_key": "service_role"}}
```

### Railway Variables (все обязательные)

```
BOT_TOKEN=
SUPABASE_URL=https://nndebjrieyxqjnwkslhn.supabase.co
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=          # формат sb_secret_... — ок
WEB_APP_URL=https://webapp-rosy-psi-26.vercel.app
NODE_ENV=production
JWT_SECRET=                          # длинный рандом
ENCRYPTION_KEY=                      # минимум 32 символа
ADMIN_IDS=7328504615,7330887188
LOG_CHAT_ID=                         # лог-канал, бот должен быть админом
LOG_LEVEL=info
CRYPTOBOT_API_TOKEN=                 # @CryptoBot → Crypto Pay
TON_RECEIVING_ADDRESS=               # холодный TON-кошелёк (UQ...)
TONCENTER_API_KEY=                   # toncenter.com
TRON_RECEIVING_ADDRESS=              # USDT-TRC20 кошелёк (T...). БЕЗ НЕГО фронт покажет заглушку TLPse2...
```

Значения брать из локального `.env` в корне (он не в git — и не должен).
После изменения Variables — **Redeploy** (токены CryptoBot/TON читаются при старте).

Проверить бота: `https://api.telegram.org/bot<TOKEN>/getMe` → `{"ok":true,"result":{"username":"gungad_bot","id":8749759791}}`.
Если `ok:false` — токен отозван, новый брать у `@BotFather`.

---

## 5. Фронт — Vercel

- Проект: **`webapp`** (`projectId: prj_OjfNtlKcsx1BkweVXWOQEjhLr1sv`, org `team_RDwGGEjJnb2B6LnFqfd6dy2U`).
- Прод-алиас: **`https://webapp-rosy-psi-26.vercel.app`** — именно его отдаёт бот как `WEB_APP_URL` (кнопка Play).
- Локальная привязка: `gungad-casino/.vercel/project.json`. CLI глобально не стоит, вызывать через `npx -y vercel`.
- Env на проекте (смотреть `vercel env ls` из `gungad-casino/`):

```
VITE_API_URL=https://web-production-28c30.up.railway.app   # Production. ОБЯЗАТЕЛЬНО с https://
VITE_SUPABASE_URL=https://nndebjrieyxqjnwkslhn.supabase.co
VITE_SUPABASE_ANON_KEY=
```

### Деплой фронта (единственный рабочий способ)

Гит-привязка Vercel → GitHub сломана (GitHub App видит репо только одного акка,
см. историю: OAuth-редирект на `127.0.0.1` тоже дохлый). Поэтому деплоим CLI:

```powershell
cd gungad-casino
$env:VERCEL_TOKEN='<токен>'
npx -y vercel --prod --yes
```

- Токен: `https://vercel.com/account/tokens` → Create. **Текущий токен светился в чате —
  отозвать в конце проекта** и выпустить новый.
- Проверка после деплоя: открыть `https://webapp-rosy-psi-26.vercel.app/`,
  найти `/assets/index-*.js`, скачать и греpnуть маркеры нужного билда
  (например отсутствие `gg_warmup_count`, наличие `assets/jackpot-orb.png`).
- Фолбэк `VITE_API_URL` захардкожен в ~11 файлах (`https://gungad-production.up.railway.app` —
  старый домен). Пока env выставлен, не мешает, но при смене домена обновить env.

---

## 6. База — Supabase

- Проект: **`https://nndebjrieyxqjnwkslhn.supabase.co`**
- Free-план встаёт на паузу сам — первый шаг при `fetch failed`: Dashboard → Restore/Unpause.
- Миграции: `supabase/migrations/*.sql`, накатывать **по порядку дат в имени**
  через Dashboard → SQL Editor → New query → Run.
- Ключевые RPC (без них всё падает): `gg_ensure_profile`, `gg_get_wallet`,
  `gg_create_deposit`, `gg_complete_deposit`, `gg_credit_stars`,
  `gg_request_withdrawal`, `gg_process_withdrawal`, `gg_cancel_withdrawal`,
  `gg_claim_welcome_bonus`, `gg_settle_bet`.
- Бэк ходит с `SERVICE_ROLE` (обход RLS), фронт — с `ANON`/publishable. Не путать.
- `GET /api/auth/ping` показывает только «клиент создался» (`client_ok`) — реальную
  связность проверяют настоящие запросы (`/api/auth`, `/api/wallet`).

---

## 7. Платёжка (4 метода)

Код бэкенда: `src/web/api/deposit*.js`, `src/services/*Reconcile.js|tonMonitor.js`,
кнопки админа: `src/bot/handlers/adminHandler.js` (`dep_approve_`, `wd_approve_`...).
Фронт: `gungad-casino/src/components/DepositModal.tsx`.

| Метод | Создание | Автозачисление | Что нужно |
|---|---|---|---|
| Stars | `POST /api/stars/invoice` → `openInvoice` | `successful_payment` (`starsHandler.js`) + `starsReconcile.js` (опрос `getStarTransactions` каждые 8с) | Живой `BOT_TOKEN` |
| CryptoBot | `POST /api/deposit/cryptobot/create` | Webhook `POST /api/deposit/cryptobot/webhook` + `cryptoBotReconcile.js` (опрос `getInvoices` каждые 20с) | `CRYPTOBOT_API_TOKEN`; webhook в `@CryptoBot → Crypto Pay` переписать на `https://web-production-28c30.up.railway.app/api/deposit/cryptobot/webhook` |
| Tonkeeper TON | `POST /api/deposit/ton/create` `{asset:'TON'}` → `ton://transfer/...?amount=&text=memo` | `tonMonitor.js` (toncenter v2 `getTransactions`, сверка memo, каждые 30с) | `TON_RECEIVING_ADDRESS` + `TONCENTER_API_KEY`; курс — CoinGecko (без ключа, бывает `503 TON rate unavailable`) |
| Tonkeeper USDT | то же, `{asset:'USDT'}` → `?jetton=<master>&amount=&text=` | `tonMonitor.js` (toncenter v3 `jetton/transfers`) | то же; мастер USDT в `config.js:78` |
| TRC20 (ручной) | `POST /api/deposit/trc20/create` с TXID | Админ жмёт ✅ в личке (`dep_approve_`) | `TRON_RECEIVING_ADDRESS`, `ADMIN_IDS`, живой бот |
| Выводы | `POST /api/withdraw/request` (мин. $7) | Вручную с холодного кошелька, админ жмёт `wd_approve_` | `ADMIN_IDS` |

Известные грабли (уже ловили):
- `ReferenceError: getTonUsdRate` в `depositTon.js` (починено `56d5e74`) — симптом: TON 500, USDT ок.
- `TRC20/info` отдаёт `TLPse2...` — значит `TRON_RECEIVING_ADDRESS` не задан, это заглушка из `config.js:77`.
- `starsReconcile` спамит одними `stx...` — значит БД недоступна, само пройдёт.

---

## 8. Математика игр (важно!)

- Подкрутки «первые 3 победы» **больше нет**: файл `gungad-casino/src/game/playerHeat.ts`
  удалён (`ae52994`). Если кто-то предложит «вернуть прогрев» — отказ, это дыра на миллионы.
- Реальная математика: `gungad-casino/src/game/demoOdds.ts` — `LIVE_WIN_RATE = 0.3`:
  честный выигрыш сохраняется с 30%, проигрыш — всегда проигрыш, множители не режутся.
  Абсолютный винрейт ≈ честный шанс × 0.3 (монетка ~15%). Демо-режим щедрее и на реал не влияет.
- Бэкенд ставок честный (`gg_settle_bet`), подкруток там никогда не было.
- Слоты (`gungad-casino/src/game/slots/`): джекпот 20 000 Stars только для валюты `STARS`
  (баннер скрыт на $,₽,₴). Тизер (`banditConfig.ts`): ~15% спинов — ровно 2 джекпота
  на линии, ~2.5% — один, **3/3 невозможны по построению** (джекпот исключён из
  честного розыгрыша). Пары с джекпотом не оплачиваются (`evaluateLine`). RTP не тронут.
- Арт джекпота: `gungad-casino/public/assets/jackpot-orb.png` (круг 512, прозрачность).
  Исходник — `jackpot2.jpg` в корне. Старые `jackpot.jpg`/`jackpot-crystal.png` удалены из паблика.

---

## 9. Типовые поломки (шпаргалка)

| Симптом | Причина | Лечение |
|---|---|---|
| `api ping web-production...` без `https://` + `auth failed 405` | `VITE_API_URL` без схемы → запросы уходят на Vercel вместо Railway | Vercel env `VITE_API_URL=https://...`, редеплой |
| `[ggSession] Railway BOT_TOKEN missing` | Пустой `BOT_TOKEN` на Railway | Variables + Redeploy |
| `fetch failed` в `tonMonitor/cryptobotReconcile/starsReconcile` | Supabase на паузе / неверный URL | Restore в Dashboard, сверить `SUPABASE_URL` |
| `ensure_profile_failed / wallet_failed` | Не накачены миграции в новом Supabase-проекте | Накатить `supabase/migrations/` по порядку |
| `postMessage / Permissions-Policy / attribution-reporting` в консоли | Шум Telegram WebView и рекламы | Игнорировать, не баги |
| Барабан бандита обрезан на ПК | — | Уже пофикшено (`3c4ad48`: ширина `min(100%, 100dvh−330px)`) |

---

## 10. После смены хостинга (чеклист)

1. Railway Variables по разделу 4 → Redeploy → проверить `/api/health` и `/api/auth/ping`.
2. Vercel env `VITE_API_URL` → деплой CLI по разделу 5 → проверить живой бандл.
3. Webhook CryptoBot на новый домен (таблица в разделе 7).
4. `WEB_APP_URL` на Railway = текущий Vercel-алиас → Redeploy (кнопка Play берёт его при старте).
5. Тест 4 кнопок кассы: Stars $1, CryptoBot $1, TON $1, TRC20 TXID → заявка админу.
