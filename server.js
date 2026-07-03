const express = require('express');
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static('public'));

let db;

// Safe asynchronous database initializer
async function initDatabase() {
    db = await open({
        filename: './goldorb_v2.db',
        driver: sqlite3.Database
    });

    console.log('Database connected seamlessly.');

    // Build relational schemas
    await db.exec(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY,
        phone TEXT UNIQUE,
        password TEXT,
        balance REAL DEFAULT 0,
        commission REAL DEFAULT 0,
        referrals_count INTEGER DEFAULT 0,
        invitation_code TEXT UNIQUE,
        referred_by TEXT
    )`);

    await db.exec(`CREATE TABLE IF NOT EXISTS orders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        phone TEXT,
        product_name TEXT,
        price REAL,
        daily_income REAL,
        total_income REAL,
        status TEXT DEFAULT 'Active'
    )`);
}

// Initialize on server boot startup
initDatabase().catch(err => console.error("Database connection failed:", err));

// --- AUTHENTICATION ROUTING SYSTEM ---
app.post('/api/register', async (req, res) => {
    const { phone, password, inviteCode } = req.body;
    if (!phone || !password) return res.json({ success: false, message: "Missing phone or password!" });

    const userInviteCode = Math.floor(1000000 + Math.random() * 9000000).toString();

    try {
        const row = await db.get("SELECT * FROM users WHERE phone = ?", [phone]);
        if (row) return res.json({ success: false, message: "Phone number already registered!" });

        if (inviteCode) {
            const referrer = await db.get("SELECT * FROM users WHERE invitation_code = ?", [inviteCode]);
            if (!referrer) return res.json({ success: false, message: "Invalid Referral Invite Code!" });

            await db.run("INSERT INTO users (phone, password, balance, commission, invitation_code, referred_by) VALUES (?, ?, 0, 0, ?, ?)", [phone, password, userInviteCode, referrer.phone]);
            await db.run("UPDATE users SET referrals_count = referrals_count + 1, commission = commission + 5000 WHERE phone = ?", [referrer.phone]);
            res.json({ success: true, message: "Registration successful! You can now log in." });
        } else {
            await db.run("INSERT INTO users (phone, password, balance, commission, invitation_code, referred_by) VALUES (?, ?, 0, 0, ?, NULL)", [phone, password, userInviteCode]);
            res.json({ success: true, message: "Registration successful! You can now log in." });
        }
    } catch (err) {
        res.json({ success: false, message: err.message });
    }
});

app.post('/api/login', async (req, res) => {
    const { phone, password } = req.body;
    const user = await db.get("SELECT * FROM users WHERE phone = ? AND password = ?", [phone, password]);
    if (!user) return res.json({ success: false, message: "Invalid phone number or password!" });
    res.json({ success: true, message: "Login successful!", phone: user.phone });
});

// --- UPDATED DYNAMIC DASHBOARD PARAMETERS ---
app.get('/api/user/:phone', async (req, res) => {
    const userRow = await db.get("SELECT * FROM users WHERE phone = ?", [req.params.phone]);
    if (!userRow) return res.status(404).json({ error: "User profile missing" });
    const orderRows = await db.all("SELECT * FROM orders WHERE phone = ?", [req.params.phone]);
    res.json({ user: userRow, orders: orderRows });
});

app.post('/api/invest', async (req, res) => {
    const { name, price, daily, total, phone } = req.body;
    const user = await db.get("SELECT balance FROM users WHERE phone = ?", [phone]);
    if (user.balance < price) return res.json({ success: false, message: "Insufficient balance!" });

    await db.run("UPDATE users SET balance = balance - ? WHERE phone = ?", [price, phone]);
    await db.run("INSERT INTO orders (phone, product_name, price, daily_income, total_income) VALUES (?, ?, ?, ?, ?)", [phone, name, price, daily, total]);
    res.json({ success: true, message: `Successfully invested in ${name}!` });
});

app.post('/api/withdraw', async (req, res) => {
    const { amount, type, phone } = req.body;
    const user = await db.get("SELECT * FROM users WHERE phone = ?", [phone]);
    let currentBalance = type === 'balance' ? user.balance : user.commission;
    if (currentBalance < amount) return res.json({ success: false, message: "Insufficient funds!" });

    let updateField = type === 'balance' ? 'balance' : 'commission';
    await db.run(`UPDATE users SET ${updateField} = ${updateField} - ? WHERE phone = ?`, [amount, phone]);
    res.json({ success: true, message: `Successfully withdrew UGX ${amount}!` });
});

// --- ADMIN SYSTEM CONFIGURATIONS ---
app.get('/api/admin/users', async (req, res) => {
    const users = await db.all("SELECT * FROM users");
    const orders = await db.all("SELECT * FROM orders");
    res.json({ users, orders });
});

app.post('/api/admin/update-balance', async (req, res) => {
    const { phone, newBalance, type } = req.body;
    const field = type === 'balance' ? 'balance' : 'commission';
    await db.run(`UPDATE users SET ${field} = ? WHERE phone = ?`, [parseFloat(newBalance), phone]);
    res.json({ success: true, message: `Updated user balance.` });
});

app.listen(PORT, () => console.log(`Server running safely on port ${PORT}`));
