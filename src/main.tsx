import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { RuntimeErrorBoundary } from './ui/RuntimeErrorBoundary'

createRoot(document.getElementById('root')!).render(
  <RuntimeErrorBoundary><App /></RuntimeErrorBoundary>,
)
