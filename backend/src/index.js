const path    = require('path');
const express = require('express');
const morgan  = require('morgan');

require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

const app = express();

// ─── CORS ────────────────────────────────────────────────────────────────────
// Allows your Vercel frontend (any *.vercel.app preview/prod URL) plus
// localhost for development. Tighten ALLOWED_ORIGIN in .env for stricter prod.
const EXTRA_ORIGIN = process.env.ALLOWED_ORIGIN; // e.g. https://your-app.vercel.app

function isAllowedOrigin(origin) {
    if (!origin) return true; // non-browser clients (curl, server-to-server)
    if (origin.includes('localhost')) return true;
    if (origin.endsWith('.vercel.app')) return true;
    if (EXTRA_ORIGIN && origin === EXTRA_ORIGIN) return true;
    return false;
}

app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (isAllowedOrigin(origin)) {
        res.header('Access-Control-Allow-Origin', origin || '*');
    }
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-tg-id');
    res.header('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
    res.header('Vary', 'Origin');
    if (req.method === 'OPTIONS') return res.sendStatus(200);
    next();
});

app.disable('x-powered-by');
app.set('trust proxy', true);

app.use(express.json({ limit: '10mb' }));
app.use(morgan('dev'));

// ─── STATIC ──────────────────────────────────────────────────────────────────
const imagesDir = path.resolve(__dirname, '..', 'images');
app.use('/images', express.static(imagesDir));

// ─── ROUTES ──────────────────────────────────────────────────────────────────
app.use('/api/mint', require('./routes/mint'));
app.use('/api/nft',  require('./routes/nft'));
app.use('/meta',     require('./routes/meta'));
app.use('/api/numbers', require('./routes/numbers'));

// ─── HEALTH (used by Railway's healthcheck) ─────────────────────────────────
app.get('/health', (_req, res) => res.json({ ok: true }));

app.get('/api/ping', (_req, res) => {
    res.json({ ok: true, service: 'backend', time: new Date().toISOString() });
});

app.get('/api/env-check', (_req, res) => {
    const required = ['GETGEMS_COLLECTION', 'MINT_PRICE_TON', 'TON_NETWORK', 'PINATA_JWT', 'DEPLOYER_MNEMONIC'];
    const missing  = required.filter(k => !process.env[k]);
    res.json({ ok: missing.length === 0, missing });
});

// ─── ERROR HANDLER ───────────────────────────────────────────────────────────
app.use((err, _req, res, _next) => {
    console.error('ERROR:', err);
    res.status(500).json({ ok: false, error: 'internal', detail: err.message });
});

// ─── START ───────────────────────────────────────────────────────────────────
// Railway provides PORT automatically — don't hardcode it.
const PORT = Number(process.env.PORT || 4000);
app.listen(PORT, () => console.log(`Backend running on port ${PORT}`));

// ─── PAYMENT WATCHER (polls every 15s for incoming on-chain payments) ──────
try {
    const { checkPayments } = require('../jobs/PaymentWatcher');
    const { prisma }        = require('./db');

    let watcherRunning = false;
    setInterval(() => {
        if (watcherRunning) return; // предыдущий цикл ещё не закончился — пропускаем
        watcherRunning = true;
        checkPayments(prisma)
            .catch(e => console.error('PaymentWatcher error:', e.message))
            .finally(() => { watcherRunning = false; });
    }, 15_000);

    console.log('PaymentWatcher started (polling every 15s)');
} catch (e) {
    console.warn('PaymentWatcher failed to start:', e.message);
}
