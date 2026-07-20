const express = require('express');
const path = require('path');
const app = express();

const PORT = process.env.PORT || 3000;

// Body parsing middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 1. Serve static files (CSS, JS, images, and HTML) directly from the 'public' folder
// Setting extensions: ['html'] lets you visit /order instead of /order.html
app.use(express.static(path.join(__dirname, 'public'), { extensions: ['html'] }));

// ================= PAGE ROUTES ================= //

// Default landing / index route
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Main Dashboard route
app.get('/dashboard', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

// Admin Panel route
app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// ================= API ENDPOINTS ================= //

app.post('/api/deposit', (req, res) => {
    const { amount, paymentMethod } = req.body;
    res.json({ success: true, message: 'Deposit request submitted successfully.' });
});

app.post('/api/withdraw', (req, res) => {
    const { amount, walletAddress } = req.body;
    res.json({ success: true, message: 'Withdrawal request queued.' });
});

app.get('/api/user-stats', (req, res) => {
    res.json({
        balance: 150.00,
        teamCount: 12,
        activeOrders: 3
    });
});

// Catch-all 404 Handler for missing routes
app.use((req, res) => {
    res.status(404).send('404 - Page or Resource Not Found in public directory.');
});

// Start Server
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
