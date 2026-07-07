export const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:4000';

async function apiFetch(url, options = {}) {
    const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
    const res  = await fetch(url, { ...options, headers });
    const text = await res.text();

    let data;
    try { data = JSON.parse(text); }
    catch { data = { ok: false, error: 'bad_json', detail: text }; }

    if (!res.ok) throw new Error(data?.detail || data?.error || `HTTP ${res.status}`);
    return data;
}

export async function createOrder({ tgId, walletAddress }) {
    return apiFetch(`${API_BASE}/api/mint/order`, {
        method: 'POST',
        headers: { 'x-tg-id': String(tgId) },
        body: JSON.stringify({ walletAddress }),
    });
}


export async function getOrderStatus(orderId) {
    return apiFetch(`${API_BASE}/api/mint/order/${orderId}`);
}

export async function getMyMints(tgId) {
    return apiFetch(`${API_BASE}/api/mint/my`, { headers: { 'x-tg-id': String(tgId) } });
}

export async function checkWalletNfts(walletAddress) {
    return apiFetch(`${API_BASE}/api/nft/check/${walletAddress}`);
}
