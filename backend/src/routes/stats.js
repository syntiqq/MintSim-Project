const express = require('express');
const router = express.Router();

let prisma = null;
try { ({ prisma } = require('../db')); } catch {}

function tonApiBase() {
    return process.env.TON_NETWORK === 'testnet'
        ? 'https://testnet.tonapi.io' : 'https://tonapi.io';
}

function beautyScore(number) {
    const digits = String(number).replace(/\D/g, '');
    let score = 0;
    let i = 0;
    while (i < digits.length) {
        let run = 1;
        while (i + run < digits.length && digits[i + run] === digits[i]) run++;
        score += run * run;
        i += run;
    }
    return score;
}

function shortWallet(addr) {
    const s = String(addr || '');
    return s.length > 12 ? `${s.slice(0, 6)}…${s.slice(-4)}` : s;
}

function formatNumber(raw) {
    const d = String(raw).replace(/\D/g, '').padStart(8, '0').slice(0, 8);
    return `+999 ${d.slice(0, 2)} ${d.slice(2, 5)} ${d.slice(5, 8)}`;
}

// GET /api/stats/top?wallet=<address>
const { Address } = require('@ton/core');

// GET /api/stats/top?wallet=<address>
router.get('/top', async (req, res) => {
    try {
        if (!prisma?.mint?.findMany) return res.json({ ok: true, top: [], myRank: null });

        const confirmed = await prisma.mint.findMany({
            where: { status: 'confirmed' },
            select: { walletAddress: true }
        });

        const counts = {};
        for (const m of confirmed) {
            let w = m.walletAddress;
            try {
                w = Address.parse(w.trim()).toRawString();
            } catch (e) {
                w = w.trim().toLowerCase(); 
            }
            counts[w] = (counts[w] || 0) + 1;
        }

        const sorted = Object.entries(counts)
            .sort((a, b) => b[1] - a[1])
            .map(([w, count], i) => ({
                rank: i + 1,
                wallet: w, 
                walletShort: shortWallet(w),
                count
            }));

        const top10 = sorted.slice(0, 10);

        let myRank = null;
        const reqWallet = req.query.wallet;
        if (reqWallet) {
            let searchWallet = reqWallet;
            try {
                searchWallet = Address.parse(reqWallet.trim()).toRawString();
            } catch (e) {
                searchWallet = searchWallet.trim().toLowerCase();
            }
            const idx = sorted.findIndex(e => e.wallet === searchWallet);
            if (idx !== -1) myRank = sorted[idx];
        }

        res.json({ ok: true, top: top10, myRank });
    } catch (e) {
        console.error('stats/top error:', e);
        res.status(500).json({ ok: false, error: 'internal' });
    }
});

// GET /api/stats/bea
router.get('/beautiful', async (req, res) => {
    try {
        if (!prisma?.mint?.findMany) return res.json({ ok: true, top: [] });

        const confirmed = await prisma.mint.findMany({
            where: { status: 'confirmed' },
            select: { number: true, walletAddress: true }
        });

        const scored = confirmed.map(m => ({
            number: m.number,
            formatted: formatNumber(m.number),
            wallet: shortWallet(m.walletAddress),
            score: beautyScore(m.number),
        }));

        scored.sort((a, b) => b.score - a.score);

        res.json({ ok: true, top: scored.slice(0, 10) });
    } catch (e) {
        console.error('stats/beautiful error:', e);
        res.status(500).json({ ok: false, error: 'internal' });
    }
});

// GET /api/stats/exp 
router.get('/expensive', async (req, res) => {
    try {
        const collectionAddr = process.env.GETGEMS_COLLECTION;
        if (!collectionAddr) return res.json({ ok: true, top: [] });

        const headers = process.env.TONAPI_KEY
            ? { Authorization: `Bearer ${process.env.TONAPI_KEY}` } : {};

        const r = await fetch(
            `${tonApiBase()}/v2/nfts/collections/${encodeURIComponent(collectionAddr)}/items?limit=1000`,
            { headers }
        );
        if (!r.ok) throw new Error(`TonAPI ${r.status}`);
        const data = await r.json();

        const items = (data.nft_items || [])
            .filter(item => item.sale?.price?.value)
            .map(item => ({
                name: item.metadata?.name || '',
                address: item.address,
                priceTon: Number(BigInt(item.sale.price.value || '0')) / 1e9,
                getgemsUrl: `https://getgems.io/nft/${item.address}`,
            }))
            .sort((a, b) => b.priceTon - a.priceTon)
            .slice(0, 10);

        res.json({ ok: true, top: items });
    } catch (e) {
        console.error('stats/expensive error:', e);
        res.status(500).json({ ok: false, error: 'internal' });
    }
});

module.exports = router;