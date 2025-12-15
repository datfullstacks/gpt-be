const { MongoClient } = require('mongodb');
require('dotenv').config();

async function fetchData() {
    const client = new MongoClient(process.env.MONGODB_URI);
    
    try {
        await client.connect();
        console.log('✅ Connected to MongoDB\n');
        
        const db = client.db(process.env.DB_NAME);
        const accounts = await db.collection(process.env.COLLECTION_NAME).find({}).toArray();
        
        console.log(`📊 Total accounts: ${accounts.length}\n`);
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        
        accounts.forEach((acc, i) => {
            console.log(`\n📧 Account ${i + 1}:`);
            console.log(`   Email: ${acc.email}`);
            console.log(`   Password: ${acc.password}`);
            console.log(`   2FA Secret: ${acc.secret_key_2fa || 'N/A'}`);
            console.log(`   Plan Type: ${acc.plan_type || 'Free'}`);
            console.log(`   Account ID: ${acc.account_id || 'N/A'}`);
            console.log(`   Status: ${acc.sold_status || 'available'}`);
            console.log(`   Created: ${acc.created_at ? new Date(acc.created_at).toLocaleString('vi-VN') : 'N/A'}`);
            
            if (acc.sold_status === 'sold') {
                console.log(`   💰 Price: ${acc.price?.toLocaleString('vi-VN')} VNĐ`);
                console.log(`   👤 Buyer: ${acc.buyer_info}`);
                console.log(`   💳 Payment: ${acc.payment_method}`);
            }
            
            console.log(`   Format: ${acc.email}|${acc.password}|${acc.secret_key_2fa || ''}`);
            console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        });
        
        // Summary
        const available = accounts.filter(a => a.sold_status !== 'sold').length;
        const sold = accounts.filter(a => a.sold_status === 'sold').length;
        
        console.log('\n📈 Summary:');
        console.log(`   🟢 Available: ${available}`);
        console.log(`   ✅ Sold: ${sold}`);
        
    } catch (error) {
        console.error('❌ Error:', error);
    } finally {
        await client.close();
        console.log('\n✅ Connection closed');
    }
}

fetchData();
