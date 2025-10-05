import { useState } from "react";
import { api } from "../lib/api";
import FormField from "../components/FormField";
import { Link, useNavigate } from "react-router-dom";

const emailOk = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v || "");

export default function Register() {
  const nav = useNavigate();
  const [loading, setLoading] = useState(false);
  const [showPass, setShowPass] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [banner, setBanner] = useState("");

  const [form, setForm] = useState({
    nombre: "",
    apellidoMaterno: "",
    apellidoPaterno: "",
    email: "",
    password: "",
    confirm: "",
  });
  const [errors, setErrors] = useState({});

  const set = (k, v) => setForm((s) => ({ ...s, [k]: v }));

  function validate() {
    const e = {};
    if (!form.nombre.trim()) e.nombre = "El nombre es requerido.";
    if (!form.email.trim()) e.email = "El correo es requerido.";
    else if (!emailOk(form.email)) e.email = "Correo no válido.";

    if (!form.password) e.password = "Contraseña requerida.";
    else if (form.password.length < 6) e.password = "Mínimo 6 caracteres.";
    if (form.confirm !== form.password) e.confirm = "Las contraseñas no coinciden.";

    return e;
    }

  async function onSubmit(ev) {
    ev.preventDefault();
    setBanner("");
    const e = validate();
    setErrors(e);
    if (Object.keys(e).length) return;

    try {
      setLoading(true);
      // Mapear a lo que requiere el backend:
      const payload = {
        email: form.email,
        password: form.password,
        confirm: form.confirm,
        first_name: form.nombre,
        // last_name: Paterno + Materno (opcional incluir ambos)
        last_name: [form.apellidoPaterno, form.apellidoMaterno].filter(Boolean).join(" ").trim(),
      };

      await api.register(payload);
      alert("Cuenta creada con éxito. Inicia sesión para continuar.");
      nav("/login");
    } catch (err) {
      setBanner(err.message || "No fue posible crear la cuenta.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center bg-yellow-200">
      <div className="w-full max-w-md rounded-2xl bg-white/90 p-6 shadow-xl">
        <h1 className="text-2xl font-bold mb-2">Registro</h1>
        <p className="text-sm text-gray-600 mb-4">
          Crea tu cuenta para reservar en <strong>Pacific Reef</strong>.
        </p>

        {banner && (
          <div className="mb-4 rounded-xl border border-red-200 bg-red-50 text-red-700 px-3 py-2 text-sm">
            {banner}
          </div>
        )}

        <form onSubmit={onSubmit} noValidate>
          <FormField
            label="Nombre"
            name="nombre"
            required
            value={form.nombre}
            onChange={(e) => set("nombre", e.target.value)}
            error={errors.nombre}
          />

          <FormField
            label="Apellido paterno (opcional)"
            name="apellidoPaterno"
            value={form.apellidoPaterno}
            onChange={(e) => set("apellidoPaterno", e.target.value)}
          />

          <FormField
            label="Apellido materno (opcional)"
            name="apellidoMaterno"
            value={form.apellidoMaterno}
            onChange={(e) => set("apellidoMaterno", e.target.value)}
          />

          <FormField
            label="Correo"
            name="email"
            required
            value={form.email}
            onChange={(e) => set("email", e.target.value)}
            error={errors.email}
            autoComplete="email"
          />

          <div className="relative">
            <FormField
              label="Contraseña"
              name="password"
              type={showPass ? "text" : "password"}
              required
              value={form.password}
              onChange={(e) => set("password", e.target.value)}
              error={errors.password}
              autoComplete="new-password"
            />
            <button
              type="button"
              className="absolute right-3 top-[38px] text-xs text-sky-700"
              onClick={() => setShowPass((s) => !s)}
            >
              {showPass ? "Ocultar" : "Mostrar"}
            </button>
          </div>

          <div className="relative">
            <FormField
              label="Confirmar contraseña"
              name="confirm"
              type={showConfirm ? "text" : "password"}
              required
              value={form.confirm}
              onChange={(e) => set("confirm", e.target.value)}
              error={errors.confirm}
              autoComplete="new-password"
            />
            <button
              type="button"
              className="absolute right-3 top-[38px] text-xs text-sky-700"
              onClick={() => setShowConfirm((s) => !s)}
            >
              {showConfirm ? "Ocultar" : "Mostrar"}
            </button>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="mt-2 w-full rounded-xl bg-sky-600 px-4 py-2 font-semibold text-white transition hover:bg-sky-700 disabled:opacity-50"
          >
            {loading ? "Creando..." : "Crear Cuenta"}
          </button>
        </form>

        <p className="mt-4 text-center text-sm">
          ¿Ya tienes cuenta?{" "}
          <Link to="/login" className="text-sky-700 hover:underline">
            Inicia sesión
          </Link>
        </p>
      </div>
    </div>
  );
}
