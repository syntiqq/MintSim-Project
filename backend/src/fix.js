const path = require('path');

require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function fix() {
    console.log("base...");
    const result = await prisma.withdrawal.updateMany({
        where: { status: 'sent' }, 
        data: { status: 'failed' }
    });
    
    console.log(`nice, counting: ${result.count}`);
}

fix().finally(() => prisma.$disconnect());