const express = require('express');
const router = express.Router();

let prisma = null;
try { ({ prisma } = require('../db')); } catch {}

const { mintNft } = require('../services/mintOnChain');

function checkAdmin(req, res, next) {
    const secret = req.headers['x-admin-secret'];
    if (!secret || secret !== process.env.ADMIN_SECRET) {
        return res.status(403).json({ ok: false, error: 'forbidden', detail: 'wrong password' });
    }
    next();
}


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
            return res.status(400).json({ ok: false, error: 'wallet and number are needed' });
        }

        console.log(`[ADMIN MINT] push mint number ${number}`);


        const backendUrl = process.env.BACKEND_PUBLIC_URL || 'https://api.mintsim.uk';
        const metaUri = `${backendUrl}/api/mint/meta/${number}`;

        const blockchainResult = await mintNft({ 
            ownerAddress: walletAddress, 
            metaUri: metaUri 
        });

        console.log('[ADMIN MINT] approve mint:', blockchainResult);


        const rec = await prisma.mint.create({
            data: {
                tgId: 'admin',
                walletAddress,
                number: String(number),
                comment: 'admin-mint-' + Date.now(),
                amountNano: '0', 
                status: 'confirmed',
                nftIndex: String(blockchainResult.index),
                nftAddress: blockchainResult.nftAddress
            }
        });

        res.json({ 
            ok: true, 
            message: `Номер ${number} nice!`, 
            blockchain: blockchainResult,
            record: rec 
        });

    } catch (e) {
        console.error('[ADMIN MINT] error:', e.message);
        res.status(500).json({ ok: false, error: 'blockchain_error', detail: e.message });
    }
});

module.exports = router;