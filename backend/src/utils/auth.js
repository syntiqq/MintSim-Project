const crypto = require('crypto');

const INIT_DATA_MAX_AGE = 24 * 3600;
const TOKEN_TTL = 7 * 24 * 3600;

function safeEq(a, b) {
    const x = Buffer.from(String(a)), y = Buffer.from(String(b));
    return x.length === y.length && crypto.timingSafeEqual(x, y);
}

function checkTelegramAuth(initData, botToken) {
    const params = new URLSearchParams(initData);
    const hash = params.get('hash');
    if (!hash) return false;
    params.delete('hash');

    const dataCheckString = [...params.entries()]
        .map(([k, v]) => `${k}=${v}`).sort().join('\n');
    const secretKey = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
    const hmac = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');
    if (!safeEq(hmac, hash)) return false;

    const authDate = Number(params.get('auth_date'));
    if (!authDate || Date.now() / 1000 - authDate > INIT_DATA_MAX_AGE) return false;
    return true;
}

const tokenSecret = (botToken) => process.env.TOKEN_SECRET || botToken;

function signToken(tgId, botToken) {
    const exp = Math.floor(Date.now() / 1000) + TOKEN_TTL;
    const body = `${tgId}.${exp}`;
    const sig = crypto.createHmac('sha256', tokenSecret(botToken)).update(body).digest('hex');
    return `${body}.${sig}`;
}

function verifyToken(token, botToken) {
    const [tgId, exp, sig] = String(token || '').split('.');
    if (!tgId || !exp || !sig || Number(exp) < Date.now() / 1000) return null;
    const expected = crypto.createHmac('sha256', tokenSecret(botToken)).update(`${tgId}.${exp}`).digest('hex');
    return safeEq(sig, expected) ? tgId : null;
}

module.exports = { checkTelegramAuth, signToken, verifyToken };