import create from 'zustand'

type User = {
  id: string
  email: string
  name: string
  picture?: string
  avatar?: string
  provider?: 'google' | 'email'
} | null

type AuthState = {
  user: User
  accessToken: string | null
  setUser: (u: User) => void
  setAccessToken: (token: string | null) => void
  clearUser: () => void
  clearAccessToken: () => void
  initializing: boolean
  setInitializing: (v: boolean) => void
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  accessToken: null,
  setUser: (u) => set(() => ({ user: u })),
  setAccessToken: (token) => set(() => ({ accessToken: token })),
  clearUser: () => set(() => ({ user: null })),
  clearAccessToken: () => set(() => ({ accessToken: null })),
  // start as initializing=true so the app waits for initAuth to complete
  // before ProtectedRoute can redirect to /login on first render.
  initializing: true,
  setInitializing: (v: boolean) => set(() => ({ initializing: v })),
}))

export default useAuthStore
