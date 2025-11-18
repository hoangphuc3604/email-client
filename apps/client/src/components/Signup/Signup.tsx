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
          <form onSubmit={handleSubmit}>
            <input value={name} onChange={(e) => setName(e.target.value)} type="text" placeholder="User Name" />
            <input className="mt_20" value={email} onChange={(e) => setEmail(e.target.value)} type="email" placeholder="Email" />
            <input className="mt_20" value={password} onChange={(e) => setPassword(e.target.value)} type="password" placeholder="Create Password" />
            <button className="mt_20" type="submit">{mutation.isLoading ? 'Signing up...' : 'Sign Up'}</button>
          </form>
          {/* Local or server-side error display */}
          {localError && <div className="error" style={{ color: 'red', marginTop: 8 }}>{localError}</div>}
          {mutation.isError && (
            <div className="error" style={{ color: 'red', marginTop: 8 }}>
              {(() => {
                // Try to display backend validation details if present
                const err: any = mutation.error
                if (err?.response?.data) {
                  try {
                    // common shapes: { detail: '...' } or APIResponse wrapper { detail: ..., message: ..., errors: ... }
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

          <div className="divider mt_20">or</div>

          <button type="button" className="mt_20" onClick={() => navigate('/login')}>Sign In</button>
        </div>
      </div>
    </div>
  );
}

export default Signup;