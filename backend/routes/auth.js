const express = require('express');
const { authenticateToken, issueToken } = require('../middleware/auth');

const router = express.Router();

// Hardcoded admin credentials
const ADMIN_USER = {
  username: 'admin',
  password: 'admin123'
};

// POST /api/auth/login
router.post('/login', (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required' });
  }

  if (username === ADMIN_USER.username && password === ADMIN_USER.password) {
    const { token, expiresAt } = issueToken({
      username: ADMIN_USER.username,
      role: 'admin'
    });
    return res.json({ token, username: ADMIN_USER.username, expiresAt });
  }

  return res.status(401).json({ error: 'Invalid username or password' });
});

// POST /api/auth/renew - exchange a still-valid token for a fresh one.
// Only valid, non-expired tokens can be renewed, so an expired session
// can never be revived without logging in again.
router.post('/renew', authenticateToken, (req, res) => {
  const { token, expiresAt } = issueToken({
    username: req.user.username,
    role: req.user.role
  });
  res.json({ token, username: req.user.username, expiresAt });
});

// GET /api/auth/session - report whether the current token is still valid
// and when it expires (used after reconnecting to the network / reopening).
router.get('/session', authenticateToken, (req, res) => {
  res.json({
    username: req.user.username,
    role: req.user.role,
    expiresAt: req.user.exp * 1000
  });
});

module.exports = router;
