import React, { useMemo, useState } from 'react'

export default function App(){
  // Filtros de búsqueda
  const [entrada, setEntrada] = useState('2025-10-10')
  const [salida,  setSalida ] = useState('2025-10-12')
  const [hotel,   setHotel  ] = useState('1')
  const [huespedes, setHuespedes] = useState(2)

  // Resultados / estados
  const [items, setItems]       = useState([])
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState('')
  const [log, setLog]           = useState('')

  // Filtro por tipo
  const [filtroTipo, setFiltroTipo] = useState('Todos') // Todos | Turista | Premium

  // Reserva
  const [habitacionSel, setHabitacionSel] = useState(null)
  const [clienteId, setClienteId]         = useState(1)
  const [personas, setPersonas]           = useState(2)
  const [confirmacion, setConfirmacion]   = useState(null)
  const [errorReserva, setErrorReserva]   = useState(null)
  const [montos, setMontos]               = useState(null)

  const API = import.meta.env.VITE_API_BASE || 'http://localhost:8000'

  const buscar = async () => {
    setError(''); setItems([]); setConfirmacion(null); setErrorReserva(null); setMontos(null)
    if (!entrada || !salida || new Date(salida) <= new Date(entrada)) {
      setError('Rango de fechas inválido'); return
    }
    setLoading(true)
    try {
      const url = `${API}/api/habitaciones/disponibles?entrada=${encodeURIComponent(entrada)}&salida=${encodeURIComponent(salida)}&hotel_id=${encodeURIComponent(hotel)}`
      const r = await fetch(url)
      const data = await r.json()
      if (!r.ok) throw new Error(data.detail || 'Error al consultar disponibilidad')
      setItems(data)
      setLog(`GET ${url} → ${r.status}`)
    } catch (e) {
      setError(String(e.message || e))
    } finally {
      setLoading(false)
    }
  }

  const reservarClick = (hab) => {
    setHabitacionSel(hab)
    setConfirmacion(null)
    setErrorReserva(null)
    setMontos(null)
    setPersonas(Math.min(Number(huespedes || 1), Number(hab.capacidad || 1)))
  }

  const confirmarReserva = async () => {
    setErrorReserva(null); setConfirmacion(null); setMontos(null)
    try {
      const body = {
        cliente_id: Number(clienteId),
        habitacion_id: Number(habitacionSel.habitacion_id),
        fecha_entrada: entrada,
        fecha_salida: salida,
        cantidad_personas: Number(personas)
      }
      const r = await fetch(`${API}/api/reservas`, {
        method: 'POST',
        headers: { 'Content-Type':'application/json' },
        body: JSON.stringify(body)
      })
      const data = await r.json()
      if (!r.ok) throw new Error(data.detail || 'Error al crear la reserva')
      setConfirmacion(data)

      // Montos
      try {
        const r2 = await fetch(`${API}/api/reservas/${data.reserva_id}/montos`)
        if (r2.ok) {
          const raw = await r2.json()
          const totalRaw =
            raw.total ?? raw.total_estadia ?? raw.monto_total ?? raw.total_reserva ?? raw.total_pagar
          const anticipoRaw =
            raw.anticipo_30 ?? raw.anticipo ?? raw.anticipo30

          let total = Number(totalRaw)
          let anticipo = Number(anticipoRaw)

          if (!Number.isFinite(total)) {
            const d1 = new Date(entrada)
            const d2 = new Date(salida)
            const dias = Math.max(0, Math.round((d2 - d1) / (1000 * 60 * 60 * 24)))
            const precio = Number(habitacionSel?.precio_diario)
            if (Number.isFinite(dias) && Number.isFinite(precio)) total = dias * precio
          }
          if (!Number.isFinite(anticipo) && Number.isFinite(total)) anticipo = total * 0.3

          setMontos({
            total: Number.isFinite(total) ? total : null,
            anticipo_30: Number.isFinite(anticipo) ? anticipo : null
          })
        }
      } catch {}
    } catch (e) {
      setErrorReserva(String(e.message || e))
    }
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
          <nav className="flex items-center gap-3 text-sm">
            <button className="btn-outline">Registrarse</button>
            <button className="btn-outline">Iniciar sesión</button>
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

        {/* Filtros tipo */}
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
          <button className="chip opacity-50 cursor-not-allowed" title="Próximamente">Con vista al mar</button>
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

        {/* Panel de reserva */}
        {habitacionSel && (
          <div className="card mt-6 bg-white">
            <h3 className="text-xl font-semibold mb-3">Confirmar reserva — Hab #{habitacionSel.numero}</h3>
            <div className="grid md:grid-cols-3 gap-3 items-end">
              <label className="label">Cliente ID
                <input type="number" className="input" value={clienteId} onChange={e=>setClienteId(e.target.value)} />
              </label>
              <label className="label">Personas
                <input type="number" min={1} className="input" value={personas} onChange={e=>setPersonas(e.target.value)} />
              </label>
              <button className="btn" onClick={confirmarReserva}>Confirmar</button>
            </div>
            {errorReserva && <p className="text-red-600 mt-2">{errorReserva}</p>}
          </div>
        )}

        {/* Confirmación */}
        {confirmacion && (
          <div className="mt-4 border border-green-200 bg-green-50 text-green-800 rounded-2xl p-4">
            <div className="font-semibold">¡Reserva creada!</div>
            <div>ID: {confirmacion.reserva_id}</div>
            {montos && (
              <div className="mt-1">
                <div>
                  Total: {montos.total != null
                    ? `$${Number(montos.total).toLocaleString('es-CL')}`
                    : '—'}
                </div>
                <div>
                  Anticipo (30%): {montos.anticipo_30 != null
                    ? `$${Number(montos.anticipo_30).toLocaleString('es-CL')}`
                    : '—'}
                </div>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  )
}
