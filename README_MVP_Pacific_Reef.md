
# Hotel Pacific Reef — MVP Semana 7 (PRY3211)

Este repositorio implementa el MVP funcional para **Semana 7** del proyecto *Hotel Pacific Reef*,
integrando **Front-end + Back-end + Base de datos** y cubriendo los **Casos de Prueba CP-001..CP-017**.
Incluye lineamientos de ejecución, endpoints de API, y cómo recolectar evidencias para **DOD** y **Planilla de Testing**.

---

## 🔧 Requisitos

- Python 3.11+
- PostgreSQL 13+ (con extensión `btree_gist`)
- Node 18+ (si utilizas React/Vite)
- (Opcional) Docker / Docker Compose

## 🗄️ Base de Datos

1. Crear DB y usuario (si no existen):
   ```sql
   CREATE DATABASE hotelreef;
   CREATE USER hotelreef_user WITH ENCRYPTED PASSWORD 'change_me';
   GRANT ALL PRIVILEGES ON DATABASE hotelreef TO hotelreef_user;
   ```

2. Habilitar extensión y cargar esquema+seed (usa tu `bd_hotelreef.sql`):
   ```sql
   \c hotelreef
   CREATE EXTENSION IF NOT EXISTS btree_gist;
   -- Ejecutar bd_hotelreef.sql
   ```

> La BD ya incluye: reglas anti-solape (EXCLUDE + GiST), trigger de capacidad,
> función `fn_habitaciones_disponibles`, y datos de ejemplo.

## 🔐 Variables de entorno (Backend)

Crea `.env` en el backend (usa el `.env.example` incluido) con:

```
DJANGO_SECRET_KEY=change_me
DB_NAME=hotelreef
DB_USER=hotelreef_user
DB_PASSWORD=change_me
DB_HOST=localhost
DB_PORT=5432
ALLOWED_HOSTS=localhost,127.0.0.1
CORS_ALLOWED_ORIGINS=http://localhost:5173
```

## ▶️ Backend (Django)

1. Instalar dependencias:
   ```bash
   pip install -r requirements.txt
   ```

2. Ejecutar migraciones de la app (si corresponde) y levantar servidor:
   ```bash
   python manage.py migrate
   python manage.py runserver 8000
   ```

3. Endpoints MVP (se sugiere usar DRF):
   - **GET** `/api/habitaciones/disponibles?entrada=YYYY-MM-DD&salida=YYYY-MM-DD&hotel_id=1`
     - Internamente ejecuta: `SELECT * FROM fn_habitaciones_disponibles(entrada, salida, hotel_id)`
     - CPs: `CP-002, CP-003, CP-005, CP-015`
   - **POST** `/api/reservas`
     - Body JSON mínimo:
       ```json
       {
         "cliente_id": 1,
         "habitacion_id": 1,
         "fecha_entrada": "2025-10-10",
         "fecha_salida": "2025-10-12",
         "cantidad_personas": 2
       }
       ```
     - Reglas de negocio garantizadas por BD: **anti-solape**, **capacidad**.
     - CPs: `CP-008, CP-009, CP-010, CP-011, CP-012`

   - (Opcional) **GET** `/api/reservas/{id}/montos`
     - Consulta `vw_reserva_montos` para total y anticipo 30%.
     - CPs: (agregables como extra).

## 💻 Front-end (React/Vite, ejemplo)

Vistas mínimas:
- Home → CTA Buscar
- Búsqueda → fechas + huéspedes
- Resultados → lista/grid con tipo/capacidad/precio + Reservar
- Reserva → formulario (nombre/email) y confirmar
- Confirmación → muestra ID de reserva

> Conecta a los endpoints anteriores. Mantén logs limpios para evidencias (UI-01..UI-09).

## 🧪 Testing funcional (Planilla CP-001..CP-017)

- Ejecuta los casos en `Planilla_Testing_Semana7.xlsx`.
- Completa “Resultado real”, “Estado” y “Evidencia” (capturas, IDs, logs).

## 🧾 Evidencias para DOD

- **GitHub**: URL repo + hash por artefacto (OPS-01)
- **Trello**: link tablero + capturas (OPS-02)
- **Demo (≤3min)**: flujo buscar→resultados→detalle→reserva→confirmación (OPS-03)
- **README + .env.example** (OPS-04)
- **Postman/Swagger** (OPS-05)
- **BD**: migraciones/seed, EXPLAIN, constraints (DB-01..DB-04)

## 🧰 Colección Postman

Se incluye `postman_hotelreef_mvp.json` con:
- GET disponibles
- POST reservas
- (Opcional) GET montos por reserva

## 🗂️ Estructura sugerida

```
/backend
  manage.py
  app/
    views.py
    urls.py
    serializers.py
    models.py
  .env.example
/frontend
  src/
    pages/
    components/
docs/
  Planilla_Testing_Semana7.xlsx
  DOD_Semana7_Pacific_Reef_enlazado.xlsx
  postman_hotelreef_mvp.json
```

---

## ✅ Tips para la demo y la rúbrica

- **Performance**: mide respuesta de `/disponibles` (<800ms backend; <1.5s render).
- **Accesibilidad**: prueba navegación con teclado y labels (UI-09).
- **Errores controlados**: exhibe mensaje amigable cuando BD cae (CP-014).
- **Retrospectiva**: tres bullets + acciones a Trello.