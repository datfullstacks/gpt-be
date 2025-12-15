require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');

const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000';
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

// Load payment config
let paymentConfig = {
  payment_verification: {
    enabled: true,
    required_keywords: [],
    excluded_keywords: [],
    min_amount: 10000,
    auto_deliver: true
  },
  price_list: {
    free: 0,
    plus: 50000,
    team: 100000
  }
};

try {
  const configPath = path.join(__dirname, 'payment-config.json');
  if (fs.existsSync(configPath)) {
    paymentConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  }
} catch (error) {
  console.warn('⚠️ Could not load payment config, using defaults');
}

if (!TELEGRAM_BOT_TOKEN) {
  console.error('❌ TELEGRAM_BOT_TOKEN not found in .env file');
  process.exit(1);
}

// Create bot instance
const bot = new TelegramBot(TELEGRAM_BOT_TOKEN, { polling: true });

console.log('🤖 Telegram Bot started successfully!');

// Helper function to call backend API
async function callAPI(endpoint, method = 'GET', body = null) {
  try {
    const url = `${API_BASE_URL}${endpoint}`;
    console.log(`📡 Calling API: ${method} ${url}`);
    
    const options = {
      method,
      headers: { 'Content-Type': 'application/json' }
    };
    if (body) {
      options.body = JSON.stringify(body);
    }
    const response = await fetch(url, options);
    const data = await response.json();
    console.log(`✅ API Response:`, JSON.stringify(data).substring(0, 200));
    return data;
  } catch (error) {
    console.error('❌ API Error:', error.message);
    throw error;
  }
}

// Format account info for display
function formatAccount(account) {
  const planIcon = account.plan_type === 'free' ? '🆓' : account.plan_type === 'plus' ? '⭐' : '📌';
  const statusIcon = account.sold_status === 'sold' ? '🔴' : '🟢';
  const statusText = account.sold_status === 'sold' ? '**ĐÃ BÁN**' : '**CÒN HÀNG**';
  
  return `
╔════════════════════════════╗
║     📧 THÔNG TIN TÀI KHOẢN     ║
╚════════════════════════════╝

┌── 🔐 CREDENTIALS ──┐
│ 📧 **Email:**
│ \`${account.email}\`
│
│ 🔑 **Password:**
│ \`${account.password}\`
│
│ 🔐 **2FA Secret:**
│ \`${account.secret_key_2fa || 'N/A'}\`
└────────────────────┘

┌── ℹ️ DETAILS ──┐
│ ${planIcon} **Plan:** ${(account.plan_type || 'Free').toUpperCase()}
│ 🆔 **ID:** \`${account.account_id || 'N/A'}\`
│ 📅 **Created:** ${new Date(account.created_at).toLocaleString('vi-VN')}
│ ${statusIcon} **Status:** ${statusText}
${account.sold_status === 'sold' && account.price ? `│ 💵 **Price:** ${account.price.toLocaleString('vi-VN')} VNĐ\n│ 👤 **Buyer:** ${account.buyer_info}` : ''}
└────────────────────┘
  `.trim();
}

// Command: /start or /menu
bot.onText(/\/(start|menu)/, (msg) => {
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
  
  const welcomeMessage = `
🤖 **Chào mừng đến với ChatGPT Account Bot!**

Sử dụng menu bên dưới để truy cập nhanh các chức năng:

🆔 **Your Chat ID:** \`${chatId}\`
📝 Copy ID trên vào file .env
  `.trim();
  
  const keyboard = {
    reply_markup: {
      keyboard: [
        [
          { text: '📊 Thống kê' },
          { text: '📦 Danh sách' }
        ],
        [
          { text: '🆓 Free Plan' },
          { text: '⭐ Plus Plan' }
        ],
        [
          { text: '🔍 Tìm ID' },
          { text: '❓ Hướng dẫn' }
        ]
      ],
      resize_keyboard: true,
      persistent: true
    }
  };
  
  bot.sendMessage(chatId, welcomeMessage, { 
    parse_mode: 'Markdown',
    ...keyboard
  });
});

// Command: /help
bot.onText(/\/help/, (msg) => {
  const chatId = msg.chat.id;
  const helpMessage = `
📖 **Hướng dẫn sử dụng Bot**

**Lệnh cơ bản:**
• \`/stats\` - Hiển thị thống kê tổng quan
• \`/list\` - Xem tất cả tài khoản available
• \`/list_free\` - Lọc tài khoản Free plan
• \`/list_plus\` - Lọc tài khoản Plus plan
• \`/account [id]\` - Xem chi tiết tài khoản

**Lệnh Admin:**
• \`/sell [account_id] [buyer_name] [price] [payment]\`
  Ví dụ: \`/sell 67abc123 NguyenVanA 50000 momo\`

**Format tài khoản:**
\`\`\`
email|password|2fa_secret
\`\`\`

**Lưu ý:**
- Giá tính bằng VNĐ
- Payment methods: momo, bank, cash
- Account ID có thể copy từ /list
  `.trim();
  
  bot.sendMessage(chatId, helpMessage, { parse_mode: 'Markdown' });
});

// Command: /stats
bot.onText(/\/stats/, async (msg) => {
  const chatId = msg.chat.id;
  
  try {
    bot.sendMessage(chatId, '⏳ Đang tải thống kê...');
    
    const stats = await callAPI('/api/stats');
    
    // Handle case when no stats data
    if (!stats || !stats.byPlanType) {
      bot.sendMessage(chatId, '📊 Chưa có dữ liệu thống kê.');
      return;
    }
    
    const statsMessage = `
╔════════════════════════╗
║   📊 THỐNG KÊ TÀI KHOẢN   ║
╚════════════════════════╝

📦 **Tổng số:** \`${stats.total || 0}\` tài khoản
🟢 **Còn lại:** \`${stats.available || 0}\` tài khoản
✅ **Đã bán:** \`${stats.sold || 0}\` tài khoản

┌─────────────────────┐
│  📋 PHÂN LOẠI PLAN  │
└─────────────────────┘
${stats.byPlanType.length > 0 ? stats.byPlanType.map(p => {
  const icon = p._id === 'free' ? '🆓' : p._id === 'plus' ? '⭐' : '📌';
  return `${icon} ${(p._id || 'Unknown').toUpperCase()}: **${p.count}** tk`;
}).join('\n') : '⚠️ Chưa có dữ liệu'}
    `.trim();
    
    bot.sendMessage(chatId, statsMessage, { parse_mode: 'Markdown' });
  } catch (error) {
    bot.sendMessage(chatId, '❌ Lỗi khi tải thống kê. Vui lòng thử lại sau.');
    console.error('Stats error:', error);
  }
});

// Command: /list [plan_type]
bot.onText(/\/list(_free|_plus)?/, async (msg, match) => {
  const chatId = msg.chat.id;
  const planFilter = match[1];
  
  try {
    bot.sendMessage(chatId, '⏳ Đang tải danh sách...');
    
    let endpoint = '/api/accounts/available';
    if (planFilter === '_free') {
      endpoint += '?plan_type=free';
    } else if (planFilter === '_plus') {
      endpoint += '?plan_type=plus';
    }
    
    const response = await callAPI(endpoint);
    const accounts = response.data || response.accounts || [];
    
    if (accounts.length === 0) {
      bot.sendMessage(chatId, '📭 Không có tài khoản nào available.');
      return;
    }
    
    const listMessage = `
🛒 **Tài khoản có sẵn (${accounts.length})**
━━━━━━━━━━━━━━━━━━━━━━━━
${accounts.slice(0, 10).map((acc, idx) => `
${idx + 1}. **${acc.plan_type || 'Free'}** Plan
   ID: \`${acc._id}\`
   Email: \`${acc.email}\`
   Created: ${new Date(acc.created_at).toLocaleDateString('vi-VN')}
`).join('\n')}
${accounts.length > 10 ? `\n... và ${accounts.length - 10} tài khoản khác` : ''}

💡 Dùng \`/account [id]\` để xem chi tiết
    `.trim();
    
    bot.sendMessage(chatId, listMessage, { parse_mode: 'Markdown' });
  } catch (error) {
    bot.sendMessage(chatId, '❌ Lỗi khi tải danh sách. Vui lòng thử lại sau.');
    console.error('List error:', error);
  }
});

// Command: /account [id]
bot.onText(/\/account (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const accountId = match[1].trim();
  
  try {
    bot.sendMessage(chatId, '⏳ Đang tải thông tin...');
    
    const response = await callAPI('/api/accounts');
    const accounts = response.data || response.accounts || [];
    const account = accounts.find(a => a._id === accountId);
    
    if (!account) {
      bot.sendMessage(chatId, '❌ Không tìm thấy tài khoản với ID này.');
      return;
    }
    
    const accountMessage = formatAccount(account);
    
    // Send account info with copy-friendly format
    bot.sendMessage(chatId, accountMessage, { parse_mode: 'Markdown' });
    
    // Send credentials in copyable format
    const credentials = `${account.email}|${account.password}|${account.secret_key_2fa || ''}`;
    bot.sendMessage(chatId, `📋 **Copy format:**\n\`${credentials}\``, { parse_mode: 'Markdown' });
    
  } catch (error) {
    bot.sendMessage(chatId, '❌ Lỗi khi tải thông tin tài khoản.');
    console.error('Account error:', error);
  }
});

// Command: /sell [account_id] [buyer_name] [price] [payment_method]
bot.onText(/\/sell (.+?) (.+?) (\d+) (\w+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const accountId = match[1].trim();
  const buyerName = match[2].trim();
  const price = parseInt(match[3]);
  const paymentMethod = match[4].trim();
  
  try {
    bot.sendMessage(chatId, '⏳ Đang xử lý...');
    
    const result = await callAPI(`/api/accounts/${accountId}/sell`, 'POST', {
      buyer_info: buyerName,
      price: price,
      payment_method: paymentMethod
    });
    
    if (result.success) {
      const successMessage = `
✅ **Đã đánh dấu bán thành công!**
━━━━━━━━━━━━━━━━━━━━━━━━
🆔 Account ID: \`${accountId}\`
👤 Buyer: ${buyerName}
💰 Price: ${price.toLocaleString('vi-VN')} VNĐ
💳 Payment: ${paymentMethod}
⏰ Time: ${new Date().toLocaleString('vi-VN')}
      `.trim();
      
      bot.sendMessage(chatId, successMessage, { parse_mode: 'Markdown' });
    } else {
      bot.sendMessage(chatId, `❌ ${result.message || 'Lỗi khi cập nhật tài khoản'}`);
    }
  } catch (error) {
    bot.sendMessage(chatId, '❌ Lỗi khi xử lý giao dịch.');
    console.error('Sell error:', error);
  }
});

// Handle invalid /sell command
bot.onText(/\/sell(?!\s+\S+\s+\S+\s+\d+\s+\w+)/, (msg) => {
  const chatId = msg.chat.id;
  const helpMessage = `
❌ **Sai cú pháp!**

**Cách dùng:**
\`/sell [account_id] [buyer_name] [price] [payment_method]\`

**Ví dụ:**
\`/sell 67abc123 NguyenVanA 50000 momo\`

**Payment methods:**
• momo
• bank
• cash
  `.trim();
  
  bot.sendMessage(chatId, helpMessage, { parse_mode: 'Markdown' });
});

// Handle callback queries from inline keyboard
bot.on('callback_query', async (query) => {
  const chatId = query.message.chat.id;
  const messageId = query.message.message_id;
  const data = query.data;
  
  // Answer callback to remove loading state
  bot.answerCallbackQuery(query.id);
  
  try {
    switch (data) {
      case 'stats':
        bot.sendMessage(chatId, '⏳ Đang tải thống kê...');
        const stats = await callAPI('/api/stats');
        
        if (!stats || !stats.byPlanType) {
          bot.sendMessage(chatId, '📊 Chưa có dữ liệu thống kê.');
          return;
        }
        
        const statsMessage = `
📊 **Thống kê tài khoản**
━━━━━━━━━━━━━━━━━━━━━━━━
📦 Tổng số tài khoản: **${stats.total || 0}**
🟢 Còn lại: **${stats.available || 0}**
✅ Đã bán: **${stats.sold || 0}**
━━━━━━━━━━━━━━━━━━━━━━━━
**Theo loại plan:**
${stats.byPlanType.length > 0 ? stats.byPlanType.map(p => `• ${p._id || 'Unknown'}: ${p.count} tài khoản`).join('\n') : '• Chưa có dữ liệu'}
        `.trim();
        
        bot.sendMessage(chatId, statsMessage, { parse_mode: 'Markdown' });
        break;
        
      case 'list_all':
        bot.sendMessage(chatId, '⏳ Đang tải danh sách...');
        await listAccounts(chatId, '/api/accounts/available');
        break;
        
      case 'list_free':
        bot.sendMessage(chatId, '⏳ Đang tải danh sách Free plan...');
        await listAccounts(chatId, '/api/accounts/available?plan_type=free');
        break;
        
      case 'list_plus':
        bot.sendMessage(chatId, '⏳ Đang tải danh sách Plus plan...');
        await listAccounts(chatId, '/api/accounts/available?plan_type=plus');
        break;
        
      case 'search_id':
        bot.sendMessage(chatId, '🔍 Nhập ID tài khoản:\n\nSử dụng lệnh: `/account [id]`', { parse_mode: 'Markdown' });
        break;
        
      case 'help':
        const helpMessage = `
📖 **Hướng dẫn sử dụng Bot**

**Lệnh cơ bản:**
• \`/menu\` - Hiển thị menu chính
• \`/stats\` - Hiển thị thống kê tổng quan
• \`/list\` - Xem tất cả tài khoản available
• \`/list_free\` - Lọc tài khoản Free plan
• \`/list_plus\` - Lọc tài khoản Plus plan
• \`/account [id]\` - Xem chi tiết tài khoản

**Lệnh Admin:**
• \`/sell [account_id] [buyer_name] [price] [payment]\`
  Ví dụ: \`/sell 67abc123 NguyenVanA 50000 momo\`

**Format tài khoản:**
\`\`\`
email|password|2fa_secret
\`\`\`
        `.trim();
        
        bot.sendMessage(chatId, helpMessage, { parse_mode: 'Markdown' });
        break;
    }
  } catch (error) {
    console.error('Callback query error:', error);
    bot.sendMessage(chatId, '❌ Đã xảy ra lỗi. Vui lòng thử lại.');
  }
});

// Helper function for listing accounts
async function listAccounts(chatId, endpoint) {
  try {
    const response = await callAPI(endpoint);
    const accounts = response.data || response.accounts || [];
    
    if (accounts.length === 0) {
      bot.sendMessage(chatId, '📭 Không có tài khoản nào available.');
      return;
    }
    
    const listMessage = `
╔══════════════════════════╗
║  🛒 TÀI KHOẢN CÓ SẴN (${accounts.length})  ║
╚══════════════════════════╝

${accounts.slice(0, 10).map((acc, idx) => {
  const planIcon = acc.plan_type === 'free' ? '🆓' : acc.plan_type === 'plus' ? '⭐' : '📌';
  const date = new Date(acc.created_at).toLocaleDateString('vi-VN');
  return `┌────── ${planIcon} #${idx + 1} ──────┐
│ 📋 ID: \`${acc._id}\`
│ 📧 ${acc.email}
│ 📅 ${date}
└──────────────────────┘`;
}).join('\n\n')}
${accounts.length > 10 ? `\n\n⚠️ Còn **${accounts.length - 10}** tài khoản nữa...` : ''}

💡 **Tip:** Dùng \`/account [id]\` để xem chi tiết
    `.trim();
    
    bot.sendMessage(chatId, listMessage, { parse_mode: 'Markdown' });
  } catch (error) {
    bot.sendMessage(chatId, '❌ Lỗi khi tải danh sách.');
    console.error('List error:', error);
  }
}

// Handle text messages from reply keyboard
bot.on('message', async (msg) => {
  if (!msg.text || msg.text.startsWith('/')) return; // Skip commands
  
  const chatId = msg.chat.id;
  const text = msg.text;
  
  try {
    switch (text) {
      case '📊 Thống kê':
        bot.sendMessage(chatId, '⏳ Đang tải thống kê...');
        const stats = await callAPI('/api/stats');
        
        if (!stats || !stats.byPlanType) {
          bot.sendMessage(chatId, '📊 Chưa có dữ liệu thống kê.');
          return;
        }
        
        const statsMessage = `
📊 **Thống kê tài khoản**
━━━━━━━━━━━━━━━━━━━━━━━━
📦 Tổng số tài khoản: **${stats.total || 0}**
🟢 Còn lại: **${stats.available || 0}**
✅ Đã bán: **${stats.sold || 0}**
━━━━━━━━━━━━━━━━━━━━━━━━
**Theo loại plan:**
${stats.byPlanType.length > 0 ? stats.byPlanType.map(p => `• ${p._id || 'Unknown'}: ${p.count} tài khoản`).join('\n') : '• Chưa có dữ liệu'}
        `.trim();
        
        bot.sendMessage(chatId, statsMessage, { parse_mode: 'Markdown' });
        break;
        
      case '📦 Danh sách':
        bot.sendMessage(chatId, '⏳ Đang tải danh sách...');
        await listAccounts(chatId, '/api/accounts/available');
        break;
        
      case '🆓 Free Plan':
        bot.sendMessage(chatId, '⏳ Đang tải danh sách Free plan...');
        await listAccounts(chatId, '/api/accounts/available?plan_type=free');
        break;
        
      case '⭐ Plus Plan':
        bot.sendMessage(chatId, '⏳ Đang tải danh sách Plus plan...');
        await listAccounts(chatId, '/api/accounts/available?plan_type=plus');
        break;
        
      case '🔍 Tìm ID':
        bot.sendMessage(chatId, '🔍 Nhập ID tài khoản:\n\nSử dụng lệnh: `/account [id]`', { parse_mode: 'Markdown' });
        break;
        
      case '❓ Hướng dẫn':
        const helpMessage = `
╔═══════════════════════╗
║   📖 HƯỚNG DẪN SỬ DỤNG   ║
╚═══════════════════════╝

┌─ 🎯 MENU NHANH ─┐
│ • Dùng nút bên dưới
│ • Hoặc gõ lệnh trực tiếp
└─────────────────┘

┌─ 📋 LỆNH CƠ BẢN ─┐
│ \`/menu\` → Menu chính
│ \`/stats\` → Thống kê
│ \`/list\` → Danh sách
│ \`/account [id]\` → Chi tiết
└─────────────────┘

┌─ 👨‍💼 LỆNH ADMIN ─┐
│ \`/sell [id] [buyer] [price] [payment]\`
│
│ **Ví dụ:**
│ \`/sell 67abc NguyenVanA 50000 momo\`
│
│ **Payment:** momo, bank, cash
└─────────────────┘

📌 **Format:** \`email|password|2fa\`
        `.trim();
        
        bot.sendMessage(chatId, helpMessage, { parse_mode: 'Markdown' });
        break;
    }
  } catch (error) {
    console.error('Message handler error:', error);
  }
});

// Command: /payment_config - Configure payment verification
bot.onText(/\/payment_config/, (msg) => {
  const chatId = msg.chat.id;
  
  const configMessage = `
╔═══════════════════════════╗
║  ⚙️ CẤU HÌNH THANH TOÁN  ║
╚═══════════════════════════╝

**Trạng thái:** ${paymentConfig.payment_verification.enabled ? '✅ Bật' : '❌ Tắt'}

┌─ ✅ TỪ KHÓA BẮT BUỘC ─┐
│ ${paymentConfig.payment_verification.required_keywords.length > 0 
    ? paymentConfig.payment_verification.required_keywords.join(', ') 
    : 'Chưa có'}
└─────────────────────────┘

┌─ ❌ TỪ KHÓA BỎ QUA ─┐
│ ${paymentConfig.payment_verification.excluded_keywords.length > 0 
    ? paymentConfig.payment_verification.excluded_keywords.join(', ') 
    : 'Chưa có'}
└───────────────────────┘

💰 **Số tiền tối thiểu:** ${paymentConfig.payment_verification.min_amount.toLocaleString('vi-VN')} VNĐ
🚀 **Tự động giao:** ${paymentConfig.payment_verification.auto_deliver ? 'Có' : 'Không'}

**Bảng giá:**
🆓 Free: ${paymentConfig.price_list.free.toLocaleString('vi-VN')} VNĐ
⭐ Plus: ${paymentConfig.price_list.plus.toLocaleString('vi-VN')} VNĐ
👥 Team: ${paymentConfig.price_list.team.toLocaleString('vi-VN')} VNĐ

**Lệnh cấu hình:**
• \`/set_required [keywords]\` - Thêm từ bắt buộc
• \`/set_excluded [keywords]\` - Thêm từ bỏ qua
• \`/set_price [plan] [amount]\` - Đặt giá
• \`/verify_payment [content] [amount]\` - Test thanh toán

**Ví dụ:**
\`/set_required AN,HD,CHATGPT\`
\`/set_excluded ON,GA,HOAN\`
\`/set_price plus 50000\`
  `.trim();
  
  bot.sendMessage(chatId, configMessage, { parse_mode: 'Markdown' });
});

// Command: /set_required - Set required keywords
bot.onText(/\/set_required (.+)/, (msg, match) => {
  const chatId = msg.chat.id;
  const keywords = match[1].split(/[,\s]+/).map(k => k.trim().toUpperCase()).filter(k => k);
  
  paymentConfig.payment_verification.required_keywords = keywords;
  savePaymentConfig();
  
  bot.sendMessage(chatId, `✅ Đã cập nhật từ khóa bắt buộc:\n${keywords.join(', ')}`);
});

// Command: /set_excluded - Set excluded keywords
bot.onText(/\/set_excluded (.+)/, (msg, match) => {
  const chatId = msg.chat.id;
  const keywords = match[1].split(/[,\s]+/).map(k => k.trim().toUpperCase()).filter(k => k);
  
  paymentConfig.payment_verification.excluded_keywords = keywords;
  savePaymentConfig();
  
  bot.sendMessage(chatId, `✅ Đã cập nhật từ khóa bỏ qua:\n${keywords.join(', ')}`);
});

// Command: /set_price - Set plan price
bot.onText(/\/set_price (\w+) (\d+)/, (msg, match) => {
  const chatId = msg.chat.id;
  const plan = match[1].toLowerCase();
  const price = parseInt(match[2]);
  
  if (paymentConfig.price_list.hasOwnProperty(plan)) {
    paymentConfig.price_list[plan] = price;
    savePaymentConfig();
    bot.sendMessage(chatId, `✅ Đã cập nhật giá ${plan}: ${price.toLocaleString('vi-VN')} VNĐ`);
  } else {
    bot.sendMessage(chatId, `❌ Plan không hợp lệ. Chọn: free, plus, team`);
  }
});

// Command: /verify_payment - Test payment verification
bot.onText(/\/verify_payment (.+) (\d+)/, (msg, match) => {
  const chatId = msg.chat.id;
  const content = match[1].toUpperCase();
  const amount = parseInt(match[2]);
  
  const result = verifyPayment(content, amount);
  
  const message = `
╔═══════════════════════════╗
║  🔍 KẾT QUẢ KIỂM TRA  ║
╚═══════════════════════════╝

**Nội dung:** ${match[1]}
**Số tiền:** ${amount.toLocaleString('vi-VN')} VNĐ

${result.valid ? '✅ **HỢP LỆ**' : '❌ **KHÔNG HỢP LỆ**'}

**Chi tiết:**
${result.reasons.map(r => `• ${r}`).join('\n')}

${result.valid && result.suggested_plan ? `\n💡 **Gợi ý:** Giao tài khoản **${result.suggested_plan.toUpperCase()}**` : ''}
  `.trim();
  
  bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
});

// Helper function to verify payment
function verifyPayment(content, amount) {
  const reasons = [];
  let valid = true;
  
  // Check minimum amount
  if (amount < paymentConfig.payment_verification.min_amount) {
    reasons.push(`❌ Số tiền < ${paymentConfig.payment_verification.min_amount.toLocaleString('vi-VN')} VNĐ`);
    valid = false;
  } else {
    reasons.push(`✅ Số tiền đủ điều kiện`);
  }
  
  // Check required keywords
  const hasRequired = paymentConfig.payment_verification.required_keywords.length === 0 ||
    paymentConfig.payment_verification.required_keywords.some(keyword => content.includes(keyword));
  
  if (!hasRequired) {
    reasons.push(`❌ Thiếu từ khóa bắt buộc: ${paymentConfig.payment_verification.required_keywords.join(', ')}`);
    valid = false;
  } else if (paymentConfig.payment_verification.required_keywords.length > 0) {
    const matched = paymentConfig.payment_verification.required_keywords.filter(k => content.includes(k));
    reasons.push(`✅ Có từ khóa: ${matched.join(', ')}`);
  }
  
  // Check excluded keywords
  const hasExcluded = paymentConfig.payment_verification.excluded_keywords.some(keyword => content.includes(keyword));
  
  if (hasExcluded) {
    const matched = paymentConfig.payment_verification.excluded_keywords.filter(k => content.includes(k));
    reasons.push(`❌ Có từ bỏ qua: ${matched.join(', ')}`);
    valid = false;
  } else if (paymentConfig.payment_verification.excluded_keywords.length > 0) {
    reasons.push(`✅ Không có từ bỏ qua`);
  }
  
  // Suggest plan based on amount
  let suggested_plan = null;
  if (valid) {
    if (amount >= paymentConfig.price_list.team) {
      suggested_plan = 'team';
    } else if (amount >= paymentConfig.price_list.plus) {
      suggested_plan = 'plus';
    } else {
      suggested_plan = 'free';
    }
  }
  
  return { valid, reasons, suggested_plan, amount };
}

// Helper function to save payment config
function savePaymentConfig() {
  try {
    const configPath = path.join(__dirname, 'payment-config.json');
    fs.writeFileSync(configPath, JSON.stringify(paymentConfig, null, 2), 'utf8');
    console.log('✅ Payment config saved');
  } catch (error) {
    console.error('❌ Error saving payment config:', error);
  }
}

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

console.log('✅ Bot is ready to receive commands!');
console.log('📱 Start chatting with your bot on Telegram');
