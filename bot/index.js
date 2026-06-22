require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');

const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) { console.error('TELEGRAM_BOT_TOKEN missing'); process.exit(1); }
const webapp = process.env.WEBAPP_URL || 'http://localhost:5173';

const bot = new TelegramBot(token, { polling: true });

bot.onText(/^\/start$/, (msg) => {
  const chatId = msg.chat.id;
  bot.sendMessage(chatId, 'Open Mint App:', {
    reply_markup: {
      inline_keyboard: [[{ text: 'Open Mint App', web_app: { url: webapp } }]]
    }
  });
});

console.log('Bot started. Send /start');
