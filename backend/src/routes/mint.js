const express = require('express');
const crypto  = require('crypto');
const router  = express.Router();
const rateLimit = require('express-rate-limit');
const { Address } = require('@ton/core');

const { renderCardPng }  = require('../utils/cardImage');
const { generateNumber } = require('../utils/generateNumber');
const { verifyToken }    = require('../utils/auth');

const orderLimiter = rateLimit({ windowMs: 60_000, max: 5 });

let prisma = null;
try { ({ prisma } = require('../db')); } catch {}

function tgIdFromReq(req) {
    try {
        const h = req.headers.authorization || '';
        const token = h.startsWith('Bearer ') ? h.slice(7) : '';
        return verifyToken(token, process.env.TELEGRAM_BOT_TOKEN);
    } catch {
        return null;
    }
}

// POST /api/mint/order
router.post('/order', orderLimiter, async (req, res) => {
    try {
        const tgId = tgIdFromReq(req) || 'web-user';
        const { walletAddress, ref } = req.body || {};

        if (!walletAddress) {
            return res.status(400).json({ ok: false, error: 'bad_request', detail: 'walletAddress required' });
        }

        let ownerRaw;
        try {
            ownerRaw = Address.parse(String(walletAddress).trim()).toRawString();
        } catch {
            return res.status(400).json({ ok: false, error: 'bad_request', detail: 'invalid walletAddress' });
        }

        const needEnv = ['GETGEMS_COLLECTION', 'MINT_PRICE_TON', 'TON_NETWORK'];
        const missing = needEnv.filter(k => !process.env[k]);
        if (missing.length) {
            console.error('Missing ENV:', missing.join(', '));
            return res.status(500).json({ ok: false, error: 'config' });
        }

        if (!prisma?.mint?.create) {
            return res.status(500).json({ ok: false, error: 'config' });
        }

        const priceTon   = Number(process.env.MINT_PRICE_TON);
        const amountNano = String(Math.round(priceTon * 1e9));
        
        let number;
        for (let i = 0; i < 20; i++) {
            const candidate = generateNumber(8);
            const taken = await prisma.mint.findFirst({ where: { number: candidate }, select: { id: true } });
            if (!taken) { number = candidate; break; }
        }
        if (!number) return res.status(503).json({ ok: false, error: 'try_again' });

        const comment    = 'mint-' + crypto.randomBytes(4).toString('hex')
        const rec = await prisma.mint.create({
            data: {
                tgId: String(tgId),
                walletAddress: ownerRaw,
                number,
                comment,
                amountNano,
                status: 'awaiting_payment',
            }
        });

        // referral
        if (ref && prisma?.referral) {
            try {
                const normalRef = Address.parse(String(ref).trim()).toRawString();
                if (normalRef !== ownerRaw) {
                    const exists = await prisma.referral.findUnique({ where: { wallet: ownerRaw } });
                    if (!exists) {
                        await prisma.referral.create({
                            data: { wallet: ownerRaw, referredBy: normalRef }
                        }).catch(() => {});
                    }
                }
            } catch {
                console.warn('Invalid referral address provided, skipping ref saving');
            }
        }

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
        return res.status(500).json({ ok: false, error: 'internal' });
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
        return res.status(500).json({ ok: false, error: 'internal' });
    }
});

// GET /api/mint/my
router.get('/my', async (req, res) => {
    try {
        const tgId = tgIdFromReq(req);
        if (!tgId) return res.status(401).json({ ok: false, error: 'unauthorized' });
        if (!prisma?.mint?.findMany) return res.json({ ok: true, items: [] });

        const items = await prisma.mint.findMany({
            where: { tgId: String(tgId) },
            orderBy: { createdAt: 'desc' }
        });
        return res.json({ ok: true, items });
    } catch (e) {
        return res.status(500).json({ ok: false, error: 'internal' });
    }
});

// GET /api/mint/meta/:number
router.get('/meta/:number', (req, res) => {
    const number = String(req.params.number).replace(/\D/g, '');
    if (!number) return res.status(400).json({ ok: false, error: 'bad_number' });
    const backendUrl = process.env.BACKEND_PUBLIC_URL || 'http://localhost:4000';
    res.json({
        name: `Number ${number}`,
        description: 'Anonymous number NFT',
        image: `${backendUrl}/images/${number}.png`,
        attributes: [{ trait_type: 'number', value: number }]
    });
});

// GET /api/mint/card/:filename
router.get('/card/:filename', async (req, res) => {
    try {
        const number = req.params.filename.replace(/\.png$/i, '');
        if (!/^\d{1,20}$/.test(number)) return res.status(400).send('bad number');
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