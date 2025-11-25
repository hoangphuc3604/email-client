import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css' // Đảm bảo import file index.css
import App from './App' // Sửa từ App.tsx thành App

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import AuthInitializer from './auth/AuthInitializer'

const queryClient = new QueryClient()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <AuthInitializer />
      <App />
      <ReactQueryDevtools initialIsOpen={false} />
    </QueryClientProvider>
  </StrictMode>,
)