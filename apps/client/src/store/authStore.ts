import create from 'zustand'

type User = {
  id: string
  email: string
  name: string
} | null

type AuthState = {
  user: User
  setUser: (u: User) => void
  clearUser: () => void
  initializing: boolean
  setInitializing: (v: boolean) => void
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  setUser: (u) => set(() => ({ user: u })),
  clearUser: () => set(() => ({ user: null })),
  // start as initializing=true so the app waits for initAuth to complete
  // before ProtectedRoute can redirect to /login on first render.
  initializing: true,
  setInitializing: (v: boolean) => set(() => ({ initializing: v })),
}))

export default useAuthStore
