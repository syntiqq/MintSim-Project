require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs');

const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) { console.error('TELEGRAM_BOT_TOKEN missing'); process.exit(1); }

const WEBAPP_URL = process.env.WEBAPP_URL || 'https://mintsim.uk';

const bot = new TelegramBot(token, { polling: true });

const tickets = new Map();
let ticketCounter = 0;
const adminReplyState = new Map();

let ADMIN_CHAT_ID = process.env.ADMIN_CHAT_ID ? Number(process.env.ADMIN_CHAT_ID) : null;

const adminPassword = process.env.ADMIN_PASSWORD;
if (!adminPassword) {
    console.error('ADMIN_PASSWORD env variable is not set');
    process.exit(1);
}

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


function mainKeyboard() {
    return {
        reply_markup: {
            keyboard: [
                [
                    { text: '🔢 Mint Number', web_app: { url: WEBAPP_URL } },
                    { text: '💬 Contact Support' }
                ]
            ],
            resize_keyboard: true,
            persistent: true
        }
    };
}

function supportKeyboard() {
    return {
        reply_markup: {
            keyboard: [
                [{ text: '✉️ Write to Support' }],
                [{ text: '📋 My Tickets' }, { text: 'ℹ️ FAQ' }],
                [{ text: '🔙 Back' }]
            ],
            resize_keyboard: true
        }
    };
}


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
        row.push({ text: `#${ticketId} — ${ticket.firstName}`, callback_data: `reply_${ticketId}` });
        i++;
        if (i % 2 === 0) { rows.push(row); row = []; }
    }
    if (row.length > 0) rows.push(row);
    return rows;
}

async function notifyAdmin(text, replyMarkup) {
    if (!ADMIN_CHAT_ID) { console.warn('Admin chat_id not set.'); return; }
    await bot.sendMessage(ADMIN_CHAT_ID, text, {
        parse_mode: 'Markdown',
        reply_markup: replyMarkup || undefined
    });
}

bot.onText(/\/start/, async (msg) => {
    const chatId = msg.chat.id;
    if (chatId === ADMIN_CHAT_ID) {
        await bot.sendMessage(chatId,
            `👋 *MintSim Admin Panel*`,
            { parse_mode: 'Markdown', ...adminMenu() }
        );
        return;
    }
    await bot.sendMessage(chatId,
        `👋 *Welcome to MintSim!*\n\n` +
        `Mint your anonymous TON phone number NFT or contact our support team.`,
        { parse_mode: 'Markdown', ...mainKeyboard() }
    );
});

bot.onText(/\/admin/, async (msg) => {
    const chatId = msg.chat.id;
    const password = msg.text.split(' ')[1];

    if (password !== adminPassword) {
        await bot.sendMessage(chatId, '❌ Wrong password. Usage: /admin <password>');
        return;
    }

    saveAdminId(chatId);
    await bot.sendMessage(chatId,
        `✅ *Registered as support admin.*`,
        { parse_mode: 'Markdown', ...adminMenu() }
    );
});

bot.on('message', async (msg) => {
    if (!msg.text || msg.text.startsWith('/')) return;

    const chatId    = msg.chat.id;
    const userId    = msg.from.id;
    const username  = msg.from.username ? `@${msg.from.username}` : '(no username)';
    const firstName = msg.from.first_name || 'User';
    const text      = msg.text;

    // ADMIN 
    if (chatId === ADMIN_CHAT_ID) {
        if (adminReplyState.has(chatId)) {
            const ticketId = adminReplyState.get(chatId);
            const ticket   = tickets.get(ticketId);
            if (ticket) {
                await bot.sendMessage(ticket.chatId,
                    `📬 *Reply from MintSim Support:*\n\n${text}`,
                    { parse_mode: 'Markdown', ...mainKeyboard() }
                );
                await bot.sendMessage(chatId, `✅ Reply sent to ${ticket.firstName} (Ticket #${ticketId})`, adminMenu());
                adminReplyState.delete(chatId);
            }
            return;
        }

        if (text === '📋 Open Tickets') {
            const buttons = buildTicketButtons();
            if (!buttons.length) { await bot.sendMessage(chatId, '📭 No open tickets.', adminMenu()); return; }
            await bot.sendMessage(chatId, `📋 *Open tickets (${tickets.size}):*`, {
                parse_mode: 'Markdown',
                reply_markup: { inline_keyboard: buttons }
            });
            return;
        }

        if (text === '📊 Stats') {
            await bot.sendMessage(chatId,
                `📊 *Stats*\n\nTotal tickets: ${ticketCounter}\nOpen: ${tickets.size}`,
                { parse_mode: 'Markdown', ...adminMenu() }
            );
            return;
        }
        return;
    }


    if (text === '💬 Contact Support') {
        await bot.sendMessage(chatId,
            `🛟 *Support Center*\n\nChoose an option below:`,
            { parse_mode: 'Markdown', ...supportKeyboard() }
        );
        return;
    }

    if (text === '🔙 Back') {
        await bot.sendMessage(chatId,
            `👋 *MintSim*\n\nWhat would you like to do?`,
            { parse_mode: 'Markdown', ...mainKeyboard() }
        );
        return;
    }

    if (text === 'ℹ️ FAQ') {
        await bot.sendMessage(chatId,
            `❓ *FAQ*\n\n` +
            `*How long does minting take?*\nUsually 1–3 minutes after payment.\n\n` +
            `*My NFT didn't appear after payment?*\nWait up to 5 minutes. If still missing, contact support.\n\n` +
            `*Which wallets are supported?*\nAny TON wallet — Tonkeeper, MyTonWallet, etc.\n\n` +
            `*Can I mint multiple numbers?*\nYes, each mint creates a unique number.`,
            { parse_mode: 'Markdown', ...supportKeyboard() }
        );
        return;
    }


    if (text === '📋 My Tickets') {
        const userTickets = [...tickets.values()].filter(t => t.userId === userId);
        if (!userTickets.length) {
            await bot.sendMessage(chatId, '📭 You have no open tickets.', supportKeyboard());
        } else {
            const list = userTickets.map(t => `• Ticket #${t.id}: _${t.text.slice(0, 50)}..._`).join('\n');
            await bot.sendMessage(chatId, `📋 *Your tickets:*\n\n${list}`, { parse_mode: 'Markdown', ...supportKeyboard() });
        }
        return;
    }

    if (text === '✉️ Write to Support') {
        await bot.sendMessage(chatId,
            `📝 Please describe your issue:\n\n• What problem are you experiencing?\n• Your wallet address (if relevant)\n• Transaction ID or order number\n\nType your message and send it:`,
            { parse_mode: 'Markdown' }
        );
        return;
    }

    ticketCounter++;
    const ticketId = ticketCounter;

    tickets.set(ticketId, {
        id: ticketId, userId, username, firstName, chatId, text,
        createdAt: new Date().toISOString()
    });

    await bot.sendMessage(chatId,
        `✅ *Request received.*\n\n🎫 *Ticket #${ticketId}*\n\nOur team will respond shortly. Thank you for your patience.`,
        { parse_mode: 'Markdown', ...supportKeyboard() }
    );

    const buttons = buildTicketButtons();
    await notifyAdmin(
        `🆕 *New ticket #${ticketId}*\n\n👤 ${firstName} (${username})\n🆔 \`${userId}\`\n\n📝 *Message:*\n${text}\n\n_Tap to reply:_`,
        { inline_keyboard: buttons }
    );
});

bot.on('callback_query', async (query) => {
    const adminChatId = query.message.chat.id;
    const data = query.data;
    if (!data.startsWith('reply_')) return;

    const ticketId = parseInt(data.replace('reply_', ''));
    const ticket   = tickets.get(ticketId);

    if (!ticket) { await bot.answerCallbackQuery(query.id, { text: 'Ticket not found.' }); return; }

    adminReplyState.set(adminChatId, ticketId);
    await bot.answerCallbackQuery(query.id);
    await bot.sendMessage(adminChatId,
        `✏️ *Replying to Ticket #${ticketId}*\n👤 ${ticket.firstName} (${ticket.username})\n\n📝 _${ticket.text}_\n\nType your reply:`,
        { parse_mode: 'Markdown' }
    );
});

console.log('✅ MintSim Bot started.');
<<<<<<< Updated upstream
console.log('⚠️  Send /admin <password> to register as admin.');
=======
console.log('⚠️  Send /admin <password> to register as admin.');
>>>>>>> Stashed changes
