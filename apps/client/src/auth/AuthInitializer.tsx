import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { initAuth } from '../hooks/useAuth'

export default function AuthInitializer() {
  const qc = useQueryClient()

  useEffect(() => {
    // try to refresh and fetch current user
    initAuth(qc)
  }, [])

  return null
}
