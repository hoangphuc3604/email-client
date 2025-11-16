import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css' // Đảm bảo import file index.css
import App from './App' // Sửa từ App.tsx thành App

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)