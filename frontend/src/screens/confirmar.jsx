import React, { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'

const API =
  import.meta.env.VITE_API_URL ||
  import.meta.env.VITE_API_BASE ||
  'http://localhost:8000'

export default function Confirmar(){
  const { state } = useLocation()
  const nav = useNavigate()
  const token = localStorage.getItem('token') || ''

  // si entraron directo sin state o sin token, volver
  useEffect(() => {
    if (!state?.hab) { nav('/'); return }
    if (!token) { nav('/login'); return }
  }, [state, nav, token])

  // datos visuales del titular
  const [cliente, setCliente]   = useState('')           // se autocompleta con /me
  const [clienteId, setClienteId] = useState(1)          // necesario para POST (temporal)
  const [personas, setPersonas] = useState(state?.huespedes || 2)
  const [hEntrada, setHEntrada] = useState('15:00')
  const [hSalida,  setHSalida ] = useState('12:00')

  const [guardando, setGuardando] = useState(false)
  const [ok, setOk]               = useState(null)   // {reserva_id}
  const [montos, setMontos]       = useState(null)   // {total, anticipo_30}
  const [error, setError]         = useState('')

  // Autocompletar nombre a partir de /me
  useEffect(() => {
    let abort = false
    if (!token) return
    ;(async () => {
      try {
        const r = await fetch(`${API}/api/auth/me`, {
          headers: { Authorization: `Bearer ${token}` }
        })
        if (r.status === 401) { nav('/login'); return }
        if (!r.ok) return
        const u = await r.json()
        const full = `${u.first_name || ''} ${u.last_name || ''}`.trim()
        if (!abort) setCliente(full || u.email || 'Usuario')
      } catch {}
    })()
    return () => { abort = true }
  }, [token, nav])

  const dias = useMemo(() => {
    if (!state?.entrada || !state?.salida) return 0
    const d1 = new Date(state.entrada)
    const d2 = new Date(state.salida)
    return Math.max(0, Math.round((d2 - d1) / (1000*60*60*24)))
  }, [state])

  const totalEstimado = useMemo(() => {
    const precio = Number(state?.hab?.precio_diario || 0)
    return dias * precio
  }, [dias, state])

  const confirmarReserva = async () => {
    if (!state?.hab) return
    setError(''); setGuardando(true); setOk(null); setMontos(null)
    try {
      const body = {
        cliente_id: Number(clienteId), // TODO: enlazar con tu tabla 'cliente'
        habitacion_id: Number(state.hab.habitacion_id),
        fecha_entrada: state.entrada,
        fecha_salida:  state.salida,
        cantidad_personas: Number(personas)
      }
      const r = await fetch(`${API}/api/reservas`, {
        method: 'POST',
        headers: {
          'Content-Type':'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify(body)
      })
      if (r.status === 401) { nav('/login'); return }
      const data = await r.json()
      if (!r.ok) throw new Error(data.detail || 'Error al crear la reserva')
      setOk(data) // {reserva_id}

      // pedir montos
      const r2 = await fetch(`${API}/api/reservas/${data.reserva_id}/montos`)
      if (r2.ok) {
        const raw = await r2.json()
        const totalRaw = raw.total ?? raw.total_estadia ?? raw.monto_total ?? raw.total_reserva ?? raw.total_pagar
        const anticipoRaw = raw.anticipo_30 ?? raw.anticipo ?? raw.anticipo30
        let total = Number(totalRaw)
        let anticipo = Number(anticipoRaw)
        if (!Number.isFinite(total)) total = totalEstimado
        if (!Number.isFinite(anticipo) && Number.isFinite(total)) anticipo = total * 0.3
        setMontos({ total, anticipo_30: anticipo })
      }
    } catch (e) {
      setError(String(e.message || e))
    } finally {
      setGuardando(false)
    }
  }

  if (!state?.hab) return null

  return (
    <div className="min-h-screen bg-[#FFE082]">
      <header className="bg-[#FFE082]">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="text-2xl font-extrabold">Pacific Reef</div>
          <button className="btn-outline" onClick={()=>nav('/')}>Volver</button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-6 grid md:grid-cols-2 gap-6">
        {/* Panel de formulario */}
        <section className="card bg-white">
          <h2 className="text-xl font-bold mb-4">Confirmar Reserva</h2>

          <label className="label mb-2">Titular de la reserva
            <input className="input" value={cliente} onChange={e=>setCliente(e.target.value)} />
          </label>

          {/* Campo temporal para mapear al 'cliente_id' de tu BD */}
          <label className="label mb-2">Cliente ID (temporal)
            <input type="number" className="input" value={clienteId} onChange={e=>setClienteId(e.target.value)} />
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="label">Personas
              <input type="number" min={1} className="input" value={personas} onChange={e=>setPersonas(e.target.value)} />
            </label>
            <div></div>
            <label className="label">Hora de entrada
              <input className="input" value={hEntrada} onChange={e=>setHEntrada(e.target.value)} />
            </label>
            <label className="label">Hora de salida
              <input className="input" value={hSalida} onChange={e=>setHSalida(e.target.value)} />
            </label>
          </div>
        </section>

        {/* Resumen */}
        <section className="card bg-white">
          <h2 className="text-xl font-bold mb-4">Resumen</h2>

          <div className="grid grid-cols-2 text-sm text-gray-600 border-b border-gray-200 pb-2 mb-3">
            <div className="font-semibold">Habitación</div>
            <div className="font-semibold">Fechas</div>
            <div className="mt-1">Tropical Paradise</div>
            <div className="mt-1">{state.entrada} – {state.salida}</div>
          </div>

          <div className="flex items-baseline justify-between">
            <div className="text-lg font-semibold">Total</div>
            <div className="text-2xl font-extrabold">${Number(totalEstimado).toLocaleString('es-CL')}</div>
          </div>
          <p className="text-xs text-gray-500 mt-1">
            Para confirmar la reserva, debes pagar el 30% del total de la habitación.
          </p>

          {error && <p className="text-red-600 mt-3">{error}</p>}

          {ok && (
            <div className="mt-3 rounded-xl border border-green-200 bg-green-50 text-green-800 p-3">
              <div className="font-semibold">¡Reserva creada!</div>
              <div>ID: {ok.reserva_id}</div>
              {montos && (
                <div className="mt-1 text-sm">
                  <div>Total: {montos.total != null ? `$${Number(montos.total).toLocaleString('es-CL')}` : '—'}</div>
                  <div>Anticipo (30%): {montos.anticipo_30 != null ? `$${Number(montos.anticipo_30).toLocaleString('es-CL')}` : '—'}</div>
                </div>
              )}
            </div>
          )}

          <button
            className="btn mt-4 w-full"
            disabled={guardando}
            onClick={confirmarReserva}
          >
            {guardando ? 'Confirmando…' : 'Confirmar reserva'}
          </button>
        </section>
      </main>
    </div>
  )
}
