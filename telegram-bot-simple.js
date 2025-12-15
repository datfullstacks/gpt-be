require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

if (!TELEGRAM_BOT_TOKEN) {
  console.error('❌ TELEGRAM_BOT_TOKEN not found in .env file');
  process.exit(1);
}

// Create bot instance
const bot = new TelegramBot(TELEGRAM_BOT_TOKEN, { polling: true });

console.log('🤖 Telegram Bot started successfully!');

// Command: /start - Get Chat ID
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  
  // LOG CHAT ID FOR SETUP
  console.log('\n╔════════════════════════════════════╗');
  console.log('║  📱 TELEGRAM CHAT ID DETECTED!   ║');
  console.log('╚════════════════════════════════════╝');
  console.log(`👤 User: ${msg.from.first_name} ${msg.from.last_name || ''}`);
  console.log(`📧 Username: @${msg.from.username || 'N/A'}`);
  console.log(`🆔 Chat ID: ${chatId}`);
  console.log('\n✅ Copy this to .env:');
  console.log(`   ADMIN_TELEGRAM_CHAT_ID=${chatId}\n`);
  
  const message = `
🤖 **ChatGPT Auto-Sell Bot**

✅ Bot đang hoạt động!

🆔 **Your Chat ID:** \`${chatId}\`

📝 **Hướng dẫn:**
1. Copy Chat ID trên
2. Thêm vào file .env:
   \`ADMIN_TELEGRAM_CHAT_ID=${chatId}\`
3. Restart backend server
4. Bạn sẽ nhận thông báo tự động khi có đơn hàng!

💡 Bot này chỉ dùng để nhận thông báo thanh toán tự động.
  `.trim();
  
  bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
});

// Command: /id - Quick check
bot.onText(/\/id/, (msg) => {
  const chatId = msg.chat.id;
  bot.sendMessage(chatId, `🆔 Your Chat ID: \`${chatId}\``, { parse_mode: 'Markdown' });
  console.log(`Chat ID requested: ${chatId}`);
});

// Handle polling errors
bot.on('polling_error', (error) => {
  console.error('Polling error:', error);
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Stopping Telegram bot...');
  bot.stopPolling();
  process.exit(0);
});

console.log('✅ Bot is ready!');
console.log('📱 Send /start to @gpt_ser_bot to get your Chat ID');
