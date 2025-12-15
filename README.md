# 🚀 ChatGPT Auto Shop - Complete System

Backend API + Telegram Bot + SePay Webhook - Hệ thống bán tài khoản ChatGPT tự động.

## ✨ Tính Năng

- 🤖 **Telegram Bot** - Customer tự đăng ký & mua hàng
- 💰 **SePay Webhook** - Tự động nhận thanh toán qua ngân hàng
- 📦 **Auto Delivery** - Giao tài khoản tự động sau khi thanh toán
- 🗄️ **MongoDB** - Quản lý inventory accounts
- 🔐 **Security** - API key authentication, payment verification
- 📊 **Admin Panel** - Nhận thông báo mỗi khi bán hàng

## 🚀 Quick Start

### 1. Cài Đặt
```bash
npm install
```

### 2. Cấu Hình .env
```env
MONGODB_URI=mongodb+srv://...
TELEGRAM_BOT_TOKEN=8042999597:AAEe...
ADMIN_TELEGRAM_CHAT_ID=5787980050
SEPAY_API_KEY=sk_sepay_chatgpt_2024
PORT=3000
```

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
Verify payment → Find account (plan=plus)
    ↓
Update sold_status → Send to Telegram
    ↓
Customer nhận tài khoản tự động
```

## 📋 API Endpoints

### Webhook
- `POST /webhook/payment` - SePay webhook (requires API key)

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
