require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
 
const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) { console.error('TELEGRAM_BOT_TOKEN missing'); process.exit(1); }
 
// Твой Telegram username или chat_id куда приходят уведомления
const SUPPORT_ADMIN = process.env.SUPPORT_ADMIN_USERNAME || 'wakkavakka';
 
const bot = new TelegramBot(token, { polling: true });
 
// Хранилище обращений { ticketId: { userId, username, firstName, messages: [] } }
const tickets = new Map();
let ticketCounter = 0;
 
// Ожидание ответа от админа на конкретный тикет
// { adminChatId: ticketId }
const adminReplyState = new Map();
 
// ── /start ──────────────────────────────────────────────────────────────────
bot.onText(/\/start/, async (msg) => {
    const chatId = msg.chat.id;
    await bot.sendMessage(chatId,
        `👋 *Welcome to MintSim Support*\n\n` +
        `If you're experiencing any issues or have questions regarding your NFT number, minting process, or anything else — we're here to help.\n\n` +
        `Please describe your issue in detail and our team will get back to you as soon as possible.\n\n` +
        `_Response time: usually within 24 hours._`,
        { parse_mode: 'Markdown' }
    );
});
 
// ── Любое сообщение от пользователя (не команда) ────────────────────────────
bot.on('message', async (msg) => {
    if (!msg.text || msg.text.startsWith('/')) return;
 
    const userId   = msg.from.id;
    const username = msg.from.username ? `@${msg.from.username}` : '(no username)';
    const firstName = msg.from.first_name || 'User';
    const chatId   = msg.chat.id;
 
    // Проверяем — это ответ от АДМИНА через бота
    if (adminReplyState.has(chatId)) {
        const ticketId = adminReplyState.get(chatId);
        const ticket   = tickets.get(ticketId);
        if (ticket) {
            // Отправляем ответ пользователю
            await bot.sendMessage(ticket.userId,
                `📬 *Reply from MintSim Support:*\n\n${msg.text}`,
                { parse_mode: 'Markdown' }
            );
            await bot.sendMessage(chatId, `✅ Reply sent to ${ticket.firstName} (Ticket #${ticketId})`);
            adminReplyState.delete(chatId);
        }
        return;
    }
 
    // Это новое обращение от пользователя
    ticketCounter++;
    const ticketId = ticketCounter;
 
    tickets.set(ticketId, {
        userId,
        username,
        firstName,
        chatId,
        text: msg.text,
        createdAt: new Date().toISOString()
    });
 
    // Подтверждение пользователю
    await bot.sendMessage(chatId,
        `✅ *Your request has been received.*\n\n` +
        `*Ticket #${ticketId}*\n\n` +
        `Our support team will review your message and respond shortly. Thank you for your patience.`,
        { parse_mode: 'Markdown' }
    );
 
    // Уведомление админу — строим список всех открытых тикетов как кнопки
    const buttons = buildTicketButtons();
 
    try {
        await bot.sendMessage(`@${SUPPORT_ADMIN}`,
            `🆕 *New support ticket #${ticketId}*\n\n` +
            `👤 ${firstName} (${username})\n` +
            `🆔 User ID: \`${userId}\`\n\n` +
            `📝 *Message:*\n${msg.text}`,
            {
                parse_mode: 'Markdown',
                reply_markup: { inline_keyboard: buttons }
            }
        );
    } catch (e) {
        console.error('Could not notify admin:', e.message);
    }
});
 
// ── Обработка нажатия кнопки тикета админом ─────────────────────────────────
bot.on('callback_query', async (query) => {
    const adminChatId = query.message.chat.id;
    const data = query.data;
 
    if (data.startsWith('reply_')) {
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
            `Type your reply below and send it:`,
            { parse_mode: 'Markdown' }
        );
    }
 
    if (data === 'list_tickets') {
        const buttons = buildTicketButtons();
        if (buttons.length === 0) {
            await bot.answerCallbackQuery(query.id, { text: 'No open tickets.' });
            return;
        }
        await bot.answerCallbackQuery(query.id);
        await bot.sendMessage(adminChatId,
            `📋 *Open tickets:*`,
            {
                parse_mode: 'Markdown',
                reply_markup: { inline_keyboard: buttons }
            }
        );
    }
});
 
// ── /tickets — показать список всех открытых обращений ──────────────────────
bot.onText(/\/tickets/, async (msg) => {
    const chatId = msg.chat.id;
    const buttons = buildTicketButtons();
 
    if (buttons.length === 0) {
        await bot.sendMessage(chatId, '📭 No open tickets at the moment.');
        return;
    }
 
    await bot.sendMessage(chatId, `📋 *Open tickets (${tickets.size}):*`,
        {
            parse_mode: 'Markdown',
            reply_markup: { inline_keyboard: buttons }
        }
    );
});
 
// ── Построить кнопки из активных тикетов ────────────────────────────────────
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
 
console.log(`✅ MintSim Support Bot started. Admin: @${SUPPORT_ADMIN}`);