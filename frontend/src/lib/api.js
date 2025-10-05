// frontend/src/lib/api.js
const RAW_BASE = import.meta.env.VITE_API_URL || "http://localhost:8000";
// asegura que no termine en "/"
const BASE_URL = RAW_BASE.replace(/\/+$/, "");

// helper de request con mejor manejo de errores
async function request(path, { method = "GET", body, headers = {} } = {}) {
  const token =
    localStorage.getItem("token") || sessionStorage.getItem("token");

  const url = `${BASE_URL}${path.startsWith("/") ? "" : "/"}${path}`;

  try {
    const res = await fetch(url, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...headers,
      },
      body: body ? JSON.stringify(body) : undefined,
      // credentials: "include", // <- SOLO si usas cookies httpOnly
    });

    // intenta json; si no, cae a texto
    const raw = await res.text();
    let data = {};
    try { data = raw ? JSON.parse(raw) : {}; } catch { data = { message: raw }; }

    if (!res.ok) {
      const msg = data?.message || data?.detail || `Error ${res.status}`;
      throw new Error(msg);
    }
    return data;
  } catch (err) {
    if (err?.message === "Failed to fetch") {
      throw new Error(
        "No se pudo conectar con el servidor (revisa VITE_API_URL, que el backend este arriba y CORS)."
      );
    }
    throw err;
  }
}

// APIs
export const api = {
  // Auth
  register: (payload) => request("/api/auth/register", { method: "POST", body: payload }),
  login:    (payload) => request("/api/auth/login",    { method: "POST", body: payload }),
  me:       ()         => request("/api/auth/me",       { method: "GET" }),

  // Negocio
  disponibles: (q) => request(`/api/habitaciones/disponibles?${q}`),
  crearReserva: (payload) => request("/api/reservas", { method: "POST", body: payload }),
  montos: (id) => request(`/api/reservas/${id}/montos`),
};
