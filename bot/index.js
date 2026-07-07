require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs');

const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) { console.error('TELEGRAM_BOT_TOKEN missing'); process.exit(1); }

const bot = new TelegramBot(token, { polling: true });


const tickets = new Map();
let ticketCounter = 0;
const adminReplyState = new Map(); // adminChatId -> ticketId

//admin
let ADMIN_CHAT_ID = process.env.ADMIN_CHAT_ID ? Number(process.env.ADMIN_CHAT_ID) : null;

function saveAdminId(chatId) {
    ADMIN_CHAT_ID = chatId;
    console.log(`✅ Admin chat_id saved: ${chatId}`);
    try {
        let env = fs.existsSync('.env') ? fs.readFileSync('.env', 'utf8') : '';
        if (env.includes('ADMIN_CHAT_ID=')) {
            env = env.replace(/ADMIN_CHAT_ID=.*/g, `ADMIN_CHAT_ID=${chatId}`);
        } else {
            env += `\nADMIN_CHAT_ID=${chatId}`;
        }
        fs.writeFileSync('.env', env);
    } catch (e) {
        console.warn('Could not save to .env:', e.message);
    }
}

function userMenu() {
    return {
        reply_markup: {
            keyboard: [
                [{ text: '✉️ Contact Support' }],
                [{ text: '📋 My Tickets' }, { text: 'ℹ️ FAQ' }]
            ],
            resize_keyboard: true
        }
    };
}

// admin menu
function adminMenu() {
    return {
        reply_markup: {
            keyboard: [
                [{ text: '📋 Open Tickets' }],
                [{ text: '✅ Close Ticket' }, { text: '📊 Stats' }]
            ],
            resize_keyboard: true
        }
    };
}

function buildTicketButtons() {
    const rows = [];
    let row = [];
    let i = 0;
    for (const [ticketId, ticket] of tickets) {
        row.push({
            text: `#${ticketId} — ${ticket.firstName}`,
            callback_data: `reply_${ticketId}`
        });
        i++;
        if (i % 2 === 0) { rows.push(row); row = []; }
    }
    if (row.length > 0) rows.push(row);
    return rows;
}

async function notifyAdmin(text, replyMarkup) {
    if (!ADMIN_CHAT_ID) {
        console.warn('Admin chat_id not set. Send /admin to the bot first.');
        return;
    }
    await bot.sendMessage(ADMIN_CHAT_ID, text, {
        parse_mode: 'Markdown',
        reply_markup: replyMarkup || undefined
    });
}

// start
bot.onText(/\/start/, async (msg) => {
    const chatId = msg.chat.id;
    if (chatId === ADMIN_CHAT_ID) {
        await bot.sendMessage(chatId,
            `👋 *MintSim Support Panel*\n\nYou are logged in as support admin.`,
            { parse_mode: 'Markdown', ...adminMenu() }
        );
        return;
    }
    await bot.sendMessage(chatId,
        `👋 *Welcome to MintSim Support*\n\n` +
        `Having trouble with your NFT number, minting process, wallet connection, or anything else?\n\n` +
        `Our support team is here to help. Use the menu below to contact us.\n\n` +
        `_Typical response time: within 24 hours._`,
        { parse_mode: 'Markdown', ...userMenu() }
    );
});

// /admin 
bot.onText(/\/admin/, async (msg) => {
    const chatId = msg.chat.id;
    const password = msg.text.split(' ')[1];
    const adminPassword = process.env.ADMIN_PASSWORD;

    if (!adminPassword) {Ы
        console.error('ADMIN_PASSWORD env variable is not set');
        process.exit(1);
    }
    if (password !== adminPassword) {
    await bot.sendMessage(chatId, '❌ Wrong password. Usage: /admin <password>');
    return;
    }

    saveAdminId(chatId);
    await bot.sendMessage(chatId,
        `✅ *You are now registered as support admin.*\n\nYou will receive notifications when users send support requests.`,
        { parse_mode: 'Markdown', ...adminMenu() }
    );
});

// text message
bot.on('message', async (msg) => {
    if (!msg.text || msg.text.startsWith('/')) return;

    const chatId    = msg.chat.id;
    const userId    = msg.from.id;
    const username  = msg.from.username ? `@${msg.from.username}` : '(no username)';
    const firstName = msg.from.first_name || 'User';
    const text      = msg.text;

    // ADMIN reply
    if (chatId === ADMIN_CHAT_ID) {
        if (adminReplyState.has(chatId)) {
            const ticketId = adminReplyState.get(chatId);
            const ticket   = tickets.get(ticketId);
            if (ticket) {
                await bot.sendMessage(ticket.chatId,
                    `📬 *Reply from MintSim Support:*\n\n${text}`,
                    { parse_mode: 'Markdown', ...userMenu() }
                );
                await bot.sendMessage(chatId,
                    `✅ Reply sent to ${ticket.firstName} (Ticket #${ticketId})`,
                    adminMenu()
                );
                adminReplyState.delete(chatId);
            }
            return;
        }

        // buttton admin
        if (text === '📋 Open Tickets') {
            const buttons = buildTicketButtons();
            if (buttons.length === 0) {
                await bot.sendMessage(chatId, '📭 No open tickets at the moment.', adminMenu());
                return;
            }
            await bot.sendMessage(chatId, `📋 *Open tickets (${tickets.size}):*\nSelect one to reply:`, {
                parse_mode: 'Markdown',
                reply_markup: { inline_keyboard: buttons }
            });
            return;
        }

        if (text === '📊 Stats') {
            await bot.sendMessage(chatId,
                `📊 *Support Stats*\n\nTotal tickets: ${ticketCounter}\nOpen tickets: ${tickets.size}`,
                { parse_mode: 'Markdown', ...adminMenu() }
            );
            return;
        }

        return;
    }

    // USER buttons
    if (text === '✉️ Contact Support') {
        await bot.sendMessage(chatId,
            `📝 Please describe your issue in detail:\n\n` +
            `• What problem are you experiencing?\n` +
            `• Your wallet address (if relevant)\n` +
            `• Transaction ID or order number (if available)\n\n` +
            `Type your message and send it:`,
            { parse_mode: 'Markdown' }
        );
        return;
    }

    if (text === '📋 My Tickets') {
        const userTickets = [...tickets.values()].filter(t => t.userId === userId);
        if (userTickets.length === 0) {
            await bot.sendMessage(chatId, '📭 You have no open tickets.', userMenu());
        } else {
            const list = userTickets.map(t => `• Ticket #${t.id}: _${t.text.slice(0, 50)}..._`).join('\n');
            await bot.sendMessage(chatId, `📋 *Your tickets:*\n\n${list}`, { parse_mode: 'Markdown', ...userMenu() });
        }
        return;
    }

    if (text === 'ℹ️ FAQ') {
        await bot.sendMessage(chatId,
            `❓ *Frequently Asked Questions*\n\n` +
            `*Q: How long does minting take?*\n` +
            `A: Usually 1-3 minutes after payment confirmation.\n\n` +
            `*Q: My NFT didn't appear after payment?*\n` +
            `A: Wait up to 5 minutes. If still missing, contact support.\n\n` +
            `*Q: Which wallets are supported?*\n` +
            `A: Any TON-compatible wallet (Tonkeeper, MyTonWallet, etc.)\n\n` +
            `*Q: Can I mint multiple numbers?*\n` +
            `A: Yes, each mint creates a unique number.`,
            { parse_mode: 'Markdown', ...userMenu() }
        );
        return;
    }

    ticketCounter++;
    const ticketId = ticketCounter;

    tickets.set(ticketId, {
        id: ticketId,
        userId,
        username,
        firstName,
        chatId,
        text,
        createdAt: new Date().toISOString()
    });

    await bot.sendMessage(chatId,
        `✅ *Your request has been received.*\n\n` +
        `🎫 *Ticket #${ticketId}*\n\n` +
        `Our support team will review your message and respond as soon as possible.\n\n` +
        `_Thank you for your patience._`,
        { parse_mode: 'Markdown', ...userMenu() }
    );

    const buttons = buildTicketButtons();
    await notifyAdmin(
        `🆕 *New support ticket #${ticketId}*\n\n` +
        `👤 ${firstName} (${username})\n` +
        `🆔 User ID: \`${userId}\`\n\n` +
        `📝 *Message:*\n${text}\n\n` +
        `_Tap a ticket below to reply:_`,
        { inline_keyboard: buttons }
    );
});

bot.on('callback_query', async (query) => {
    const adminChatId = query.message.chat.id;
    const data = query.data;

    if (!data.startsWith('reply_')) return;

    const ticketId = parseInt(data.replace('reply_', ''));
    const ticket   = tickets.get(ticketId);

    if (!ticket) {
        await bot.answerCallbackQuery(query.id, { text: 'Ticket not found or already closed.' });
        return;
    }

    adminReplyState.set(adminChatId, ticketId);
    await bot.answerCallbackQuery(query.id);
    await bot.sendMessage(adminChatId,
        `✏️ *Replying to Ticket #${ticketId}*\n` +
        `👤 ${ticket.firstName} (${ticket.username})\n\n` +
        `📝 Their message:\n_${ticket.text}_\n\n` +
        `Type your reply and send it:`,
        { parse_mode: 'Markdown' }
    );
});

console.log('✅ MintSim Support Bot started.');
console.log('⚠️  Send /admin <password> to the bot to register as admin.');

