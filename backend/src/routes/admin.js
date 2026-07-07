const express = require('express');
const router = express.Router();

let prisma = null;
try { ({ prisma } = require('../db')); } catch {}

const { mintNft } = require('../services/mintOnChain');

const safeJson = (data) => JSON.parse(JSON.stringify(data, (key, value) =>
    typeof value === 'bigint' ? value.toString() : value
));

function formatMintNumber(rawNumber) {
    let clean = String(rawNumber).replace(/\D/g, ''); 
    if (clean.startsWith('999') && clean.length > 8) {
        clean = clean.slice(3);
    }
    if (clean.length === 8) {
        clean = `${clean.slice(0, 2)} ${clean.slice(2, 5)} ${clean.slice(5)}`;
    }
    return `+999 ${clean}`;
}

router.get('/meta/:number', (req, res) => {
    const rawNumber = req.params.number;
    const formattedName = formatMintNumber(rawNumber);
    const backendUrl = process.env.BACKEND_PUBLIC_URL || 'https://api.mintsim.uk';
    
    res.json({
        name: formattedName, 
        description: 'Anonymous number NFT',
        image: `${backendUrl}/api/mint/card/${rawNumber}.png`, 
        attributes: [{ trait_type: 'number', value: formattedName }]
    });
});

function checkAdmin(req, res, next) {
    const secret = req.headers['x-admin-secret'];
    if (!secret || secret !== process.env.ADMIN_SECRET) {
        return res.status(403).json({ ok: false, error: 'forbidden', detail: 'incorrect password' });
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
                "all attemtps": totalMints,
                "minted numbers": confirmedMints,
                "unique buyers": totalUsers.length,
                "referral amount (TON)": Number(totalPaidNano) / 1e9
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
            return res.status(400).json({ ok: false, error: 'wallet and number' });
        }

        console.log(`[ADMIN MINT] Minting number ${number}`);

        const backendUrl = process.env.BACKEND_PUBLIC_URL || 'https://api.mintsim.uk';
        const metaUri = `${backendUrl}/api/admin/meta/${number}`;

        const blockchainResult = await mintNft({ 
            ownerAddress: walletAddress, 
            metaUri: metaUri 
        });

        console.log('[ADMIN MINT] mint agreed:', safeJson(blockchainResult));

        const rec = await prisma.mint.create({
            data: {
                tgId: 'admin',
                walletAddress,
                number: String(number),
                comment: 'admin-mint-' + Date.now(),
                amountNano: '0', 
                status: 'confirmed',
                nftIndex: blockchainResult.index !== undefined ? String(blockchainResult.index) : null,
                nftAddress: blockchainResult.nftAddress || null
            }
        });

        res.json({ 
            ok: true, 
            message: `✅  ${number} has been minted`, 
            blockchain: safeJson(blockchainResult),
            record: rec 
        });

    } catch (e) {
        console.error('[ADMIN MINT] error:', e.message);
        res.status(500).json({ ok: false, error: 'blockchain_error', detail: e.message });
    }
});

module.exports = router;