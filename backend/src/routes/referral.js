const express = require('express');
const router = express.Router();
const { verifyToken } = require('../utils/auth');

let prisma = null;
try { ({ prisma } = require('../db')); } catch {}

const REWARD_PER_MINT_NANO = String(Math.round(0.5 * 1e9)); // 0.5 GRAM/TON за каждый сминченный номер реферала

async function computeBalance(tgId) {
    const referredUsers = await prisma.user.findMany({ where: { referredBy: tgId } });

    const referrals = [];
    let totalEarnedNano = 0n;

    for (const u of referredUsers) {
        const count = await prisma.mint.count({ where: { tgId: u.tgId, status: 'confirmed' } });
        const earnedNano = BigInt(count) * BigInt(REWARD_PER_MINT_NANO);
        totalEarnedNano += earnedNano;
        referrals.push({
            tgId: u.tgId,
            joinedAt: u.createdAt,
            mints: count,
            rewardTon: Number(earnedNano) / 1e9,
        });
    }

    const withdrawals = await prisma.withdrawal.findMany({ where: { tgId, status: 'sent' } });
    const withdrawnNano = withdrawals.reduce((sum, w) => sum + BigInt(w.amountNano), 0n);
    const availableNano = totalEarnedNano - withdrawnNano;

    return { referrals, totalEarnedNano, withdrawnNano, availableNano };
}

router.get('/me', async (req, res) => {
    try {
        const tgId = req.headers['x-tg-id'];
        if (!tgId) return res.status(401).json({ ok: false, error: 'bad_request', detail: 'x-tg-id required' });
        if (!prisma?.user?.findMany) return res.json({ ok: true, link: '', totalEarned: 0, totalAvailable: 0, referrals: [] });

        const { referrals, totalEarnedNano, withdrawnNano, availableNano } = await computeBalance(String(tgId));

        res.json({
            ok: true,
            rewardPerReferral: 0.5,
            totalEarned: Number(totalEarnedNano) / 1e9,
            totalWithdrawn: Number(withdrawnNano) / 1e9,
            totalAvailable: Number(availableNano) / 1e9,
            referrals,
        });
    } catch (e) {
        console.error('referral/me error:', e);
        res.status(500).json({ ok: false, error: 'internal' });
    }
});

router.post('/withdraw', async (req, res) => {
    try {
        const auth = req.headers['authorization'];
        const token = auth?.startsWith('Bearer ') ? auth.slice(7) : null;
        const tgId = verifyToken(token, process.env.TELEGRAM_BOT_TOKEN);
        if (!tgId) return res.status(401).json({ ok: false, error: 'unauthorized' });

        const { walletAddress } = req.body || {};
        if (!walletAddress) return res.status(400).json({ ok: false, error: 'bad_request', detail: 'walletAddress required' });

        const { availableNano } = await computeBalance(tgId);
        if (availableNano <= 0n) {
            return res.status(400).json({ ok: false, error: 'nothing_to_withdraw' });
        }

        const rec = await prisma.withdrawal.create({
            data: { tgId, amountNano: String(availableNano), status: 'pending' }
        });

        try {
            const { sendTon } = require('../services/mintOnChain'); // ⚠️ функцию sendTon допишем после того, как пришлёшь mintOnChain.js
            const result = await sendTon({ toAddress: walletAddress, amountNano: availableNano });

            await prisma.withdrawal.update({
                where: { id: rec.id },
                data: { status: 'sent', txHash: result.txHash || null }
            });

            res.json({ ok: true, amountTon: Number(availableNano) / 1e9 });
        } catch (e) {
            await prisma.withdrawal.update({ where: { id: rec.id }, data: { status: 'failed' } }).catch(() => {});
            throw e;
        }
    } catch (e) {
        console.error('referral/withdraw error:', e);
        res.status(500).json({ ok: false, error: 'internal', detail: e.message });
    }
});

module.exports = router;