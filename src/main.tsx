import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import './ui/core/motion.css'
import { RuntimeErrorBoundary } from './ui/RuntimeErrorBoundary'
import { installBrowserGestureGuard } from './ui/browserGestureGuard'

const root = document.getElementById('root')!
// Dialogs are portaled to body, outside the React root.
const removeGestureGuard = installBrowserGestureGuard(document.body)
if (import.meta.hot) import.meta.hot.dispose(removeGestureGuard)

createRoot(root).render(
  <RuntimeErrorBoundary><App /></RuntimeErrorBoundary>,
)
