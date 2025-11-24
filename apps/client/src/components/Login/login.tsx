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

    const handleSubmit = (e: any) => {
      e.preventDefault()
      mutation.mutate({ email, password })
    }

    const googleMutation = useGoogleLogin()
    const googleCodeMutation = useGoogleCodeLogin()

    // Auto-login if code is present in URL (Google OAuth callback)
    useEffect(() => {
      const code = searchParams.get('code')
      if (code) {
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

    async function waitForGIS(timeout = 5000) {
      const start = Date.now()
      // simple poll loop
      // eslint-disable-next-line no-constant-condition
      while (true) {
        // @ts-ignore
        if ((window as any).google && (window as any).google.accounts && (window as any).google.accounts.id) return true
        if (Date.now() - start > timeout) return false
        // eslint-disable-next-line no-await-in-loop
        await new Promise((r) => setTimeout(r, 200))
      }
    }

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

    // Popup fallback: open the provided authorization URL and wait for redirect (code or id_token)
    async function openOAuthPopup(url: string) {
      const width = 500
      const height = 600
      const left = window.screenX + (window.outerWidth - width) / 2
      const top = window.screenY + (window.outerHeight - height) / 2
      const opts = `width=${width},height=${height},left=${left},top=${top}`
      const popup = window.open(url, 'google_oauth', opts)
      if (!popup) throw new Error('Popup blocked')

      return new Promise<void>((resolve, reject) => {
        let resolved = false

        function cleanup() {
          resolved = true
          try { window.removeEventListener('message', messageHandler) } catch (e) {}
          try { if (pollTimer) clearInterval(pollTimer) } catch (e) {}
          try { if (timeoutTimer) clearTimeout(timeoutTimer) } catch (e) {}
        }

        function messageHandler(e: MessageEvent) {
          if (e.origin !== window.location.origin) return
          const data = e.data || {}
          if (data && data.type === 'google-code' && data.code) {
            try { if (popup && !popup.closed) popup.close() } catch (e) {}
            cleanup()
            // send auth code to backend
            googleCodeMutation.mutate(data.code)
            resolve()
            return
          }
          if (data && data.type === 'google-id_token' && data.id_token) {
            try { if (popup && !popup.closed) popup.close() } catch (e) {}
            cleanup()
            // fallback: if we receive id_token, use existing id_token flow
            googleMutation.mutate(data.id_token)
            resolve()
            return
          }
        }

        window.addEventListener('message', messageHandler)

        // keep a poll to detect popup closed
        const pollTimer = setInterval(() => {
          try {
            if (!popup || popup.closed) {
              if (!resolved) {
                cleanup()
                reject(new Error('Popup closed'))
              }
            }
          } catch (e) {}
        }, 500)

        const timeoutTimer = setTimeout(() => {
          if (!resolved) {
            try { if (popup && !popup.closed) popup.close() } catch (e) {}
            cleanup()
            reject(new Error('Timeout waiting for OAuth popup'))
          }
        }, 2 * 60 * 1000)
      })
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
            <form onSubmit={handleSubmit}>
              <input value={email} onChange={(e) => setEmail(e.target.value)} type="text" placeholder="Email" />
              <input className="mt_20" value={password} onChange={(e) => setPassword(e.target.value)} type="password" placeholder="Password" />
              <button className="mt_20" type="submit">{mutation.isLoading ? 'Signing in...' : 'Sign in'}</button>
            </form>

            <div className="divider mt_20">or</div>

            <button type="button" className="btn-google mt_20" onClick={handleGoogleClick}>
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