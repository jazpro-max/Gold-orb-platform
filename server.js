const express = require('express');
const path = require('path');
const app = express();

const PORT = process.env.PORT || 3000;

// Body Parsing Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static assets (css, js, images)
app.use('/css', express.static(path.join(__dirname, 'css')));
app.use('/js', express.static(path.join(__dirname, 'js')));

// ================= PAGE ROUTING ================= //

// Main Shell
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/dashboard', (req, res) => {
    res.sendFile(path.join(__dirname, 'dashboard.html'));
});

// Authentication Pages
app.get('/login', (req, res) => {
    res.sendFile(path.join(__dirname, 'login.html'));
});

app.get('/register', (req, res) => {
    res.sendFile(path.join(__dirname, 'register.html'));
});

// Sub-pages served inside dashboard view
app.get('/order', (req, res) => {
    res.sendFile(path.join(__dirname, 'order.html'));
});

app.get('/team', (req, res) => {
    res.sendFile(path.join(__dirname, 'team.html'));
});

app.get('/me', (req, res) => {
    res.sendFile(path.join(__dirname, 'me.html'));
});

app.get('/deposit', (req, res) => {
    res.sendFile(path.join(__dirname, 'deposit.html'));
});

app.get('/withdraw', (req, res) => {
    res.sendFile(path.join(__dirname, 'withdraw.html'));
});

app.get('/transactions', (req, res) => {
    res.sendFile(path.join(__dirname, 'transactions.html'));
});

app.get('/notifications', (req, res) => {
    res.sendFile(path.join(__dirname, 'notifications.html'));
});

app.get('/settings', (req, res) => {
    res.sendFile(path.join(__dirname, 'settings.html'));
});

// ================= API ENDPOINTS ================= //

app.post('/api/deposit', (req, res) => {
    const { amount, paymentMethod } = req.body;
    // Database logic here
    res.json({ success: true, message: 'Deposit request submitted successfully.' });
});

app.post('/api/withdraw', (req, res) => {
    const { amount, walletAddress } = req.body;
    // Database logic here
    res.json({ success: true, message: 'Withdrawal request queued.' });
});

app.get('/api/user-stats', (req, res) => {
    // Return sample user balance, team metrics, transactions
    res.json({
        balance: 150.00,
        teamCount: 12,
        activeOrders: 3
    });
});

// Start Server
app.listen(PORT, () => {
    console.log(`Server running smoothly on port ${PORT}`);
});
              
