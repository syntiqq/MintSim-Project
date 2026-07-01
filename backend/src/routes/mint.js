const express = require('express');
const crypto   = require('crypto');
const router   = express.Router();
const { renderCardPng } = require('../utils/cardImage');
const { generateNumber } = require('../utils/generateNumber');
const rateLimit = require('express-rate-limit');
const orderLimiter = rateLimit({ windowMs: 60_000, max: 5 });

let prisma = null;
try { ({ prisma } = require('../db')); } catch {}

function toDetail(e) {
    const ax = e?.response?.data;
    if (typeof ax === 'string') return ax;
    if (ax?.detail)  return ax.detail;
    if (ax?.message) return ax.message;
    if (ax)           return JSON.stringify(ax);
    return e?.message || String(e);
}

// POST /api/mint/order
router.post('/order', orderLimiter, async (req, res) => {
    try {
        const tgId = req.headers['x-tg-id'] || 'web-user';
        const { walletAddress } = req.body || {};
        const { walletAddress, ref } = req.body || {};
        if (!walletAddress) {
            return res.status(400).json({ ok: false, error: 'bad_request', detail: 'walletAddress required' });
        }

        const needEnv = ['GETGEMS_COLLECTION', 'MINT_PRICE_TON', 'TON_NETWORK'];
        const missing = needEnv.filter(k => !process.env[k]);
        if (missing.length) {
            return res.status(500).json({ ok: false, error: 'config', detail: `Missing ENV: ${missing.join(', ')}` });
        }

        if (!prisma?.mint?.create) {
            if (ref && prisma?.referral) {
        const normalRef = String(ref).trim().toLowerCase();
            const normalWallet = walletAddress.trim().toLowerCase();
            if (normalRef !== normalWallet) {
                const exists = await prisma.referral.findUnique({ where: { wallet: normalWallet } });
                if (!exists) {
                    await prisma.referral.create({
                        data: { wallet: normalWallet, referredBy: normalRef }
                    }).catch(() => {}); // игнорируем если уже есть (race condition safe)
                }
            }
        }
            return res.status(500).json({ ok: false, error: 'config', detail: 'Database not available' });
        }

        const priceTon    = Number(process.env.MINT_PRICE_TON);
        const amountNano  = String(Math.round(priceTon * 1e9));
        const number      = generateNumber(8);                         // looks like a phone number
        const comment      = 'mint-' + crypto.randomBytes(4).toString('hex');

        const rec = await prisma.mint.create({
            data: {
                tgId: String(tgId),
                walletAddress,
                number,
                comment,
                amountNano,
                status: 'awaiting_payment',
            }
        });

        return res.json({
            ok: true,
            orderId: rec.id,
            number,
            comment,
            amountNano,
            amountTon: priceTon,
            collectionAddress: process.env.GETGEMS_COLLECTION,
        });

    } catch (e) {
        console.error('ORDER ERROR:', e);
        return res.status(500).json({ ok: false, error: 'internal', detail: toDetail(e) });
    }
});

// GET /api/mint/order/:id 
router.get('/order/:id', async (req, res) => {
    try {
        if (!prisma?.mint?.findUnique) {
            return res.status(404).json({ ok: false, error: 'not_found' });
        }
        const rec = await prisma.mint.findUnique({ where: { id: req.params.id } });
        if (!rec) return res.status(404).json({ ok: false, error: 'not_found' });
        return res.json({ ok: true, order: rec });
    } catch (e) {
        console.error('ORDER ERROR:', e);
        return res.status(500).json({ ok: false, error: 'internal' }); 
    }
});

// GET /api/mint/my 
router.get('/my', async (req, res) => {
    try {
        const tgId = req.headers['x-tg-id'];
        if (!tgId) return res.status(401).json({ ok: false, error: 'bad_request', detail: 'x-tg-id required' });
        if (!prisma?.mint?.findMany) return res.json({ ok: true, items: [] });

        const items = await prisma.mint.findMany({
            where: { tgId: String(tgId) },
            orderBy: { createdAt: 'desc' }
        });
        return res.json({ ok: true, items });
    } catch (e) {
        return res.status(500).json({ ok: false, error: 'internal', detail: toDetail(e) });
    }
});

router.get('/meta/:number', (req, res) => {
    const number = req.params.number;
    const backendUrl = process.env.BACKEND_PUBLIC_URL || 'http://localhost:4000';
    res.json({
        name: `Number ${number}`,
        description: 'Anonymous number NFT',
        image: `${backendUrl}/images/${number}.png`,
        attributes: [{ trait_type: 'number', value: number }]
    });
});
// GENERATING CARD
router.get('/card/:filename', async (req, res) => {
    try {
        const number = req.params.filename.replace(/\.png$/i, '');
        const png = await renderCardPng(number);
        res.set('Content-Type', 'image/png');
        res.set('Cache-Control', 'public, max-age=31536000, immutable');
        res.send(png);
    } catch (e) {
        console.error('card render error:', e.message);
        res.status(500).send('card render failed');
    }
});
module.exports = router;
