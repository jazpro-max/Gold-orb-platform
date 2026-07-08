const express = require('express');
const { Pool } = require('pg');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static('public'));

// Secure connection to your Supabase cloud database
const pool = new Pool({
    connectionString:"postgresql://postgres.oaiibycvnckgzfmrazch:Jazug@2004Pro@aws-0-ca-central-1.pooler.supabase.com:6543/postgres" ,
    ssl: { rejectUnauthorized: false }
});

// Setup cloud database tables permanently
async function initDatabase() {
    const client = await pool.connect();
    try {
        await client.query(`CREATE TABLE IF NOT EXISTS users (
            id SERIAL PRIMARY KEY,
            phone TEXT UNIQUE,
            password TEXT,
            balance REAL DEFAULT 0,
            commission REAL DEFAULT 0,
            referrals_count INTEGER DEFAULT 0,
            invitation_code TEXT UNIQUE,
            referred_by TEXT
        )`);

        await client.query(`CREATE TABLE IF NOT EXISTS orders (
            id SERIAL PRIMARY KEY,
            phone TEXT,
            product_name TEXT,
            price REAL,
            daily_income REAL,
            total_income REAL,
            status TEXT DEFAULT 'Active'
        )`);
        console.log("Supabase Cloud Database Connected Permanently!");
    } finally {
        client.release();
    }
}
initDatabase().catch(err => console.error(err));

// --- REGISTER ---
app.post('/api/register', async (req, res) => {
    const { phone, password, inviteCode } = req.body;
    if (!phone || !password) return res.json({ success: false, message: "Missing phone or password!" });
    const userInviteCode = Math.floor(1000000 + Math.random() * 9000000).toString();

    try {
        const checkUser = await pool.query("SELECT * FROM users WHERE phone = $1", [phone]);
        if (checkUser.rows.length > 0) return res.json({ success: false, message: "Phone already registered!" });

        if (inviteCode) {
            const referrer = await pool.query("SELECT * FROM users WHERE invitation_code = $1", [inviteCode]);
            if (referrer.rows.length === 0) return res.json({ success: false, message: "Invalid Invite Code!" });

            await pool.query("INSERT INTO users (phone, password, balance, commission, invitation_code, referred_by) VALUES ($1, $2, 0, 0, $3, $4)", [phone, password, userInviteCode, referrer.rows[0].phone]);
            await pool.query("UPDATE users SET referrals_count = referrals_count + 1, commission = commission + 5000 WHERE phone = $1", [referrer.rows[0].phone]);
        } else {
            await pool.query("INSERT INTO users (phone, password, balance, commission, invitation_code, referred_by) VALUES ($1, $2, 0, 0, $3, NULL)", [phone, password, userInviteCode]);
        }
        res.json({ success: true, message: "Registration successful!" });
    } catch (err) {
        res.json({ success: false, message: err.message });
    }
});

// --- LOGIN ---
app.post('/api/login', async (req, res) => {
    const { phone, password } = req.body;
    const result = await pool.query("SELECT * FROM users WHERE phone = $1 AND password = $2", [phone, password]);
    if (result.rows.length === 0) return res.json({ success: false, message: "Invalid credentials!" });
    res.json({ success: true, message: "Login successful!", phone: result.rows[0].phone });
});

// --- DASHBOARD USER DATA ---
app.get('/api/user/:phone', async (req, res) => {
    const userRes = await pool.query("SELECT * FROM users WHERE phone = $1", [req.params.phone]);
    if (userRes.rows.length === 0) return res.status(404).json({ error: "User missing" });
    const ordersRes = await pool.query("SELECT * FROM orders WHERE phone = $1", [req.params.phone]);
    res.json({ user: userRes.rows[0], orders: ordersRes.rows });
});

// --- INVEST ---
app.post('/api/invest', async (req, res) => {
    const { name, price, daily, total, phone } = req.body;
    const userRes = await pool.query("SELECT balance FROM users WHERE phone = $1", [phone]);
    if (userRes.rows[0].balance < price) return res.json({ success: false, message: "Insufficient balance!" });

    await pool.query("UPDATE users SET balance = balance - $1 WHERE phone = $2", [price, phone]);
    await pool.query("INSERT INTO orders (phone, product_name, price, daily_income, total_income) VALUES ($1, $2, $3, $4, $5)", [phone, name, price, daily, total]);
    res.json({ success: true, message: `Invested in ${name}!` });
});

// --- WITHDRAW ---
app.post('/api/withdraw', async (req, res) => {
    const { amount, type, phone } = req.body;
    const userRes = await pool.query("SELECT * FROM users WHERE phone = $1", [phone]);
    let currentBalance = type === 'balance' ? userRes.rows[0].balance : userRes.rows[0].commission;
    if (currentBalance < amount) return res.json({ success: false, message: "Insufficient funds!" });

    let updateField = type === 'balance' ? 'balance' : 'commission';
    await pool.query(`UPDATE users SET ${updateField} = $1 WHERE phone = $2`, [amount, phone]);
    res.json({ success: true, message: `Withdrew UGX ${amount}!` });
});

// --- ADMIN CONTROLS ---
app.get('/api/admin/users', async (req, res) => {
    const users = await pool.query("SELECT * FROM users");
    const orders = await pool.query("SELECT * FROM orders");
    res.json({ users: users.rows, orders: orders.rows });
});

app.post('/api/admin/update-balance', async (req, res) => {
    const { phone, newBalance, type } = req.body;
    const field = type === 'balance' ? 'balance' : 'commission';
    await pool.query(`UPDATE users SET ${field} = $1 WHERE phone = $2`, [parseFloat(newBalance), phone]);
    res.json({ success: true, message: `Updated user balance.` });
});

app.listen(PORT, () => console.log(`Server running safely on port ${PORT}`));
        
