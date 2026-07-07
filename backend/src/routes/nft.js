const express = require('express');
const router  = express.Router();

function tonApiBase() {
    return (process.env.TON_NETWORK || 'mainnet') === 'testnet'
        ? 'https://testnet.tonapi.io' : 'https://tonapi.io';
}

// GET /api/nft/check/:wallet — list NFTs currently in a wallet
router.get('/check/:wallet', async (req, res) => {
    const wallet = req.params.wallet;
    try {
        const headers = process.env.TONAPI_KEY ? { Authorization: `Bearer ${process.env.TONAPI_KEY}` } : {};
        const response = await fetch(`${tonApiBase()}/v2/accounts/${wallet}/nfts`, { headers });
        const data = await response.json();
        res.json({ ok: true, nfts: data.nft_items || [] });
    } catch (e) {
        res.status(500).json({ ok: false, error: 'internal'});
    }
});

module.exports = router;
