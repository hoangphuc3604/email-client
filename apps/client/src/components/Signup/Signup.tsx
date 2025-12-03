import "./signup.css"; // Import file CSS
import { useNavigate } from "react-router-dom";
import { useEffect } from 'react'
import { useState } from "react";
import { useRegister } from "../../hooks/useAuth";
import useAuthStore from '../../store/authStore'

function Signup() {
  const navigate = useNavigate();
  const mutation = useRegister()

  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [localError, setLocalError] = useState<string | null>(null)

  const handleSubmit = async (e: any) => {
    e.preventDefault()
    setLocalError(null)
    // basic client-side validations to avoid 422 from backend
    if (!name || name.trim().length === 0) {
      setLocalError('Name is required')
      return
    }
    if (!email || !email.includes('@')) {
      setLocalError('A valid email is required')
      return
    }
    if (!password || password.length < 8) {
      setLocalError('Password must be at least 8 characters')
      return
    }

    mutation.mutate({ name, email, password })
  }

  // navigate to login when signup succeeds
  useEffect(() => {
    if (mutation.isSuccess) {
      // Clear any auto-saved access token from the register handler so
      // we go to the login page and require an explicit sign-in.
      try { delete (window as any).api?.defaults?.headers?.common['Authorization'] } catch (e) {}
      try { 
        useAuthStore.getState().clearUser()
        useAuthStore.getState().clearAccessToken()
      } catch (e) {}
      navigate('/login')
    }
  }, [mutation.isSuccess])

  // if already authenticated, redirect to dashboard
  const user = useAuthStore(s => s.user)
  useEffect(() => {
    if (user) navigate('/dashboard')
  }, [user])

  return (
    <div className="signup_wrap_container">
      <div className="signup_wrap">
        <div className="ring">
          <i></i>
          <i></i>
          <i></i>
        </div>
        <div className="signup_box">
          <h2>Sign Up</h2>
          
          {/* Error messages with consistent styling */}
          {localError && (
            <div style={{ 
              padding: '10px', 
              marginBottom: '15px', 
              backgroundColor: 'rgba(255, 77, 79, 0.15)', 
              border: '1px solid rgba(255, 77, 79, 0.3)',
              borderRadius: '5px',
              color: '#ff4d4f',
              fontSize: '14px'
            }}>
              {localError}
            </div>
          )}
          
          {mutation.isError && (
            <div style={{ 
              padding: '10px', 
              marginBottom: '15px', 
              backgroundColor: 'rgba(255, 77, 79, 0.15)', 
              border: '1px solid rgba(255, 77, 79, 0.3)',
              borderRadius: '5px',
              color: '#ff4d4f',
              fontSize: '14px'
            }}>
              {(() => {
                const err: any = mutation.error
                if (err?.response?.data) {
                  try {
                    const data = err.response.data
                    if (data.detail) return String(data.detail)
                    if (data.message) return String(data.message)
                    return JSON.stringify(data)
                  } catch (e) {
                    return String(err.message || 'Request failed')
                  }
                }
                return String(err?.message || 'Request failed')
              })()}
            </div>
          )}
          
          <form onSubmit={handleSubmit}>
            <input 
              value={name} 
              onChange={(e) => { setName(e.target.value); setLocalError(null) }} 
              type="text" 
              placeholder="User Name"
              disabled={mutation.isLoading}
            />
            <input 
              className="mt_20" 
              value={email} 
              onChange={(e) => { setEmail(e.target.value); setLocalError(null) }} 
              type="email" 
              placeholder="Email"
              disabled={mutation.isLoading}
            />
            <input 
              className="mt_20" 
              value={password} 
              onChange={(e) => { setPassword(e.target.value); setLocalError(null) }} 
              type="password" 
              placeholder="Create Password"
              disabled={mutation.isLoading}
            />
            <button className="mt_20" type="submit" disabled={mutation.isLoading}>
              {mutation.isLoading ? 'Signing up...' : 'Sign Up'}
            </button>
          </form>

          <div className="divider mt_20">or</div>

          <button type="button" className="mt_20" onClick={() => navigate('/login')}>Sign In</button>
        </div>
      </div>
    </div>
  );
}

export default Signup;