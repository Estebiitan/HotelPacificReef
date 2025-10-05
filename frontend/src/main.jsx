// frontend/src/main.jsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import {
  createBrowserRouter,
  RouterProvider,
  Navigate,
  useLocation,
} from 'react-router-dom'
import './index.css'

// Importa usando el mismo nombre/casing que tus archivos reales:
import Home from './screens/home.jsx'
import Login from './screens/Login.jsx'
import Register from './screens/Register.jsx'
import Confirmar from './screens/confirmar.jsx'

// Ruta protegida: si no hay token, redirige a /login y recuerda a dónde iba
function PrivateRoute({ children }) {
  const token = localStorage.getItem('token') || sessionStorage.getItem('token')
  const loc = useLocation()
  return token ? children : <Navigate to="/login" replace state={{ from: loc.pathname }} />
}

const router = createBrowserRouter([
  { path: '/', element: <Home /> },
  { path: '/login', element: <Login /> },
  { path: '/register', element: <Register /> },
  {
    path: '/confirmar',
    element: (
      <PrivateRoute>
        <Confirmar />
      </PrivateRoute>
    ),
  },
  // 404 → Home
  { path: '*', element: <Navigate to="/" replace /> },
])

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>,
)
