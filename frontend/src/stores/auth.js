import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import api, { AUTH_INVALIDATED } from '../api'
import { getTokenExpiresAt } from '../utils/jwt'

// Remaining time at (or below) which the protected pages switch from a
// quiet countdown to the prominent renewal reminder.
const WARNING_MS = 5 * 60 * 1000
const TICK_MS = 1000

// Shared across every useAuthStore() call in this tab, so a burst of
// renewal clicks (or multiple mounted components) can only produce one
// in-flight renewal request.
let renewInFlight = null

export const useAuthStore = defineStore('auth', () => {
  const token = ref(localStorage.getItem('blog_token') || '')
  const username = ref(localStorage.getItem('blog_username') || '')
  const now = ref(Date.now())
  const online = ref(typeof navigator === 'undefined' ? true : navigator.onLine)
  const renewing = ref(false)
  // Bumped whenever the session is definitively lost. UI layers watch this
  // to show a notice exactly once and return to the login page.
  const invalidation = ref(null)

  const isLoggedIn = computed(() => !!token.value)
  const expiresAt = computed(() => getTokenExpiresAt(token.value))
  const remainingMs = computed(() => {
    const exp = expiresAt.value
    if (exp === null) return token.value ? -1 : 0
    return Math.max(0, exp - now.value)
  })
  // A token that is missing, expired or un-decodable must not be treated as
  // a live session by route guards or protected pages.
  const sessionUsable = computed(
    () => !!token.value && expiresAt.value !== null && remainingMs.value > 0
  )
  const status = computed(() => {
    if (!token.value) return 'anonymous'
    if (!sessionUsable.value) return 'expired'
    return remainingMs.value <= WARNING_MS ? 'warning' : 'valid'
  })

  function persistSession(nextToken, nextUsername) {
    token.value = nextToken
    username.value = nextUsername
    // Token first: tabs receiving the events converge either way, and the
    // adoption rule (see storage listener) never downgrades a newer token.
    localStorage.setItem('blog_token', nextToken)
    localStorage.setItem('blog_username', nextUsername)
  }

  async function login(user, password) {
    const response = await api.post('/auth/login', {
      username: user,
      password: password
    })
    persistSession(response.data.token, response.data.username)
    invalidation.value = null
    return response.data
  }

  // Manual logout is silent: it preserves the existing rule of leaving for
  // the home page without an "expired" notice. Session-driven cleanup goes
  // through invalidateSession instead.
  function logout() {
    token.value = ''
    username.value = ''
    localStorage.removeItem('blog_token')
    localStorage.removeItem('blog_username')
  }

  // Single-flight renewal: concurrent callers share the same request and the
  // same result, so repeated clicks can never create competing sessions.
  function renew() {
    if (renewInFlight) return renewInFlight
    renewing.value = true
    renewInFlight = api
      .post('/auth/renew')
      .then((response) => {
        // Only adopt the fresh token if it really extends the current
        // session; a stale response from an overlapping request in another
        // flow can never shorten it.
        const currentExp = expiresAt.value ?? 0
        const nextExp = getTokenExpiresAt(response.data.token) ?? 0
        if (nextExp >= currentExp) {
          persistSession(response.data.token, response.data.username)
        }
        return response.data
      })
      .finally(() => {
        renewInFlight = null
        renewing.value = false
      })
    return renewInFlight
  }

  function invalidateSession(reason = 'server') {
    const hadToken = !!token.value
    logout()
    // Idempotent within a short window: a wave of 401/403 responses arriving
    // together (or a removal echoed across keys) clears state once and
    // notifies the UI once, so there are no loops or stacked messages.
    if (invalidation.value && Date.now() - invalidation.value.at < 5000) return
    invalidation.value = { reason, at: Date.now(), hadToken }
  }

  // Ask the server whether the persisted session is still alive. Silent on
  // network failure: being offline must never manufacture a logout, and a
  // token that is genuinely expired is still caught locally by the timer.
  async function validateSession() {
    if (!token.value) return
    if (expiresAt.value !== null && remainingMs.value <= 0) {
      invalidateSession('expired')
      return
    }
    if (!online.value) return
    try {
      const { data } = await api.get('/auth/session')
      // Reconcile with a login/renewal that happened in another tab meanwhile.
      const latest = localStorage.getItem('blog_token')
      if (latest && latest !== token.value) {
        adoptExternalToken(latest, localStorage.getItem('blog_username') || data.username)
      }
      // On success the token is confirmed valid; its local exp drives the
      // countdown UX and the server remains the authoritative gatekeeper.
    } catch (error) {
      // 401/403 are already handled by the response interceptor; anything
      // else (offline, timeout, 5xx) keeps the existing session.
    }
  }

  function adoptExternalToken(externalToken, externalUsername) {
    if (!externalToken) return
    const externalExp = getTokenExpiresAt(externalToken)
    const currentExp = expiresAt.value
    // Never downgrade to an older/expired token from a lagging tab.
    if (externalExp === null) return
    if (currentExp !== null && externalExp < currentExp) return
    token.value = externalToken
    username.value = externalUsername || username.value
  }

  function handleStorageChange(event) {
    if (event.key !== 'blog_token' && event.key !== 'blog_username') return

    if (event.key === 'blog_token') {
      const storedToken = localStorage.getItem('blog_token')
      if (!storedToken) {
        // Another tab logged out or had its session invalidated. Clearing the
        // in-memory state without writing back (the key is already gone)
        // cannot echo a storage event, so this can never loop.
        if (token.value) {
          token.value = ''
          username.value = ''
          if (invalidation.value && Date.now() - invalidation.value.at < 5000) return
          invalidation.value = { reason: 'external', at: Date.now(), hadToken: true }
        }
      } else if (storedToken !== token.value) {
        // Login or renewal in another tab: adopt it when it is not older.
        adoptExternalToken(storedToken, localStorage.getItem('blog_username') || '')
      }
    } else if (event.key === 'blog_username') {
      // Only mirror the username while a token exists; a missing username
      // here accompanies the token-removal handled above.
      const storedToken = localStorage.getItem('blog_token')
      if (token.value && storedToken && event.newValue) {
        username.value = event.newValue
      }
    }
  }

  // Every initialized store owns its own timers/listeners, all bound to its
  // own refs (main.js calls init() exactly once for the singleton store).
  // Keeping registration per-instance also makes multiple Pinia instances in
  // tests independent rather than sharing the first instance's closures.
  function init() {
    const ticker = setInterval(() => {
      now.value = Date.now()
    }, TICK_MS)

    // When the local countdown reaches zero the JWT is expired for sure;
    // invalidateSession is idempotent so repeated ticks are harmless.
    const expiryChecker = setInterval(() => {
      if (token.value && !sessionUsable.value) {
        invalidateSession('expired')
      }
    }, TICK_MS)

    const onInvalidated = () => invalidateSession('server')
    const onOnline = () => {
      online.value = true
      validateSession()
    }
    const onOffline = () => {
      online.value = false
    }
    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        now.value = Date.now()
        validateSession()
      }
    }

    window.addEventListener('storage', handleStorageChange)
    window.addEventListener(AUTH_INVALIDATED, onInvalidated)
    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)
    document.addEventListener('visibilitychange', onVisibility)

    // On reopen/reload with an already-expired token, start clean instead of
    // briefly pretending to be logged in.
    if (token.value && expiresAt.value !== null && remainingMs.value <= 0) {
      logout()
    }

    return function destroy() {
      clearInterval(ticker)
      clearInterval(expiryChecker)
      window.removeEventListener('storage', handleStorageChange)
      window.removeEventListener(AUTH_INVALIDATED, onInvalidated)
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOffline)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }

  return {
    token,
    username,
    now,
    online,
    renewing,
    invalidation,
    isLoggedIn,
    expiresAt,
    remainingMs,
    sessionUsable,
    status,
    login,
    logout,
    renew,
    invalidateSession,
    validateSession,
    init
  }
})
