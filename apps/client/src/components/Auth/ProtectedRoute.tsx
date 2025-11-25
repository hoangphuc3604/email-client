import React from 'react'
import { Navigate } from 'react-router-dom'
import useAuthStore from '../../store/authStore'

type Props = {
  children: React.ReactElement
}

export default function ProtectedRoute({ children }: Props) {
  const user = useAuthStore((s) => s.user)
  const initializing = useAuthStore((s) => s.initializing)

  if (initializing) return null

  if (!user) {
    return <Navigate to="/login" replace />
  }

  return children
}
