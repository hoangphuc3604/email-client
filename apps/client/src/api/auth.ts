import { api, refreshToken } from './client'

export type RegisterPayload = {
  email: string
  password: string
  name: string
}

export type LoginPayload = {
  email: string
  password: string
}

export const register = async (payload: RegisterPayload) => {
  const res = await api.post('/auth/register', payload)
  return res.data
}

export const login = async (payload: LoginPayload) => {
  const res = await api.post('/auth/login', payload)
  return res.data
}

export const logout = async () => {
  const res = await api.post('/auth/logout')
  return res.data
}

export const refresh = async () => {
  // Use centralized refresh implementation to avoid duplicate refresh requests
  const token = await refreshToken()
  return { data: { access_token: token } }
}

export const me = async () => {
  const res = await api.get('/auth/me')
  return res.data
}

export const getGoogleUrl = async () => {
  const res = await api.get('/auth/google/url')
  return res.data
}

export const google = async (payload: { credential?: string; code?: string }) => {
  const res = await api.post('/auth/google', payload)
  return res.data
}
