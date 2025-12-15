const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const { MongoClient } = require('mongodb');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// ============ MAINTENANCE MODE ============
let maintenanceMode = false;
let maintenanceMessage = 'Hệ thống đang bảo trì. Vui lòng quay lại sau!';

const maintenanceMiddleware = (req, res, next) => {
    // Skip maintenance check for admin endpoints and health check
    if (req.path === '/' || req.path === '/api/maintenance' || req.path.startsWith('/api/admin')) {
        return next();
    }
    
    if (maintenanceMode) {
        return res.status(503).json({
            success: false,
            error: 'Service Unavailable',
            message: maintenanceMessage,
            maintenance: true
        });
    }
    
    next();
};

// ============ RATE LIMITING MIDDLEWARE ============
const requestCounts = new Map(); // IP -> { count, resetTime }
const RATE_LIMIT_WINDOW = 60000; // 1 minute
const MAX_REQUESTS = 60; // 60 requests per minute per IP

const rateLimiter = (req, res, next) => {
    const ip = req.ip || req.connection.remoteAddress;
    const now = Date.now();
    
    if (!requestCounts.has(ip)) {
        requestCounts.set(ip, { count: 1, resetTime: now + RATE_LIMIT_WINDOW });
        return next();
    }
    
    const record = requestCounts.get(ip);
    
    if (now > record.resetTime) {
        // Reset counter
        record.count = 1;
        record.resetTime = now + RATE_LIMIT_WINDOW;
        return next();
    }
    
    if (record.count >= MAX_REQUESTS) {
        const retryAfter = Math.ceil((record.resetTime - now) / 1000);
        res.set('Retry-After', retryAfter);
        return res.status(429).json({
            error: 'Too many requests',
            message: `Rate limit exceeded. Try again in ${retryAfter} seconds.`,
            retryAfter
        });
    }
    
    record.count++;
    next();
};

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(maintenanceMiddleware); // Check maintenance mode
app.use(rateLimiter); // Apply rate limiting to all routes

// MongoDB client
const mongoClient = new MongoClient(process.env.MONGODB_URI);
let db;
let accountsCollection;
let usersCollection;
let walletsCollection;
let transactionsCollection;

// Connect to MongoDB
async function connectDB() {
    try {
        await mongoClient.connect();
        console.log('✅ Connected to MongoDB');
        db = mongoClient.db(process.env.DB_NAME || 'gpt_extension');
        accountsCollection = db.collection(process.env.COLLECTION_NAME || 'accounts');
        usersCollection = db.collection('users');
        walletsCollection = db.collection('wallets');
        transactionsCollection = db.collection('transactions');
        
        // Create indexes
        await usersCollection.createIndex({ telegram_chat_id: 1 }, { unique: true });
        await walletsCollection.createIndex({ user_id: 1 });
        await transactionsCollection.createIndex({ user_id: 1, created_at: -1 });
        
        console.log('✅ Collections initialized');
    } catch (error) {
        console.error('❌ MongoDB connection error:', error);
        process.exit(1);
    }
}

// Maintenance mode control (Admin only)
app.post('/api/maintenance', async (req, res) => {
    try {
        const authHeader = req.headers['authorization'] || '';
        const apiKey = authHeader.replace('Apikey ', '').replace('Bearer ', '').trim();
        
        if (!process.env.SEPAY_API_KEY || apiKey !== process.env.SEPAY_API_KEY) {
            return res.status(401).json({ success: false, error: 'Unauthorized' });
        }
        
        const { enabled, message } = req.body;
        
        if (typeof enabled === 'boolean') {
            maintenanceMode = enabled;
            if (message) {
                maintenanceMessage = message;
            }
            
            console.log(`🔧 Maintenance mode: ${enabled ? 'ENABLED' : 'DISABLED'}`);
            if (enabled) {
                console.log(`📝 Message: ${maintenanceMessage}`);
            }
            
            return res.json({
                success: true,
                maintenance: {
                    enabled: maintenanceMode,
                    message: maintenanceMessage
                }
            });
        }
        
        res.status(400).json({ success: false, error: 'Invalid request' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.get('/api/maintenance', (req, res) => {
    res.json({
        success: true,
        maintenance: {
            enabled: maintenanceMode,
            message: maintenanceMessage
        }
    });
});

// Health check
app.get('/', (req, res) => {
    res.json({ 
        status: 'ok', 
        message: 'GPT Backend API is running',
        maintenance: maintenanceMode,
        db: db ? 'connected' : 'disconnected'
    });
});

// Check Telegram Bot
app.get('/api/check-bot', async (req, res) => {
    try {
        const botToken = process.env.TELEGRAM_BOT_TOKEN;
        const chatId = process.env.ADMIN_TELEGRAM_CHAT_ID;
        
        if (!botToken) {
            return res.json({
                success: false,
                error: 'TELEGRAM_BOT_TOKEN not configured'
            });
        }
        
        // Get bot info
        const botInfoResponse = await fetch(`https://api.telegram.org/bot${botToken}/getMe`);
        const botInfo = await botInfoResponse.json();
        
        if (!botInfo.ok) {
            return res.json({
                success: false,
                error: 'Invalid bot token',
                details: botInfo
            });
        }
        
        // Get updates with offset to get latest messages
        const updatesResponse = await fetch(`https://api.telegram.org/bot${botToken}/getUpdates?offset=-1&limit=100`);
        const updates = await updatesResponse.json();
        
        // Extract all unique chat IDs from messages
        const chatIds = [];
        if (updates.result && updates.result.length > 0) {
            updates.result.forEach(update => {
                if (update.message?.chat?.id) {
                    const id = update.message.chat.id;
                    if (!chatIds.find(c => c.id === id)) {
                        chatIds.push({
                            id: id,
                            type: update.message.chat.type,
                            username: update.message.chat.username,
                            first_name: update.message.chat.first_name,
                            last_message: update.message.text
                        });
                    }
                }
            });
        }
        
        res.json({
            success: true,
            bot: {
                username: botInfo.result.username,
                first_name: botInfo.result.first_name,
                id: botInfo.result.id,
                telegram_link: `https://t.me/${botInfo.result.username}`
            },
            config: {
                chat_id_configured: chatId !== 'your_chat_id_here',
                current_chat_id: chatId
            },
            found_chats: chatIds,
            total_messages: updates.result?.length || 0,
            instructions: chatIds.length > 0 ? {
                found: `✅ Tìm thấy ${chatIds.length} chat(s)`,
                your_chat_id: chatIds[0]?.id,
                action: `Copy ID: ${chatIds[0]?.id} vào .env -> ADMIN_TELEGRAM_CHAT_ID`
            } : {
                step1: `Mở Telegram và tìm: @${botInfo.result.username}`,
                step2: 'Hoặc click: https://t.me/' + botInfo.result.username,
                step3: 'Gửi bất kỳ tin nhắn nào (ví dụ: /start)',
                step4: 'Refresh trang này để lấy chat_id'
            }
        });
        
    } catch (error) {
        res.json({
            success: false,
            error: error.message
        });
    }
});

// Send test notification
app.post('/api/test-notification', async (req, res) => {
    try {
        const botToken = process.env.TELEGRAM_BOT_TOKEN;
        const chatId = process.env.ADMIN_TELEGRAM_CHAT_ID;
        
        if (!botToken || chatId === 'your_chat_id_here') {
            return res.json({
                success: false,
                error: 'Telegram not configured. Please check /api/check-bot first'
            });
        }
        
        const message = `
🧪 **TEST NOTIFICATION**

✅ Backend đang hoạt động
📱 Telegram bot đã kết nối
⏰ ${new Date().toLocaleString('vi-VN')}

Nếu nhận được tin nhắn này, hệ thống đã sẵn sàng!
        `.trim();
        
        const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: chatId,
                text: message,
                parse_mode: 'Markdown'
            })
        });
        
        const result = await response.json();
        
        res.json({
            success: result.ok,
            message: result.ok ? 'Test notification sent!' : 'Failed to send',
            details: result
        });
        
    } catch (error) {
        res.json({
            success: false,
            error: error.message
        });
    }
});

// POST /api/accounts - Save account info
app.post('/api/accounts', async (req, res) => {
    try {
        const {
            email,
            password,
            secret_key_2fa,
            plan_type,
            account_id,
            organization_id,
            user_id,
            access_token,
            session_data
        } = req.body;

        // Validate required fields
        if (!email || !password) {
            return res.status(400).json({
                success: false,
                error: 'Email and password are required'
            });
        }

        // Format account_info as email|password|2fa
        const account_info = `${email}|${password}|${secret_key_2fa || ''}`;

        // Prepare document
        const document = {
            email,
            password,
            secret_key_2fa,
            account_info,
            plan_type,
            account_id,
            organization_id,
            user_id,
            access_token,
            session_data,
            status: '2FA enabled',
            sold_status: 'available', // Mặc định: chưa bán
            created_at: new Date()
        };

        // Insert into MongoDB
        const result = await accountsCollection.insertOne(document);

        console.log('Account saved:', result.insertedId);
        res.json({
            success: true,
            data: {
                id: result.insertedId,
                ...document
            }
        });

    } catch (error) {
        console.error('Server error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// POST /api/accounts/update-session - Update account session (account_id, organization_id, etc.)
app.post('/api/accounts/update-session', async (req, res) => {
    try {
        const { email, account_id, organization_id, access_token, plan_type, mfa_enabled } = req.body;
        
        console.log('[UPDATE-SESSION] Request:', { email, account_id, organization_id, plan_type });
        
        if (!email) {
            return res.status(400).json({
                success: false,
                error: 'Email is required'
            });
        }
        
        // Chuẩn bị data để update/insert
        const updateData = {
            updated_at: new Date()
        };
        
        if (account_id) updateData.account_id = account_id;
        if (organization_id) updateData.organization_id = organization_id;
        if (access_token) updateData.access_token = access_token;
        if (plan_type) updateData.plan_type = plan_type;
        if (mfa_enabled !== undefined) updateData.mfa_enabled = mfa_enabled;
        
        // Upsert: update nếu có, tạo mới nếu chưa có
        const result = await db.collection('accounts').updateOne(
            { email },
            { 
                $set: updateData,
                $setOnInsert: { 
                    email,
                    created_at: new Date(),
                    status: 'session_only',
                    sold_status: 'available'
                }
            },
            { upsert: true }
        );
        
        const action = result.upsertedCount > 0 ? 'Created' : 'Updated';
        console.log(`[UPDATE-SESSION] ${action}:`, result.modifiedCount || result.upsertedCount);
        
        res.json({
            success: true,
            message: `Session ${action.toLowerCase()} successfully`,
            data: {
                email,
                account_id,
                organization_id,
                plan_type,
                mfa_enabled
            }
        });
        
    } catch (error) {
        console.error('[UPDATE-SESSION] Error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// GET /api/accounts - Get all accounts
app.get('/api/accounts', async (req, res) => {
    try {
        const { status, plan_type } = req.query;
        const filter = {};
        
        if (status) {
            filter.sold_status = status;
        }
        if (plan_type) {
            filter.plan_type = plan_type;
        }

        const accounts = await accountsCollection
            .find(filter)
            .sort({ created_at: -1 })
            .toArray();

        res.json({
            success: true,
            count: accounts.length,
            data: accounts
        });

    } catch (error) {
        console.error('Error fetching accounts:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// GET /api/accounts/available - Get available accounts for sale
app.get('/api/accounts/available', async (req, res) => {
    try {
        const { plan_type } = req.query;
        const filter = {
            sold_status: { $ne: 'sold' } // Chưa bán
        };
        
        if (plan_type) {
            filter.plan_type = plan_type;
        }

        const accounts = await accountsCollection
            .find(filter)
            .sort({ created_at: -1 })
            .toArray();

        res.json({
            success: true,
            count: accounts.length,
            data: accounts
        });

    } catch (error) {
        console.error('Error fetching available accounts:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// POST /api/accounts/:id/sell - Mark account as sold
app.post('/api/accounts/:id/sell', async (req, res) => {
    try {
        const { id } = req.params;
        const { buyer_info, price, payment_method } = req.body;

        const { ObjectId } = require('mongodb');
        const result = await accountsCollection.updateOne(
            { _id: new ObjectId(id) },
            {
                $set: {
                    sold_status: 'sold',
                    sold_at: new Date(),
                    buyer_info,
                    price,
                    payment_method
                }
            }
        );

        if (result.matchedCount === 0) {
            return res.status(404).json({
                success: false,
                error: 'Account not found'
            });
        }

        res.json({
            success: true,
            message: 'Account marked as sold'
        });

    } catch (error) {
        console.error('Error marking account as sold:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// GET /api/stats - Get statistics
app.get('/api/stats', async (req, res) => {
    try {
        const total = await accountsCollection.countDocuments({});
        const available = await accountsCollection.countDocuments({ sold_status: { $ne: 'sold' } });
        const sold = await accountsCollection.countDocuments({ sold_status: 'sold' });
        
        const byPlanType = await accountsCollection.aggregate([
            {
                $group: {
                    _id: '$plan_type',
                    count: { $sum: 1 }
                }
            }
        ]).toArray();

        res.json({
            success: true,
            stats: {
                total,
                available,
                sold,
                by_plan_type: byPlanType
            }
        });

    } catch (error) {
        console.error('Error fetching stats:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Get all users (for broadcast)
app.get('/api/users', async (req, res) => {
    try {
        const users = await usersCollection.find({}).toArray();
        
        res.json({
            success: true,
            users: users.map(u => ({
                telegram_chat_id: u.telegram_chat_id,
                created_at: u.created_at,
                total_spent: u.total_spent || 0,
                total_purchases: u.total_purchases || 0
            })),
            count: users.length
        });

    } catch (error) {
        console.error('Error fetching users:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// ============ WALLET & BALANCE MANAGEMENT ============

// Get or create user wallet
async function getOrCreateWallet(telegramChatId) {
    let user = await usersCollection.findOne({ telegram_chat_id: telegramChatId });
    
    if (!user) {
        // Create new user
        user = {
            telegram_chat_id: telegramChatId,
            created_at: new Date(),
            total_spent: 0,
            total_purchases: 0
        };
        const result = await usersCollection.insertOne(user);
        user._id = result.insertedId;
    }
    
    let wallet = await walletsCollection.findOne({ user_id: user._id.toString() });
    
    if (!wallet) {
        // Create new wallet
        wallet = {
            user_id: user._id.toString(),
            telegram_chat_id: telegramChatId,
            balance: 0,
            created_at: new Date(),
            updated_at: new Date()
        };
        await walletsCollection.insertOne(wallet);
    }
    
    return { user, wallet };
}

// API: Get wallet balance
app.get('/api/wallet/:chatId', async (req, res) => {
    try {
        const chatId = req.params.chatId;
        const { user, wallet } = await getOrCreateWallet(chatId);
        
        // Get recent transactions
        const transactions = await transactionsCollection
            .find({ user_id: user._id.toString() })
            .sort({ created_at: -1 })
            .limit(10)
            .toArray();
        
        res.json({
            success: true,
            wallet: {
                balance: wallet.balance,
                telegram_chat_id: wallet.telegram_chat_id,
                created_at: wallet.created_at
            },
            user: {
                total_spent: user.total_spent,
                total_purchases: user.total_purchases
            },
            recent_transactions: transactions
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// API: Add balance (deposit)
app.post('/api/wallet/deposit', async (req, res) => {
    try {
        const { telegram_chat_id, amount, transaction_id, payment_method } = req.body;
        
        if (!telegram_chat_id || !amount) {
            return res.status(400).json({ 
                success: false, 
                error: 'telegram_chat_id and amount required' 
            });
        }
        
        const { user, wallet } = await getOrCreateWallet(telegram_chat_id);
        
        // Add balance
        const newBalance = wallet.balance + amount;
        await walletsCollection.updateOne(
            { user_id: user._id.toString() },
            { 
                $set: { 
                    balance: newBalance,
                    updated_at: new Date()
                }
            }
        );
        
        // Record transaction
        await transactionsCollection.insertOne({
            user_id: user._id.toString(),
            telegram_chat_id,
            type: 'deposit',
            amount,
            balance_before: wallet.balance,
            balance_after: newBalance,
            transaction_id: transaction_id || `DEP_${Date.now()}`,
            payment_method: payment_method || 'bank_transfer',
            status: 'completed',
            created_at: new Date()
        });
        
        console.log(`💰 Deposit: User ${telegram_chat_id} +${amount} VNĐ → Balance: ${newBalance}`);
        
        res.json({
            success: true,
            message: 'Deposit successful',
            wallet: {
                balance: newBalance,
                user_id: user._id.toString()
            },
            new_balance: newBalance
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// API: Deduct balance (purchase)
app.post('/api/wallet/deduct', async (req, res) => {
    try {
        const { telegram_chat_id, amount, plan_type, account_id } = req.body;
        
        if (!telegram_chat_id || !amount) {
            return res.status(400).json({ 
                success: false, 
                error: 'telegram_chat_id and amount required' 
            });
        }
        
        const { user, wallet } = await getOrCreateWallet(telegram_chat_id);
        
        // Check sufficient balance
        if (wallet.balance < amount) {
            return res.status(400).json({
                success: false,
                error: 'Insufficient balance',
                current_balance: wallet.balance,
                required: amount
            });
        }
        
        // Deduct balance
        const newBalance = wallet.balance - amount;
        await walletsCollection.updateOne(
            { user_id: user._id.toString() },
            { 
                $set: { 
                    balance: newBalance,
                    updated_at: new Date()
                }
            }
        );
        
        // Update user stats
        await usersCollection.updateOne(
            { _id: user._id },
            {
                $inc: {
                    total_spent: amount,
                    total_purchases: 1
                }
            }
        );
        
        // Record transaction
        await transactionsCollection.insertOne({
            user_id: user._id.toString(),
            telegram_chat_id,
            type: 'purchase',
            amount: -amount,
            balance_before: wallet.balance,
            balance_after: newBalance,
            plan_type,
            account_id,
            status: 'completed',
            created_at: new Date()
        });
        
        console.log(`💸 Purchase: User ${telegram_chat_id} -${amount} VNĐ → Balance: ${newBalance}`);
        
        res.json({
            success: true,
            message: 'Purchase successful',
            new_balance: newBalance
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Start server
async function startServer() {
    await connectDB();
    app.listen(PORT, () => {
        console.log(`🚀 Server running on http://localhost:${PORT}`);
    });
}

// Webhook endpoint for SePay payment notifications
app.post('/webhook/payment', async (req, res) => {
    try {
        // ============ XÁC THỰC API KEY ============
        const authHeader = req.headers['authorization'] || '';
        const apiKey = authHeader.replace('Apikey ', '').replace('Bearer ', '').trim();
        
        if (process.env.SEPAY_API_KEY && apiKey !== process.env.SEPAY_API_KEY) {
            console.log('❌ Invalid API Key:', apiKey);
            return res.status(401).json({
                success: false,
                error: 'Unauthorized - Invalid API Key'
            });
        }
        console.log('✅ API Key verified');
        // ============================================
        
        console.log('💰 SePay webhook received:', JSON.stringify(req.body, null, 2));
        
        // SePay data format
        const sepayData = req.body;
        
        // Extract transaction info from SePay format
        const content = sepayData.content || sepayData.transferContent || sepayData.description || '';
        const amount = parseInt(sepayData.transferAmount || sepayData.amount || 0);
        const transactionId = sepayData.id || sepayData.transactionId || sepayData.code || '';
        const accountNumber = sepayData.accountNumber || sepayData.bankAccount || '';
        const gateway = sepayData.gateway || 'SePay';
        
        console.log(`📝 Content: "${content}"`);
        console.log(`💵 Amount: ${amount.toLocaleString('vi-VN')} VNĐ`);
        console.log(`🔖 Transaction ID: ${transactionId}`);
        
        // Verify payment
        const verification = verifyPayment(content, amount);
        
        if (verification.valid) {
            console.log('✅ Payment verified:', verification);
            
            // Check if this is a deposit (no user_chat_id means deposit to wallet)
            const isDeposit = verification.suggested_plan === 'deposit' || content.toUpperCase().includes('NAP') || content.toUpperCase().includes('DEPOSIT');
            
            if (isDeposit && verification.user_chat_id) {
                // DEPOSIT TO WALLET
                console.log(`💰 Processing deposit for user ${verification.user_chat_id}`);
                
                const { user, wallet } = await getOrCreateWallet(verification.user_chat_id);
                const newBalance = wallet.balance + amount;
                
                await walletsCollection.updateOne(
                    { user_id: user._id.toString() },
                    { 
                        $set: { 
                            balance: newBalance,
                            updated_at: new Date()
                        }
                    }
                );
                
                await transactionsCollection.insertOne({
                    user_id: user._id.toString(),
                    telegram_chat_id: verification.user_chat_id,
                    type: 'deposit',
                    amount,
                    balance_before: wallet.balance,
                    balance_after: newBalance,
                    transaction_id: transactionId,
                    payment_method: 'sepay_auto',
                    status: 'completed',
                    created_at: new Date(),
                    sepay_data: sepayData
                });
                
                console.log(`✅ Deposited ${amount} VNĐ → Balance: ${newBalance}`);
                
                // Send notification
                try {
                    await sendDepositNotification(verification.user_chat_id, amount, newBalance, transactionId);
                } catch (error) {
                    console.error('⚠️ Telegram notification failed:', error.message);
                }
                
                return res.status(200).json({
                    success: true,
                    message: 'Deposit successful',
                    new_balance: newBalance,
                    amount
                });
            }
            
            // PURCHASE ACCOUNT
            // Get available account based on suggested plan
            const accounts = await accountsCollection
                .find({ 
                    sold_status: 'available',
                    plan_type: verification.suggested_plan 
                })
                .limit(1)
                .toArray();
            
            if (accounts.length > 0) {
                const account = accounts[0];
                
                // Mark as sold
                await accountsCollection.updateOne(
                    { _id: account._id },
                    {
                        $set: {
                            sold_status: 'sold',
                            sold_at: new Date(),
                            buyer_info: `Auto - ${gateway} - ${transactionId}`,
                            buyer_chat_id: verification.user_chat_id,
                            price: amount,
                            payment_method: 'sepay_auto',
                            transaction_id: transactionId,
                            transaction_content: content,
                            sepay_data: sepayData
                        }
                    }
                );
                
                // Update user stats if user_chat_id provided
                if (verification.user_chat_id) {
                    const { user } = await getOrCreateWallet(verification.user_chat_id);
                    await usersCollection.updateOne(
                        { _id: user._id },
                        {
                            $inc: {
                                total_spent: amount,
                                total_purchases: 1
                            }
                        }
                    );
                }
                
                console.log('✅ Account delivered:', account.email);
                console.log('📦 Plan:', account.plan_type);
                
                // Send Telegram notification if bot is configured
                try {
                    await sendTelegramNotification(account, amount, transactionId, content, verification.user_chat_id);
                } catch (error) {
                    console.error('⚠️ Telegram notification failed:', error.message);
                }
                
                // Return success to SePay
                res.status(200).json({
                    success: true,
                    message: 'Payment verified and account delivered',
                    data: {
                        email: account.email,
                        password: account.password,
                        secret_key_2fa: account.secret_key_2fa,
                        plan_type: account.plan_type,
                        format: `${account.email}|${account.password}|${account.secret_key_2fa}`
                    }
                });
            } else {
                console.log('⚠️ No available accounts for plan:', verification.suggested_plan);
                
                // Still return 200 to SePay but indicate no stock
                res.status(200).json({
                    success: false,
                    message: 'Payment verified but no accounts available',
                    plan: verification.suggested_plan
                });
            }
        } else {
            console.log('❌ Payment verification failed:', verification.reasons);
            
            // Return 200 to prevent SePay retry, but indicate failure
            res.status(200).json({
                success: false,
                message: 'Payment verification failed',
                reasons: verification.reasons,
                content: content,
                amount: amount
            });
        }
    } catch (error) {
        console.error('❌ Webhook error:', error);
        // Return 200 even on error to prevent infinite retry
        res.status(200).json({ success: false, error: error.message });
    }
});

// Send Telegram notification for deposit
async function sendDepositNotification(userChatId, amount, newBalance, transactionId) {
    const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
    const ADMIN_CHAT_ID = process.env.ADMIN_TELEGRAM_CHAT_ID;
    
    if (!TELEGRAM_BOT_TOKEN) {
        console.log('⚠️ Telegram not configured, skipping notification');
        return;
    }
    
    const fetch = require('node-fetch');
    
    // Send to admin
    if (ADMIN_CHAT_ID) {
        const adminMessage = `
╔═══════════════════════════╗
║  💰 NẠP TIỀN THÀNH CÔNG  ║
╚═══════════════════════════╝

👤 **User ID:** ${userChatId}
💵 **Số tiền:** ${amount.toLocaleString('vi-VN')} VNĐ
💰 **Số dư mới:** ${newBalance.toLocaleString('vi-VN')} VNĐ
🔖 **Mã GD:** \`${transactionId}\`
⏰ **Thời gian:** ${new Date().toLocaleString('vi-VN')}

✅ Đã cộng vào ví tự động
        `.trim();
        
        const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
        await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: ADMIN_CHAT_ID,
                text: adminMessage,
                parse_mode: 'Markdown'
            })
        });
        console.log('✅ Admin deposit notification sent');
    }
    
    // Send to customer
    if (userChatId) {
        const customerMessage = `
╔═══════════════════════════╗
║  ✅ NẠP TIỀN THÀNH CÔNG  ║
╚═══════════════════════════╝

💰 **Số tiền nạp:** +${amount.toLocaleString('vi-VN')} VNĐ
💳 **Số dư hiện tại:** ${newBalance.toLocaleString('vi-VN')} VNĐ
🔖 **Mã giao dịch:** \`${transactionId}\`
⏰ **Thời gian:** ${new Date().toLocaleString('vi-VN')}

📝 **Sử dụng số dư:**
• Gửi /balance để xem số dư
• Gửi /muaplus để mua account bằng số dư
• Số dư được bảo toàn, không hết hạn

💡 Bạn có thể mua account mà không cần chuyển khoản mỗi lần!
        `.trim();
        
        const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
        try {
            await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    chat_id: userChatId,
                    text: customerMessage,
                    parse_mode: 'Markdown'
                })
            });
            console.log(`✅ Customer deposit notification sent to ${userChatId}`);
        } catch (error) {
            console.error(`⚠️ Failed to send to customer ${userChatId}:`, error.message);
        }
    }
}

// Send Telegram notification when account is delivered
async function sendTelegramNotification(account, amount, transactionId, content, userChatId = null) {
    const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
    const ADMIN_CHAT_ID = process.env.ADMIN_TELEGRAM_CHAT_ID;
    
    if (!TELEGRAM_BOT_TOKEN) {
        console.log('⚠️ Telegram not configured, skipping notification');
        return;
    }
    
    const planIcon = account.plan_type === 'free' ? '🆓' : account.plan_type === 'plus' ? '⭐' : '👥';
    
    // Send to admin
    if (ADMIN_CHAT_ID) {
        const adminMessage = `
╔═══════════════════════════╗
║  🎉 TÀI KHOẢN ĐÃ BÁN TỰ ĐỘNG  ║
╚═══════════════════════════╝

${planIcon} **Plan:** ${account.plan_type.toUpperCase()}
💰 **Số tiền:** ${amount.toLocaleString('vi-VN')} VNĐ
🔖 **Mã GD:** \`${transactionId}\`
👤 **User ID:** ${userChatId || 'N/A'}

┌─ 📧 ACCOUNT INFO ─┐
│ Email: \`${account.email}\`
│ Pass: \`${account.password}\`
│ 2FA: \`${account.secret_key_2fa}\`
└───────────────────┘

📝 **Nội dung:** ${content}
⏰ **Thời gian:** ${new Date().toLocaleString('vi-VN')}

✅ Đã giao tự động qua SePay webhook
        `.trim();
        
        const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
        await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: ADMIN_CHAT_ID,
                text: adminMessage,
                parse_mode: 'Markdown'
            })
        });
        console.log('✅ Admin notification sent');
    }
    
    // Send to customer if userChatId is provided
    if (userChatId) {
        const customerMessage = `
╔═══════════════════════════╗
║  🎉 THANH TOÁN THÀNH CÔNG  ║
╚═══════════════════════════╝

Cảm ơn bạn đã mua ${planIcon} **${account.plan_type.toUpperCase()} Account**!

┌─ 📧 THÔNG TIN TÀI KHOẢN ─┐
│ Email: \`${account.email}\`
│ Mật khẩu: \`${account.password}\`
│ Mã 2FA: \`${account.secret_key_2fa}\`
└─────────────────────────────┘

📝 **Hướng dẫn đăng nhập:**
1. Truy cập: https://chat.openai.com
2. Đăng nhập bằng email & password trên
3. Nhập mã 2FA khi được yêu cầu

⚠️ **Lưu ý quan trọng:**
• Lưu lại thông tin này
• Không chia sẻ cho người khác
• Đổi mật khẩu sau khi đăng nhập đầu tiên

💡 Nếu cần hỗ trợ, liên hệ admin!

✅ Đơn hàng: \`${transactionId}\`
⏰ ${new Date().toLocaleString('vi-VN')}
        `.trim();
        
        const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
        try {
            await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    chat_id: userChatId,
                    text: customerMessage,
                    parse_mode: 'Markdown'
                })
            });
            console.log(`✅ Customer notification sent to ${userChatId}`);
        } catch (error) {
            console.error(`⚠️ Failed to send to customer ${userChatId}:`, error.message);
        }
    }
}

// Payment verification function
function verifyPayment(content, amount) {
    const fs = require('fs');
    const path = require('path');
    
    let config = {
        payment_verification: {
            required_keywords: [],
            excluded_keywords: [],
            min_amount: 10000,
            user_code_pattern: "^(PLUS|TEAM|FREE)\\d+$"
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
            config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        }
    } catch (error) {
        console.warn('⚠️ Using default payment config');
    }
    
    const contentUpper = content.toUpperCase();
    const reasons = [];
    let valid = true;
    let user_id = null;
    let user_chat_id = null;
    
    // Check if content matches user code pattern (PLUS123456, TEAM789012, NAP5787980050)
    let suggested_plan = null;
    if (config.payment_verification.user_code_pattern) {
        const codeRegex = new RegExp(config.payment_verification.user_code_pattern, 'i');
        const match = contentUpper.match(codeRegex);
        
        console.log('🔍 Regex match attempt:', { 
            pattern: config.payment_verification.user_code_pattern, 
            content: contentUpper, 
            match: match 
        });
        
        if (match) {
            const fullCode = match[0]; // Full match: NAP5787980050, PLUS123456, etc
            const planPart = match[1]; // Plan: NAP, PLUS, TEAM, FREE
            
            // Extract number part (digits after plan name)
            const numberMatch = fullCode.match(/(NAP|PLUS|TEAM|FREE)(\d+)/);
            if (numberMatch && numberMatch[2]) {
                user_chat_id = numberMatch[2]; // This is the Telegram Chat ID
                console.log(`✅ User code detected: ${planPart}${user_chat_id} (Chat ID: ${user_chat_id})`);
                
                if (planPart === 'PLUS') {
                    suggested_plan = 'plus';
                } else if (planPart === 'TEAM') {
                    suggested_plan = 'team';
                } else if (planPart === 'FREE') {
                    suggested_plan = 'free';
                } else if (planPart === 'NAP') {
                    suggested_plan = 'deposit'; // Mark as deposit transaction
                }
            }
        } else {
            console.log('❌ No regex match found');
        }
    }
    
    // Check minimum amount
    if (amount < config.payment_verification.min_amount) {
        reasons.push(`Số tiền < ${config.payment_verification.min_amount}`);
        valid = false;
    }
    
    // Check required keywords (skip for deposits)
    if (suggested_plan !== 'deposit' && config.payment_verification.required_keywords.length > 0) {
        const hasRequired = config.payment_verification.required_keywords.some(k => contentUpper.includes(k));
        if (!hasRequired) {
            reasons.push(`Thiếu từ khóa: ${config.payment_verification.required_keywords.join(', ')}`);
            valid = false;
        }
    }
    
    // Check excluded keywords (check whole words, not substrings)
    if (config.payment_verification.excluded_keywords.length > 0) {
        // Split content into words
        const words = contentUpper.split(/\s+/);
        const hasExcluded = config.payment_verification.excluded_keywords.some(k => words.includes(k.toUpperCase()));
        if (hasExcluded) {
            const matched = config.payment_verification.excluded_keywords.filter(k => words.includes(k.toUpperCase()));
            reasons.push(`Có từ bỏ qua: ${matched.join(', ')}`);
            valid = false;
        }
    }
    
    // If no user code, suggest plan based on amount
    if (!suggested_plan) {
        if (amount >= config.price_list.team) {
            suggested_plan = 'team';
        } else if (amount >= config.price_list.plus) {
            suggested_plan = 'plus';
        } else {
            suggested_plan = 'free';
        }
    }
    
    return { valid, reasons, suggested_plan, amount, user_chat_id };
}

startServer().catch(console.error);

// Graceful shutdown
process.on('SIGINT', async () => {
    console.log('\n👋 Closing MongoDB connection...');
    await mongoClient.close();
    process.exit(0);
});