require('dotenv').config();
const express = require('express');
const cors = require('cors');

const authRoutes = require('./src/routes/auth');
const transferRoutes = require('./src/routes/transfer');
const userRoutes = require('./src/routes/user');
const accountsRoutes = require('./src/routes/accounts');
const adminRoutes = require('./src/routes/admin');
const walletRoutes = require('./src/routes/wallets');
const walletTransferRoutes = require('./src/routes/walletTransfers');


const app = express();

app.use(cors({ origin: true, credentials: true }));
app.use(express.json());

app.use('/api/auth', authRoutes);
app.use('/api/transfer', transferRoutes);
app.use('/api/user', userRoutes);
app.use('/api/accounts', accountsRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/wallets', walletRoutes);
app.use('/api/wallets', walletTransferRoutes);

app.get('/api/health', (req, res) => {
  res.json({ status: 'SimplePay API running', timestamp: new Date().toISOString() });
});

app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Internal server error' });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`SimplePay API running on http://localhost:${PORT}`);
});