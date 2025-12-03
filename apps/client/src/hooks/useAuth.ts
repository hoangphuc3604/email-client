import { useMutation, useQueryClient } from '@tanstack/react-query'
import * as authApi from '../api/auth'
import useAuthStore from '../store/authStore'
import api from '../api/client'

function extractAccessToken(resp: any): string | null {
  if (!resp) return null
  // common shapes to check (ordered by likelihood)
  const candidates = [
    resp.access_token,
    resp?.data?.access_token,
    resp?.data?.data?.access_token,
    resp?.data?.accessToken,
    resp?.accessToken,
    resp?.token,
  ]
  for (const c of candidates) {
    if (typeof c === 'string' && c.length > 0) return c
  }
  return null
}

export function useRegister() {
  const qc = useQueryClient()
  const setUser = useAuthStore((s) => s.setUser)
  const setAccessToken = useAuthStore((s) => s.setAccessToken)

  return useMutation((payload: any) => authApi.register(payload), {
    onSuccess(data) {
      const user = data?.data?.user || data?.user || null
      const accessToken = extractAccessToken(data)
      if (accessToken) {
        setAccessToken(accessToken)
        api.defaults.headers.common['Authorization'] = `Bearer ${accessToken}`
      }
      setUser(user)
      qc.invalidateQueries(['me'])
    },
  })
}

export function useLogin() {
  const qc = useQueryClient()
  const setUser = useAuthStore((s) => s.setUser)
  const setAccessToken = useAuthStore((s) => s.setAccessToken)

  return useMutation((payload: any) => authApi.login(payload), {
    onSuccess(data) {
      const user = data?.data?.user || data?.user || null
      const accessToken = extractAccessToken(data)
      if (accessToken) {
        setAccessToken(accessToken)
        api.defaults.headers.common['Authorization'] = `Bearer ${accessToken}`
      }
      setUser(user)
      qc.invalidateQueries(['me'])
    },
  })
}

export function useGoogleLogin() {
  const qc = useQueryClient()
  const setUser = useAuthStore((s) => s.setUser)
  const setAccessToken = useAuthStore((s) => s.setAccessToken)

  return useMutation((credential: string) => authApi.google({ credential }), {
    onSuccess(data) {
      const user = data?.data?.user || data?.user || null
      const accessToken = extractAccessToken(data)
      if (accessToken) {
        setAccessToken(accessToken)
        api.defaults.headers.common['Authorization'] = `Bearer ${accessToken}`
      }
      setUser(user)
      qc.invalidateQueries(['me'])
    },
  })
}

export function useGoogleCodeLogin() {
  const qc = useQueryClient()
  const setUser = useAuthStore((s) => s.setUser)
  const setAccessToken = useAuthStore((s) => s.setAccessToken)

  return useMutation((code: string) => authApi.google({ code }), {
    onSuccess(data) {
      const user = data?.data?.user || data?.user || null
      const accessToken = extractAccessToken(data)
      if (accessToken) {
        setAccessToken(accessToken)
        api.defaults.headers.common['Authorization'] = `Bearer ${accessToken}`
      }
      setUser(user)
      qc.invalidateQueries(['me'])
    },
  })
}

export function useLogout() {
  const qc = useQueryClient()
  const clearUser = useAuthStore((s) => s.clearUser)
  const clearAccessToken = useAuthStore((s) => s.clearAccessToken)

  return useMutation(() => authApi.logout(), {
    onSuccess() {
      clearUser()
      clearAccessToken()
      qc.removeQueries(['me'])
      delete api.defaults.headers.common['Authorization']
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
  const setAccessToken = useAuthStore.getState().setAccessToken
  setInitializing(true)
  try {
    // Try server-side refresh (cookie-based) to get access token
    try {
      console.debug('initAuth: attempting server refresh')
      const refreshRes = await authApi.refresh()
      // Backend returns camelCase (accessToken) due to CamelModel, but also check snake_case for compatibility
      const accessToken = refreshRes?.data.access_token
      
      if (accessToken && typeof accessToken === 'string' && accessToken.length > 0) {
        setAccessToken(accessToken)
        api.defaults.headers.common['Authorization'] = `Bearer ${accessToken}`
        
        // Now call me() with the valid token
        try {
          const meRes = await authApi.me()
          const user = meRes?.data?.user ?? meRes?.data ?? meRes?.user ?? meRes ?? null
          if (user) {
            useAuthStore.getState().setUser(user)
            queryClient.invalidateQueries(['me'])
            return
          } else {
            console.debug('initAuth: me() returned no user')
          }
        } catch (meErr) {
          console.debug('initAuth: me() failed after refresh', meErr)
          // If me() fails, token might be invalid, clear it
          setAccessToken(null)
          delete api.defaults.headers.common['Authorization']
        }
      } else {
        console.debug('initAuth: no valid access token received from refresh')
      }
    } catch (refreshErr) {
      console.debug('initAuth: refresh failed', refreshErr)
    }

    // nothing worked - clear state
    useAuthStore.getState().clearUser()
    useAuthStore.getState().clearAccessToken()
    delete api.defaults.headers.common['Authorization']
  } finally {
    setInitializing(false)
  }
}
