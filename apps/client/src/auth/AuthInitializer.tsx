import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { initAuth } from '../hooks/useAuth'
import api from '../api/client'
import useAuthStore from '../store/authStore'

function decodeJwt(token: string | null) {
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

export default function AuthInitializer() {
  const qc = useQueryClient()

  useEffect(() => {
    // If an access token is present in localStorage, apply it immediately so
    // routes don't redirect before initAuth validates it. This is optimistic;
    // initAuth will still verify the token with the server.
    try {
      const token = localStorage.getItem('access_token')
      if (token) {
        api.defaults.headers.common['Authorization'] = `Bearer ${token}`
        const payload = decodeJwt(token)
        if (payload) {
          const setUser = useAuthStore.getState().setUser
          const user = {
            id: payload.sub || payload.user_id || '',
            email: payload.email || payload.sub || '',
            name: payload.name || payload.email || '',
          }
          try { setUser(user) } catch (e) {}
        }
      }
    } catch (e) {}

    // Validate / refresh as normal
    initAuth(qc)
  }, [])

  return null
}
