import { useMutation, useQueryClient } from '@tanstack/react-query'
import * as authApi from '../api/auth'
import useAuthStore from '../store/authStore'
import api from '../api/client'

function parseJwt(token: string | null) {
  if (!token) return null
  try {
    const parts = token.split('.')
    if (parts.length < 2) return null
    const b = parts[1].replace(/-/g, '+').replace(/_/g, '/')
    const json = decodeURIComponent(
      atob(b)
        .split('')
        .map(function (c) {
          return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)
        })
        .join('')
    )
    return JSON.parse(json)
  } catch (e) {
    return null
  }
}

function isTokenExpired(token: string | null) {
  const payload = parseJwt(token)
  if (!payload || !payload.exp) return true
  const now = Math.floor(Date.now() / 1000)
  return payload.exp <= now
}

export function useRegister() {
  const qc = useQueryClient()
  const setUser = useAuthStore((s) => s.setUser)

  return useMutation((payload: any) => authApi.register(payload), {
    onSuccess(data) {
      // data structure depends on backend APIResponse wrapper
      const user = data?.data?.user || data?.user || null
      const accessToken = data?.data?.access_token || data?.access_token
      if (accessToken) {
        api.defaults.headers.common['Authorization'] = `Bearer ${accessToken}`
        try {
          localStorage.setItem('access_token', accessToken)
        } catch (e) {
          // ignore storage errors
        }
      }
      setUser(user)
      qc.invalidateQueries(['me'])
    },
  })
}

export function useLogin() {
  const qc = useQueryClient()
  const setUser = useAuthStore((s) => s.setUser)

  return useMutation((payload: any) => authApi.login(payload), {
    onSuccess(data) {
      const user = data?.data?.user || data?.user || null
      const accessToken = data?.data?.access_token || data?.access_token
      if (accessToken) {
        api.defaults.headers.common['Authorization'] = `Bearer ${accessToken}`
        try {
          localStorage.setItem('access_token', accessToken)
        } catch (e) {
          // ignore storage errors
        }
      }
      setUser(user)
      qc.invalidateQueries(['me'])
    },
  })
}

export function useGoogleLogin() {
  const qc = useQueryClient()
  const setUser = useAuthStore((s) => s.setUser)

  return useMutation((credential: string) => authApi.google({ credential }), {
    onSuccess(data) {
      const user = data?.data?.user || data?.user || null
      const accessToken = data?.data?.access_token || data?.access_token
      if (accessToken) {
        api.defaults.headers.common['Authorization'] = `Bearer ${accessToken}`
        try {
          localStorage.setItem('access_token', accessToken)
        } catch (e) {}
      }
      setUser(user)
      qc.invalidateQueries(['me'])
    },
  })
}

export function useLogout() {
  const qc = useQueryClient()
  const clearUser = useAuthStore((s) => s.clearUser)

  return useMutation(() => authApi.logout(), {
    onSuccess() {
      clearUser()
      qc.removeQueries(['me'])
      delete api.defaults.headers.common['Authorization']
      try {
        localStorage.removeItem('access_token')
      } catch (e) {
        // ignore
      }
    },
  })
}

export function useMe() {
  const setUser = useAuthStore((s) => s.setUser)
  return useMutation(() => authApi.me(), {
    onSuccess(data) {
      const user = data?.data?.user ?? data?.data ?? data?.user ?? data ?? null
      setUser(user)
    },
  })
}

// Initialize auth on app start: try refresh -> set access token -> fetch user
export async function initAuth(queryClient: any) {
  const setInitializing = useAuthStore.getState().setInitializing
  setInitializing(true)
  try {
    // 1) Prefer stored access token for faster return-to-site behavior
    const stored = (() => {
      try {
        return localStorage.getItem('access_token')
      } catch (e) {
        return null
      }
    })()

    console.debug('initAuth: stored token present?', !!stored)

    if (stored && !isTokenExpired(stored)) {
      console.debug('initAuth: using stored token')
      api.defaults.headers.common['Authorization'] = `Bearer ${stored}`
      try {
        const meRes = await authApi.me()
        const user = meRes?.data?.user ?? meRes?.data ?? meRes?.user ?? meRes ?? null
        useAuthStore.getState().setUser(user)
        queryClient.invalidateQueries(['me'])
        return
      } catch (meErr) {
        console.debug('initAuth: stored token failed me(), will try refresh', meErr)
        // fall through to refresh attempt
      }
    }

    // 2) Try server-side refresh (cookie-based) as a fallback
    try {
      console.debug('initAuth: attempting server refresh')
      const refreshRes = await authApi.refresh()
      const accessToken = refreshRes?.data?.data?.access_token || refreshRes?.data?.access_token
      if (accessToken) {
        api.defaults.headers.common['Authorization'] = `Bearer ${accessToken}`
        try {
          localStorage.setItem('access_token', accessToken)
        } catch (e) {}
      }
      const meRes2 = await authApi.me()
      const user2 = meRes2?.data?.user ?? meRes2?.data ?? meRes2?.user ?? meRes2 ?? null
      useAuthStore.getState().setUser(user2)
      queryClient.invalidateQueries(['me'])
      return
    } catch (refreshErr) {
      console.debug('initAuth: refresh failed', refreshErr)
    }

    // nothing worked
    useAuthStore.getState().clearUser()
    try {
      localStorage.removeItem('access_token')
    } catch (e) {}
  } finally {
    setInitializing(false)
  }
}
