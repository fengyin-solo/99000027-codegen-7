const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'blog-platform-secret-key';
// Kept at 24h by default to preserve the existing rule; can be overridden via env
// (e.g. ADMIN_TOKEN_TTL=30s) for testing the expiry / renewal flow.
const TOKEN_TTL = process.env.ADMIN_TOKEN_TTL || '24h';

function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  try {
    const user = jwt.verify(token, JWT_SECRET);
    req.user = user;
    next();
  } catch (err) {
    return res.status(403).json({ error: 'Invalid or expired token' });
  }
}

// Issue a signed token and report its expiry time (ms since epoch).
function issueToken(payload) {
  const token = jwt.sign(payload, JWT_SECRET, { expiresIn: TOKEN_TTL });
  const { exp } = jwt.decode(token);
  return { token, expiresAt: exp * 1000 };
}

module.exports = { authenticateToken, issueToken, JWT_SECRET, TOKEN_TTL };
