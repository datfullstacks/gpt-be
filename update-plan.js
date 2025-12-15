const { MongoClient } = require('mongodb');
require('dotenv').config();

async function updateAccountPlan() {
    const client = new MongoClient(process.env.MONGODB_URI);
    
    try {
        await client.connect();
        console.log('✅ Connected to MongoDB\n');
        
        const db = client.db('gpt-reg-account');
        const collection = db.collection('accounts');
        
        // Update first account to 'plus' and set sold_status to 'available'
        const result = await collection.updateOne(
            { },
            { $set: { 
                plan_type: 'plus',
                sold_status: 'available' 
            } }
        );
        
        console.log(`✅ Updated ${result.modifiedCount} account(s) to Plus plan\n`);
        
        // Show all accounts with their status
        const allAccounts = await collection.find({}).toArray();
        console.log(`📊 Total accounts in database: ${allAccounts.length}\n`);
        
        allAccounts.forEach((acc, index) => {
            console.log(`[${index + 1}] 📧 ${acc.email}`);
            console.log(`    📦 Plan: ${acc.plan_type || 'N/A'}`);
            console.log(`    💚 Status: ${acc.sold_status || 'N/A'}`);
            console.log();
        });
        
    } catch (error) {
        console.error('❌ Error:', error);
    } finally {
        await client.close();
    }
}

updateAccountPlan();
