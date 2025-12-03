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
    // Validate / refresh as normal
    // Access token will be stored in Zustand store (in-memory) after successful refresh
    initAuth(qc)
  }, [])

  return null
}
