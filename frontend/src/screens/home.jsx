import React, { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'

export default function Home(){
  // Filtros de búsqueda
  const [entrada, setEntrada] = useState('2025-10-10')
  const [salida,  setSalida ] = useState('2025-10-12')
  const [hotel,   setHotel  ] = useState('1')
  const [huespedes, setHuespedes] = useState(2)

  // Resultados / estados
  const [items, setItems]     = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState('')
  const [log, setLog]         = useState('')

  // Filtro por tipo
  const [filtroTipo, setFiltroTipo] = useState('Todos')

  // Sesión
  const [user, setUser] = useState(null)

  const API = import.meta.env.VITE_API_URL || import.meta.env.VITE_API_BASE || 'http://localhost:8000'
  const nav = useNavigate()

  // Cargar datos del usuario si hay token
  useEffect(() => {
    const token = localStorage.getItem('token') || sessionStorage.getItem('token')
    if (!token) { setUser(null); return }
    ;(async () => {
      try {
        const r = await fetch(`${API}/api/auth/me`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (!r.ok) throw new Error('No autorizado')
        const data = await r.json()
        setUser(data)
      } catch {
        // token inválido → limpiar
        localStorage.removeItem('token')
        sessionStorage.removeItem('token')
        setUser(null)
      }
    })()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const logout = () => {
    localStorage.removeItem('token')
    sessionStorage.removeItem('token')
    setUser(null)
    // Redirige al Home
    nav("/", { replace: true });
  }

  const buscar = async () => {
    setError(''); setItems([])
    if (!entrada || !salida || new Date(salida) <= new Date(entrada)) {
      setError('Rango de fechas inválido'); return
    }
    setLoading(true)
    try {
      const url = `${API}/api/habitaciones/disponibles?entrada=${encodeURIComponent(entrada)}&salida=${encodeURIComponent(salida)}&hotel_id=${encodeURIComponent(hotel)}`
      const r = await fetch(url)
      const data = await r.json()
      if (!r.ok) throw new Error(data.detail || 'Error al consultar disponibilidad')
      setItems(data); setLog(`GET ${url} → ${r.status}`)
    } catch (e) { setError(String(e.message || e)) }
    finally { setLoading(false) }
  }

  const reservarClick = (hab) => {
    const token = localStorage.getItem('token') || sessionStorage.getItem('token')
    if (!token) {
      alert('Debes iniciar sesión para reservar.')
      nav('/login', { state: { from: '/confirmar' } })
      return
    }
    nav('/confirmar', {
      state: {
        hab,
        entrada,
        salida,
        huespedes: Number(huespedes || 1),
        hotelId: Number(hotel || 1)
      }
    })
  }

  const itemsFiltrados = useMemo(() => {
    if (filtroTipo === 'Todos') return items
    return items.filter(x => (x.tipo || '').toLowerCase() === filtroTipo.toLowerCase())
  }, [items, filtroTipo])

  return (
    <div className="min-h-screen bg-[#FFE082]">
      {/* Navbar */}
      <header className="bg-[#FFE082]">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="text-2xl font-extrabold">Pacific Reef</div>

          {/* Estado de sesión en el header */}
          <nav className="flex items-center gap-3 text-sm">
            {user ? (
              <>
                <span className="hidden sm:inline text-gray-700">
                  Hola{user.first_name ? `, ${user.first_name}` : ''} 👋
                </span>
                <button
                  className="btn-outline"
                  onClick={() => alert('Proximamente: historial de reservas')}
                >
                  Reservas
                </button>
                <button className="btn-outline" onClick={logout}>Cerrar sesión</button>
              </>
            ) : (
              <>
                <button className="btn-outline" onClick={() => nav('/register')}>Registrarse</button>
                <button className="btn-outline" onClick={() => nav('/login')}>Iniciar sesión</button>
              </>
            )}
            <span className="text-gray-700">ES ▾</span>
          </nav>
        </div>
      </header>

      {/* Barra de búsqueda */}
      <section className="max-w-6xl mx-auto px-4">
        <div className="card mt-2 bg-[#FFF7D1]">
          <div className="grid md:grid-cols-5 gap-3 items-end">
            <label className="label">Fecha Entrada
              <input type="date" className="input" value={entrada} onChange={e=>setEntrada(e.target.value)} />
            </label>
            <label className="label">Fecha Salida
              <input type="date" className="input" value={salida} onChange={e=>setSalida(e.target.value)} />
            </label>
            <label className="label">Huéspedes
              <input type="number" min={1} className="input" value={huespedes} onChange={e=>setHuespedes(e.target.value)} />
            </label>
            <label className="label">Hotel
              <input type="number" min={1} className="input" value={hotel} onChange={e=>setHotel(e.target.value)} />
            </label>
            <div><button className="btn w-full" onClick={buscar} disabled={loading}>{loading ? 'Buscando…' : 'Buscar'}</button></div>
          </div>
          {error && <p className="text-red-600 mt-2">{error}</p>}
          {log && <p className="text-xs text-gray-500 mt-1">{log}</p>}
        </div>
      </section>

      {/* Listado */}
      <main className="max-w-6xl mx-auto px-4 py-6">
        <h2 className="text-3xl font-bold mb-4">Habitaciones</h2>

        <div className="flex gap-2 mb-4">
          {['Todos', 'Turista', 'Premium'].map(op => (
            <button
              key={op}
              onClick={()=>setFiltroTipo(op)}
              className={`chip ${filtroTipo===op ? 'bg-[#2E8BC0] text-white border-[#2E8BC0]' : ''}`}
            >
              {op}
            </button>
          ))}
          <button className="chip opacity-50 cursor-not-allowed">Con vista al mar</button>
        </div>

        {itemsFiltrados.length === 0 && !loading && (
          <p className="opacity-70">No hay habitaciones disponibles en este rango. Prueba otras fechas u otro hotel.</p>
        )}

        <div className="grid md:grid-cols-3 gap-6">
          {itemsFiltrados.map(x => (
            <div key={x.habitacion_id} className="card">
              <div className="h-36 bg-gray-200 rounded-xl mb-3 grid place-items-center text-gray-500">🏝️ Foto</div>
              <div className="flex justify-between items-start">
                <div>
                  <div className="text-lg font-semibold">Tropical Paradise</div>
                  <div className="text-sm text-gray-600">{x.tipo} · Capacidad {x.capacidad}</div>
                  <div className="text-xs text-gray-500 mt-1">{entrada} – {salida}</div>
                </div>
                <div className="text-right">
                  <div className="text-xl font-bold">${Number(x.precio_diario).toLocaleString('es-CL')}</div>
                  <div className="text-xs text-gray-500">/ Noche</div>
                </div>
              </div>
              <div className="mt-3 flex justify-between items-center">
                <div className="text-xl">📶 ❄️ 📺</div>
                <button className="btn" onClick={()=>reservarClick(x)}>Reservar</button>
              </div>
            </div>
          ))}
        </div>
      </main>
    </div>
  )
}
