const express = require('express');
const router = express.Router();

let prisma = null;
try { ({ prisma } = require('../db')); } catch {}

const REWARD_PER_MINT_NANO = BigInt(Math.round(0.5 * 1e9)); // 0.5 TON 

const { Address } = require('@ton/core');

function normalizeWallet(addr) {
    try {
        return Address.parse(String(addr).trim()).toRawString();
    } catch (e) {
        return (addr || '').trim();
    }
}

function shortWallet(addr) {
    const s = String(addr || '');
    return s.length > 12 ? `${s.slice(0, 6)}…${s.slice(-4)}` : s;
}

async function computeBalance(wallet) {
    const normalized = normalizeWallet(wallet);

    const referrals = await prisma.referral.findMany({ where: { referredBy: normalized } });

    const referralData = [];
    let totalEarnedNano = 0n;

    for (const ref of referrals) {
        const count = await prisma.mint.count({
            where: {
                walletAddress: { in: [ref.wallet, ref.wallet.toUpperCase()] },
                status: 'confirmed'
            }
        });
        const earnedNano = BigInt(count) * REWARD_PER_MINT_NANO;
        totalEarnedNano += earnedNano;
        referralData.push({
            wallet: ref.wallet,
            walletShort: shortWallet(ref.wallet),
            joinedAt: ref.createdAt,
            mints: count,
            rewardTon: Number(earnedNano) / 1e9,
        });
    }

    const withdrawals = await prisma.withdrawal.findMany({
        where: { wallet: normalized, status: 'sent' }
    });
    const withdrawnNano = withdrawals.reduce((sum, w) => sum + BigInt(w.amountNano), 0n);
    const availableNano = totalEarnedNano > withdrawnNano
        ? totalEarnedNano - withdrawnNano
        : 0n;

    return { referralData, totalEarnedNano, withdrawnNano, availableNano };
}

// GET /api/referral/me?wallet=<address>
router.get('/me', async (req, res) => {
    try {
        const wallet = req.query.wallet;
        if (!wallet) return res.status(400).json({ ok: false, error: 'wallet_required' });
        if (!prisma?.referral?.findMany) {
            return res.json({ ok: true, totalEarned: 0, totalAvailable: 0, referrals: [] });
        }

        const { referralData, totalEarnedNano, withdrawnNano, availableNano } = await computeBalance(wallet);

        res.json({
            ok: true,
            rewardPerMint: 0.5,
            totalEarned: Number(totalEarnedNano) / 1e9,
            totalWithdrawn: Number(withdrawnNano) / 1e9,
            totalAvailable: Number(availableNano) / 1e9,
            referrals: referralData,
        });
    } catch (e) {
        console.error('referral/me error:', e);
        res.status(500).json({ ok: false, error: 'internal' });
    }
});

// POST /api/referral/withdraw
router.post('/withdraw', async (req, res) => {
    try {
        const { walletAddress } = req.body || {};
        if (!walletAddress) {
            return res.status(400).json({ ok: false, error: 'walletAddress_required' });
        }

        // TON-address validation
        let normalized;
        try {
            normalized = normalizeWallet(walletAddress);
            const { Address } = require('@ton/core');
            Address.parse(normalized); 
        } catch {
            return res.status(400).json({ ok: false, error: 'invalid_wallet_address' });
        }
 
        const existingPending = await prisma.withdrawal.findFirst({
            where: { wallet: normalized, status: 'pending' }
        });
        if (existingPending) {
            return res.status(429).json({
                ok: false,
                error: 'withdrawal_in_progress',
                detail: 'A withdrawal is already being processed, try again in a minute'
            });
        }

        const { availableNano } = await computeBalance(walletAddress);
        if (availableNano <= 0n) {
            return res.status(400).json({ ok: false, error: 'nothing_to_withdraw' });
        }

       
        const rec = await prisma.withdrawal.create({
            data: { wallet: normalized, amountNano: String(availableNano), status: 'pending' }
        });

        try {
            const { sendTon } = require('../services/mintOnChain');
            await sendTon({ toAddress: walletAddress, amountNano: availableNano });

            await prisma.withdrawal.update({
                where: { id: rec.id },
                data: { status: 'sent' }
            });

            res.json({ ok: true, amountTon: Number(availableNano) / 1e9 });
        } catch (e) {
            await prisma.withdrawal.update({
                where: { id: rec.id },
                data: { status: 'failed' }
            }).catch(() => {});
            throw e;
        }
    } catch (e) {
        console.error('referral/withdraw error:', e);
        res.status(500).json({ ok: false, error: 'internal' });
    }
});

module.exports = router;