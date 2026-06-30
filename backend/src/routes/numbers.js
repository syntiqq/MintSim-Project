const express = require('express');
const router = express.Router();

function tonApiBase() {
    return (process.env.TON_NETWORK === 'testnet') ? 'https://testnet.tonapi.io' : 'https://tonapi.io';
}
function extractDigits(item) {
    const attrs = item?.metadata?.attributes || [];
    const attr = attrs.find(a => a.trait_type === 'number');
    const raw = attr?.value || item?.metadata?.name || '';
    const digitsOnly = String(raw).replace(/\D/g, '');
    return digitsOnly.slice(-8).padStart(8, '0');
}

function formatDigits(digits) {
    return `+999 ${digits.slice(0, 2)} ${digits.slice(2, 5)} ${digits.slice(5, 8)}`;
}

// GET /api/numbers/:wallet numbers
router.get('/:wallet', async (req, res) => {
    try {
        const { wallet } = req.params;
        const collectionAddr = process.env.GETGEMS_COLLECTION;

        if (!collectionAddr) {
            return res.status(500).json({ ok: false, error: 'config', detail: 'GETGEMS_COLLECTION not set' });
        }

        const url = `${tonApiBase()}/v2/accounts/${encodeURIComponent(wallet)}/nfts?collection=${encodeURIComponent(collectionAddr)}&limit=1000`;
        const headers = process.env.TONAPI_KEY ? { Authorization: `Bearer ${process.env.TONAPI_KEY}` } : {};

        const r = await fetch(url, { headers });
        if (!r.ok) throw new Error(`TonAPI ${r.status}: ${await r.text()}`);
        const data = await r.json();

        const numbers = (data.nft_items || []).map(item => ({
            number: formatDigits(extractDigits(item)),
        }));

        res.json({ ok: true, numbers });
    } catch (e) {
        console.error('numbers error:', e.message);
        res.status(500).json({ ok: false, error: 'internal', detail: e.message });
    }
});

module.exports = router;