  import "./login.css"; // Import file CSS cho template
  import { FcGoogle } from "react-icons/fc";
  import { useState } from 'react'
  import { useNavigate, useSearchParams } from 'react-router-dom'
  import { useEffect } from 'react'
  import { useLogin, useGoogleLogin, useGoogleCodeLogin } from '../../hooks/useAuth'
  import useAuthStore from '../../store/authStore'

  function Login() {
    const navigate = useNavigate()
    const [searchParams] = useSearchParams()
    const mutation = useLogin()
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [isProcessingOAuth, setIsProcessingOAuth] = useState(false)
    const [validationError, setValidationError] = useState('')

    const handleSubmit = (e: any) => {
      e.preventDefault()
      setValidationError('')
      
      // Client-side validation
      if (!email || !email.includes('@')) {
        setValidationError('Please enter a valid email address')
        return
      }
      if (!password || password.length === 0) {
        setValidationError('Password is required')
        return
      }
      
      mutation.mutate({ email, password })
    }

    const googleMutation = useGoogleLogin()
    const googleCodeMutation = useGoogleCodeLogin()

    // Auto-login if code is present in URL (Google OAuth callback)
    useEffect(() => {
      const code = searchParams.get('code')
      if (code) {
        setIsProcessingOAuth(true)
        googleCodeMutation.mutate(code)
      }
    }, [searchParams])

    // load Google Identity Services script
    useEffect(() => {
      const existing = document.getElementById('google-identity')
      if (existing) return
      const s = document.createElement('script')
      s.src = 'https://accounts.google.com/gsi/client'
      s.async = true
      s.defer = true
      s.id = 'google-identity'
      s.onload = () => {
        // eslint-disable-next-line no-console
        console.log('gsi script loaded')
      }
      s.onerror = (err) => {
        // eslint-disable-next-line no-console
        console.error('gsi script failed to load', err)
      }
      document.body.appendChild(s)
      return () => { try { s.remove() } catch (e) {} }
    }, [])

    // debug: log vite env and google readiness (do not run `import.meta` in DevTools console)
    useEffect(() => {
      try {
        // import.meta.env is available inside the app code (Vite replaces it at build time)
        // eslint-disable-next-line no-console
        console.log('VITE_GOOGLE_CLIENT_ID', (import.meta as any).env?.VITE_GOOGLE_CLIENT_ID)
      } catch (e) {
        // eslint-disable-next-line no-console
        console.warn('Could not read import.meta.env here', e)
      }
      // eslint-disable-next-line no-console
      console.log('google ready?', !!(window as any).google && !!(window as any).google.accounts && !!(window as any).google.accounts.id)
    }, [])

    async function handleGoogleClick() {
      try {
        // Ask backend for the Google authorization URL
        const res = await (await import('../../api/auth')).getGoogleUrl()
        const url = res?.data || res || null
        if (!url) {
          alert('Failed to get Google auth URL from server')
          return
        }

        // Redirect to Google OAuth in the same window
        window.location.href = url
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error('Google sign-in failed, popup fallback', e)
        alert('Google sign-in failed')
      }
    }
    
    // navigate to dashboard on login success
    useEffect(() => {
      if (mutation.isSuccess) {
        navigate('/dashboard')
      }
    }, [mutation.isSuccess])

    // navigate to dashboard on google login success
    useEffect(() => {
      if (googleMutation.isSuccess) {
        navigate('/dashboard')
      }
    }, [googleMutation.isSuccess])

    // navigate to dashboard on google code login success
    useEffect(() => {
      if (googleCodeMutation.isSuccess) {
        navigate('/dashboard')
      }
    }, [googleCodeMutation.isSuccess])

    // if already authenticated, redirect to dashboard
    const user = useAuthStore(s => s.user)
    useEffect(() => {
      if (user) navigate('/dashboard')
    }, [user])

    // Show loading screen during OAuth processing
    if (isProcessingOAuth) {
      return (
        <div className="login_wrap_container">
          <div className="login_wrap">
            <div className="ring">
              <i></i>
              <i></i>
              <i></i>
            </div>
            <div className="login_box" style={{ textAlign: 'center', padding: '40px' }}>
              <div className="oauth-loading">
                <div className="spinner" style={{
                  width: '60px',
                  height: '60px',
                  margin: '0 auto 20px',
                  border: '4px solid rgba(255, 255, 255, 0.1)',
                  borderTop: '4px solid #fff',
                  borderRadius: '50%',
                  animation: 'spin 1s linear infinite'
                }}></div>
                <h3 style={{ color: '#fff', marginBottom: '10px' }}>Signing you in...</h3>
                <p style={{ color: 'rgba(255, 255, 255, 0.7)', fontSize: '14px' }}>
                  Please wait while we complete your authentication
                </p>
              </div>
            </div>
          </div>
        </div>
      )
    }

    return (
      <div className="login_wrap_container">
        <div className="login_wrap">
          <div className="ring">
            <i></i>
            <i></i>
            <i></i>
          </div>
          <div className="login_box">
            <h2>Login</h2>
            
            {/* Error messages */}
            {validationError && (
              <div style={{ 
                padding: '10px', 
                marginBottom: '15px', 
                backgroundColor: 'rgba(255, 77, 79, 0.15)', 
                border: '1px solid rgba(255, 77, 79, 0.3)',
                borderRadius: '5px',
                color: '#ff4d4f',
                fontSize: '14px'
              }}>
                {validationError}
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
                {(mutation.error as any)?.response?.data?.detail || (mutation.error as any)?.message || 'Invalid email or password'}
              </div>
            )}
            
            <form onSubmit={handleSubmit}>
              <input 
                value={email} 
                onChange={(e) => { setEmail(e.target.value); setValidationError('') }} 
                type="text" 
                placeholder="Email"
                disabled={mutation.isLoading}
              />
              <input 
                className="mt_20" 
                value={password} 
                onChange={(e) => { setPassword(e.target.value); setValidationError('') }} 
                type="password" 
                placeholder="Password"
                disabled={mutation.isLoading}
              />
              <button className="mt_20" type="submit" disabled={mutation.isLoading}>
                {mutation.isLoading ? 'Signing in...' : 'Sign in'}
              </button>
            </form>

            <div className="divider mt_20">or</div>

            <button type="button" className="btn-google mt_20" onClick={handleGoogleClick} disabled={mutation.isLoading}>
              <FcGoogle />
              Login with Google
            </button>

            <div className="custom_flex">
              <a className="mt_20" href="#" onClick={() => navigate('/forgot')}>Forget Password</a>
            </div>
          </div>
        </div>
      </div>
    );
  }

  export default Login;