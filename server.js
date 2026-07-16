const express = require('express');
const path = require('path');
const { Pool } = require('pg');
const session = require('express-session');

const app = express();

// Core Middlewares
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Session Configuration
app.use(session({
    secret: 'gold-orb-secret-key-abcde',
    resave: false,
    saveUninitialized: false,
    cookie: { 
        maxAge: 24 * 60 * 60 * 1000,
        secure: false // Keep false unless running fully on forced HTTPS
    }
}));

// Serve static frontend assets cleanly out of your public directory
app.use(express.static(path.join(__dirname, 'public')));

// Securely check if DATABASE_URL is provided before creating connection pool
if (!process.env.DATABASE_URL) {
    console.error("FATAL ERROR: DATABASE_URL environment variable is missing!");
}

// Initialize PostgreSQL Connection Pool with SSL config for Render
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false // Required for safe connection to Render Postgres
    },
    connectionTimeoutMillis: 10000 // 10 second timeout allowance
});

// Setup Database & Tables
const initializeDatabase = async () => {
    try {
        const client = await pool.connect();
        console.log("Successfully handshook with PostgreSQL instance.");
        client.release(); // Immediately release client back to pool

        // Create Users Table
        await pool.query(`
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                phone VARCHAR(50) UNIQUE NOT NULL,
                password VARCHAR(255) NOT NULL,
                balance NUMERIC(15, 2) DEFAULT 0.00,
                commission NUMERIC(15, 2) DEFAULT 0.00,
                invitation_code VARCHAR(50)
            )
        `);

        // Create Orders Table
        await pool.query(`
            CREATE TABLE IF NOT EXISTS orders (
                id SERIAL PRIMARY KEY,
                user_phone VARCHAR(50) NOT NULL,
                product_name VARCHAR(100) NOT NULL,
                price NUMERIC(15, 2) NOT NULL,
                daily_income NUMERIC(15, 2) NOT NULL,
                timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        console.log("Database tables verified and ready.");
    } catch (err) {
        console.error("CRITICAL DATABASE CONNECTION FAULT:", err.message);
    }
};

initializeDatabase();

// ==========================================
// AUTHENTICATION ENDPOINTS (With Safe Connection Checks)
// ==========================================

// Register Account Pipeline
app.post('/api/auth/register', async (req, res) => {
    let { phone, password } = req.body;

    if (!phone || !password) {
        return res.status(400).json({ success: false, message: "Phone and password values required." });
    }

    // Sanitize values to plain strings and trim whitespace
    phone = String(phone).trim();
    password = String(password).trim();

    const assignedInviteCode = Math.floor(1000000 + Math.random() * 9000000).toString();
    const query = `INSERT INTO users (phone, password, balance, commission, invitation_code) VALUES ($1, $2, 0, 0, $3)`;
    
    try {
        await pool.query(query, [phone, password, assignedInviteCode]);
        req.session.userPhone = phone;
        return res.json({ success: true, message: "Account created successfully!" });
    } catch (err) {
        console.error("Registration error details:", err.message);
        if (err.code === '23505') { 
            return res.json({ success: false, message: "This phone number is already registered!" });
        }
        return res.status(500).json({ success: false, message: "Server connection failed. Try again in 10 seconds." });
    }
});

// Authenticate Session Access Login
app.post('/api/auth/login', async (req, res) => {
    let { phone, password } = req.body;

    if (!phone || !password) {
        return res.status(400).json({ success: false, message: "Phone and password required." });
    }

    phone = String(phone).trim();
    password = String(password).trim();

    try {
        const result = await pool.query(`SELECT * FROM users WHERE phone = $1 AND password = $2`, [phone, password]);
        
        if (result.rows.length === 0) {
            return res.json({ success: false, message: "Incorrect phone number or password." });
        }

        req.session.userPhone = result.rows[0].phone;
        return res.json({ success: true, message: "Login successful!" });
    } catch (err) {
        console.error("Login database query failure:", err.message);
        return res.status(500).json({ success: false, message: "Database handshake delayed. Please try again." });
    }
});

// ==========================================
// OTHER PORTFOLIO ENDPOINTS
// ==========================================

app.get('/api/user/profile', async (req, res) => {
    if (!req.session.userPhone) {
        return res.status(401).json({ success: false, message: "Session unauthorized. Re-login required." });
    }
    const phone = req.session.userPhone;
    try {
        const userResult = await pool.query(`SELECT phone, balance, commission, invitation_code FROM users WHERE phone = $1`, [phone]);
        if (userResult.rows.length === 0) {
            return res.status(404).json({ success: false, message: "Profile matching error." });
        }
        const ordersResult = await pool.query(`SELECT product_name, price, daily_income FROM orders WHERE user_phone = $1`, [phone]);

        return res.json({
            phone: userResult.rows[0].phone,
            balance: parseFloat(userResult.rows[0].balance),
            commission: parseFloat(userResult.rows[0].commission),
            invitation_code: userResult.rows[0].invitation_code,
            orders: ordersResult.rows || []
        });
    } catch (err) {
        return res.status(500).json({ success: false, message: "Failed to map user profile portfolio status." });
    }
});

app.post('/api/user/buy-product', async (req, res) => {
    if (!req.session.userPhone) {
        return res.status(401).json({ success: false, message: "Unauthenticated action attempt." });
    }
    const phone = req.session.userPhone;
    const { productName, price, dailyIncome } = req.body;

    try {
        const userResult = await pool.query(`SELECT balance FROM users WHERE phone = $1`, [phone]);
        if (userResult.rows.length === 0) return res.status(500).json({ success: false, message: "Verification processing failed." });

        const currentBalance = parseFloat(userResult.rows[0].balance);
        if (currentBalance < price) {
            return res.json({ success: false, message: "Insufficient balance to lease this machine!" });
        }

        await pool.query('BEGIN');
        await pool.query(`UPDATE users SET balance = balance - $1 WHERE phone = $2`, [price, phone]);
        await pool.query(`INSERT INTO orders (user_phone, product_name, price, daily_income) VALUES ($1, $2, $3, $4)`, 
            [phone, productName, price, dailyIncome]);
        await pool.query('COMMIT');
        return res.json({ success: true, message: "Machine leased successfully!" });
    } catch (err) {
        await pool.query('ROLLBACK');
        return res.status(500).json({ success: false, message: "Hardware binding failure transaction." });
    }
});

app.post('/api/admin/update-balance', async (req, res) => {
    const { phone, newBalance, type } = req.body;
    const amount = parseFloat(newBalance);
    let query = `UPDATE users SET balance = balance + $1 WHERE phone = $2`;
    if (type === 'balance_subtract') {
        query = `UPDATE users SET balance = balance - $1 WHERE phone = $2`;
    }
    try {
        await pool.query(query, [amount, phone]);
        return res.json({ success: true, message: "Ledger status balanced successfully!" });
    } catch (err) {
        return res.status(500).json({ success: false, message: "Admin update execution error." });
    }
});

app.get('/', (req, res) => {
    res.redirect('/login.html');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server execution processing safely on port ${PORT}`));
