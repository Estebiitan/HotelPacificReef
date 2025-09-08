-- =========================
-- Esquema base: Hotel Reef
-- PostgreSQL 13+ recomendado
-- =========================

CREATE SCHEMA IF NOT EXISTS hotelreef;
SET search_path TO hotelreef, public;

-- Extensiones necesarias
CREATE EXTENSION IF NOT EXISTS btree_gist;

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
  correo         VARCHAR(160) NOT NULL,
  telefono       VARCHAR(30)
);

-- Único por correo en minúsculas (evita duplicados ANa@ y ana@)
CREATE UNIQUE INDEX IF NOT EXISTS ux_cliente_correo_lower
  ON cliente (lower(correo));

CREATE TABLE reserva (
  reserva_id         BIGSERIAL PRIMARY KEY,
  cliente_id         BIGINT NOT NULL REFERENCES cliente(cliente_id) ON DELETE RESTRICT,
  habitacion_id      BIGINT NOT NULL REFERENCES habitacion(habitacion_id) ON DELETE RESTRICT,
  fecha_entrada      DATE   NOT NULL,
  fecha_salida       DATE   NOT NULL,
  cantidad_personas  INTEGER NOT NULL CHECK (cantidad_personas > 0),
  -- checkout libre: rango semiabierto [fecha_entrada, fecha_salida)
  rango              daterange GENERATED ALWAYS AS (daterange(fecha_entrada, fecha_salida, '[)')) STORED,
  CHECK (fecha_salida > fecha_entrada)
);

-- Evitar traslapes de reservas por habitación usando EXCLUDE + GiST
ALTER TABLE reserva
  ADD CONSTRAINT no_overlap_por_habitacion
  EXCLUDE USING gist (
    habitacion_id WITH =,
    rango WITH &&
  );

-- Trigger para validar capacidad de habitación
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
    RAISE EXCEPTION 'Habitación % no existe', NEW.habitacion_id;
  END IF;

  IF NEW.cantidad_personas > cap THEN
    RAISE EXCEPTION 'La cantidad de personas (%) excede la capacidad (%) de la habitación %',
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

-- ------------------------
-- 2) Pago y Ticket (opc.)
-- ------------------------
CREATE TABLE pago (
  pago_id       BIGSERIAL PRIMARY KEY,
  reserva_id    BIGINT NOT NULL UNIQUE REFERENCES reserva(reserva_id) ON DELETE CASCADE,
  monto         NUMERIC(12,2) NOT NULL CHECK (monto >= 0),
  estado        VARCHAR(20)    NOT NULL DEFAULT 'pendiente'
                CHECK (estado IN ('pendiente','aprobado','fallido')),
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
-- Devuelve habitaciones disponibles en el rango [entrada, salida) para un hotel dado (opcional).
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

-- --------------------
-- 5) Índices útiles
-- --------------------
CREATE INDEX IF NOT EXISTS idx_reserva_cliente ON reserva(cliente_id);
CREATE INDEX IF NOT EXISTS idx_reserva_habitacion ON reserva(habitacion_id);
CREATE INDEX IF NOT EXISTS idx_reserva_rango_gist ON reserva USING gist (rango);

-- --------------------
-- 6) Datos de ejemplo
-- --------------------
INSERT INTO hotel (nombre, direccion)
VALUES ('Hotel Pacific Reef', 'Av. Costanera 123, Ciudad'),
       ('Hotel Centro',       'Av. Principal 456');

INSERT INTO habitacion (hotel_id, numero, tipo, capacidad, precio_diario) VALUES
  (1, '101', 'Turista', 2, 45000),
  (1, '102', 'Turista', 3, 52000),
  (1, '201', 'Premium', 2, 78000),
  (2, '101', 'Turista', 2, 40000);

INSERT INTO cliente (nombre, apellido, correo, telefono) VALUES
  ('Ana',  'González', 'ana@example.com',  '+56 9 1234 5678'),
  ('Luis', 'Pérez',    'luis@example.com', '+56 9 9876 5432');

-- Reserva válida (2 noches: 10 y 11; checkout 12)
INSERT INTO reserva (cliente_id, habitacion_id, fecha_entrada, fecha_salida, cantidad_personas)
VALUES (1, 1, DATE '2025-10-10', DATE '2025-10-12', 2);

-- Caso límite: comienza el día del check-out anterior (12-14) -> DEBE PASAR (no traslape por rango [))
INSERT INTO reserva (cliente_id, habitacion_id, fecha_entrada, fecha_salida, cantidad_personas)
VALUES (2, 1, DATE '2025-10-12', DATE '2025-10-14', 2);

-- Intento de traslape real (11-13) -> DEBE FALLAR por EXCLUDE (comenta para continuar el script)
-- INSERT INTO reserva (cliente_id, habitacion_id, fecha_entrada, fecha_salida, cantidad_personas)
-- VALUES (1, 1, DATE '2025-10-11', DATE '2025-10-13', 2);

-- Intento exceder capacidad -> DEBE FALLAR por trigger (comenta para continuar)
-- INSERT INTO reserva (cliente_id, habitacion_id, fecha_entrada, fecha_salida, cantidad_personas)
-- VALUES (1, 3, DATE '2025-11-01', DATE '2025-11-03', 5);

-- Pago asociado (opcional) para la primera reserva
INSERT INTO pago (reserva_id, monto, estado)
SELECT r.reserva_id, v.anticipo_30, 'pendiente'
FROM reserva r
JOIN vw_reserva_montos v USING (reserva_id)
WHERE r.reserva_id = 1;

-- --------------------
-- 7) Consultas de verificación
-- --------------------
-- Ver habitaciones disponibles (hotel 1) entre 10 y 15 de oct, considerando checkout libre
SELECT * FROM fn_habitaciones_disponibles('2025-10-10','2025-10-15',1);

-- Ver montos y anticipo (30%)
SELECT * FROM vw_reserva_montos ORDER BY reserva_id;

-- Probar correo único case-insensitive (debe FALLAR si se descomenta)
-- INSERT INTO cliente (nombre, apellido, correo) VALUES ('Ana2','G','ANA@example.com');
