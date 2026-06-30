const express = require('express');
const router = express.Router();
const { checkTelegramAuth, signToken } = require('../utils/auth');

let prisma = null;
try { ({ prisma } = require('../db')); } catch {}

router.post('/telegram', async (req, res) => {
    try {
        const { initData, ref } = req.body || {};
        const botToken = process.env.TELEGRAM_BOT_TOKEN;

        if (!botToken) {
            return res.status(500).json({ ok: false, error: 'config', detail: 'TELEGRAM_BOT_TOKEN not set' });
        }
        if (!initData) {
            return res.status(400).json({ ok: false, error: 'bad_request', detail: 'initData required' });
        }

        const valid = checkTelegramAuth(initData, botToken);
        if (!valid) {
            return res.status(401).json({ ok: false, error: 'unauthorized', detail: 'invalid initData' });
        }

        const params = new URLSearchParams(initData);
        const userJson = params.get('user');
        const user = userJson ? JSON.parse(userJson) : null;
        if (!user?.id) {
            return res.status(400).json({ ok: false, error: 'bad_request', detail: 'no user in initData' });
        }

        const tgId = String(user.id);

        if (prisma?.user?.findUnique) {
            const existing = await prisma.user.findUnique({ where: { tgId } });
            if (!existing) {
                let referredBy = null;
                if (ref && String(ref) !== tgId) {
                    const refUser = await prisma.user.findUnique({ where: { tgId: String(ref) } });
                    if (refUser) referredBy = String(ref);
                }
                await prisma.user.create({ data: { tgId, referredBy } });
            }
        }

        const token = signToken(tgId, botToken);
        res.json({ ok: true, token, user: { id: tgId, firstName: user.first_name } });
    } catch (e) {
        console.error('auth error:', e);
        res.status(500).json({ ok: false, error: 'internal' });
    }
});

module.exports = router;