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
  initializing: false,
  setInitializing: (v: boolean) => set(() => ({ initializing: v })),
}))

export default useAuthStore
