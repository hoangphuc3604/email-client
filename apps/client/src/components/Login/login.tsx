  import "./login.css"; // Import file CSS cho template
  import { FcGoogle } from "react-icons/fc";
  import { useState } from 'react'
  import { useNavigate } from 'react-router-dom'
  import { useEffect } from 'react'
  import { useLogin, useGoogleLogin } from '../../hooks/useAuth'
  import useAuthStore from '../../store/authStore'

  function Login() {
    const navigate = useNavigate()
    const mutation = useLogin()
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')

    const handleSubmit = (e: any) => {
      e.preventDefault()
      mutation.mutate({ email, password })
    }

    const googleMutation = useGoogleLogin()

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
      const clientId = (import.meta as any).env?.VITE_GOOGLE_CLIENT_ID
      if (!clientId) {
        alert('Google Client ID not configured')
        return
      }

      try {
        const ready = await waitForGIS(5000)
        if (!ready) {
          // Fall back to popup OAuth if GIS/One-Tap is blocked
          // eslint-disable-next-line no-console
          console.warn('GIS not ready within timeout, falling back to popup OAuth')
          await openOAuthPopup(clientId)
          return
        }
        // @ts-ignore
        window.google.accounts.id.initialize({
          client_id: clientId,
          callback: (resp: any) => {
            const cred = resp?.credential
            if (cred) {
              googleMutation.mutate(cred)
            }
          }
        })
        // @ts-ignore
        window.google.accounts.id.prompt()
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error('Google sign-in failed, falling back to popup', e)
        try {
          await openOAuthPopup(clientId)
        } catch (err) {
          // eslint-disable-next-line no-console
          console.error('Popup fallback also failed', err)
          alert('Google sign-in failed')
        }
      }
    }

    // Popup fallback: open Google's OAuth2 endpoint and wait for redirect to our app (hash contains id_token)
    async function openOAuthPopup(clientId: string) {
      const redirectUri = window.location.origin + '/google-callback'
      const nonce = Math.random().toString(36).slice(2)
      const scope = encodeURIComponent('openid email profile')
      const url = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${encodeURIComponent(clientId)}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=id_token&scope=${scope}&nonce=${nonce}&prompt=select_account`

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
          if (data && data.type === 'google-id_token' && data.id_token) {
            try { if (popup && !popup.closed) popup.close() } catch (e) {}
            cleanup()
            googleMutation.mutate(data.id_token)
            resolve()
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