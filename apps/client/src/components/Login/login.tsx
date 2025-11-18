import "./login.css"; // Import file CSS cho template
import { FcGoogle } from "react-icons/fc";
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useEffect } from 'react'
import { useLogin } from '../../hooks/useAuth'
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

  // navigate to dashboard on login success
  useEffect(() => {
    if (mutation.isSuccess) {
      navigate('/dashboard')
    }
  }, [mutation.isSuccess])

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

          <button type="button" className="btn-google mt_20">
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