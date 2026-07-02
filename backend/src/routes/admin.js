const express = require('express');
const router = express.Router();

let prisma = null;
try { ({ prisma } = require('../db')); } catch {}

function checkAdmin(req, res, next) {
    const secret = req.headers['x-admin-secret'];
    if (!secret || secret !== process.env.ADMIN_SECRET) {
        return res.status(403).json({ ok: false, error: 'forbidden', detail: 'incorrect password' });
    }
    next();
}
//stats
router.get('/stats', checkAdmin, async (req, res) => {
    try {
        const totalMints = await prisma.mint.count();
        const confirmedMints = await prisma.mint.count({ where: { status: 'confirmed' } });
        const totalUsers = await prisma.mint.groupBy({ by: ['walletAddress'] });
        
        const allWithdrawals = await prisma.withdrawal.findMany({ where: { status: 'sent' } });
        const totalPaidNano = allWithdrawals.reduce((sum, w) => sum + BigInt(w.amountNano), 0n);

        res.json({
            ok: true,
            stats: {
                totalOrders: totalMints,
                confirmedMints,
                uniqueMinters: totalUsers.length,
                referralPaidTon: Number(totalPaidNano) / 1e9
            }
        });
    } catch (e) {
        res.status(500).json({ ok: false, error: e.message });
    }
});

router.post('/custom-mint', checkAdmin, async (req, res) => {
    try {
        const { walletAddress, number } = req.body;
        if (!walletAddress || !number) {
            return res.status(400).json({ ok: false, error: 'wallet and address' });
        }

        const rec = await prisma.mint.create({
            data: {
                tgId: 'admin',
                walletAddress,
                number: String(number),
                comment: 'admin-mint-' + Date.now(),
                amountNano: '0',
                status: 'confirmed',
            }
        });
        const { mintNft } = require('./referral');
        await mintNft({ ownerAddress: walletAddress, metaUri: '...' });

        res.json({ ok: true, message: `number ${number} is yours ${walletAddress}`, record: rec });
    } catch (e) {
        res.status(500).json({ ok: false, error: e.message });
    }
});

module.exports = router;