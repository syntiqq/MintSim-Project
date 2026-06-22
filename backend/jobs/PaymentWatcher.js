// Polls TonAPI for incoming transactions to the Collection contract address,
// matches them against pending orders (by the one-time comment code), and —
// once a matching payment is found — uploads metadata to Pinata and triggers
// the on-chain Mint. Runs in a simple sequential loop (one order at a time)
// to avoid two orders racing for the same nextItemIndex.
const { pinJson }   = require('../src/utils/pinata');
const { mintNft }   = require('../src/services/mintOnChain');

function isTestnet() {
    return (process.env.TON_NETWORK || 'mainnet') === 'testnet';
}

function tonApiBase() {
    return isTestnet() ? 'https://testnet.tonapi.io' : 'https://tonapi.io';
}

async function fetchRecentTxs(address, limit = 30) {
    const url = `${tonApiBase()}/v2/blockchain/accounts/${address}/transactions?limit=${limit}`;
    const headers = process.env.TONAPI_KEY ? { Authorization: `Bearer ${process.env.TONAPI_KEY}` } : {};
    const res = await fetch(url, { headers });
    if (!res.ok) throw new Error(`TonAPI ${res.status}: ${await res.text()}`);
    const data = await res.json();
    return data.transactions || [];
}

function decodeComment(tx) {
    try {
        const msg = tx.in_msg;
        if (!msg) return null;
        if (msg.decoded_op_name === 'text_comment' && msg.decoded_body?.text) {
            return msg.decoded_body.text;
        }
        return msg.message || null; // older TonAPI shapes expose it directly
    } catch {
        return null;
    }
}

async function checkPayments(prisma) {
    if (!prisma?.mint?.findMany) return;

    const pending = await prisma.mint.findMany({ where: { status: 'awaiting_payment' } });
    if (pending.length === 0) return;

    const collectionAddr = process.env.GETGEMS_COLLECTION;
    if (!collectionAddr) { console.warn('PaymentWatcher: GETGEMS_COLLECTION not set'); return; }

    let txs;
    try {
        txs = await fetchRecentTxs(collectionAddr);
    } catch (e) {
        console.error('PaymentWatcher: could not fetch transactions:', e.message);
        return;
    }

    // Sequential on purpose — keeps Mint index assignment race-free.
    for (const order of pending) {
        const match = txs.find(tx => decodeComment(tx) === order.comment);
        if (!match) continue;

        const paidNano = BigInt(match.in_msg?.value ?? 0);
        if (paidNano < BigInt(order.amountNano)) {
            console.warn(`Order ${order.id}: underpaid (${paidNano} < ${order.amountNano}), ignoring`);
            continue;
        }

        try {
            await prisma.mint.update({ where: { id: order.id }, data: { status: 'paid', txHash: match.hash } });

            // ── Upload metadata to Pinata ────────────────────────────────────
            const meta = {
                name: `Number ${order.number}`,
                description: 'Anonymous number NFT — minted via this app',
                image: `https://api.dicebear.com/7.x/identicon/svg?seed=${order.number}`,
                attributes: [{ trait_type: 'number', value: order.number }],
            };
            const pinned = await pinJson(meta, `number-${order.number}.json`);
            console.log(`Order ${order.id}: Pinata OK →`, pinned.gatewayUrl);
            // ── On-chain mint (admin wallet) ─────────────────────────────────
            const result = await mintNft({
                ownerAddress: order.walletAddress,
                metaUri: pinned.gatewayUrl,
            });

            await prisma.mint.update({
                where: { id: order.id },
                data: {
                    status:     'confirmed',
                    metaUri:    pinned.gatewayUrl,
                    nftIndex:   String(result.index),
                    nftAddress: result.nftAddress,
                }
            });

            console.log(`✅ Order ${order.id} → NFT #${result.index} @ ${result.nftAddress}`);
        } catch (e) {
            console.error(`Order ${order.id}: mint failed —`, e.message);
            await prisma.mint.update({ where: { id: order.id }, data: { status: 'mint_failed' } }).catch(() => {});
        }
    }
}

module.exports = { checkPayments };
