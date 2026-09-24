const jwt = require('jsonwebtoken');

const JWT_SECRET = 'blog-platform-secret-key';

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
    // Expired sessions must be distinguishable from malformed/forged tokens
    // so the frontend can run the expire-and-renew flow instead of a silent failure.
    const status = err.name === 'TokenExpiredError' ? 401 : 403;
    return res.status(status).json({ error: 'Invalid or expired token' });
  }
}

module.exports = { authenticateToken, JWT_SECRET };
