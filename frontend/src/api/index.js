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

// A definitive "invalid/expired session" response from the server must clear
// the local login state. Network errors are deliberately ignored here so an
// offline outage never causes a fake logout; the caller keeps the last known
// state until the server can be consulted again (or the token expires locally).
const AUTH_INVALIDATED = 'auth:invalidated'

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error.response?.status
    const url = error.config?.url || ''
    const isLoginAttempt = url.includes('/auth/login')

    if ((status === 401 || status === 403) && !isLoginAttempt) {
      window.dispatchEvent(new CustomEvent(AUTH_INVALIDATED, {
        detail: { reason: 'server' }
      }))
    }
    return Promise.reject(error)
  }
)

export { AUTH_INVALIDATED }
export default api
