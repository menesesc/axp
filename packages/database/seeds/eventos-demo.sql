-- Datos de prueba del módulo de eventos: la cena de fin de año con 120
-- reservas (~450 personas), para ver cómo se comportan la ficha del evento,
-- los KPIs y la lista con volumen de verdad.
--
-- NO correr contra producción. Pensado para una base local con
-- manual_eventos.sql aplicada.
--
--   psql ... -v cliente=<uuid del cliente> -f eventos-demo.sql
--
-- Si no se pasa :cliente, usa el primero de la tabla clientes.

BEGIN;

\if :{?cliente}
\else
  SELECT id AS cliente FROM clientes ORDER BY "razonSocial" LIMIT 1 \gset
\endif

-- El evento.
WITH e AS (
  INSERT INTO eventos ("clienteId", nombre, tipo, fecha, "horaInicio", "horaFin", cupo,
                       "precioAdulto", "precioMenor", "ivaModo", "ivaAlicuota",
                       "pagoModo", "senaPct", "senaVence", "saldoVence", observaciones)
  VALUES (:'cliente', 'Fin de año · turno noche (demo)', 'FIN_DE_ANIO',
          make_date(extract(year FROM now())::int, 12, 31), '21:30', '03:00', 650,
          85000, 42000, 'INCLUIDO', 21, 'SENA_PCT', 30,
          make_date(extract(year FROM now())::int, 12, 15),
          make_date(extract(year FROM now())::int, 12, 28),
          'Datos de prueba generados por eventos-demo.sql')
  RETURNING id, fecha
)
SELECT id AS evento, fecha AS fecha_evento FROM e \gset

-- Salones habilitados: todos los del cliente, si hay.
INSERT INTO evento_salones ("eventoId", "sectorId")
SELECT :'evento', s.id FROM pos_sectores s WHERE s."clienteId" = :'cliente'
ON CONFLICT DO NOTHING;

-- 120 reservas con estados, orígenes y tamaños variados.
INSERT INTO reservas ("clienteId", numero, "eventoId", nombre, "contactoNombre", "contactoTelefono",
                      fecha, hora, "sectorId", adultos, menores, bebes, liberados,
                      estado, "aprobadaAt", origen, observaciones)
SELECT :'cliente',
       COALESCE((SELECT max(numero) FROM reservas WHERE "clienteId" = :'cliente'), 0) + g,
       :'evento',
       'Familia ' || (ARRAY['Pérez','González','Rodríguez','Fernández','López','Martínez','Sánchez','Romero','Díaz','Álvarez','Torres','Ruiz'])[1 + g % 12] || ' ' || g,
       (ARRAY['Laura','Martín','Sofía','Juan','Carla','Diego','Ana','Pablo'])[1 + g % 8],
       '+54 9 294 4' || lpad((g * 7919 % 1000000)::text, 6, '0'),
       :'fecha_evento', '21:30',
       (SELECT s.id FROM pos_sectores s WHERE s."clienteId" = :'cliente' ORDER BY s.orden OFFSET (g % GREATEST((SELECT count(*) FROM pos_sectores WHERE "clienteId" = :'cliente'), 1)) LIMIT 1),
       2 + g % 5, g % 3, CASE WHEN g % 11 = 0 THEN 1 ELSE 0 END, CASE WHEN g % 17 = 0 THEN 1 ELSE 0 END,
       CASE WHEN g % 10 = 0 THEN 'PRESUPUESTO' WHEN g % 23 = 0 THEN 'CANCELADO' ELSE 'APROBADO' END,
       CASE WHEN g % 10 = 0 OR g % 23 = 0 THEN NULL ELSE now() - (g || ' hours')::interval END,
       (ARRAY['WHATSAPP','TELEFONO','INSTAGRAM','PRESENCIAL','EMAIL','WEB'])[1 + g % 6],
       CASE WHEN g % 9 = 0 THEN 'Cerca de la ventana si se puede' END
  FROM generate_series(1, 120) g;

-- Plan de pagos de la regla del evento: seña 30 % y saldo.
INSERT INTO reserva_cuotas ("reservaId", concepto, porcentaje, vencimiento, orden)
SELECT r.id, 'Seña', 30, make_date(extract(year FROM now())::int, 12, 15), 0
  FROM reservas r WHERE r."eventoId" = :'evento';
INSERT INTO reserva_cuotas ("reservaId", concepto, vencimiento, orden)
SELECT r.id, 'Saldo', make_date(extract(year FROM now())::int, 12, 28), 1
  FROM reservas r WHERE r."eventoId" = :'evento';

-- Regímenes: algunos celíacos, vegetarianos y una alergia.
INSERT INTO reserva_regimenes ("reservaId", tipo, cantidad, nota)
SELECT r.id,
       (ARRAY['CELIACO','VEGETARIANO','VEGANO','SIN_LACTOSA','ALERGIA'])[1 + r.numero % 5],
       1 + r.numero % 2,
       CASE WHEN r.numero % 5 = 4 THEN 'Alergia a frutos secos' END
  FROM reservas r WHERE r."eventoId" = :'evento' AND r.numero % 4 = 0;

-- Pagos: la mitad de los aprobados pagó la seña, un cuarto pagó todo.
INSERT INTO reserva_pagos ("clienteId", "reservaId", fecha, monto, medio, "usuarioNombre")
SELECT r."clienteId", r.id, current_date - (r.numero % 20), round(t.total * 0.3, 2),
       (ARRAY['TRANSFERENCIA','EFECTIVO','MERCADOPAGO','TARJETA'])[1 + r.numero % 4], 'Demo'
  FROM reservas r JOIN reserva_totales t ON t."reservaId" = r.id
 WHERE r."eventoId" = :'evento' AND r.estado = 'APROBADO' AND r.numero % 2 = 0 AND t.total > 0;
INSERT INTO reserva_pagos ("clienteId", "reservaId", fecha, monto, medio, "usuarioNombre")
SELECT r."clienteId", r.id, current_date, t.saldo, 'TRANSFERENCIA', 'Demo'
  FROM reservas r JOIN reserva_totales t ON t."reservaId" = r.id
 WHERE r."eventoId" = :'evento' AND r.estado = 'APROBADO' AND r.numero % 4 = 0 AND t.saldo > 0;

INSERT INTO evento_auditoria ("clienteId", "eventoId", accion, descripcion, "usuarioNombre")
VALUES (:'cliente', :'evento', 'creado', 'Evento de prueba generado con 120 reservas', 'Demo');

COMMIT;

SELECT sigla, count(*) AS reservas, sum(personas) AS personas, sum(total) AS total, sum(cobrado) AS cobrado
  FROM reserva_totales WHERE "eventoId" = :'evento' GROUP BY sigla ORDER BY sigla;
