const express = require('express');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const session = require('express-session'); // To securely track who is logged in

const app = express();

// 1. Core Middlewares
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Setup tracking sessions so the dashboard knows WHICH user is active
app.use(session({
    secret: 'gold-orb-secret-key-abcde',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 24 * 60 * 60 * 1000 } // Session expires in 24 hours
}));

// Serve static frontend assets cleanly out of your public directory
app.use(express.static(path.join(__dirname, 'public')));

// 2. Initialize the SQLite3 Database Infrastructure
const db = new sqlite3.Database('./database.db', (err) => {
    if (err) {
        console.error("Database connection fault:", err.message);
    } else {
        console.log("Connected to the SQLite database successfully.");
        
        // Setup User Management Table
        db.run(`CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            phone TEXT UNIQUE,
            password TEXT,
            balance REAL DEFAULT 0,
            commission REAL DEFAULT 0,
            invitation_code TEXT
        )`);

        // Setup Active Investment Leases Tracking Table
        db.run(`CREATE TABLE IF NOT EXISTS orders (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_phone TEXT,
            product_name TEXT,
            price REAL,
            daily_income REAL,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
        )`);
    }
});

// ==========================================
// 🔐 AUTHENTICATION ENDPOINTS (For login.html)
// ==========================================

// Register Account Pipeline
app.post('/api/auth/register', (req, res) => {
    const { phone, password } = req.body;

    if (!phone || !password) {
        return res.status(400).json({ success: false, message: "Phone and password values required." });
    }

    const assignedInviteCode = Math.floor(1000000 + Math.random() * 9000000).toString();
    const query = `INSERT INTO users (phone, password, balance, commission, invitation_code) VALUES (?, ?, 0, 0, ?)`;
    
    db.run(query, [phone, password, assignedInviteCode], function(err) {
        if (err) {
            if (err.message.includes('UNIQUE')) {
                return res.json({ success: false, message: "This phone number is already registered!" });
            }
            return res.status(500).json({ success: false, message: "Internal server registry error." });
        }
        
        // Log the newly registered user explicitly into the current session tracking state
        req.session.userPhone = phone;
        return res.json({ success: true, message: "Account created successfully!" });
    });
});

// Authenticate Session Access Login
app.post('/api/auth/login', (req, res) => {
    const { phone, password } = req.body;

    db.get(`SELECT * FROM users WHERE phone = ? AND password = ?`, [phone, password], (err, row) => {
        if (err) {
            return res.status(500).json({ success: false, message: "System core connection drop." });
        }
        if (!row) {
            return res.json({ success: false, message: "Incorrect phone number or password." });
        }

        // Save active identity reference inside session storage
        req.session.userPhone = row.phone;
        return res.json({ success: true, message: "Login successful!" });
    });
});


// ==========================================
// 📊 DASHBOARD & MACHINE STORAGE ENDPOINTS
// ==========================================

// Pull live profile telemetry for the logged-in user
app.get('/api/user/profile', (req, res) => {
    if (!req.session.userPhone) {
        return res.status(401).json({ success: false, message: "Session unauthorized. Re-login required." });
    }

    const phone = req.session.userPhone;

    // Fetch user details
    db.get(`SELECT phone, balance, commission, invitation_code FROM users WHERE phone = ?`, [phone], (err, userRow) => {
        if (err || !userRow) {
            return res.status(404).json({ success: false, message: "Profile profile matching error." });
        }

        // Fetch their active physical investment orders
        db.all(`SELECT product_name, price, daily_income FROM orders WHERE user_phone = ?`, [phone], (err, orderRows) => {
            if (err) {
                return res.status(500).json({ success: false, message: "Failed to map user portfolio state." });
            }

            return res.json({
                phone: userRow.phone,
                balance: userRow.balance,
                commission: userRow.commission,
                invitation_code: userRow.invitation_code,
                orders: orderRows || []
            });
        });
    });
});

// Process a Lease Investment Machine Purchase
app.post('/api/user/buy-product', (req, res) => {
    if (!req.session.userPhone) {
        return res.status(401).json({ success: false, message: "Unauthenticated action attempt." });
    }

    const phone = req.session.userPhone;
    const { productName, price, dailyIncome } = req.body;

    // Look up wallet to verify if they have enough money
    db.get(`SELECT balance FROM users WHERE phone = ?`, [phone], (err, row) => {
        if (err || !row) return res.status(500).json({ success: false, message: "Verification processing failed." });

        if (row.balance < price) {
            return res.json({ success: false, message: "Insufficient balance to lease this machine!" });
        }

        // Deduct balance funds out of wallet data sheet
        db.run(`UPDATE users SET balance = balance - ? WHERE phone = ?`, [price, phone], (err) => {
            if (err) return res.status(500).json({ success: false, message: "Failed ledger updates." });

            // Provision investment hardware record mapping
            db.run(`INSERT INTO orders (user_phone, product_name, price, daily_income) VALUES (?, ?, ?, ?)`, 
            [phone, productName, price, dailyIncome], (err) => {
                if (err) return res.status(500).json({ success: false, message: "Hardware binding failure." });

                return res.json({ success: true, message: "Machine leased and processing successfully!" });
            });
        });
    });
});

// Administrative Adjustments (Recharge / Manual subtracts)
app.post('/api/admin/update-balance', (req, res) => {
    const { phone, newBalance, type } = req.body;
    const amount = parseFloat(newBalance);

    let query = `UPDATE users SET balance = balance + ? WHERE phone = ?`;
    if (type === 'balance_subtract') {
        query = `UPDATE users SET balance = balance - ? WHERE phone = ?`;
    }

    db.run(query, [amount, phone], function(err) {
        if (err) return res.status(500).json({ success: false, message: "Admin system balance sync failed." });
        return res.json({ success: true, message: "Ledger status balanced successfully!" });
    });
});

// Global Router Catch-all (Redirect default requests gracefully to login)
app.get('/', (req, res) => {
    res.redirect('/login.html');
});

// Boot up Listener 
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Gold Orb Node running flawlessly on port ${PORT}`));
           
