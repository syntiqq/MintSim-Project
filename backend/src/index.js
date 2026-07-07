const path    = require('path');
const express = require('express');
const morgan  = require('morgan');

require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

const app = express();

const EXTRA_ORIGIN = process.env.ALLOWED_ORIGIN;
const ADMIN_ORIGIN = 'https://mint-sim-project-xi.vercel.app';

function isAllowedOrigin(origin) {
    if (!origin) return true;
    if (origin.includes('localhost')) return true;
    if (origin === 'https://mintsim.uk' || origin === 'https://www.mintsim.uk') return true;
    if (EXTRA_ORIGIN && origin === EXTRA_ORIGIN) return true;
    if (origin === ADMIN_ORIGIN) return true;
    return false;
}

app.use(require('helmet')());

app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (isAllowedOrigin(origin)) {
        res.header('Access-Control-Allow-Origin', origin || '*');
    }
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-tg-id, x-admin-secret');
    res.header('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
    res.header('Vary', 'Origin');
    if (req.method === 'OPTIONS') return res.sendStatus(200);
    next();
});

app.use(require('helmet')());

app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (isAllowedOrigin(origin)) {
        res.header('Access-Control-Allow-Origin', origin || '*');
    }
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-tg-id, x-admin-secret');
    res.header('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
    res.header('Vary', 'Origin');
    if (req.method === 'OPTIONS') return res.sendStatus(200);
    next();
});

app.disable('x-powered-by');
app.set('trust proxy', true);

app.use(express.json({ limit: '100kb' }));
app.use(morgan('dev'));

// STATIC
const imagesDir = path.resolve(__dirname, '..', 'images');
app.use('/images', express.static(imagesDir));

// ROUTES
app.use('/api/mint', require('./routes/mint'));
app.use('/api/nft',  require('./routes/nft'));
app.use('/meta',     require('./routes/meta'));
app.use('/api/numbers', require('./routes/numbers'));
app.use('/api/auth', require('./routes/auth'));
app.use('/api/referral', require('./routes/referral'));
app.use('/api/stats', require('./routes/stats'));
app.use('/api/admin', require('./routes/admin'));

// HEALTH 
app.get('/health', (_req, res) => res.json({ ok: true }));

app.get('/api/ping', (_req, res) => {
    res.json({ ok: true, service: 'backend', time: new Date().toISOString() });
});

app.get('/api/env-check', (_req, res) => {
    const required = ['GETGEMS_COLLECTION', 'MINT_PRICE_TON', 'TON_NETWORK', 'PINATA_JWT', 'DEPLOYER_MNEMONIC'];
    const missing  = required.filter(k => !process.env[k]);
    res.json({ ok: missing.length === 0, missing });
});

// ERROR HANDLER 
app.use((err, _req, res, _next) => {
    console.error('ERROR:', err);
    res.status(500).json({ ok: false, error: 'internal' });
});

// START

const PORT = Number(process.env.PORT || 4000);
app.listen(PORT, () => console.log(`Backend running on port ${PORT}`));

// PAYMENT WATCHER
try {
    const { checkPayments } = require('../jobs/PaymentWatcher');
    const { prisma }        = require('./db');

    let watcherRunning = false;
    setInterval(() => {
        if (watcherRunning) return;
        watcherRunning = true;
        checkPayments(prisma)
            .catch(e => console.error('PaymentWatcher error:', e.message))
            .finally(() => { watcherRunning = false; });
    }, 15_000);

    console.log('PaymentWatcher started (polling every 15s)');
} catch (e) {
    console.warn('PaymentWatcher failed to start:', e.message);
}
