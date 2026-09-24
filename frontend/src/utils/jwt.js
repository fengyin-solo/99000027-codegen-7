// Decode the payload of a JWT without verifying the signature (verification
// remains the server's responsibility). Returns null when the token is
// malformed, e.g. a token persisted by an older version of the app.
export function decodeToken(token) {
  if (!token || typeof token !== 'string') return null
  const parts = token.split('.')
  if (parts.length !== 3) return null
  try {
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/')
    const json = decodeURIComponent(
      atob(base64)
        .split('')
        .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    )
    return JSON.parse(json)
  } catch {
    return null
  }
}

// Absolute expiry time in ms since epoch, or null if it cannot be derived.
export function getTokenExpiresAt(token) {
  const payload = decodeToken(token)
  if (!payload || typeof payload.exp !== 'number') return null
  return payload.exp * 1000
}
