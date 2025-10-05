-- =========================================================
-- Hotel Reef - Base de datos (PostgreSQL 13+)
-- Script idempotente: se puede ejecutar varias veces
-- =========================================================

-- 0) Esquema y extensiones
CREATE SCHEMA IF NOT EXISTS hotelreef;
SET search_path TO hotelreef, public;

CREATE EXTENSION IF NOT EXISTS btree_gist;

-- ---------------------------------------------------------
-- 1) NUCLEO
-- ---------------------------------------------------------

-- 1.1 Tabla hotel
CREATE TABLE IF NOT EXISTS hotel (
  hotel_id      BIGSERIAL PRIMARY KEY,
  nombre        VARCHAR(120) NOT NULL,
  direccion     VARCHAR(200) NOT NULL
);

-- 1.2 Tabla habitacion
CREATE TABLE IF NOT EXISTS habitacion (
  habitacion_id BIGSERIAL PRIMARY KEY,
  hotel_id      BIGINT NOT NULL REFERENCES hotel(hotel_id) ON DELETE CASCADE,
  numero        VARCHAR(10) NOT NULL,                      -- ej: "101"
  tipo          VARCHAR(20) NOT NULL CHECK (tipo IN ('Turista','Premium')),
  capacidad     INTEGER NOT NULL CHECK (capacidad > 0),
  precio_diario NUMERIC(12,2) NOT NULL CHECK (precio_diario >= 0),
  UNIQUE (hotel_id, numero)
);

-- 1.3 Tabla cliente (incluye user_id para vinculo con Django auth_user)
CREATE TABLE IF NOT EXISTS cliente (
  cliente_id BIGSERIAL PRIMARY KEY,
  nombre     VARCHAR(80)  NOT NULL,
  apellido   VARCHAR(80)  NOT NULL,
  correo     VARCHAR(160) NOT NULL,
  telefono   VARCHAR(30),
  user_id    INTEGER UNIQUE
);

-- unico por correo en minusculas (evita duplicados tipo Ana@ y ana@)
CREATE UNIQUE INDEX IF NOT EXISTS ux_cliente_correo_lower
  ON cliente (lower(correo));

CREATE INDEX IF NOT EXISTS ix_cliente_user_id ON cliente(user_id);

-- FK cliente.user_id -> public.auth_user(id) (solo si no existe)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE constraint_schema = 'hotelreef'
      AND table_name = 'cliente'
      AND constraint_name = 'fk_cliente_user'
  ) THEN
    ALTER TABLE cliente
      ADD CONSTRAINT fk_cliente_user
      FOREIGN KEY (user_id)
      REFERENCES public.auth_user(id)
      ON DELETE SET NULL;
  END IF;
END$$;

-- 1.4 Tabla reserva
CREATE TABLE IF NOT EXISTS reserva (
  reserva_id        BIGSERIAL PRIMARY KEY,
  cliente_id        BIGINT NOT NULL REFERENCES cliente(cliente_id) ON DELETE RESTRICT,
  habitacion_id     BIGINT NOT NULL REFERENCES habitacion(habitacion_id) ON DELETE RESTRICT,
  fecha_entrada     DATE   NOT NULL,
  fecha_salida      DATE   NOT NULL,
  cantidad_personas INTEGER NOT NULL CHECK (cantidad_personas > 0),
  -- rango semiabierto [entrada, salida) para checkout libre
  rango             daterange GENERATED ALWAYS AS (daterange(fecha_entrada, fecha_salida, '[)')) STORED,
  CHECK (fecha_salida > fecha_entrada)
);

-- Evitar traslapes de reservas por habitacion
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'no_overlap_por_habitacion'
      AND conrelid = 'hotelreef.reserva'::regclass
  ) THEN
    ALTER TABLE reserva
      ADD CONSTRAINT no_overlap_por_habitacion
      EXCLUDE USING gist (
        habitacion_id WITH =,
        rango WITH &&
      );
  END IF;
END$$;

-- Trigger de capacidad
CREATE OR REPLACE FUNCTION tg_reserva_valida_capacidad()
RETURNS trigger LANGUAGE plpgsql AS
$$
DECLARE
  cap INTEGER;
BEGIN
  SELECT h.capacidad INTO cap
  FROM habitacion h
  WHERE h.habitacion_id = NEW.habitacion_id;

  IF cap IS NULL THEN
    RAISE EXCEPTION 'Habitacion % no existe', NEW.habitacion_id;
  END IF;

  IF NEW.cantidad_personas > cap THEN
    RAISE EXCEPTION 'La cantidad de personas (%) excede la capacidad (%) de la habitacion %',
      NEW.cantidad_personas, cap, NEW.habitacion_id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_reserva_valida_capacidad ON reserva;
CREATE TRIGGER tr_reserva_valida_capacidad
BEFORE INSERT OR UPDATE ON reserva
FOR EACH ROW
EXECUTE FUNCTION tg_reserva_valida_capacidad();

-- 1.5 Pago y ticket (opcionales)
CREATE TABLE IF NOT EXISTS pago (
  pago_id    BIGSERIAL PRIMARY KEY,
  reserva_id BIGINT NOT NULL UNIQUE REFERENCES reserva(reserva_id) ON DELETE CASCADE,
  monto      NUMERIC(12,2) NOT NULL CHECK (monto >= 0),
  estado     VARCHAR(20) NOT NULL DEFAULT 'pendiente'
             CHECK (estado IN ('pendiente','aprobado','fallido')),
  creado_en  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ticket_reserva (
  ticket_id    BIGSERIAL PRIMARY KEY,
  reserva_id   BIGINT NOT NULL UNIQUE REFERENCES reserva(reserva_id) ON DELETE CASCADE,
  codigo_qr    TEXT NOT NULL,
  url_descarga TEXT,
  creado_en    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------
-- 2) VISTAS Y FUNCIONES
-- ---------------------------------------------------------

-- Vista de montos (30% anticipo)
CREATE OR REPLACE VIEW vw_reserva_montos AS
SELECT
  r.reserva_id,
  r.habitacion_id,
  r.fecha_entrada,
  r.fecha_salida,
  (r.fecha_salida - r.fecha_entrada)          AS total_dias,
  h.precio_diario,
  (r.fecha_salida - r.fecha_entrada) * h.precio_diario    AS total_estadia,
  ROUND(((r.fecha_salida - r.fecha_entrada) * h.precio_diario) * 0.30, 2) AS anticipo_30
FROM reserva r
JOIN habitacion h ON h.habitacion_id = r.habitacion_id;

-- Funcion de disponibilidad [entrada, salida) por hotel (opcional)
CREATE OR REPLACE FUNCTION fn_habitaciones_disponibles(
  p_fecha_entrada DATE,
  p_fecha_salida  DATE,
  p_hotel_id      BIGINT DEFAULT NULL
)
RETURNS TABLE(
  habitacion_id BIGINT,
  hotel_id      BIGINT,
  numero        VARCHAR,
  tipo          VARCHAR,
  capacidad     INTEGER,
  precio_diario NUMERIC
) LANGUAGE sql AS
$$
  SELECT h.habitacion_id, h.hotel_id, h.numero, h.tipo, h.capacidad, h.precio_diario
  FROM habitacion h
  WHERE (p_hotel_id IS NULL OR h.hotel_id = p_hotel_id)
    AND NOT EXISTS (
      SELECT 1
      FROM reserva r
      WHERE r.habitacion_id = h.habitacion_id
        AND r.rango && daterange(p_fecha_entrada, p_fecha_salida, '[)')
    )
  ORDER BY h.hotel_id, h.numero;
$$;

-- Indices utiles
CREATE INDEX IF NOT EXISTS idx_reserva_cliente ON reserva(cliente_id);
CREATE INDEX IF NOT EXISTS idx_reserva_habitacion ON reserva(habitacion_id);
CREATE INDEX IF NOT EXISTS idx_reserva_rango_gist ON reserva USING gist (rango);

-- ---------------------------------------------------------
-- 3) VINCULO CON USUARIOS DJANGO (auth_user)
-- Crea FK, backfill por correo/username y completa clientes faltantes
-- ---------------------------------------------------------

-- A) Asegurar columna ya declarada arriba y FK creada (lineas anteriores)

-- B) Backfill: enlazar clientes existentes con usuarios por correo/username
UPDATE hotelreef.cliente c
SET user_id = u.id
FROM public.auth_user u
WHERE c.user_id IS NULL
  AND lower(c.correo) = lower(COALESCE(NULLIF(u.email, ''), u.username));

-- C) Crear filas de cliente para usuarios que no esten en cliente
INSERT INTO hotelreef.cliente (nombre, apellido, correo, telefono, user_id)
SELECT
  COALESCE(NULLIF(u.first_name, ''), split_part(u.username, '@', 1)) AS nombre,
  COALESCE(NULLIF(u.last_name, ''),  'Usuario') AS apellido,
  COALESCE(NULLIF(u.email, ''), u.username) AS correo,
  NULL AS telefono,
  u.id
FROM public.auth_user u
LEFT JOIN hotelreef.cliente c ON c.user_id = u.id
WHERE c.user_id IS NULL;

-- ---------------------------------------------------------
-- 4) DATOS DE EJEMPLO (idempotentes)
-- ---------------------------------------------------------

-- Hoteles
INSERT INTO hotel (nombre, direccion)
VALUES ('Hotel Pacific Reef', 'Av. Costanera 123, Ciudad')
ON CONFLICT DO NOTHING;

INSERT INTO hotel (nombre, direccion)
VALUES ('Hotel Centro', 'Av. Principal 456')
ON CONFLICT DO NOTHING;

-- Habitaciones (usa unique (hotel_id, numero))
INSERT INTO habitacion (hotel_id, numero, tipo, capacidad, precio_diario) VALUES
  (1, '101', 'Turista', 2, 45000)
ON CONFLICT (hotel_id, numero) DO NOTHING;

INSERT INTO habitacion (hotel_id, numero, tipo, capacidad, precio_diario) VALUES
  (1, '102', 'Turista', 3, 52000)
ON CONFLICT (hotel_id, numero) DO NOTHING;

INSERT INTO habitacion (hotel_id, numero, tipo, capacidad, precio_diario) VALUES
  (1, '201', 'Premium', 2, 78000)
ON CONFLICT (hotel_id, numero) DO NOTHING;

INSERT INTO habitacion (hotel_id, numero, tipo, capacidad, precio_diario) VALUES
  (2, '101', 'Turista', 2, 40000)
ON CONFLICT (hotel_id, numero) DO NOTHING;

-- Clientes (usa indice unico ux_cliente_correo_lower)
INSERT INTO cliente (nombre, apellido, correo, telefono)
VALUES ('Ana',  'Gonzalez', 'ana@example.com',  '+56 9 1234 5678')
ON CONFLICT ON CONSTRAINT ux_cliente_correo_lower DO NOTHING;

INSERT INTO cliente (nombre, apellido, correo, telefono)
VALUES ('Luis', 'Perez',    'luis@example.com', '+56 9 9876 5432')
ON CONFLICT ON CONSTRAINT ux_cliente_correo_lower DO NOTHING;

-- Reservas de ejemplo (se saltan si ya existen filas similares)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM reserva r WHERE r.cliente_id=1 AND r.habitacion_id=1
                 AND r.fecha_entrada=DATE '2025-10-10' AND r.fecha_salida=DATE '2025-10-12') THEN
    INSERT INTO reserva (cliente_id, habitacion_id, fecha_entrada, fecha_salida, cantidad_personas)
    VALUES (1, 1, DATE '2025-10-10', DATE '2025-10-12', 2);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM reserva r WHERE r.cliente_id=2 AND r.habitacion_id=1
                 AND r.fecha_entrada=DATE '2025-10-12' AND r.fecha_salida=DATE '2025-10-14') THEN
    INSERT INTO reserva (cliente_id, habitacion_id, fecha_entrada, fecha_salida, cantidad_personas)
    VALUES (2, 1, DATE '2025-10-12', DATE '2025-10-14', 2);
  END IF;
END$$;

-- Pago asociado para la primera reserva (si existe)
INSERT INTO pago (reserva_id, monto, estado)
SELECT r.reserva_id, v.anticipo_30, 'pendiente'
FROM reserva r
JOIN vw_reserva_montos v USING (reserva_id)
WHERE r.reserva_id = 1
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------
-- 5) CONSULTAS DE VERIFICACION (opcionales)
-- ---------------------------------------------------------

-- Disponibilidad en hotel 1
-- SELECT * FROM fn_habitaciones_disponibles('2025-10-10','2025-10-15',1);

-- Montos y anticipo
-- SELECT * FROM vw_reserva_montos ORDER BY reserva_id;
