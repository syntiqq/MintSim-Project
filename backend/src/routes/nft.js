const express = require('express');
const { Address } = require('@ton/core');
const router  = express.Router();

function tonApiBase() {
    return (process.env.TON_NETWORK || 'mainnet') === 'testnet'
        ? 'https://testnet.tonapi.io' : 'https://tonapi.io';
}

router.get('/check/:wallet', async (req, res) => {
    let wallet;
    try {
        wallet = Address.parse(String(req.params.wallet).trim()).toRawString();
    } catch {
        return res.status(400).json({ ok: false, error: 'bad_wallet' });
    }

    try {
        const headers = process.env.TONAPI_KEY ? { Authorization: `Bearer ${process.env.TONAPI_KEY}` } : {};
        const response = await fetch(`${tonApiBase()}/v2/accounts/${encodeURIComponent(wallet)}/nfts`, { headers });
        if (!response.ok) throw new Error(`TonAPI ${response.status}`);
        const data = await response.json();
        res.json({ ok: true, nfts: data.nft_items || [] });
    } catch (e) {
        console.error('nft/check error:', e.message);
        res.status(500).json({ ok: false, error: 'internal' });
    }
});

module.exports = router;