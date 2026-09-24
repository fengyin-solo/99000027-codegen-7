const express = require('express');
const jwt = require('jsonwebtoken');
const { JWT_SECRET, authenticateToken } = require('../middleware/auth');

const router = express.Router();

// Hardcoded admin credentials
const ADMIN_USER = {
  username: 'admin',
  password: 'admin123'
};

function signToken(username) {
  return jwt.sign({ username, role: 'admin' }, JWT_SECRET, { expiresIn: '24h' });
}

// POST /api/auth/login
router.post('/login', (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required' });
  }

  if (username === ADMIN_USER.username && password === ADMIN_USER.password) {
    const token = signToken(ADMIN_USER.username);
    return res.json({ token, username: ADMIN_USER.username });
  }

  return res.status(401).json({ error: 'Invalid username or password' });
});

// POST /api/auth/refresh - exchange a still-valid token for a new 24h session
router.post('/refresh', authenticateToken, (req, res) => {
  const token = signToken(req.user.username);
  return res.json({ token, username: req.user.username });
});

module.exports = router;
