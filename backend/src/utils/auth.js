const crypto = require('crypto');

function checkTelegramAuth(initData, botToken) {
    const params = new URLSearchParams(initData);
    const hash = params.get('hash');
    params.delete('hash');
    const dataCheckArr = [...params.entries()].map(([k, v]) => `${k}=${v}`).sort();
    const dataCheckString = dataCheckArr.join('\n');
    const secretKey = crypto.createHash('sha256').update(botToken).digest();
    const hmac = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');
    return hmac === hash;
}

function signToken(tgId, botToken) {
    const sig = crypto.createHmac('sha256', botToken).update(tgId).digest('hex');
    return `${sig}.${tgId}`;
}

function verifyToken(token, botToken) {
    if (!token) return null;
    const [sig, tgId] = token.split('.');
    if (!sig || !tgId) return null;
    const expected = crypto.createHmac('sha256', botToken).update(tgId).digest('hex');
    if (sig !== expected) return null;
    return tgId;
}

module.exports = { checkTelegramAuth, signToken, verifyToken };