const fetch = require('node-fetch');

const API_BASE = 'http://localhost:3000/api';

class AccountBot {
    constructor() {
        this.checkInterval = 5000; // Check mỗi 5 giây
    }

    // Lấy tài khoản available
    async getAvailableAccounts(planType = null) {
        try {
            let url = `${API_BASE}/accounts/available`;
            if (planType) {
                url += `?plan_type=${planType}`;
            }

            const response = await fetch(url);
            const result = await response.json();

            if (result.success) {
                console.log(`✅ Found ${result.count} available accounts`);
                return result.data;
            }

            return [];
        } catch (error) {
            console.error('❌ Error fetching accounts:', error.message);
            return [];
        }
    }

    // Đánh dấu tài khoản đã bán
    async markAsSold(accountId, buyerInfo, price, paymentMethod) {
        try {
            const response = await fetch(`${API_BASE}/accounts/${accountId}/sell`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    buyer_info: buyerInfo,
                    price: price,
                    payment_method: paymentMethod
                })
            });

            const result = await response.json();

            if (result.success) {
                console.log(`✅ Account ${accountId} marked as sold`);
                return true;
            }

            return false;
        } catch (error) {
            console.error('❌ Error marking as sold:', error.message);
            return false;
        }
    }

    // Lấy thống kê
    async getStats() {
        try {
            const response = await fetch(`${API_BASE}/stats`);
            const result = await response.json();

            if (result.success) {
                console.log('\n📊 STATISTICS:');
                console.log(`   Total accounts: ${result.stats.total}`);
                console.log(`   Available: ${result.stats.available}`);
                console.log(`   Sold: ${result.stats.sold}`);
                console.log('\n   By plan type:');
                result.stats.by_plan_type.forEach(item => {
                    console.log(`   - ${item._id}: ${item.count}`);
                });
                console.log('');
            }
        } catch (error) {
            console.error('❌ Error fetching stats:', error.message);
        }
    }

    // Format account info để bán
    formatAccountForSale(account) {
        return {
            id: account._id,
            credentials: account.account_info, // email|password|2fa
            plan: account.plan_type,
            created: new Date(account.created_at).toLocaleString('vi-VN')
        };
    }

    // Simulate: Bán tài khoản tự động
    async autoSellDemo() {
        console.log('🤖 Starting auto-sell demo...\n');

        // Lấy tài khoản available
        const accounts = await this.getAvailableAccounts();

        if (accounts.length === 0) {
            console.log('⚠️ No accounts available for sale');
            return;
        }

        // Lấy account đầu tiên
        const account = accounts[0];
        const formatted = this.formatAccountForSale(account);

        console.log('📦 Account ready for sale:');
        console.log(`   ID: ${formatted.id}`);
        console.log(`   Credentials: ${formatted.credentials}`);
        console.log(`   Plan: ${formatted.plan}`);
        console.log(`   Created: ${formatted.created}`);
        console.log('');

        // Giả lập: Có khách mua
        console.log('💰 Selling to customer...');
        const sold = await this.markAsSold(
            formatted.id,
            'customer@example.com',
            50000, // 50k VND
            'bank_transfer'
        );

        if (sold) {
            console.log('✅ Sale completed!\n');
        }
    }

    // Start monitoring
    async start() {
        console.log('🚀 Account Bot Started\n');
        
        // Hiển thị stats ban đầu
        await this.getStats();

        // Demo bán 1 tài khoản
        await this.autoSellDemo();

        // Hiển thị stats sau khi bán
        await this.getStats();

        console.log('✅ Bot demo completed');
    }
}

// Run bot
if (require.main === module) {
    const bot = new AccountBot();
    bot.start().catch(console.error);
}

module.exports = AccountBot;
