import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { initAuth } from '../hooks/useAuth'

// Guard to prevent running initAuth multiple times in development StrictMode
// and on accidental double-mounts.
let hasInitializedAuth = false

export default function AuthInitializer() {
  const qc = useQueryClient()

  useEffect(() => {
    if (hasInitializedAuth) return
    hasInitializedAuth = true
    // Validate / refresh as normal
    // Access token will be stored in Zustand store (in-memory) after successful refresh
    initAuth(qc)
  }, [])

  return null
}
