require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const fetch = require('node-fetch');
const QRCode = require('qrcode');

const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000';
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const ADMIN_CHAT_IDS = (process.env.ADMIN_TELEGRAM_CHAT_ID || '').split(',').map(id => id.trim());
const SEPAY_API_KEY = process.env.SEPAY_API_KEY;
const SEPAY_ACCOUNT_NUMBER = process.env.SEPAY_ACCOUNT_NUMBER;
const SEPAY_QR_URL = 'https://my.sepay.vn/userapi/qr/create';
const BANK_INFO = {
  bank: 'MBBank',
  account: '999906052003',
  name: 'HOANG TIEN DAT'
};

if (!TELEGRAM_BOT_TOKEN) {
  console.error('❌ TELEGRAM_BOT_TOKEN not found');
  process.exit(1);
}

const bot = new TelegramBot(TELEGRAM_BOT_TOKEN, { polling: true });
console.log('🤖 Customer Bot started!');
console.log('👥 Admin Chat IDs:', ADMIN_CHAT_IDS);

// ============ RATE LIMITING ============
const rateLimits = new Map(); // chatId -> { requests: [], banned: false }
const RATE_LIMIT_WINDOW = 60000; // 1 minute
const MAX_REQUESTS_PER_MINUTE = 10;
const BAN_DURATION = 300000; // 5 minutes

function checkRateLimit(chatId) {
  const now = Date.now();
  
  if (!rateLimits.has(chatId)) {
    rateLimits.set(chatId, { requests: [], banned: false, bannedUntil: 0 });
  }
  
  const userLimit = rateLimits.get(chatId);
  
  // Check if banned
  if (userLimit.banned && now < userLimit.bannedUntil) {
    const remainingTime = Math.ceil((userLimit.bannedUntil - now) / 1000);
    return { allowed: false, reason: `Bạn đã bị tạm khóa. Thử lại sau ${remainingTime} giây.` };
  } else if (userLimit.banned && now >= userLimit.bannedUntil) {
    // Unban
    userLimit.banned = false;
    userLimit.requests = [];
  }
  
  // Remove old requests outside window
  userLimit.requests = userLimit.requests.filter(time => now - time < RATE_LIMIT_WINDOW);
  
  // Check rate limit
  if (userLimit.requests.length >= MAX_REQUESTS_PER_MINUTE) {
    // Ban user
    userLimit.banned = true;
    userLimit.bannedUntil = now + BAN_DURATION;
    console.log(`⚠️ Rate limit exceeded for chat ${chatId}. Banned for 5 minutes.`);
    return { allowed: false, reason: '⚠️ Bạn đã gửi quá nhiều request. Tạm khóa 5 phút.' };
  }
  
  // Add request
  userLimit.requests.push(now);
  return { allowed: true };
}

// ============ AUTHORIZATION ============
function isAdmin(chatId) {
  return ADMIN_CHAT_IDS.includes(chatId.toString());
}

function requireAdmin(chatId) {
  if (!isAdmin(chatId)) {
    return { authorized: false, message: '❌ Unauthorized. Admin only command.' };
  }
  return { authorized: true };
}

// Command: /start
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  
  // Check rate limit
  const rateCheck = checkRateLimit(chatId);
  if (!rateCheck.allowed) {
    return bot.sendMessage(chatId, rateCheck.reason);
  }
  
  const isAdminUser = isAdmin(chatId);
  const roleText = isAdminUser ? '\n\n👑 **Admin Mode** - Bạn có quyền admin' : '';
  
  const message = `
🤖 **Chào mừng đến với ChatGPT Auto Shop!**

🛒 **Sản phẩm:**
🆓 FREE Account - 0 VNĐ
⭐ PLUS Account - 50,000 VNĐ
👥 TEAM Account - 100,000 VNĐ

📝 **Cách mua:**
1. Gửi /muaplus hoặc /muafree
2. Chuyển khoản theo hướng dẫn
3. Nhận tài khoản TỰ ĐỘNG sau 1-2 phút!

💡 Gửi /help để xem hướng dẫn chi tiết${roleText}
  `.trim();
  
  const keyboard = {
    reply_markup: {
      keyboard: isAdminUser ? [
        [{ text: '🆓 Mua FREE' }, { text: '⭐ Mua PLUS' }],
        [{ text: '👥 Mua TEAM' }],
        [{ text: '💰 Số Dư' }, { text: '💳 Nạp Tiền' }],
        [{ text: '📋 Bảng giá' }, { text: '❓ Hướng dẫn' }],
        [{ text: '👑 Admin Panel' }]
      ] : [
        [{ text: '🆓 Mua FREE' }, { text: '⭐ Mua PLUS' }],
        [{ text: '👥 Mua TEAM' }],
        [{ text: '💰 Số Dư' }, { text: '💳 Nạp Tiền' }],
        [{ text: '📋 Bảng giá' }, { text: '❓ Hướng dẫn' }]
      ],
      resize_keyboard: true
    }
  };
  
  bot.sendMessage(chatId, message, { parse_mode: 'Markdown', ...keyboard });
});

// Maintenance check middleware for user commands
async function checkMaintenance(chatId) {
  try {
    const response = await fetch(`${API_BASE_URL}/api/maintenance`);
    const data = await response.json();
    
    if (data.maintenance.enabled && !isAdmin(chatId)) {
      bot.sendMessage(chatId, 
        `🔧 **HỆ THỐNG BẢO TRÌ**\n\n${data.maintenance.message}`,
        { parse_mode: 'Markdown' }
      );
      return true; // In maintenance
    }
    return false; // Not in maintenance
  } catch (error) {
    return false; // On error, allow access
  }
}

// Command: /muafree, /muaplus, /muateam
bot.onText(/\/(muafree|muaplus|muateam)/, async (msg, match) => {
  const chatId = msg.chat.id;
  
  // Check maintenance mode
  if (await checkMaintenance(chatId)) return;
  
  // Check rate limit
  const rateCheck = checkRateLimit(chatId);
  if (!rateCheck.allowed) {
    return bot.sendMessage(chatId, rateCheck.reason);
  }
  
  const plan = match[1].replace('mua', '');
  
  let price = 0;
  let planName = '';
  
  if (plan === 'free') {
    price = 0;
    planName = '🆓 FREE';
  } else if (plan === 'plus') {
    price = 50000;
    planName = '⭐ PLUS';
  } else if (plan === 'team') {
    price = 100000;
    planName = '👥 TEAM';
  }
  
  if (price === 0) {
    bot.sendMessage(chatId, '❌ FREE account hiện không khả dụng qua bot. Vui lòng liên hệ admin.');
    return;
  }
  
  const userId = msg.from.id;
  const code = `${plan.toUpperCase()}${userId}`;
  
  console.log(`📝 User ${userId} (${msg.from.username || 'no username'}) requested ${plan.toUpperCase()} plan`);
  
  // Call SePay QR API
  try {
    console.log('🔄 Calling SePay QR API...');
    const qrResponse = await fetch(SEPAY_QR_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SEPAY_API_KEY}`
      },
      body: JSON.stringify({
        account_number: SEPAY_ACCOUNT_NUMBER,
        amount: price,
        content: code
      })
    });

    console.log('📡 SePay Response Status:', qrResponse.status);
    const responseText = await qrResponse.text();
    console.log('📄 SePay Response Body:', responseText);
    
    let qrData;
    try {
      qrData = JSON.parse(responseText);
    } catch (e) {
      console.error('❌ Failed to parse JSON:', e.message);
      throw new Error('Invalid JSON from SePay: ' + responseText.substring(0, 100));
    }
    
    if (qrData.status !== 200 || !qrData.data || !qrData.data.qr) {
      throw new Error('SePay QR API failed: ' + JSON.stringify(qrData));
    }
    
    const qrImageUrl = qrData.data.qr;
    console.log('✅ QR URL:', qrImageUrl);
    
    const message = `
╔═══════════════════════════╗
║  💳 THANH TOÁN ${planName}  ║
╚═══════════════════════════╝

📦 **Sản phẩm:** ${planName} Account
💰 **Giá:** ${price.toLocaleString('vi-VN')} VNĐ

📱 **Quét QR để thanh toán:**
👇 Dùng app ngân hàng quét mã dưới

⚠️ Hoặc chuyển khoản thủ công:

┌─ 🏦 THÔNG TIN CK ─┐
│ NH: **${BANK_INFO.bank}**
│ STK: \`${BANK_INFO.account}\`
│ Tên: ${BANK_INFO.name}
│ Số tiền: **${price.toLocaleString('vi-VN')} VNĐ**
│ Nội dung: \`${code}\`
└────────────────────┘

⏱️ Nhận tài khoản TỰ ĐỘNG sau 1-2 phút!

💡 Lưu ý: Ghi ĐÚNG nội dung để nhận hàng tự động
    `.trim();
    
    // Gửi QR code từ SePay
    await bot.sendPhoto(chatId, qrImageUrl, {
      caption: `📱 Quét QR thanh toán ${planName} - ${price.toLocaleString('vi-VN')} VNĐ`,
      parse_mode: 'Markdown'
    });
    
    // Gửi thông tin chi tiết
    bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
    
  } catch (error) {
    console.error('❌ SePay QR error:', error.message);
    
    // Fallback: Use VietQR.io API to generate QR
    try {
      console.log('🔄 Fallback to VietQR.io API...');
      console.log('💰 Price before URL:', price, 'Type:', typeof price);
      // VietQR.io format: amount must be integer in VND
      const amountParam = Math.floor(price);
      const qrImageUrl = `https://img.vietqr.io/image/970422-${BANK_INFO.account}-compact2.jpg?amount=${amountParam}&addInfo=${encodeURIComponent(code)}&accountName=${encodeURIComponent(BANK_INFO.name)}`;
      
      console.log('✅ VietQR URL:', qrImageUrl);
      console.log('💰 Amount param:', amountParam);
      
      // Gửi QR image từ VietQR.io
      await bot.sendPhoto(chatId, qrImageUrl, {
        caption: `📱 Quét QR thanh toán ${planName} - ${price.toLocaleString('vi-VN')} VNĐ`,
        parse_mode: 'Markdown'
      });
      
      const message = `
╔═══════════════════════════╗
║  💳 THANH TOÁN ${planName}  ║
╚═══════════════════════════╝

📦 **Sản phẩm:** ${planName} Account
💰 **Giá:** ${price.toLocaleString('vi-VN')} VNĐ

┌─ 🏦 THÔNG TIN CK ─┐
│ NH: **${BANK_INFO.bank}**
│ STK: \`${BANK_INFO.account}\`
│ Tên: ${BANK_INFO.name}
│ Số tiền: **${price.toLocaleString('vi-VN')} VNĐ**
│ Nội dung: \`${code}\`
└────────────────────┘

⏱️ Nhận tài khoản TỰ ĐỘNG sau 1-2 phút!
    `.trim();
      
      bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
      return;
    } catch (qrError) {
      console.error('❌ VietQR.io also failed:', qrError);
    }
    
    // Last resort: Text only
    try {
      const qrBuffer = await QRCode.toBuffer(qrContent, {
        errorCorrectionLevel: 'M',
        type: 'png',
        width: 400,
        margin: 2
      });
      
      await bot.sendPhoto(chatId, qrBuffer, {
        caption: `📱 Quét QR thanh toán ${planName} - ${price.toLocaleString('vi-VN')} VNĐ`,
        parse_mode: 'Markdown'
      });
      
      const message = `
╔═══════════════════════════╗
║  💳 THANH TOÁN ${planName}  ║
╚═══════════════════════════╝

📦 **Sản phẩm:** ${planName} Account
💰 **Giá:** ${price.toLocaleString('vi-VN')} VNĐ

┌─ 🏦 THÔNG TIN CK ─┐
│ NH: **${BANK_INFO.bank}**
│ STK: \`${BANK_INFO.account}\`
│ Tên: ${BANK_INFO.name}
│ Số tiền: **${price.toLocaleString('vi-VN')} VNĐ**
│ Nội dung: \`${code}\`
└────────────────────┘

⏱️ Nhận tài khoản TỰ ĐỘNG sau 1-2 phút!

💡 Lưu ý: Ghi ĐÚNG nội dung để nhận hàng tự động
    `.trim();
      
      bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
      return;
    } catch (qrError) {
      console.error('❌ VietQR generation also failed:', qrError);
    }
    
    // Last resort: Text only
    const message = `
╔═══════════════════════════╗
║  💳 THÔNG TIN THANH TOÁN  ║
╚═══════════════════════════╝

📦 **Sản phẩm:** ${planName} Account
💰 **Giá:** ${price.toLocaleString('vi-VN')} VNĐ

┌─ 🏦 CHUYỂN KHOẢN ĐẾN ─┐
│ Ngân hàng: **${BANK_INFO.bank}**
│ STK: \`${BANK_INFO.account}\`
│ Tên: ${BANK_INFO.name}
└─────────────────────────┘

⚠️ **Nội dung:** \`${code}\`
💰 **Số tiền:** ${price.toLocaleString('vi-VN')} VNĐ

📝 Chuyển ĐÚNG số tiền + nội dung
⏱️ Nhận tự động sau 1-2 phút
    `.trim();
    
    bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
  }
});

// Admin Commands
bot.onText(/\/admin/, (msg) => {
  const chatId = msg.chat.id;
  const authCheck = requireAdmin(chatId);
  
  if (!authCheck.authorized) {
    return bot.sendMessage(chatId, authCheck.message);
  }
  
  const message = `
👑 **ADMIN PANEL**

📊 **Statistics:**
/stats - View system stats
/inventory - Check account inventory
/users - List active users

🔧 **Management:**
/broadcast <message> - Send to all users
/ban <chatId> - Ban user
/unban <chatId> - Unban user
/gift <chatId> <amount> - Gift money to user
/maintenance - Toggle maintenance mode

📝 **Logs:**
/logs - View recent activity
/ratelimits - Check rate limits
  `.trim();
  
  bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
});

bot.onText(/\/stats/, async (msg) => {
  const chatId = msg.chat.id;
  const authCheck = requireAdmin(chatId);
  
  if (!authCheck.authorized) {
    return bot.sendMessage(chatId, authCheck.message);
  }
  
  try {
    const response = await fetch(`${API_BASE_URL}/api/stats`);
    const stats = await response.json();
    
    const message = `
📊 **SYSTEM STATISTICS**

📦 **Accounts:**
Total: ${stats.total || 0}
Available: ${stats.available || 0}
Sold: ${stats.sold || 0}

📋 **By Plan:**
FREE: ${stats.byPlan?.free || 0}
PLUS: ${stats.byPlan?.plus || 0}
TEAM: ${stats.byPlan?.team || 0}

⏰ Updated: ${new Date().toLocaleString('vi-VN')}
    `.trim();
    
    bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
  } catch (error) {
    bot.sendMessage(chatId, `❌ Error: ${error.message}`);
  }
});

bot.onText(/\/ratelimits/, (msg) => {
  const chatId = msg.chat.id;
  const authCheck = requireAdmin(chatId);
  
  if (!authCheck.authorized) {
    return bot.sendMessage(chatId, authCheck.message);
  }
  
  let message = '🔒 **RATE LIMIT STATUS**\n\n';
  
  if (rateLimits.size === 0) {
    message += 'No users tracked yet.';
  } else {
    rateLimits.forEach((data, userId) => {
      const status = data.banned ? '🚫 BANNED' : '✅ OK';
      const requests = data.requests.length;
      message += `User ${userId}: ${status} (${requests} requests)\n`;
    });
  }
  
  bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
});

bot.onText(/\/ban (.+)/, (msg, match) => {
  const chatId = msg.chat.id;
  const authCheck = requireAdmin(chatId);
  
  if (!authCheck.authorized) {
    return bot.sendMessage(chatId, authCheck.message);
  }
  
  const targetUserId = match[1].trim();
  
  if (!rateLimits.has(targetUserId)) {
    rateLimits.set(targetUserId, { requests: [], banned: false, bannedUntil: 0 });
  }
  
  const userLimit = rateLimits.get(targetUserId);
  userLimit.banned = true;
  userLimit.bannedUntil = Date.now() + (24 * 60 * 60 * 1000); // 24 hours
  
  bot.sendMessage(chatId, `✅ User ${targetUserId} has been banned for 24 hours.`);
  console.log(`🚫 Admin ${chatId} banned user ${targetUserId}`);
});

bot.onText(/\/unban (.+)/, (msg, match) => {
  const chatId = msg.chat.id;
  const authCheck = requireAdmin(chatId);
  
  if (!authCheck.authorized) {
    return bot.sendMessage(chatId, authCheck.message);
  }
  
  const targetUserId = match[1].trim();
  
  if (rateLimits.has(targetUserId)) {
    const userLimit = rateLimits.get(targetUserId);
    userLimit.banned = false;
    userLimit.bannedUntil = 0;
    userLimit.requests = [];
    
    bot.sendMessage(chatId, `✅ User ${targetUserId} has been unbanned.`);
    console.log(`✅ Admin ${chatId} unbanned user ${targetUserId}`);
  } else {
    bot.sendMessage(chatId, `⚠️ User ${targetUserId} not found in rate limit tracking.`);
  }
});

bot.onText(/\/maintenance(?:\s+(.+))?/, async (msg, match) => {
  const chatId = msg.chat.id;
  const authCheck = requireAdmin(chatId);
  
  if (!authCheck.authorized) {
    return bot.sendMessage(chatId, authCheck.message);
  }
  
  try {
    // Get current status
    const statusResponse = await fetch(`${API_BASE_URL}/api/maintenance`);
    const statusData = await statusResponse.json();
    
    if (!match[1]) {
      // Just show current status
      const status = statusData.maintenance.enabled ? '🔴 ĐANG BẢO TRÌ' : '🟢 HOẠT ĐỘNG';
      bot.sendMessage(chatId, 
        `🔧 **TRẠNG THÁI HỆ THỐNG**\n\n` +
        `Status: ${status}\n` +
        `Message: ${statusData.maintenance.message}\n\n` +
        `Để bật/tắt: /maintenance on|off [message]`,
        { parse_mode: 'Markdown' }
      );
      return;
    }
    
    const args = match[1].trim().split(' ');
    const action = args[0].toLowerCase();
    const customMessage = args.slice(1).join(' ');
    
    if (action !== 'on' && action !== 'off') {
      return bot.sendMessage(chatId, '❌ Usage: /maintenance on|off [custom message]');
    }
    
    const enabled = action === 'on';
    const payload = {
      enabled,
      message: customMessage || 'Hệ thống đang bảo trì. Vui lòng quay lại sau!'
    };
    
    const response = await fetch(`${API_BASE_URL}/api/maintenance`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SEPAY_API_KEY}`
      },
      body: JSON.stringify(payload)
    });
    
    const result = await response.json();
    
    if (result.success) {
      const status = enabled ? '🔴 BẬT' : '🟢 TẮT';
      bot.sendMessage(chatId, 
        `✅ **CẬP NHẬT BẢO TRÌ**\n\n` +
        `Trạng thái: ${status}\n` +
        `Thông báo: ${result.maintenance.message}`,
        { parse_mode: 'Markdown' }
      );
      
      console.log(`🔧 Admin ${chatId} ${enabled ? 'enabled' : 'disabled'} maintenance mode`);
    } else {
      bot.sendMessage(chatId, `❌ Error: ${result.error}`);
    }
    
  } catch (error) {
    console.error('Maintenance error:', error);
    bot.sendMessage(chatId, `❌ Error: ${error.message}`);
  }
});

bot.onText(/\/gift (\d+) (\d+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const authCheck = requireAdmin(chatId);
  
  if (!authCheck.authorized) {
    return bot.sendMessage(chatId, authCheck.message);
  }
  
  const targetChatId = match[1].trim();
  const amount = parseInt(match[2]);
  
  if (!amount || amount <= 0) {
    return bot.sendMessage(chatId, '❌ Usage: /gift <chatId> <amount>\nExample: /gift 6726648486 100000');
  }
  
  try {
    // Add money to user's wallet
    const response = await fetch(`${API_BASE_URL}/api/wallet/deposit`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SEPAY_API_KEY}`
      },
      body: JSON.stringify({
        telegram_chat_id: targetChatId,
        amount: amount
      })
    });
    
    const result = await response.json();
    
    if (result.success) {
      const formattedAmount = amount.toLocaleString('vi-VN');
      const formattedBalance = result.wallet.balance.toLocaleString('vi-VN');
      
      // Notify admin
      bot.sendMessage(chatId, 
        `✅ **GIFT SUCCESSFUL**\n\n` +
        `👤 User: ${targetChatId}\n` +
        `💰 Amount: ${formattedAmount} VNĐ\n` +
        `💳 New Balance: ${formattedBalance} VNĐ`,
        { parse_mode: 'Markdown' }
      );
      
      // Notify user
      try {
        await bot.sendMessage(targetChatId, 
          `🎁 **QUẢN TRỊ VIÊN TẶNG TIỀN**\n\n` +
          `Bạn đã nhận được ${formattedAmount} VNĐ từ quản trị viên!\n\n` +
          `💳 Số dư hiện tại: ${formattedBalance} VNĐ\n\n` +
          `Cảm ơn bạn đã sử dụng dịch vụ! 🎉`,
          { parse_mode: 'Markdown' }
        );
      } catch (error) {
        console.error(`Failed to notify user ${targetChatId}:`, error.message);
      }
      
      console.log(`🎁 Admin ${chatId} gifted ${amount} to user ${targetChatId}`);
    } else {
      bot.sendMessage(chatId, `❌ Error: ${result.message || 'Failed to gift money'}`);
    }
    
  } catch (error) {
    console.error('Gift error:', error);
    bot.sendMessage(chatId, `❌ Error: ${error.message}`);
  }
});

bot.onText(/\/broadcast (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const authCheck = requireAdmin(chatId);
  
  if (!authCheck.authorized) {
    return bot.sendMessage(chatId, authCheck.message);
  }
  
  const message = match[1].trim();
  
  if (!message) {
    return bot.sendMessage(chatId, '❌ Usage: /broadcast <message>');
  }
  
  try {
    // Get all users from database
    const response = await fetch(`${API_BASE_URL}/api/users`);
    const data = await response.json();
    
    if (!data.users || data.users.length === 0) {
      return bot.sendMessage(chatId, '⚠️ No users found in database.');
    }
    
    // Send broadcast message
    let successCount = 0;
    let failCount = 0;
    
    const broadcastMessage = `
📢 **THÔNG BÁO HỆ THỐNG**

${message}

---
_Tin nhắn từ Admin_
    `.trim();
    
    for (const user of data.users) {
      try {
        await bot.sendMessage(user.telegram_chat_id, broadcastMessage, { parse_mode: 'Markdown' });
        successCount++;
        await new Promise(resolve => setTimeout(resolve, 100)); // Delay to avoid rate limit
      } catch (error) {
        console.error(`Failed to send to ${user.telegram_chat_id}:`, error.message);
        failCount++;
      }
    }
    
    bot.sendMessage(chatId, 
      `✅ Broadcast completed!\n\n` +
      `📤 Sent: ${successCount}\n` +
      `❌ Failed: ${failCount}\n` +
      `📊 Total users: ${data.users.length}`
    );
    
    console.log(`📢 Admin ${chatId} broadcasted to ${successCount}/${data.users.length} users`);
    
  } catch (error) {
    console.error('Broadcast error:', error);
    bot.sendMessage(chatId, `❌ Error: ${error.message}`);
  }
});

// Handle button clicks
bot.on('message', (msg) => {
  if (!msg.text) return;
  
  const chatId = msg.chat.id;
  const text = msg.text;
  
  // Check rate limit for button clicks
  const rateCheck = checkRateLimit(chatId);
  if (!rateCheck.allowed) {
    return bot.sendMessage(chatId, rateCheck.reason);
  }
  
  switch(text) {
    case '🆓 Mua FREE':
      bot.sendMessage(chatId, '/muafree');
      break;
    case '⭐ Mua PLUS':
      bot.sendMessage(chatId, '/muaplus');
      break;
    case '👥 Mua TEAM':
      bot.sendMessage(chatId, '/muateam');
      break;
    case '👑 Admin Panel':
      if (isAdmin(chatId)) {
        bot.sendMessage(chatId, '/admin');
      }
      break;
    case '💰 Số Dư':
      bot.sendMessage(chatId, '/balance');
      break;
    case '💳 Nạp Tiền':
      bot.sendMessage(chatId, '/naptien');
      break;
    case '📋 Bảng giá':
      showPriceList(chatId);
      break;
    case '❓ Hướng dẫn':
      showHelp(chatId);
      break;
  }
});

// Wallet Commands
bot.onText(/\/balance/, async (msg) => {
  const chatId = msg.chat.id;
  
  // Check maintenance mode
  if (await checkMaintenance(chatId)) return;
  
  // Check rate limit
  const rateCheck = checkRateLimit(chatId);
  if (!rateCheck.allowed) {
    return bot.sendMessage(chatId, rateCheck.reason);
  }
  
  try {
    const response = await fetch(`${API_BASE_URL}/api/wallet/${chatId}`);
    const data = await response.json();
    
    if (data.success) {
      const message = `
💰 **SỐ DƯ VÍ**

💳 **Số dư hiện tại:** ${data.wallet.balance.toLocaleString('vi-VN')} VNĐ

📊 **Thống kê:**
• Tổng chi tiêu: ${data.user.total_spent.toLocaleString('vi-VN')} VNĐ
• Tổng đơn hàng: ${data.user.total_purchases}

📝 **Lịch sử gần đây:**
${data.recent_transactions.slice(0, 5).map(tx => {
  const icon = tx.type === 'deposit' ? '💰' : '💸';
  const sign = tx.type === 'deposit' ? '+' : '';
  return `${icon} ${sign}${tx.amount.toLocaleString('vi-VN')} VNĐ - ${new Date(tx.created_at).toLocaleDateString('vi-VN')}`;
}).join('\n') || 'Chưa có giao dịch'}

💡 **Sử dụng:**
• /naptien - Nạp tiền vào ví
• /muaplus - Mua account bằng số dư
      `.trim();
      
      bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
    } else {
      bot.sendMessage(chatId, '❌ Không thể lấy thông tin ví. Vui lòng thử lại.');
    }
  } catch (error) {
    bot.sendMessage(chatId, '❌ Lỗi kết nối. Vui lòng thử lại sau.');
  }
});

bot.onText(/\/naptien(?:\s+(\d+))?/, async (msg, match) => {
  const chatId = msg.chat.id;
  
  // Check maintenance mode
  if (await checkMaintenance(chatId)) return;
  
  const userId = msg.from.id;
  const code = `NAP${userId}`;
  
  // Parse amount from command (optional)
  const inputAmount = match[1] ? parseInt(match[1]) : 0;
  const amount = inputAmount > 0 ? inputAmount : 0; // 0 = user tự nhập
  
  console.log('💰 Deposit amount:', amount, '(0 = user enters manually)');
  
  // Call SePay QR API
  try {
    console.log('🔄 Calling SePay QR API for deposit...');
    const qrResponse = await fetch(SEPAY_QR_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SEPAY_API_KEY}`
      },
      body: JSON.stringify({
        account_number: SEPAY_ACCOUNT_NUMBER,
        amount: amount,
        content: code
      })
    });

    console.log('📡 SePay Deposit Response Status:', qrResponse.status);
    const responseText = await qrResponse.text();
    console.log('📄 SePay Deposit Response Body:', responseText);
    
    let qrData;
    try {
      qrData = JSON.parse(responseText);
    } catch (e) {
      console.error('❌ Failed to parse JSON:', e.message);
      throw new Error('Invalid JSON from SePay');
    }
    
    if (qrData.status !== 200 || !qrData.data || !qrData.data.qr) {
      throw new Error('SePay QR API failed: ' + JSON.stringify(qrData));
    }
    
    const qrImageUrl = qrData.data.qr;
    console.log('✅ QR URL:', qrImageUrl);
    
    const message = `
╔═══════════════════════════╗
║     💰 NẠP TIỀN VÀO VÍ    ║
╚═══════════════════════════╝

📱 **Quét QR Code để nạp:**
👇 Dùng app ngân hàng quét mã dưới đây

⚠️ Hoặc chuyển khoản thủ công:

┌─ 🏦 THÔNG TIN CK ─┐
│ Ngân hàng: **${BANK_INFO.bank}**
│ STK: \`${BANK_INFO.account}\`
│ Tên: ${BANK_INFO.name}
│ Nội dung: \`${code}\`
└────────────────────┘

📝 **Lưu ý:**
${amount > 0 ? `• Số tiền: **${amount.toLocaleString('vi-VN')} VNĐ**\n` : '• Nạp bao nhiêu cũng được (min 1,000 VNĐ)\n'}• Số dư được cộng TỰ ĐỘNG sau 1-2 phút
• Số dư không hết hạn, bảo toàn mãi mãi
• Dùng số dư để mua account không cần CK mỗi lần

💡 **Cách dùng:**
\`/naptien\` - Nạp bất kỳ số tiền
\`/naptien 50000\` - Nạp 50k VNĐ (QR có sẵn số tiền)

🔍 Kiểm tra số dư: /balance
    `.trim();
    
    // Gửi QR code từ SePay
    await bot.sendPhoto(chatId, qrImageUrl, {
      caption: amount > 0 
        ? `📱 Quét QR nạp ${amount.toLocaleString('vi-VN')} VNĐ` 
        : '📱 Quét QR để nạp tiền (nhập số tiền sau)',
      parse_mode: 'Markdown'
    });
    
    // Gửi text message
    bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
    
  } catch (error) {
    console.error('❌ SePay deposit QR error:', error.message);
    
    // Fallback: Use VietQR.io API for deposit
    try {
      console.log('🔄 Fallback to VietQR.io API for deposit...');
      console.log('💰 Deposit amount for QR:', amount);
      // VietQR.io format - include amount if specified
      let qrImageUrl;
      if (amount > 0) {
        qrImageUrl = `https://img.vietqr.io/image/970422-${BANK_INFO.account}-compact2.jpg?amount=${amount}&addInfo=${encodeURIComponent(code)}&accountName=${encodeURIComponent(BANK_INFO.name)}`;
      } else {
        qrImageUrl = `https://img.vietqr.io/image/970422-${BANK_INFO.account}-compact2.jpg?addInfo=${encodeURIComponent(code)}&accountName=${encodeURIComponent(BANK_INFO.name)}`;
      }
      
      console.log('✅ VietQR Deposit URL:', qrImageUrl);
      
      await bot.sendPhoto(chatId, qrImageUrl, {
        caption: amount > 0 
          ? `📱 Quét QR nạp ${amount.toLocaleString('vi-VN')} VNĐ` 
          : '📱 Quét QR để nạp tiền (nhập số tiền sau)',
        parse_mode: 'Markdown'
      });
      
      const message = `
╔═══════════════════════════╗
║     💰 NẠP TIỀN VÀO VÍ    ║
╚═══════════════════════════╝

📱 **Quét QR Code để nạp:**
👇 Dùng app ngân hàng quét mã trên

┌─ 🏦 THÔNG TIN CK ─┐
│ Ngân hàng: **${BANK_INFO.bank}**
│ STK: \`${BANK_INFO.account}\`
│ Tên: ${BANK_INFO.name}
│ Nội dung: \`${code}\`
└────────────────────┘

📝 **Lưu ý:**
• Nạp bao nhiêu cũng được (min 1,000 VNĐ)
• Số dư được cộng TỰ ĐỘNG sau 1-2 phút

🔍 Kiểm tra số dư: /balance
    `.trim();
      
      bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
      return;
    } catch (qrError) {
      console.error('❌ VietQR generation also failed:', qrError);
    }
    
    // Last resort: Text only
    const message = `
╔═══════════════════════════╗
║     💰 NẠP TIỀN VÀO VÍ    ║
╚═══════════════════════════╝

┌─ 🏦 CHUYỂN KHOẢN ĐẾN ─┐
│ Ngân hàng: **${BANK_INFO.bank}**
│ STK: \`${BANK_INFO.account}\`
│ Tên: ${BANK_INFO.name}
└─────────────────────────┘

⚠️ **Nội dung:** \`${code}\`

📝 Nạp bao nhiêu cũng được (min 1k)
⚡ Tự động cộng sau 1-2 phút
🔍 Kiểm tra: /balance
    `.trim();
    
    bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
  }
});

function showPriceList(chatId) {
  const message = `
📋 **BẢNG GIÁ SẢN PHẨM**

🆓 **FREE Account**
   • Giá: MIỄN PHÍ
   • Giới hạn: 3 tin/giờ
   • GPT-3.5
   
⭐ **PLUS Account** 
   • Giá: 50,000 VNĐ
   • Không giới hạn
   • GPT-4, GPT-4o
   • Tạo ảnh DALL-E
   
👥 **TEAM Account**
   • Giá: 100,000 VNĐ
   • Không giới hạn
   • GPT-4, GPT-4o
   • Workspace sharing
   
💡 Tất cả account có **2FA bảo mật**!

💰 **Hai cách thanh toán:**
1️⃣ Chuyển khoản trực tiếp (PLUS123456)
2️⃣ Dùng số dư trong ví (/naptien → /balance)

Gửi /muaplus hoặc /muateam để mua!
  `.trim();
  
  bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
}

function showHelp(chatId) {
  const message = `
❓ **HƯỚNG DẪN SỬ DỤNG**

**🛒 Cách 1: Mua trực tiếp**
1. Gửi /muaplus hoặc /muateam
2. Chuyển khoản với mã PLUS123456
3. Nhận tài khoản TỰ ĐỘNG sau 1-2 phút

**💰 Cách 2: Dùng ví (Khuyên dùng!)**
1. Nạp tiền: /naptien
   → Chuyển khoản với mã NAP123456
   → Số dư tự động cộng vào ví
2. Kiểm tra: /balance
3. Mua hàng: /muaplus
   → Tự động trừ từ số dư ví
   → Nhận tài khoản ngay lập tức!

**💡 Ưu điểm của Ví:**
✅ Không cần chuyển khoản mỗi lần
✅ Mua hàng nhanh hơn (1-2 giây)
✅ Số dư không hết hạn
✅ Dễ quản lý chi tiêu

**📝 Commands:**
/balance - Xem số dư
/naptien - Nạp tiền
/muaplus - Mua PLUS
/muateam - Mua TEAM

📞 Hỗ trợ: @your_admin_username
  `.trim();
  
  bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
}

bot.on('polling_error', (error) => {
  console.error('Polling error:', error);
});

process.on('SIGINT', () => {
  bot.stopPolling();
  process.exit(0);
});

console.log('✅ Customer bot ready!');
console.log('📱 Start: https://t.me/gpt_ser_bot');
