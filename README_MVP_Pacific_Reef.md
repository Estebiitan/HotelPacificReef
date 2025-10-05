# 🏝️ Hotel Pacific Reef — MVP Semana 8 (PRY3211)

Este repositorio implementa el **MVP funcional para Semana 8** del proyecto *Hotel Pacific Reef*, integrando **Front-end (React/Vite/Tailwind)**, **Back-end (Django REST Framework)** y **Base de Datos PostgreSQL**, cubriendo los **Casos de Prueba CP-001..CP-017** y entregando las **Evidencias DOD** requeridas.

---

## 🔧 Requisitos del entorno

- Python 3.11 o superior  
- PostgreSQL 13+ con extensión `btree_gist`  
- Node.js 18+ (React + Vite + Tailwind v4)  
- (Opcional) Docker / Docker Compose  

---

## 🗄️ Configuración de Base de Datos

1. Crear base de datos y usuario:
   ```sql
   CREATE DATABASE hotelreef;
   CREATE USER hotelreef_user WITH ENCRYPTED PASSWORD 'change_me';
   GRANT ALL PRIVILEGES ON DATABASE hotelreef TO hotelreef_user;
   ```

2. Activar extensión y cargar esquema:
   ```sql
   \c hotelreef
   CREATE EXTENSION IF NOT EXISTS btree_gist;
   -- Ejecutar el archivo docs/bd_hotelreef.sql
   ```

3. Permisos recomendados:
   ```sql
   GRANT USAGE ON SCHEMA public TO hotelreef_user;
   GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO hotelreef_user;
   GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO hotelreef_user;
   ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO hotelreef_user;
   ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO hotelreef_user;
   ```

> La base incluye: reglas anti-solape (EXCLUDE + GiST), trigger de capacidad, función `fn_habitaciones_disponibles`, y datos de ejemplo.

---

## 🔐 Variables de entorno (Backend)

Crear archivo `.env` dentro de `/backend`:

```
DJANGO_SECRET_KEY=change_me
DB_NAME=hotelreef
DB_USER=hotelreef_user
DB_PASSWORD=2041442
DB_HOST=localhost
DB_PORT=5432
ALLOWED_HOSTS=localhost,127.0.0.1
CORS_ALLOWED_ORIGINS=http://localhost:5173
```

---

## ▶️ Backend (Django)

1. Instalar dependencias:
   ```bash
   pip install -r requirements.txt
   ```

2. Migrar y ejecutar:
   ```bash
   python manage.py migrate
   python manage.py runserver 8000
   ```

3. Endpoints principales:
   - GET `/api/habitaciones/disponibles?entrada=YYYY-MM-DD&salida=YYYY-MM-DD&hotel_id=1`
   - POST `/api/reservas`
   - GET `/api/reservas/{id}/montos`
   - POST `/api/auth/login`
   - POST `/api/auth/register`

---

## 💻 Front-end (React + Vite + Tailwind)

1. Instalar dependencias:
   ```bash
   cd frontend
   npm install
   npm i -D @tailwindcss/postcss
   ```

2. Configurar archivos clave:

   **postcss.config.js**
   ```js
   export default { plugins: { '@tailwindcss/postcss': {} } }
   ```

   **tailwind.config.js**
   ```js
   export default {
     content: ["./index.html","./src/**/*.{js,jsx,ts,tsx}"],
     theme: { extend: {} },
     plugins: [],
   }
   ```

   **src/index.css**
   ```css
   @import "tailwindcss";
   @reference "tailwindcss";
   @tailwind base;
   @tailwind components;
   @tailwind utilities;
   ```

   **.env.local**
   ```
   VITE_API_BASE=http://localhost:8000
   ```

3. Ejecutar entorno:
   ```bash
   npm run dev
   # abrir http://localhost:5173
   ```

---

## 🚀 Ejecución completa del proyecto

```bash
# Terminal A → Backend
cd backend
pip install -r requirements.txt
python manage.py migrate
python manage.py runserver 8000

# Terminal B → Frontend
cd frontend
npm install
npm run dev
```

---

## 📡 Ejemplos de requests

**Consultar habitaciones disponibles**
```bash
curl "http://localhost:8000/api/habitaciones/disponibles?entrada=2025-10-10&salida=2025-10-12&hotel_id=1"
```

**Crear reserva**
```bash
curl -X POST http://localhost:8000/api/reservas \
  -H "Content-Type: application/json" \
  -d '{
    "cliente_id": 1,
    "habitacion_id": 2,
    "fecha_entrada": "2025-10-12",
    "fecha_salida": "2025-10-14",
    "cantidad_personas": 2
  }'
```

**Consultar montos**
```bash
curl http://localhost:8000/api/reservas/5/montos
# → {"total": 190000, "anticipo_30": 57000}
```

---

## 🧪 Testing funcional (Planilla CP-001..CP-017)

- CP-002 / CP-003 / CP-005 / CP-015 → GET /habitaciones/disponibles  
- CP-008 / CP-009 / CP-010 / CP-012 → POST /reservas  
- CP-017 → Confirmación muestra ID + montos  
- CP-013 / CP-014 → Validaciones de capacidad y traslape  

> Evidencias: capturas, logs, IDs generados (UI-01..UI-09).

---

## 🧾 Evidencias para DOD

- **OPS-01:** GitHub → URL repo + hash  
- **OPS-02:** Trello → tablero y capturas  
- **OPS-03:** Demo ≤3min → flujo buscar → reservar → confirmar  
- **OPS-04:** README + `.env.example`  
- **OPS-05:** Postman / Swagger  
- **DB-01..DB-04:** Constraints, EXPLAIN, triggers, seed  

---

## 🛠️ Troubleshooting

- Error `ModuleNotFoundError: django` → activar venv + `pip install -r requirements.txt`  
- Error permisos → ejecutar los GRANTs indicados arriba  
- Error “no existe la relación habitacion” → confirmar `SET search_path TO public;`  
- Error Tailwind → instalar `@tailwindcss/postcss` y usar `@reference`  

---

## ✅ Tips para la demo

- `/disponibles` responde en < 800 ms (backend)  
- Render UI < 1.5 s  
- Accesibilidad y navegación por teclado  
- Manejo de errores controlados  
- Retrospectiva: 3 mejoras y tareas en Trello  

---

## 🗂️ Estructura recomendada

```
/backend
  manage.py
  api/
    models.py
    views.py
    urls.py
    serializers.py
  .env.example

/frontend
  src/
    screens/
    components/
    lib/api.js
docs/
  bd_hotelreef.sql
  Planilla_Testing_Semana8.xlsx
  DOD_Semana7_Pacific_Reef_enlazado.xlsx
  Manual_Usuario_Testing_Pacific_Reef.docx
  postman_hotelreef_mvp.json
```

---

✅ **Autores:**  
- Esteban Bravo  
- Alejandro Cárdenas  

📅 **Duoc UC — Ingeniería de Software — Semana 8**  

---

Este documento garantiza la trazabilidad entre el desarrollo, testing y evidencias DOD del MVP funcional *Hotel Pacific Reef*.
