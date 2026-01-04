# 🚀 ChatGPT Auto Shop - Complete System

Backend API + Telegram Bot + SePay Webhook - Hệ thống bán tài khoản ChatGPT tự động.

## ✨ Tính Năng

- 🤖 **Telegram Bot** - Customer tự đăng ký & mua hàng
- 💰 **SePay Webhook** - Tự động nhận thanh toán qua ngân hàng
- 📦 **Auto Delivery** - Giao tài khoản tự động sau khi thanh toán
- 🗄️ **MongoDB** - Quản lý inventory accounts
- 🔐 **Security** - API key authentication, payment verification
- 📊 **Admin Panel** - Nhận thông báo mỗi khi bán hàng
- 🔌 **Extension Integration** - Nhận accounts từ Chrome extension

## 🏗️ Kiến Trúc Hệ Thống

```
gpt-extension (Chrome Extension)
    ↓ POST /api/accounts
gpt-be Backend (DigitalOcean)
    ↓ MongoDB: gpt-reg-account.accounts
Telegram Bot (@gpt_ser_bot)
    ↓ GET /api/accounts/available
Customer mua hàng
    ↓ Chuyển khoản ngân hàng
SePay Webhook
    ↓ POST /webhook/payment
Auto Delivery (Telegram)
```

## 🚀 Quick Start

### 1. Cài Đặt
```bash
npm install
```

### 2. Cấu Hình .env
```env
PORT=3000
DB_NAME=gpt-reg-account
COLLECTION_NAME=accounts
TELEGRAM_BOT_TOKEN=8042999597:AAEe...
ADMIN_TELEGRAM_CHAT_ID=5787980050
SEPAY_API_KEY=sk_sepay_chatgpt_2024
SEPAY_ACCOUNT_NUMBER=999906052003
```

**MongoDB Collections:**
- `accounts` - ChatGPT accounts inventory
- `users` - Telegram bot users
- `wallets` - User wallet balances
- `transactions` - Payment history

### 3. Kiểm Tra Hệ Thống
```bash
npm run test-system
```

### 4. Chạy Tất Cả
```bash
# Windows
start-all.bat

# Hoặc chạy từng service:
npm start              # Backend
npm run customer-bot   # Telegram Bot
ngrok http 3000        # Tunnel
```

## 📖 Hướng Dẫn Sử Dụng

### Cho Customer
1. Mở Telegram → `@gpt_ser_bot`
2. Gửi `/start` → Chọn gói cần mua
3. Chuyển khoản theo hướng dẫn (nội dung: PLUS + Chat ID)
4. Nhận tài khoản TỰ ĐỘNG sau 1-2 phút

### Cho Admin
```bash
# Monitor logs
npm start

# Kiểm tra inventory
npm run test-system

# Cập nhật plan
npm run update-plan
```

## 🔧 Scripts

| Command | Mô Tả |
|---------|-------|
| `npm start` | Chạy backend server |
| `npm run customer-bot` | Chạy Telegram bot |
| `npm run test-system` | Test toàn bộ hệ thống |
| `npm run update-plan` | Cập nhật account plan |
| `start-all.bat` | Chạy tất cả services (Windows) |
| `check-system.bat` | Kiểm tra cấu hình |

## 📁 Files Quan Trọng

- `server.js` - Backend API + Webhook
- `customer-bot.js` - Telegram bot cho customers
- `payment-config.json` - Cấu hình payment rules
- `test-system.js` - Script test hệ thống
- `.env` - Environment variables

## 🔐 Payment Flow

```
Customer chuyển khoản (PLUS123456)
    ↓
SePay webhook → Backend
    ↓
Verify payment → Find account (plan=plus, sold_status='available')
    ↓
Update sold_status='sold', sold_to=chatId, sold_at=Date
    ↓
Send to Telegram: "Email: xxx\nPassword: yyy\n2FA: zzz"
    ↓
Notify Admin: "Đã bán 1 account PLUS cho @username"
    ↓
Customer nhận tài khoản tự động
```

## 📦 Extension Integration Flow

```
User dùng gpt-extension (Chrome)
    ↓
Auto đăng ký ChatGPT + Enable 2FA
    ↓
Extension POST đến: https://orca-app-an2z8.ondigitalocean.app/api/accounts
    ↓
gpt-be server.js nhận request
    ↓
Validate: email, password required
    ↓
Create document với sold_status = 'available'
    ↓
Insert vào MongoDB: gpt-reg-account.accounts
    ↓
Response: { success: true, data: { id: ObjectId } }
    ↓
Account sẵn sàng để bán qua Telegram bot
`````javascript
  Body: {
    email, password, secret_key_2fa,
    plan_type, account_id, organization_id, user_id,
    access_token, session_data
  }
  Response: { success: true, data: { id, ... } }
  ```
- `POST /api/accounts/update-session` - Update session info
- `GET /api/accounts` - Get all accounts
- `GET /api/accounts/available` - Get available accounts (sold_status = 'available')
- `GET /api/accounts/available?plan_type=plus` - Filter by plan
- `POST /api/accounts/:id/sell` - Mark as sold

### Admin
- `GET /api/check-bot` - Check Telegram bot status
- `POST /api/test-notification` - Test notification
- `POST /api/maintenance` - Enable/disable maintenance mode
- `GET /api/maintenance` - Check maintenance status

### Account Document Structure
```javascript
{
  email: "string",
## 🐛 Troubleshooting

**Lỗi: No available accounts**
```bash
# Kiểm tra inventory
npm run test-system

# Cập nhật plan của account
npm run update-plan

# Check MongoDB
# sold_status phải là 'available', không phải 'sold'
```
## 📚 Related Projects

- **gpt-extension** - Chrome extension auto register ChatGPT + 2FA
  - POST accounts to this backend (`/api/accounts`)
  - Repository: `c:\Users\DAT\code\gpt-extension`
  
- **gpt-slot-manager** - Monitor ChatGPT teams & session tracking
  - Track 401 expired sessions
  - Admin dashboard
  - Repository: `c:\Users\DAT\code\gpt-managerment\gpt-slot-manager`
  
- **gpt-session** - Auto-refresh expired ChatGPT sessions
  - Playwright automation
  - Batch token refresh
  - Repository: `c:\Users\DAT\code\gpt-session`

## 📚 Documentation

- `CUSTOMER_BOT_GUIDE.md` - Hướng dẫn chi tiết customer bot
- `ADMIN_GUIDE.md` - Hướng dẫn quản trị hệ thống
- `WEBHOOK_SETUP.md` - Hướng dẫn setup SePay webhook
- `WALLET_SYSTEM.md` - Hướng dẫn hệ thống ví
- `QR_CODE_SYSTEM.md` - Hướng dẫn QR payment
- `SECURITY.md` - Hướng dẫn bảo mật
curl https://orca-app-an2z8.ondigitalocean.app/

# Check MongoDB connection
npm start  # Xem log "✅ Connected to MongoDB"

# Test endpoint
curl -X POST https://orca-app-an2z8.ondigitalocean.app/api/accounts \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"test123"}'
```

**Lỗi: User không nhận message**
- User phải /start bot trước khi mua
- Check TELEGRAM_BOT_TOKEN trong .env
- Verify bot qua: `GET /api/check-bot`

**Lỗi: Payment not verified**
- Check nội dung CK phải có: PLUS/TEAM/FREE + Chat ID
- Verify SEPAY_API_KEY trong .env
- Check SEPAY_ACCOUNT_NUMBER đúng tài khoản
  sold_at: Date,
  created_at: Date
}
```
### Accounts
- `GET /api/accounts` - Get all accounts
- `GET /api/accounts/available` - Get available accounts
- `POST /api/accounts` - Create account
- `POST /api/accounts/:id/sell` - Mark as sold

### Admin
- `GET /api/check-bot` - Check Telegram bot status
- `POST /api/test-notification` - Test notification

## 🐛 Troubleshooting

**Lỗi: No available accounts**
```bash
npm run update-plan  # Cập nhật plan của account
```

**Lỗi: User không nhận message**
- User phải /start bot trước

**Lỗi: Payment not verified**
- Check nội dung CK phải có: PLUS/TEAM/FREE + số

## 📚 Documentation

- `CUSTOMER_BOT_GUIDE.md` - Hướng dẫn chi tiết customer bot
- `WEBHOOK_SETUP.md` - Hướng dẫn setup SePay webhook

## 🎯 Bảng Giá

| Gói | Giá | User Code Format |
|-----|-----|------------------|
| 🆓 FREE | 0đ | FREE123456 |
| ⭐ PLUS | 50,000đ | PLUS123456 |
| 👥 TEAM | 100,000đ | TEAM123456 |

## 📞 Support

- Telegram: @your_admin_username
- Email: your-email@example.com

## 📄 License

MIT License

---

**Made with ❤️ for ChatGPT Auto Shop**

| Command | Description |
|---------|-------------|
| `/start` | Welcome message and command list |
| `/help` | Detailed usage instructions |
| `/stats` | View account statistics |
| `/list` | List all available accounts |
| `/list_free` | Filter Free plan accounts |
| `/list_plus` | Filter Plus plan accounts |
| `/account [id]` | View account details |
| `/sell [id] [buyer] [price] [payment]` | Mark account as sold (Admin) |

**Example Usage:**
```
/stats
/list
/account 67abc123def456
/sell 67abc123def456 NguyenVanA 50000 momo
```

**Features:**
- 📊 Real-time statistics
- 📦 Account listing with filters
- 📋 Copy-friendly format (email|password|2fa)
- 💰 Sales tracking with buyer info
- 🔍 Search by account ID
- 🇻🇳 Vietnamese language support
