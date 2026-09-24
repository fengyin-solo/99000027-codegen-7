import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import api from '../api'

// 会话剩余时间进入该窗口后提示并允许主动续期
const WARN_BEFORE_MS = 5 * 60 * 1000
// 容忍服务端/客户端时钟偏差，提前少量时间判定本地过期，避免使用已过期 token 请求
const CLOCK_SKEW_MS = 30 * 1000
const TOKEN_KEY = 'blog_token'
const USERNAME_KEY = 'blog_username'

// 会话失效时派发的全局事件，由 App 统一处理跳转（避免 store 与 router 循环依赖）
export const AUTH_INVALID_EVENT = 'blog:auth-invalid'

// 读取 JWT 的 exp 声明；token 非法时返回 null
function readTokenExpiry(token) {
  if (!token) return null
  try {
    const payload = token.split('.')[1]
    const claims = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')))
    return typeof claims.exp === 'number' ? claims.exp * 1000 : null
  } catch {
    return null
  }
}

// 跨标签页的失效事件总线：同标签页内拦截器与 store 之间通信
const listeners = new Set()
export function onAuthInvalid(listener) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
function emitAuthInvalid(reason) {
  listeners.forEach((listener) => listener(reason))
}

export const useAuthStore = defineStore('auth', () => {
  const token = ref(localStorage.getItem(TOKEN_KEY) || '')
  const username = ref(localStorage.getItem(USERNAME_KEY) || '')
  const expiresAt = ref(readTokenExpiry(token.value))
  // 每秒更新的剩余毫秒数；驱动倒计时展示与本地到期判定
  const remainingMs = ref(0)
  const renewing = ref(false)
  const renewError = ref('')

  const isLoggedIn = computed(() => !!token.value && !!expiresAt.value)
  const isExpired = computed(() => isLoggedIn.value && remainingMs.value <= 0)
  const isWarning = computed(
    () => isLoggedIn.value && !isExpired.value && remainingMs.value <= WARN_BEFORE_MS
  )
  const isOnline = computed(() => (typeof navigator === 'undefined' ? true : navigator.onLine))

  // 新 token 统一入口，保证 store 状态与 localStorage 原子一致（多标签页读到的总是有效快照）
  function applyToken(newToken, newUsername) {
    token.value = newToken
    username.value = newUsername
    expiresAt.value = readTokenExpiry(newToken)
    renewError.value = ''
    localStorage.setItem(TOKEN_KEY, newToken)
    localStorage.setItem(USERNAME_KEY, newUsername)
  }

  function clearSession() {
    token.value = ''
    username.value = ''
    expiresAt.value = null
    remainingMs.value = 0
    renewing.value = false
    renewError.value = ''
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(USERNAME_KEY)
  }

  // 本地判定已失效：清理登录态并通知跳转。幂等，避免重复提示/循环跳转
  function handleSessionInvalid(reason = 'expired') {
    if (!token.value) return
    clearSession()
    emitAuthInvalid(reason)
  }

  // 启动/刷新时清理本地已过期的 token（不派发跳转，由路由守卫决定去向）
  function pruneExpired() {
    if (token.value && (!expiresAt.value || expiresAt.value - Date.now() <= CLOCK_SKEW_MS)) {
      clearSession()
      return true
    }
    return false
  }

  async function login(user, password) {
    const response = await api.post('/auth/login', {
      username: user,
      password: password
    })
    applyToken(response.data.token, response.data.username)
    return response.data
  }

  // 主动续期：同一时刻只允许一个请求；网络错误等非 401/403 不清理登录态
  async function renew() {
    if (!isLoggedIn.value || renewing.value) return
    if (remainingMs.value <= CLOCK_SKEW_MS) return
    renewing.value = true
    renewError.value = ''
    try {
      const response = await api.post('/auth/refresh')
      applyToken(response.data.token, response.data.username)
    } catch (error) {
      if (error.response?.status === 401 || error.response?.status === 403) {
        handleSessionInvalid('rejected')
      } else {
        renewError.value = isOnline.value
          ? '续期失败，请稍后重试'
          : '网络已断开，恢复网络后可重试续期'
      }
    } finally {
      renewing.value = false
    }
  }

  // 用户主动退出：清理本标签页登录态（其他标签页通过 storage 事件自行清理）
  function logout() {
    clearSession()
  }

  // 每秒滴答：更新剩余时间，到期瞬间触发失效流程（只触发一次）
  function tick() {
    if (!isLoggedIn.value) {
      remainingMs.value = 0
      return
    }
    const remaining = expiresAt.value - CLOCK_SKEW_MS - Date.now()
    remainingMs.value = Math.max(remaining, 0)
    if (remaining <= 0) {
      handleSessionInvalid('expired')
    }
  }
  const timer = setInterval(tick, 1000)
  tick()

  // 多标签页状态同步：其他标签页登录/续期/退出/到期时，本标签页保持一致
  function onStorage(event) {
    if (event.key !== TOKEN_KEY) return
    const nextToken = event.newValue || ''
    if (!nextToken) {
      // 另一个标签页退出或会话到期
      if (token.value) handleSessionInvalid('tab')
      return
    }
    if (nextToken === token.value) return
    // 采纳另一个标签页登录/续期后的新 token
    applyToken(nextToken, localStorage.getItem(USERNAME_KEY) || username.value)
    pruneExpired()
    tick()
  }
  window.addEventListener('storage', onStorage)

  window.addEventListener('online', () => {
    if (renewError.value) renewError.value = ''
  })

  pruneExpired()
  tick()

  return {
    token,
    username,
    remainingMs,
    renewing,
    renewError,
    isLoggedIn,
    isExpired,
    isWarning,
    isOnline,
    login,
    renew,
    logout,
    pruneExpired,
    handleSessionInvalid
  }
})
