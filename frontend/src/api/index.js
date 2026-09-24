import axios from 'axios'

const api = axios.create({
  baseURL: '/api',
  timeout: 10000
})

// Add token to requests if available
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('blog_token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// Handle authentication failures.
// 401/403 from any authenticated call means the session is gone server-side:
// hand off to the auth store's invalid-session flow (clear state + redirect).
// Network errors (offline/timeout) must NOT be treated as logout — otherwise a
// dropped connection would look like a fake-logout / redirect loop.
api.interceptors.response.use(
  (response) => response,
  (error) => {
    const url = error.config?.url || ''
    const isLoginRequest = url.includes('/auth/login')
    const status = error.response?.status

    if (!isLoginRequest && (status === 401 || status === 403)) {
      window.dispatchEvent(new CustomEvent('blog:api-unauthorized'))
    }
    return Promise.reject(error)
  }
)

export default api
