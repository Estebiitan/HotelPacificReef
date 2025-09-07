-- =========================
-- Esquema base: Hotel Reef
-- PostgreSQL 13+ recomendado
-- =========================

CREATE SCHEMA IF NOT EXISTS hotelreef;
SET search_path TO hotelreef, public;

-- ---------
-- 1) Núcleo
-- ---------
CREATE TABLE hotel (
  hotel_id       BIGSERIAL PRIMARY KEY,
  nombre         VARCHAR(120) NOT NULL,
  direccion      VARCHAR(200) NOT NULL
);

CREATE TABLE habitacion (
  habitacion_id  BIGSERIAL PRIMARY KEY,
  hotel_id       BIGINT NOT NULL REFERENCES hotel(hotel_id) ON DELETE CASCADE,
  numero         VARCHAR(10) NOT NULL,                          -- p.ej. "101"
  tipo           VARCHAR(20)  NOT NULL CHECK (tipo IN ('Turista','Premium')),
  capacidad      INTEGER NOT NULL CHECK (capacidad > 0),
  precio_diario  NUMERIC(12,2) NOT NULL CHECK (precio_diario >= 0),
  UNIQUE (hotel_id, numero)
);

CREATE TABLE cliente (
  cliente_id     BIGSERIAL PRIMARY KEY,
  nombre         VARCHAR(80)  NOT NULL,
  apellido       VARCHAR(80)  NOT NULL,
  correo         VARCHAR(160) NOT NULL UNIQUE,
  telefono       VARCHAR(30)
);

CREATE TABLE reserva (
  reserva_id       BIGSERIAL PRIMARY KEY,
  cliente_id       BIGINT NOT NULL REFERENCES cliente(cliente_id) ON DELETE RESTRICT,
  habitacion_id    BIGINT NOT NULL REFERENCES habitacion(habitacion_id) ON DELETE RESTRICT,
  fecha_entrada    DATE   NOT NULL,
  fecha_salida     DATE 
  
  NOT NULL,
  cantidad_personas INTEGER NOT NULL CHECK (cantidad_personas > 0),
  CHECK (fecha_salida > fecha_entrada)
);

-- Evitar traslapes de reservas por habitación usando un EXCLUDE + gist
-- Requiere la extensión btree_gist (nativa en Postgres).
CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE reserva
  ADD CONSTRAINT no_overlap_por_habitacion
  EXCLUDE USING gist (
    habitacion_id WITH =,
    daterange(fecha_entrada, fecha_salida, '[]') WITH &&
  );

-- ------------------------
-- 2) Pago y Ticket (opc.)
-- ------------------------
CREATE TABLE pago (
  pago_id       BIGSERIAL PRIMARY KEY,
  reserva_id    BIGINT NOT NULL UNIQUE REFERENCES reserva(reserva_id) ON DELETE CASCADE,
  monto         NUMERIC(12,2) NOT NULL CHECK (monto >= 0),
  estado        VARCHAR(20)    NOT NULL CHECK (estado IN ('pendiente','aprobado','fallido')),
  creado_en     TIMESTAMPTZ    NOT NULL DEFAULT now()
);

CREATE TABLE ticket_reserva (
  ticket_id     BIGSERIAL PRIMARY KEY,
  reserva_id    BIGINT NOT NULL UNIQUE REFERENCES reserva(reserva_id) ON DELETE CASCADE,
  codigo_qr     TEXT NOT NULL,
  url_descarga  TEXT,
  creado_en     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- -------------------------
-- 3) VISTA de montos (30%)
-- -------------------------
-- total_dias * precio_diario y anticipo del 30% (redondeado a 0 decimales si quieres)
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

-- --------------------------------
-- 4) FUNCIÓN: consultar disponibilidad
-- --------------------------------
-- Devuelve habitaciones disponibles en el rango (entrada, salida) para un hotel dado (opcional).
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
        AND daterange(r.fecha_entrada, r.fecha_salida, '[]')
            && daterange(p_fecha_entrada, p_fecha_salida, '[]')
    )
  ORDER BY h.hotel_id, h.numero;
$$;

-- --------------------
-- 5) Índices útiles
-- --------------------
CREATE INDEX IF NOT EXISTS idx_reserva_cliente ON reserva(cliente_id);
CREATE INDEX IF NOT EXISTS idx_reserva_habitacion ON reserva(habitacion_id);
CREATE INDEX IF NOT EXISTS idx_reserva_rango ON reserva USING gist (daterange(fecha_entrada, fecha_salida, '[]'));

-- --------------------
-- 6) Datos de ejemplo
-- --------------------
INSERT INTO hotel (nombre, direccion)
VALUES ('Hotel Pacific Reef', 'Av. Costanera 123, Ciudad'), ('Hotel Centro', 'Av. Principal 456');

INSERT INTO habitacion (hotel_id, numero, tipo, capacidad, precio_diario) VALUES
  (1, '101', 'Turista', 2, 45000),
  (1, '102', 'Turista', 3, 52000),
  (1, '201', 'Premium', 2, 78000),
  (2, '101', 'Turista', 2, 40000);

INSERT INTO cliente (nombre, apellido, correo, telefono) VALUES
  ('Ana', 'González', 'ana@example.com', '+56 9 1234 5678'),
  ('Luis', 'Pérez',    'luis@example.com', '+56 9 9876 5432');

-- Reserva válida (2 noches)
INSERT INTO reserva (cliente_id, habitacion_id, fecha_entrada, fecha_salida, cantidad_personas)
VALUES (1, 1, DATE '2025-10-10', DATE '2025-10-12', 2);

-- Intento de traslape (debe FALLAR por la constraint EXCLUDE)
-- INSERT INTO reserva (cliente_id, habitacion_id, fecha_entrada, fecha_salida, cantidad_personas)
-- VALUES (2, 1, DATE '2025-10-11', DATE '2025-10-13', 2);

-- Pago asociado (opcional)
INSERT INTO pago (reserva_id, monto, estado)
SELECT r.reserva_id, v.anticipo_30, 'pendiente'
FROM reserva r
JOIN vw_reserva_montos v USING (reserva_id)
WHERE r.reserva_id = 1;

--Ver habitaciones disponibles
SELECT * FROM fn_habitaciones_disponibles('2025-10-10','2025-10-15',1);

--Ver montos y anticipo (30%)
SELECT * FROM vw_reserva_montos;

--Insertar reserva traslapada (debe fallar por constraint)
INSERT INTO reserva (cliente_id, habitacion_id, fecha_entrada, fecha_salida, cantidad_personas)
VALUES (1, 1, DATE '2025-10-11', DATE '2025-10-13', 2);
