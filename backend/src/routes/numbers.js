const express = require('express');
const router = express.Router();
const { prisma } = require('../db');

router.get('/:wallet', async (req, res) => {
  try {
    const { wallet } = req.params;
    const orders = await prisma.order.findMany({
      where: { walletAddress: wallet, status: 'confirmed' },
      select: { number: true }
    });
    res.json({ ok: true, numbers: orders });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: 'failed to fetch numbers' });
  }
});

module.exports = router;