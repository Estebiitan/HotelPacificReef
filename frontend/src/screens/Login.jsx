import { useState } from "react";
import { api } from "../lib/api";
import FormField from "../components/FormField";
import { Link, useLocation, useNavigate } from "react-router-dom";

const emailOk = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test((v || "").trim());

export default function Login() {
  const nav = useNavigate();
  const loc = useLocation();
  const [loading, setLoading] = useState(false);
  const [showPass, setShowPass] = useState(false);
  const [remember, setRemember] = useState(true);
  const [form, setForm] = useState({ email: "", password: "" });
  const [errors, setErrors] = useState({});
  const [banner, setBanner] = useState("");

  const set = (k, v) => {
    setForm((s) => ({ ...s, [k]: v }));
    setBanner(""); // limpia error global al tipear
  };

  function validate() {
    const e = {};
    if (!form.email.trim()) e.email = "El correo es requerido.";
    else if (!emailOk(form.email)) e.email = "Correo no valido.";
    if (!form.password) e.password = "Contrasena requerida.";
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
      const payload = {
        email: form.email.trim().toLowerCase(),
        password: form.password,
      };
      const res = await api.login(payload);

      const token = res?.data?.token;
      if (!token) throw new Error("No se recibio token.");

      // recordarme: localStorage (persistente) o sessionStorage (solo sesion)
      (remember ? localStorage : sessionStorage).setItem("token", token);
      if (!remember) localStorage.removeItem("token"); // por si quedo uno previo

      const redirectTo = loc.state?.from || "/";
      nav(redirectTo, { replace: true });
    } catch (err) {
      setBanner(err?.message || "No fue posible iniciar sesion");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center bg-yellow-200">
      <div className="w-full max-w-md rounded-2xl bg-white/90 p-6 shadow-xl">
        <h1 className="text-2xl font-bold mb-2">Iniciar sesion</h1>
        <p className="text-sm text-gray-600 mb-4">
          Accede a tu cuenta para continuar con tu reserva.
        </p>

        {banner && (
          <div className="mb-4 rounded-xl border border-red-200 bg-red-50 text-red-700 px-3 py-2 text-sm">
            {banner}
          </div>
        )}

        <form onSubmit={onSubmit} noValidate>
          <FormField
            label="Correo"
            name="email"
            value={form.email}
            onChange={(e) => set("email", e.target.value)}
            error={errors.email}
            autoComplete="email"
          />

          <div className="relative">
            <FormField
              label="Contrasena"
              name="password"
              type={showPass ? "text" : "password"}
              value={form.password}
              onChange={(e) => set("password", e.target.value)}
              error={errors.password}
              autoComplete="current-password"
            />
            <button
              type="button"
              className="absolute right-3 top-[38px] text-xs text-sky-700"
              onClick={() => setShowPass((s) => !s)}
              aria-label={showPass ? "Ocultar contrasena" : "Mostrar contrasena"}
            >
              {showPass ? "Ocultar" : "Mostrar"}
            </button>
          </div>

          <label className="mt-1 mb-3 flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="accent-sky-600"
              checked={remember}
              onChange={(e) => setRemember(e.target.checked)}
            />
            Recordarme en este dispositivo
          </label>

          <button
            type="submit"
            disabled={loading}
            className="mt-1 w-full rounded-xl bg-sky-600 px-4 py-2 font-semibold text-white transition
                       hover:bg-sky-700 disabled:opacity-50"
          >
            {loading ? "Ingresando..." : "Ingresar"}
          </button>
        </form>

        <p className="mt-4 text-center text-sm">
          ¿No tienes cuenta?{" "}
          <Link to="/register" className="text-sky-700 hover:underline">
            Registrate
          </Link>
        </p>
      </div>
    </div>
  );
}
