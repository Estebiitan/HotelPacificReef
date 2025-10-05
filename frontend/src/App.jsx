// /frontend/src/App.jsx
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";

// Respeta mayúsculas/minúsculas según tus archivos reales
import Home from "./screens/home.jsx";
import Login from "./screens/Login.jsx";
import Register from "./screens/Register.jsx";
import Confirmar from "./screens/confirmar.jsx";

function PrivateRoute({ children }) {
  const location = useLocation();
  const token = localStorage.getItem("token") || sessionStorage.getItem("token");
  if (token) return children;
  // Pasamos la ruta de origen para volver después del login
  return <Navigate to="/login" replace state={{ from: location.pathname }} />;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Públicas */}
        <Route path="/" element={<Home />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />

        {/* Protegida */}
        <Route
          path="/confirmar"
          element={
            <PrivateRoute>
              <Confirmar />
            </PrivateRoute>
          }
        />

        {/* 404 -> Home */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
