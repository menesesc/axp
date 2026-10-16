/**
 * Qué turno es.
 *
 * "Turno 1" no le dice nada a nadie: el que mira la pantalla piensa en
 * mañana, mediodía, tarde o noche. El nombre sale de la hora en que se abrió
 * la caja y de los horarios que configuró la casa, porque un bar de playa y
 * un restaurante de centro no parten el día igual.
 *
 * La madrugada cae en el último turno del día anterior, que es como se
 * siente trabajando: el que cierra a las tres sigue en el turno noche.
 */

export interface Turno {
  nombre: string
  /** HH:MM en que arranca. */
  desde: string
}

export const TURNOS_POR_DEFECTO: Turno[] = [
  { nombre: 'Mañana', desde: '06:00' },
  { nombre: 'Mediodía', desde: '11:00' },
  { nombre: 'Tarde', desde: '15:00' },
  { nombre: 'Noche', desde: '19:00' },
]

const minutos = (hhmm: string) => {
  const [h, m] = hhmm.split(':')
  return (Number(h) || 0) * 60 + (Number(m) || 0)
}

/** El turno al que pertenece una hora HH:MM. */
export function turnoDe(hora: string | null | undefined, turnos: Turno[] = TURNOS_POR_DEFECTO): string | null {
  if (!hora) return null
  const lista = [...(turnos.length ? turnos : TURNOS_POR_DEFECTO)].sort((a, b) => minutos(a.desde) - minutos(b.desde))
  const t = minutos(hora)
  let actual = lista[lista.length - 1]!
  for (const x of lista) {
    if (t >= minutos(x.desde)) actual = x
  }
  return actual.nombre
}
