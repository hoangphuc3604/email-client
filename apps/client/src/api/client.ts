import axios, { AxiosError } from 'axios'
import type { AxiosRequestConfig } from 'axios'
import useAuthStore from '../store/authStore'

const API_BASE = (import.meta as any).env?.VITE_API_BASE_URL || ''
const API_PREFIX = '/api/v1'

export const api = axios.create({
  baseURL: API_BASE + API_PREFIX,
  headers: {
    'Content-Type': 'application/json',
  },
  withCredentials: true,
})

// If an access token was stored from a previous session, set it on the client
try {
  const stored = localStorage.getItem('access_token')
  if (stored) {
    api.defaults.headers.common['Authorization'] = `Bearer ${stored}`
  }
} catch (e) {
  // ignore if localStorage is not available
}

// A separate client used for refresh calls to avoid interceptor loops
const refreshClient = axios.create({
  baseURL: API_BASE + API_PREFIX,
  withCredentials: true,
})

let isRefreshing = false
let failedQueue: Array<{
  resolve: (value?: unknown) => void
  reject: (error: any) => void
  config: AxiosRequestConfig
}> = []

const processQueue = (error: any, token: string | null = null) => {
  failedQueue.forEach((prom) => {
    if (error) {
      prom.reject(error)
    } else {
      if (token && prom.config.headers) prom.config.headers['Authorization'] = `Bearer ${token}`
      prom.resolve(prom.config)
    }
  })
  failedQueue = []
}

// Centralized refresh function to avoid duplicate refresh requests
export async function refreshToken(): Promise<string> {
  if (isRefreshing) {
    return new Promise<string>((resolve, reject) => {
      failedQueue.push({ resolve: resolve as any, reject, config: {} as AxiosRequestConfig })
    })
  }

  isRefreshing = true

  try {
    const refreshRes = await refreshClient.post('/auth/refresh')
    const accessToken = refreshRes?.data?.data?.access_token || refreshRes?.data?.access_token
    if (accessToken) {
      api.defaults.headers.common['Authorization'] = `Bearer ${accessToken}`
      try {
        localStorage.setItem('access_token', accessToken)
      } catch (e) {}
    }
    processQueue(null, accessToken)
    isRefreshing = false
    return accessToken
  } catch (refreshError) {
    try {
      localStorage.removeItem('access_token')
    } catch (e) {}
    try {
      localStorage.removeItem('email_previews_map')
    } catch (e) {}
    processQueue(refreshError, null)
    isRefreshing = false
    // Force local logout state and redirect to login, but avoid redirect loops.
    try {
      useAuthStore.getState().clearUser()
    } catch (e) {}
    try {
      delete api.defaults.headers.common['Authorization']
    } catch (e) {}

    // Only redirect once to avoid reload loops when multiple requests fail.
    try {
      const alreadyAtLogin = typeof window !== 'undefined' && (window.location.pathname === '/login' || window.location.pathname === '/signup')
      ;(refreshToken as any)._hasForcedLogout = (refreshToken as any)._hasForcedLogout || false
      if (!alreadyAtLogin && !(refreshToken as any)._hasForcedLogout) {
        ;(refreshToken as any)._hasForcedLogout = true
        try {
          window.location.href = '/login'
        } catch (e) {}
      }
    } catch (e) {}

    throw refreshError
  }
}

api.interceptors.response.use(
  (res) => res,
  async (err: AxiosError) => {
    const originalRequest = err.config as AxiosRequestConfig & { _retry?: boolean }
    const status = err.response?.status

    if (status === 401 && !originalRequest._retry) {
      // Don't try to refresh when calling refresh itself
      if (originalRequest.url && originalRequest.url.includes('/auth/refresh')) {
        return Promise.reject(err)
      }
        // queue other requests while we refresh
        if (isRefreshing) {
          return new Promise((resolve, reject) => {
            failedQueue.push({ resolve, reject, config: originalRequest })
          })
            .then((cfg: any) => api(cfg))
            .catch((e) => Promise.reject(e))
        }

        originalRequest._retry = true

        try {
          const accessToken = await refreshToken()
          if (accessToken && originalRequest.headers) {
            originalRequest.headers['Authorization'] = `Bearer ${accessToken}`
          }
          return api(originalRequest)
        } catch (refreshError) {
          return Promise.reject(refreshError)
        }
    }

    return Promise.reject(err)
  }
)

export default api
