/**
 * Account Import Bot
 * Bot Telegram để import accounts vào MongoDB
 * Format: email, password, 2fa (mỗi dòng 1 field, không có dòng trống giữa các accounts)
 * 
 * Ví dụ:
 * emailexample@gmail.com
 * thisispas
 * thisis2fa
 * emailexample1@gmail.com
 * thisispas1
 * thisis2fa1
 */

require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const { MongoClient } = require('mongodb');

// Config
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN2;
const MONGODB_URI = process.env.MONGODB_URI;
const DB_NAME = process.env.DB_NAME || 'gpt-reg-account';
const COLLECTION_NAME = process.env.COLLECTION_NAME || 'accounts';

// Validate config
if (!BOT_TOKEN) {
    console.error('❌ TELEGRAM_BOT_TOKEN2 is not set in .env');
    process.exit(1);
}

if (!MONGODB_URI) {
    console.error('❌ MONGODB_URI is not set in .env');
    process.exit(1);
}

// Initialize bot
const bot = new TelegramBot(BOT_TOKEN, { polling: true });

// MongoDB connection
let db = null;
let accountsCollection = null;

async function connectDB() {
    try {
        const client = new MongoClient(MONGODB_URI);
        await client.connect();
        db = client.db(DB_NAME);
        accountsCollection = db.collection(COLLECTION_NAME);
        console.log('✅ Connected to MongoDB');
        console.log(`📦 Database: ${DB_NAME}`);
        console.log(`📋 Collection: ${COLLECTION_NAME}`);
        return true;
    } catch (error) {
        console.error('❌ MongoDB connection error:', error.message);
        return false;
    }
}

// Parse accounts from message
function parseAccounts(text) {
    const lines = text.split('\n').map(line => line.trim()).filter(line => line.length > 0);
    const accounts = [];
    
    // Mỗi account có 3 dòng: email, password, 2fa
    for (let i = 0; i < lines.length; i += 3) {
        if (i + 2 < lines.length) {
            const email = lines[i];
            const password = lines[i + 1];
            const secret_key_2fa = lines[i + 2];
            
            // Validate email format
            if (email.includes('@')) {
                accounts.push({
                    email,
                    password,
                    secret_key_2fa,
                    status: 'available',
                    sold_status: 'available',
                    plan_type: 'unknown',
                    imported_at: new Date(),
                    source: 'telegram_import'
                });
            }
        }
    }
    
    return accounts;
}

// Start command
bot.onText(/\/start/, async (msg) => {
    const chatId = msg.chat.id;
    const username = msg.from.username || msg.from.first_name || 'User';
    
    const welcomeMessage = `
🤖 **Account Import Bot**

Xin chào ${username}!

Bot này giúp bạn import accounts ChatGPT vào database.

📝 **Cách sử dụng:**
Gửi danh sách accounts theo format:
\`\`\`
email1@gmail.com
password1
2fakey1
email2@gmail.com
password2
2fakey2
\`\`\`

⚠️ **Lưu ý:**
- Mỗi account gồm 3 dòng liên tiếp
- Không có dòng trống giữa các accounts
- Email phải chứa @

📋 **Commands:**
/start - Hiển thị hướng dẫn
/stats - Xem thống kê accounts
/list - Xem 10 accounts gần nhất
/search <email> - Tìm account theo email
    `;
    
    await bot.sendMessage(chatId, welcomeMessage, { parse_mode: 'Markdown' });
});

// Stats command
bot.onText(/\/stats/, async (msg) => {
    const chatId = msg.chat.id;
    
    try {
        const total = await accountsCollection.countDocuments();
        const available = await accountsCollection.countDocuments({ sold_status: 'available' });
        const sold = await accountsCollection.countDocuments({ sold_status: 'sold' });
        const imported = await accountsCollection.countDocuments({ source: 'telegram_import' });
        
        const statsMessage = `
📊 **Thống kê Accounts**

📦 Tổng số: ${total}
✅ Còn trống: ${available}
💰 Đã bán: ${sold}
📥 Import từ bot: ${imported}
        `;
        
        await bot.sendMessage(chatId, statsMessage, { parse_mode: 'Markdown' });
    } catch (error) {
        await bot.sendMessage(chatId, `❌ Lỗi: ${error.message}`);
    }
});

// List command
bot.onText(/\/list/, async (msg) => {
    const chatId = msg.chat.id;
    
    try {
        const accounts = await accountsCollection
            .find({})
            .sort({ imported_at: -1, created_at: -1 })
            .limit(10)
            .toArray();
        
        if (accounts.length === 0) {
            await bot.sendMessage(chatId, '📭 Chưa có account nào trong database.');
            return;
        }
        
        let listMessage = '📋 **10 Accounts gần nhất:**\n\n';
        
        accounts.forEach((acc, index) => {
            const status = acc.sold_status === 'sold' ? '💰 Sold' : '✅ Available';
            listMessage += `${index + 1}. \`${acc.email}\`\n   ${status} | ${acc.plan_type || 'unknown'}\n\n`;
        });
        
        await bot.sendMessage(chatId, listMessage, { parse_mode: 'Markdown' });
    } catch (error) {
        await bot.sendMessage(chatId, `❌ Lỗi: ${error.message}`);
    }
});

// Search command
bot.onText(/\/search (.+)/, async (msg, match) => {
    const chatId = msg.chat.id;
    const searchTerm = match[1].trim();
    
    try {
        const accounts = await accountsCollection
            .find({ email: { $regex: searchTerm, $options: 'i' } })
            .limit(5)
            .toArray();
        
        if (accounts.length === 0) {
            await bot.sendMessage(chatId, `🔍 Không tìm thấy account với email chứa "${searchTerm}"`);
            return;
        }
        
        let resultMessage = `🔍 **Kết quả tìm kiếm "${searchTerm}":**\n\n`;
        
        accounts.forEach((acc, index) => {
            const status = acc.sold_status === 'sold' ? '💰 Sold' : '✅ Available';
            resultMessage += `${index + 1}. **Email:** \`${acc.email}\`\n`;
            resultMessage += `   **Password:** \`${acc.password}\`\n`;
            resultMessage += `   **2FA:** \`${acc.secret_key_2fa}\`\n`;
            resultMessage += `   **Status:** ${status}\n`;
            resultMessage += `   **Plan:** ${acc.plan_type || 'unknown'}\n\n`;
        });
        
        await bot.sendMessage(chatId, resultMessage, { parse_mode: 'Markdown' });
    } catch (error) {
        await bot.sendMessage(chatId, `❌ Lỗi: ${error.message}`);
    }
});

// Handle text messages (import accounts)
bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text;
    
    // Skip commands
    if (!text || text.startsWith('/')) return;
    
    // Check if message contains email format
    if (!text.includes('@')) {
        return; // Ignore non-account messages
    }
    
    try {
        await bot.sendMessage(chatId, '⏳ Đang xử lý...');
        
        const accounts = parseAccounts(text);
        
        if (accounts.length === 0) {
            await bot.sendMessage(chatId, `
❌ **Không tìm thấy accounts hợp lệ!**

📝 Format đúng:
\`\`\`
email@gmail.com
password
2fakey
\`\`\`

Mỗi account gồm 3 dòng liên tiếp, không có dòng trống.
            `, { parse_mode: 'Markdown' });
            return;
        }
        
        // Check for duplicates
        const emails = accounts.map(a => a.email);
        const existing = await accountsCollection.find({ email: { $in: emails } }).toArray();
        const existingEmails = existing.map(a => a.email);
        
        // Filter out duplicates
        const newAccounts = accounts.filter(a => !existingEmails.includes(a.email));
        const duplicateCount = accounts.length - newAccounts.length;
        
        if (newAccounts.length === 0) {
            await bot.sendMessage(chatId, `
⚠️ **Tất cả ${duplicateCount} accounts đã tồn tại trong database!**

Không có account mới nào được thêm.
            `, { parse_mode: 'Markdown' });
            return;
        }
        
        // Insert new accounts
        const result = await accountsCollection.insertMany(newAccounts);
        
        let successMessage = `
✅ **Import thành công!**

📥 Đã thêm: ${result.insertedCount} accounts
${duplicateCount > 0 ? `⚠️ Bỏ qua (trùng): ${duplicateCount} accounts` : ''}

📋 **Danh sách đã thêm:**
`;
        
        newAccounts.forEach((acc, index) => {
            successMessage += `${index + 1}. \`${acc.email}\`\n`;
        });
        
        await bot.sendMessage(chatId, successMessage, { parse_mode: 'Markdown' });
        
        console.log(`[IMPORT] User ${msg.from.username || msg.from.id} imported ${result.insertedCount} accounts`);
        
    } catch (error) {
        console.error('[IMPORT] Error:', error);
        await bot.sendMessage(chatId, `❌ Lỗi import: ${error.message}`);
    }
});

// Error handling
bot.on('polling_error', (error) => {
    console.error('Polling error:', error.message);
});

// Start bot
async function start() {
    console.log('🚀 Starting Account Import Bot...');
    console.log('🤖 Bot Token:', BOT_TOKEN.substring(0, 10) + '...');
    
    const dbConnected = await connectDB();
    if (!dbConnected) {
        console.error('❌ Failed to connect to database. Exiting...');
        process.exit(1);
    }
    
    console.log('✅ Account Import Bot is running!');
    console.log('📱 Send /start to the bot to begin');
}

start();
