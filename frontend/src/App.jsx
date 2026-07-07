import {
    TonConnectUIProvider,
    TonConnectButton,
    useTonWallet,
    useTonConnectUI
} from '@tonconnect/ui-react';

import { beginCell } from '@ton/core';
import { useState, useRef } from 'react';
import { createOrder, getOrderStatus } from './api.js';

const MANIFEST_URL = import.meta.env.VITE_MANIFEST_URL ||
    'https://mintsim.uk/manifest-v2.json';

const PRICE_LABEL = `${import.meta.env.VITE_MINT_PRICE_TON || 5} Gram (TON)`;


function buildCommentPayload(comment) {
    return beginCell()
        .storeUint(0, 32)            // text-comment opcode
        .storeStringTail(comment)
        .endCell()
        .toBoc()
        .toString('base64');
}

function InnerApp() {
    const wallet         = useTonWallet();
    const [tonConnectUI] = useTonConnectUI();
    const [status, setStatus]   = useState('');
    const [loading, setLoading] = useState(false);
    const [result, setResult]   = useState(null);
    const pollRef = useRef(null);

    function stopPolling() {
        if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    }

    async function mint() {
        if (!wallet) { alert('connect the wallet'); return; }
        setLoading(true);
        setStatus('creating an order...');
        setResult(null);

        try {
            const tgId = window.Telegram?.WebApp?.initDataUnsafe?.user?.id || 'dev-user';
            const order = await createOrder({ tgId, walletAddress: wallet.account.address });

            setStatus(`confirm the payment ${order.amountTon} Gram (TON) in wallet…`);
            const payload = buildCommentPayload(order.comment);

            await tonConnectUI.sendTransaction({
                validUntil: Math.floor(Date.now() / 1000) + 600,
                messages: [{
                    address: order.collectionAddress,
                    amount:  order.amountNano,
                    payload,
                }]
            });

            setStatus('The payment has been sent. We are waiting for the confirmation of the network and mint…');

            pollRef.current = setInterval(async () => {
                try {
                    const { order: o } = await getOrderStatus(order.orderId);

                    if (o.status === 'paid') {
                        setStatus('The payment was found. Mint the NFT…');
                    } else if (o.status === 'confirmed') {
                        stopPolling();
                        setLoading(false);
                        setStatus('✅ Done!');
                        setResult(o);
                    } else if (o.status === 'mint_failed') {
                        stopPolling();
                        setLoading(false);
                        setStatus('❌ The mint failed. Write to support — the payment is saved in the order..');
                    }
                } catch (e) {
                    console.error('poll error:', e);
                }
            }, 4000);

        } catch (e) {
            console.error('MINT ERROR:', e);
            setStatus('❌ ' + (e.message || 'unknown error'));
            setLoading(false);
        }
    }

    return (
        <div style={{ padding: 20, fontFamily: 'sans-serif', maxWidth: 480, margin: '0 auto' }}>
            <h1 style={{ fontSize: 24 }}>Mint your NFT number</h1>
            <p style={{ color: '#666' }}>Mint Price: {PRICE_LABEL}</p>

            <TonConnectButton />
            <br />

            <button
                onClick={mint}
                disabled={loading || !wallet}
                style={{
                    marginTop: 16, padding: '12px 24px', fontSize: 16,
                    background: wallet ? '#0088cc' : '#ccc', color: '#fff',
                    border: 'none', borderRadius: 8,
                    cursor: wallet && !loading ? 'pointer' : 'not-allowed',
                }}
            >
                {loading ? 'processing…' : `Mint NFT (${PRICE_LABEL})`}
            </button>

            {status && <p style={{ marginTop: 16, whiteSpace: 'pre-wrap' }}>{status}</p>}

            {result && (
                <div style={{ marginTop: 16, padding: 12, border: '1px solid #ddd', borderRadius: 8 }}>
                    <strong>Number: {result.number}</strong>
                    <div>NFT address: {result.nftAddress}</div>
                    <a
                        href={`https://getgems.io/nft/${result.nftAddress}`}
                        target="_blank" rel="noreferrer"
                    >
                        Open in Getgems.io →
                    </a>
                </div>
            )}
        </div>
    );
}

export default function App() {
    return (
        <TonConnectUIProvider manifestUrl={MANIFEST_URL}>
            <InnerApp />
        </TonConnectUIProvider>
    );
}
