import React from 'react'
import ReactDOM from 'react-dom/client'
import { RouterProvider } from 'react-router'
import { useLicenseBootstrap } from './hooks/useLicense'
import { router } from './router'
import './index.css'
import { autoCleanupStorage } from './utils/storage'

autoCleanupStorage()

function Root() {
  useLicenseBootstrap()
  return <RouterProvider router={router} />
}

ReactDOM.createRoot(document.getElementById('root') ?? document.createElement('div')).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>,
)

postMessage({ payload: 'removeLoading' }, '*')
