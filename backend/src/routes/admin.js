const express = require('express');
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
const { Address } = require('@ton/core');
const router = express.Router();

let prisma = null;
try { ({ prisma } = require('../db')); } catch {}

const { mintNft } = require('../services/mintOnChain');

const safeJson = (data) => JSON.parse(JSON.stringify(data, (key, value) =>
    typeof value === 'bigint' ? value.toString() : value
));

function formatMintNumber(rawNumber) {
    let clean = String(rawNumber).replace(/\D/g, '');
    if (clean.startsWith('999') && clean.length > 8) clean = clean.slice(3);
    if (clean.length === 8) clean = `${clean.slice(0, 2)} ${clean.slice(2, 5)} ${clean.slice(5)}`;
    return `+999 ${clean}`;
}

router.get('/meta/:number', (req, res) => {
    const rawNumber = String(req.params.number).replace(/\D/g, '');
    if (!rawNumber) return res.status(400).json({ ok: false, error: 'bad_number' });

    const formattedName = formatMintNumber(rawNumber);
    const backendUrl = process.env.BACKEND_PUBLIC_URL || 'https://api.mintsim.uk';

    res.json({
        name: formattedName,
        description: 'Anonymous number NFT',
        image: `${backendUrl}/api/mint/card/${rawNumber}.png`,
        attributes: [{ trait_type: 'number', value: formattedName }]
    });
});

const authFailLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: true,
    requestWasSuccessful: (req, res) => res.statusCode !== 403,
    message: { ok: false, error: 'too_many_attempts' }
});

function checkAdmin(req, res, next) {
    const expected = process.env.ADMIN_SECRET;
    if (!expected || expected.length < 32) {
        console.error('ADMIN_SECRET missing or too short');
        return res.status(500).json({ ok: false, error: 'internal' }); // fail closed
    }
    const got = String(req.headers['x-admin-secret'] || '');
    const a = Buffer.from(got);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
        return res.status(403).json({ ok: false, error: 'forbidden' });
    }
    next();
}

router.use(authFailLimiter, checkAdmin);

router.get('/stats', async (req, res) => {
    try {
        const totalMints = await prisma.mint.count();
        const confirmedMints = await prisma.mint.count({ where: { status: 'confirmed' } });
        const totalUsers = await prisma.mint.groupBy({ by: ['walletAddress'] });

        const allWithdrawals = await prisma.withdrawal.findMany({ where: { status: 'sent' } });
        const totalPaidNano = allWithdrawals.reduce((sum, w) => sum + BigInt(w.amountNano), 0n);

        res.json({
            ok: true,
            stats: {
                "all attemtps": totalMints,
                "minted numbers": confirmedMints,
                "unique buyers": totalUsers.length,
                "referral amount (TON)": Number(totalPaidNano) / 1e9
            }
        });
    } catch (e) {
        console.error('[ADMIN STATS]', e.message);
        res.status(500).json({ ok: false, error: 'internal' });
    }
});

let minting = false;

router.post('/custom-mint', async (req, res) => {
    if (minting) return res.status(429).json({ ok: false, error: 'mint_in_progress' });
    minting = true;
    try {
        const { walletAddress, number } = req.body || {};

        const digits = String(number ?? '').replace(/\D/g, '');
        if (!/^\d{8,15}$/.test(digits)) {
            return res.status(400).json({ ok: false, error: 'bad_number' });
        }

        let owner;
        try {
            owner = Address.parse(String(walletAddress ?? '').trim());
        } catch {
            return res.status(400).json({ ok: false, error: 'bad_wallet' });
        }
        const ownerFriendly = owner.toString({ bounceable: false });

        const exists = await prisma.mint.findFirst({
            where: { number: digits, status: 'confirmed' }
        });
        if (exists) return res.status(409).json({ ok: false, error: 'already_minted' });

        console.log(`[ADMIN MINT] number ${digits} -> ${ownerFriendly}`);

        const backendUrl = process.env.BACKEND_PUBLIC_URL || 'https://api.mintsim.uk';
        const metaUri = `${backendUrl}/api/admin/meta/${digits}`;

        const blockchainResult = await mintNft({ ownerAddress: ownerFriendly, metaUri });
        console.log('[ADMIN MINT] ok:', safeJson(blockchainResult));

        const rec = await prisma.mint.create({
            data: {
                tgId: 'admin',
                walletAddress: ownerFriendly,
                number: digits,
                comment: 'admin-mint-' + Date.now(),
                amountNano: '0',
                status: 'confirmed',
                nftIndex: blockchainResult.index !== undefined ? String(blockchainResult.index) : null,
                nftAddress: blockchainResult.nftAddress || null
            }
        });

        res.json({
            ok: true,
            message: `✅ ${digits} has been minted`,
            blockchain: safeJson(blockchainResult),
            record: safeJson(rec)
        });
    } catch (e) {
        console.error('[ADMIN MINT] error:', e); 
        res.status(500).json({ ok: false, error: 'blockchain_error' });
    } finally {
        minting = false;
    }
});

module.exports = router;