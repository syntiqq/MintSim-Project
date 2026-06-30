const { pinJson }   = require('../src/utils/pinata');
const { mintNft }   = require('../src/services/mintOnChain');
const { formatPhoneNumber } = require('../src/utils/formatNumber');
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
        return msg.message || null;
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
console.log('PaymentWatcher: transactions received —', txs.length);
if (txs.length > 0) {
    console.log('PaymentWatcher: example in_msg —', JSON.stringify(txs[0].in_msg));
}

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

         
            const formatted = `+999 ${formatPhoneNumber(order.number)}`;
            const meta = {
                name: formatted,
                description: 'Anonymous number NFT — minted via this app',
                image: `${process.env.BACKEND_PUBLIC_URL}/api/mint/card/${order.number}.png`,
                attributes: [{ trait_type: 'number', value: formatted }],
            };
            const pinned = await pinJson(meta, `number-${order.number}.json`);
            console.log(`Order ${order.id}: Pinata OK →`, pinned.gatewayUrl);
            
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
    if (e.response?.data) {
        console.error('  → response data:', JSON.stringify(e.response.data));
    }
    await prisma.mint.update({ where: { id: order.id }, data: { status: 'mint_failed' } }).catch(() => {});
}
    }
}

module.exports = { checkPayments };
