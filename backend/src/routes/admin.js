const express = require('express');
const router = express.Router();

let prisma = null;
try { ({ prisma } = require('../db')); } catch {}

const { mintNft } = require('../services/mintOnChain');

// Помощник: превращает BigInt в обычные строки
const safeJson = (data) => JSON.parse(JSON.stringify(data, (key, value) =>
    typeof value === 'bigint' ? value.toString() : value
));

// Функция для красивого формата: из 99999999 делает +999 99 999 999
function formatMintNumber(rawNumber) {
    let clean = String(rawNumber).replace(/\D/g, ''); 
    if (clean.startsWith('999') && clean.length > 8) {
        clean = clean.slice(3);
    }
    if (clean.length === 8) {
        clean = `${clean.slice(0, 2)} ${clean.slice(2, 5)} ${clean.slice(5)}`;
    }
    return `+999 ${clean}`;
}

// НОВЫЙ РОУТ: Специальная мета для админских NFT (не трогает основной сайт)
router.get('/meta/:number', (req, res) => {
    const rawNumber = req.params.number;
    const formattedName = formatMintNumber(rawNumber);
    const backendUrl = process.env.BACKEND_PUBLIC_URL || 'https://api.mintsim.uk';
    
    res.json({
        name: formattedName, // Имя с пробелами и +999
        description: 'Anonymous number NFT',
        // Прямая ссылка на твой рабочий генератор картинок!
        image: `${backendUrl}/api/mint/card/${rawNumber}.png`, 
        attributes: [{ trait_type: 'number', value: formattedName }]
    });
});

function checkAdmin(req, res, next) {
    const secret = req.headers['x-admin-secret'];
    if (!secret || secret !== process.env.ADMIN_SECRET) {
        return res.status(403).json({ ok: false, error: 'forbidden', detail: 'Неверный пароль' });
    }
    next();
}

// 1. Статистика
router.get('/stats', checkAdmin, async (req, res) => {
    try {
        const totalMints = await prisma.mint.count();
        const confirmedMints = await prisma.mint.count({ where: { status: 'confirmed' } });
        const totalUsers = await prisma.mint.groupBy({ by: ['walletAddress'] });
        
        const allWithdrawals = await prisma.withdrawal.findMany({ where: { status: 'sent' } });
        const totalPaidNano = allWithdrawals.reduce((sum, w) => sum + BigInt(w.amountNano), 0n);

        res.json({
            ok: true,
            stats: {
                "Всего попыток (включая неоплаченные)": totalMints,
                "УСПЕШНО СМИЧЕННЫХ НОМЕРОВ": confirmedMints,
                "Уникальных кошельков-покупателей": totalUsers.length,
                "Выплачено по рефералке (TON)": Number(totalPaidNano) / 1e9
            }
        });
    } catch (e) {
        res.status(500).json({ ok: false, error: e.message });
    }
});

// 2. Минт (теперь использует админскую мету)
router.post('/custom-mint', checkAdmin, async (req, res) => {
    try {
        const { walletAddress, number } = req.body;
        if (!walletAddress || !number) {
            return res.status(400).json({ ok: false, error: 'Нужен кошелек и номер' });
        }

        console.log(`[ADMIN MINT] Запуск минта для номера ${number}`);

        const backendUrl = process.env.BACKEND_PUBLIC_URL || 'https://api.mintsim.uk';
        // ВАЖНО: Теперь админка берет мету из СВОЕГО роута, а не с основного сайта
        const metaUri = `${backendUrl}/api/admin/meta/${number}`;

        const blockchainResult = await mintNft({ 
            ownerAddress: walletAddress, 
            metaUri: metaUri 
        });

        console.log('[ADMIN MINT] Блокчейн подтвердил минт:', safeJson(blockchainResult));

        const rec = await prisma.mint.create({
            data: {
                tgId: 'admin',
                walletAddress,
                number: String(number),
                comment: 'admin-mint-' + Date.now(),
                amountNano: '0', 
                status: 'confirmed',
                nftIndex: blockchainResult.index !== undefined ? String(blockchainResult.index) : null,
                nftAddress: blockchainResult.nftAddress || null
            }
        });

        res.json({ 
            ok: true, 
            message: `✅ Номер ${number} успешно отправлен в блокчейн!`, 
            blockchain: safeJson(blockchainResult),
            record: rec 
        });

    } catch (e) {
        console.error('[ADMIN MINT] ОШИБКА:', e.message);
        res.status(500).json({ ok: false, error: 'blockchain_error', detail: e.message });
    }
});

module.exports = router;