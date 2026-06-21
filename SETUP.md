# Чек-лист запуска

## 0. Важно про "TON / GRAM"

15 июня 2026 TON-сообщество проголосовало (81.22%) за переименование **токена**
Toncoin → **Gram (GRAM)**. Сама сеть осталась "TON / The Open Network" —
адреса, контракты, API (toncenter.com, tonapi.io), пакеты `@ton/core`,
Blueprint — всё без изменений. Поменялось только отображаемое имя токена.
Поэтому в коде везде остался `@ton/*`, `toNano()`, `TON_NETWORK` — это норма,
не баг. В интерфейсе я подписал цену как **"Gram (TON)"** — рекомендованный
формат на переходный период (до ~22 июня 2026 экосистема показывает оба имени).

---

## 1. Новая архитектура минта

```
Юзер подключает кошелёк
        ↓
Frontend → POST /api/mint/order  (backend создаёт заказ: number, comment, amountNano)
        ↓
Frontend отправляет ОБЫЧНЫЙ TON-перевод с текстовым комментарием `comment`
на адрес Collection-контракта, на сумму amountNano
        ↓
Backend (PaymentWatcher, опрашивает TonAPI каждые 15с) находит платёж по comment
        ↓
Backend грузит metadata в Pinata → получает ipfs/gateway URL
        ↓
Backend (от имени owner-кошелька, DEPLOYER_MNEMONIC) отправляет Mint
в Collection-контракт → создаётся NftItem с owner = кошелёк юзера
        ↓
NFT появляется в кошельке юзера и (через какое-то время на индексацию) в GetGems
```

Раньше фронтенд сам пытался собрать Mint-сообщение с opcode — это было хрупко
(контракт требовал owner=сам контракт, а не юзера). Теперь юзер просто платит
обычным переводом, всю остальную работу делает backend.

## 2. Почему контракты переписаны (TEP-62)

Старые `collection.tact` / `nft-item.tact` не реализовывали стандарт NFT
(TEP-62/TEP-64) — у них не было `get_collection_data()`, `get_nft_data()`,
стандартного `Transfer`. **Без этого GetGems и кошельки просто не распознают
твои NFT.** Я переписал оба контракта под стандарт — теперь это настоящие
TON NFT, которые видны в Tonkeeper/GetGems/TonAPI.

⚠️ Адрес контракта поменяется после редеплоя — старую коллекцию на GetGems
нужно будет привязать заново (или она появится как новая).

---

## 3. Что нужно сделать руками (у меня этих данных нет)

| # | Что | Где взять |
|---|-----|-----------|
| 1 | Скомпилировать контракты | `cd contracts/ton-nft && npx blueprint build` |
C:\proj\contracts\ton-nft\build\Collection
| 2 | Скопировать ABI в backend | `cp contracts/ton-nft/build/Collection/Collection_Collection.abi backend/abi/Collection.abi.json` |
| 3 | Залить `collection.json` (имя/описание/картинка коллекции) в Pinata вручную через сайт | pinata.cloud → Upload → получить URL |
| 4 | Задеплоить контракт | `npx blueprint run deployCollection --network mainnet` (передать URL из шага 3) |
| 5 | Новый адрес коллекции | вывод предыдущей команды → `GETGEMS_COLLECTION` в backend/.env и `VITE_COLLECTION_ADDRESS` в frontend/.env |
| 6 | Pinata JWT | pinata.cloud → API Keys → New Key |
| 7 | TonAPI ключ | tonconsole.com → создать токен |
| 8 | Мнемоника кошелька-владельца (24 слова) | твой существующий deployer-кошелёк → `DEPLOYER_MNEMONIC` (только в Railway Variables, никогда в git!) |
| 9 | Цена минта | `MINT_PRICE_TON` — бизнес-решение |
| 10 | Railway-домен | после первого деплоя на Railway → Settings → Domains |
| 11 | Production-домен Vercel | Vercel Dashboard → Project → Domains (используй постоянный домен, не git-preview-ссылку) |
| 12 | Telegram Bot Token | если используешь — перегенерировать у @BotFather, старый был скомпрометирован |

---

## 4. Деплой backend на Railway

1. railway.app → New Project → Deploy from GitHub repo
2. **Settings → Root Directory** = `backend` (проект — монорепо!)
3. **Settings → Variables** — вставь все переменные из `backend/.env.example`
4. **Добавь Volume**: Settings → Volumes → New Volume, mount path `/data`.
   Затем `DATABASE_URL="file:/data/prod.db"` — иначе SQLite будет стираться
   при каждом редеплое.
5. После первого деплоя: Settings → Domains → Generate Domain — скопируй URL
   в `BACKEND_PUBLIC_URL` (своя же переменная) и в frontend `VITE_API_BASE`.
6. `railway.toml` уже настроен (`npm run start` = `prisma migrate deploy && node src/index.js`).

## 5. Деплой frontend на Vercel

Без изменений в процессе — просто обнови Environment Variables в Vercel
Dashboard под новые `VITE_*` из `frontend/.env.example`, и убедись что
`tonconnect-manifest.json` → `url` совпадает с реальным production-доменом.

---

## 6. Тестирование перед mainnet

Настоятельно рекомендую сначала прогнать весь цикл на **testnet**
(`TON_NETWORK=testnet`, тестовые TON через testnet-кран в @testgiver_ton_bot)
прежде чем пускать реальные деньги. Я не могу скомпилировать/запустить
контракты в этой среде (нет доступа в сеть), поэтому:
- `npx blueprint build` — проверь, что контракты компилируются без ошибок
- `npx blueprint test` — прогони `Collection.spec.ts`
- Сделай один тестовый платёж на testnet и убедись, что PaymentWatcher
  реально находит транзакцию и минтит NFT
