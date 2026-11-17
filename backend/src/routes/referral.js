const express = require('express');
const router = express.Router();

let prisma = null;
try { ({ prisma } = require('../db')); } catch {}

const REWARD_PER_MINT_NANO = BigInt(Math.round(0.5 * 1e9)); // 0.5 TON

const { Address } = require('@ton/core');
const { sendTon } = require('../services/mintOnChain');

function walletVariants(addr) {
    try {
        const a = Address.parse(String(addr).trim());
        return [...new Set([
            a.toRawString(),
            a.toString({ bounceable: true,  urlSafe: true }),
            a.toString({ bounceable: false, urlSafe: true }),
            a.toString({ bounceable: true,  urlSafe: false }),
            a.toString({ bounceable: false, urlSafe: false }),
        ])];
    } catch {
        return [String(addr || '').trim()];
    }
}

function normalizeWallet(addr) {
    try {
        return Address.parse(String(addr).trim()).toRawString();
    } catch {
        return String(addr || '').trim();
    }
}

function shortWallet(addr) {
    const s = String(addr || '');
    return s.length > 12 ? `${s.slice(0, 6)}…${s.slice(-4)}` : s;
}

async function computeBalance(wallet) {
    const normalized = normalizeWallet(wallet);
    const variants = walletVariants(normalized);

    const referrals = await prisma.referral.findMany({ where: { referredBy: { in: variants } } });

    const referralData = [];
    let totalEarnedNano = 0n;

    for (const ref of referrals) {
        const count = await prisma.mint.count({
            where: {
                walletAddress: { in: walletVariants(ref.wallet) },
                status: 'confirmed',
                amountNano: { not: '0' } 
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
        where: { wallet: { in: variants }, status: { in: ['sent', 'review'] } }
    });
    const withdrawnNano = withdrawals.reduce((sum, w) => sum + BigInt(w.amountNano), 0n);
    const availableNano = totalEarnedNano > withdrawnNano ? totalEarnedNano - withdrawnNano : 0n;

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

const withdrawing = new Set();

// POST /api/referral/withdraw
router.post('/withdraw', async (req, res) => {
    let lockKey;
    try {
        const { walletAddress } = req.body || {};
        if (!walletAddress) {
            return res.status(400).json({ ok: false, error: 'walletAddress_required' });
        }

        let normalized;
        try {
            normalized = Address.parse(String(walletAddress).trim()).toRawString();
        } catch {
            return res.status(400).json({ ok: false, error: 'invalid_wallet_address' });
        }

        if (withdrawing.has(normalized)) {
            return res.status(429).json({ ok: false, error: 'withdrawal_in_progress' });
        }
        withdrawing.add(normalized);
        lockKey = normalized;

        const blocked = await prisma.withdrawal.findFirst({
            where: { wallet: normalized, status: { in: ['pending', 'review'] } }
        });
        if (blocked) {
            return res.status(429).json({ ok: false, error: 'withdrawal_in_progress' });
        }

        const { availableNano } = await computeBalance(normalized);
        if (availableNano <= 0n) {
            return res.status(400).json({ ok: false, error: 'nothing_to_withdraw' });
        }

        const rec = await prisma.withdrawal.create({
            data: { wallet: normalized, amountNano: String(availableNano), status: 'pending' }
        });

        try {
            await sendTon({ toAddress: normalized, amountNano: availableNano });
            await prisma.withdrawal.update({ where: { id: rec.id }, data: { status: 'sent' } });
            return res.json({ ok: true, amountTon: Number(availableNano) / 1e9 });
        } catch (e) {
            console.error('sendTon error:', e);
           
            await prisma.withdrawal.update({ where: { id: rec.id }, data: { status: 'review' } }).catch(() => {});
            return res.status(500).json({ ok: false, error: 'internal' });
        }
    } catch (e) {
        console.error('referral/withdraw error:', e);
        return res.status(500).json({ ok: false, error: 'internal' });
    } finally {
        if (lockKey) withdrawing.delete(lockKey);
    }
});

module.exports = router;