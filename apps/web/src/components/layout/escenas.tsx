'use client'

/**
 * Escenas isométricas animadas para el encabezado de cada sección. Todo es
 * SVG + CSS: cajas proyectadas a 30° con caras en degradé, bordes con brillo,
 * sombras suaves en el piso y partículas. Sin librerías.
 */

export type NombreEscena =
  | 'inicio'
  | 'comprobantes'
  | 'pagos'
  | 'ventas'
  | 'stock'
  | 'recetas'
  | 'informes'
  | 'proveedores'
  | 'items'
  | 'configuracion'
  | 'generica'

const O = { x: 160, y: 46 }
const K = 1.2
const C = Math.cos(Math.PI / 6)

/** Proyección isométrica de un punto (x, y en el piso; z hacia arriba). */
const P = (x: number, y: number, z: number): [number, number] => [O.x + (x - y) * C * K, O.y + ((x + y) * 0.5 - z) * K]
type P3 = [number, number, number]
const pts = (arr: P3[]) => arr.map(([a, b, c]) => P(a, b, c).map((n) => n.toFixed(1)).join(',')).join(' ')

// Tres tonos por material: tapa, cara izquierda, cara derecha.
const MAT = {
  base: ['#ffffff', '#e9f0f9', '#d4e0ef'],
  blanco: ['#ffffff', '#eef3fa', '#d9e4f2'],
  azul: ['#d3e9ff', '#7cc4ff', '#3b9bff'],
  azulOsc: ['#8ccbff', '#3b9bff', '#1d66c4'],
  ambar: ['#ffe8b3', '#fcd34d', '#ee9c16'],
  carton: ['#f7dcae', '#e8b670', '#cf9547'],
  cinta: ['#fbe7c4', '#f0cd92', '#dcae68'],
  verde: ['#c8f7e3', '#6ee7b7', '#10b981'],
  rojo: ['#fecaca', '#f87171', '#dc2626'],
  gris: ['#e2e8f0', '#94a3b8', '#64748b'],
} as const
type Mat = keyof typeof MAT

function Caja({
  x,
  y,
  z = 0,
  w,
  d,
  h,
  m = 'blanco',
  sombra = false,
  className,
  style,
  children,
}: {
  x: number
  y: number
  z?: number
  w: number
  d: number
  h: number
  m?: Mat
  sombra?: boolean
  className?: string | undefined
  style?: React.CSSProperties | undefined
  children?: React.ReactNode
}) {
  const [t, l, r] = MAT[m]
  const tapa: P3[] = [[x, y, z + h], [x + w, y, z + h], [x + w, y + d, z + h], [x, y + d, z + h]]
  const izq: P3[] = [[x, y + d, z], [x + w, y + d, z], [x + w, y + d, z + h], [x, y + d, z + h]]
  const der: P3[] = [[x + w, y, z], [x + w, y + d, z], [x + w, y + d, z + h], [x + w, y, z + h]]
  return (
    <g className={className} style={style}>
      {sombra && (
        <polygon
          points={pts([[x + 4, y + 2, z], [x + w + 9, y + 2, z], [x + w + 9, y + d + 6, z], [x + 4, y + d + 6, z]])}
          fill="rgba(20,60,120,0.2)"
          filter="url(#axe-blur)"
        />
      )}
      <polygon points={pts(izq)} fill={l} stroke={l} strokeWidth="0.6" strokeLinejoin="round" />
      <polygon points={pts(izq)} fill="url(#axe-luz-l)" />
      <polygon points={pts(der)} fill={r} stroke={r} strokeWidth="0.6" strokeLinejoin="round" />
      <polygon points={pts(der)} fill="url(#axe-luz-r)" />
      <polygon points={pts(tapa)} fill={t} stroke={t} strokeWidth="0.6" strokeLinejoin="round" />
      <polygon points={pts(tapa)} fill="url(#axe-luz-t)" />
      {/* Borde iluminado del frente de la tapa */}
      <polyline points={pts([[x, y + d, z + h], [x + w, y + d, z + h], [x + w, y, z + h]])} fill="none" stroke="rgba(255,255,255,0.85)" strokeWidth="0.9" strokeLinejoin="round" />
      {children}
    </g>
  )
}

/** Segmento sobre una superficie (renglones de una factura, rayas, etc.). */
function Linea({ a, b, color = '#c7d3e3', ancho = 1.6 }: { a: P3; b: P3; color?: string; ancho?: number }) {
  const [x1, y1] = P(...a)
  const [x2, y2] = P(...b)
  return <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={color} strokeWidth={ancho} strokeLinecap="round" />
}

/** Moneda con canto; con `gira` rota sobre su eje. */
function Moneda({ x, y, z, r = 9, gira }: { x: number; y: number; z: number; r?: number; gira?: boolean }) {
  const [cx, cy] = P(x, y, z)
  return (
    <g className={gira ? 'ax-gira' : undefined}>
      <ellipse cx={cx} cy={cy + 3} rx={r} ry={r * 0.55} fill="#d48a0c" />
      <ellipse cx={cx} cy={cy} rx={r} ry={r * 0.55} fill="#fcd34d" />
      <ellipse cx={cx} cy={cy} rx={r * 0.62} ry={r * 0.34} fill="none" stroke="#f0a01d" strokeWidth="1.3" />
      <ellipse cx={cx - r * 0.35} cy={cy - r * 0.18} rx={r * 0.22} ry={r * 0.1} fill="rgba(255,255,255,0.7)" />
    </g>
  )
}

/** Partículas que suben y se desvanecen alrededor de la escena. */
function Particulas({ lista }: { lista: Array<[number, number, number, string, number]> }) {
  return (
    <>
      {lista.map(([x, y, z, c, d], i) => {
        const [cx, cy] = P(x, y, z)
        return <circle key={i} cx={cx} cy={cy} r={i % 3 === 0 ? 2.6 : 1.8} fill={c} className="ax-particula" style={{ animationDelay: `${d}s` }} />
      })}
    </>
  )
}

function Plataforma() {
  const [hx, hy] = P(65, 65, -18)
  return (
    <>
      <ellipse cx={hx} cy={hy + 10} rx="150" ry="58" fill="url(#axe-halo)" />
      <Caja x={-5} y={-5} z={-20} w={140} d={140} h={6} m="azul" />
      <Caja x={0} y={0} z={-14} w={130} d={130} h={14} m="base" />
      {[26, 52, 78, 104].map((n) => (
        <g key={n}>
          <Linea a={[n, 0, 0]} b={[n, 130, 0]} color="rgba(59,155,255,0.13)" ancho={0.8} />
          <Linea a={[0, n, 0]} b={[130, n, 0]} color="rgba(59,155,255,0.13)" ancho={0.8} />
        </g>
      ))}
    </>
  )
}

/* ------------------------------------------------------------- escenas */

function Inicio() {
  const barras = [
    { x: 18, h: 28 },
    { x: 46, h: 48 },
    { x: 74, h: 38 },
    { x: 102, h: 66 },
  ]
  const tope = barras.map((b) => P(b.x + 9, 67, b.h + 14))
  return (
    <>
      <Plataforma />
      <Caja x={14} y={98} w={46} d={26} h={3} m="blanco" sombra className="ax-flota" style={{ animationDelay: '-1.5s' }}>
        <Linea a={[20, 104, 3]} b={[46, 104, 3]} color="#3b9bff" ancho={2} />
        <Linea a={[20, 111, 3]} b={[54, 111, 3]} />
        <Linea a={[20, 117, 3]} b={[40, 117, 3]} />
      </Caja>
      {barras.map((b, i) => (
        <Caja
          key={b.x}
          x={b.x}
          y={58}
          w={18}
          d={18}
          h={b.h}
          sombra
          m={i === 3 ? 'azulOsc' : 'azul'}
          className="ax-crece"
          style={{ animationDelay: `${i * 120}ms, ${1300 + i * 300}ms` }}
        />
      ))}
      {/* Tendencia que se dibuja sobre las barras */}
      <polyline points={tope.map((p) => p.join(',')).join(' ')} fill="none" stroke="#f5a524" strokeWidth="2.4" strokeLinejoin="round" strokeLinecap="round" className="ax-traza" pathLength={100} />
      {tope.map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r="3.4" fill="#fff" stroke="#f5a524" strokeWidth="2" className="ax-aparece" style={{ animationDelay: `${0.9 + i * 0.25}s` }} />
      ))}
      <g className="ax-flota" style={{ animationDelay: '-2.5s' }}>
        <Moneda x={124} y={14} z={92} r={11} gira />
      </g>
      <Particulas
        lista={[
          [20, 30, 40, '#7cc4ff', 0],
          [110, 100, 30, '#f5a524', 1.2],
          [60, 20, 70, '#3b9bff', 2.1],
          [130, 60, 50, '#7cc4ff', 0.6],
        ]}
      />
    </>
  )
}

function Hoja({ z, i }: { z: number; i: number }) {
  return (
    <g className="ax-cae" style={{ animationDelay: `${i * 1.3}s` }}>
      <Caja x={42} y={44} z={z} w={48} d={34} h={2} m="blanco">
        <Linea a={[48, 50, z + 2]} b={[66, 50, z + 2]} color="#3b9bff" ancho={2} />
        <Linea a={[48, 57, z + 2]} b={[82, 57, z + 2]} />
        <Linea a={[48, 63, z + 2]} b={[78, 63, z + 2]} />
        <Linea a={[70, 71, z + 2]} b={[84, 71, z + 2]} color="#f5a524" ancho={2} />
      </Caja>
    </g>
  )
}

function Comprobantes() {
  const [cx, cy] = P(14, 22, 34)
  return (
    <>
      <Plataforma />
      <Caja x={34} y={36} w={64} d={50} h={20} m="blanco" sombra />
      <Caja x={40} y={42} z={19.5} w={52} d={38} h={1} m="azul" />
      {[0, 1, 2].map((i) => (
        <Hoja key={i} z={22 + i * 3} i={i} />
      ))}
      {/* Haz que lee la factura */}
      <g className="ax-escanea">
        <polygon points={pts([[36, 40, 24], [96, 40, 24], [96, 40, 46], [36, 40, 46]])} fill="url(#axe-haz)" />
        <Linea a={[36, 40, 24]} b={[96, 40, 24]} color="#3b9bff" ancho={1.6} />
      </g>
      {/* Sobre de mail que llega */}
      <g className="ax-flota" style={{ animationDelay: '-1s' }}>
        <Caja x={102} y={90} z={28} w={26} d={18} h={4} m="ambar" sombra>
          <Linea a={[102, 90, 32]} b={[115, 99, 32]} color="#ee9c16" ancho={1.2} />
          <Linea a={[128, 90, 32]} b={[115, 99, 32]} color="#ee9c16" ancho={1.2} />
        </Caja>
      </g>
      {/* Tilde de leída */}
      <g className="ax-pulso" style={{ transformOrigin: `${cx}px ${cy}px`, transformBox: 'view-box' }}>
        <circle cx={cx} cy={cy} r="17" fill="rgba(16,185,129,0.18)" />
        <circle cx={cx} cy={cy} r="12" fill="#10b981" />
        <path d={`M${cx - 5} ${cy} l3.5 3.5 l6.5 -7`} fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
      </g>
      <Particulas
        lista={[
          [100, 40, 40, '#7cc4ff', 0.4],
          [20, 80, 30, '#3b9bff', 1.6],
          [120, 120, 20, '#f5a524', 2.4],
        ]}
      />
    </>
  )
}

function Pagos() {
  const [ax, ay] = P(32, 94, 36)
  const [bx, by] = P(88, 46, 46)
  const camino = `M${ax} ${ay} Q${(ax + bx) / 2} ${Math.min(ay, by) - 50} ${bx} ${by}`
  const [kx, ky] = P(118, 22, 74)
  return (
    <>
      <Plataforma />
      {/* Banco con columnas y techo escalonado */}
      <Caja x={78} y={16} w={44} d={40} h={30} m="blanco" sombra />
      {[82, 94, 106].map((x) => (
        <Caja key={x} x={x} y={58} w={5} d={4} h={30} m="blanco" />
      ))}
      <Caja x={74} y={12} z={30} w={52} d={52} h={5} m="azul" />
      <Caja x={80} y={18} z={35} w={40} d={40} h={5} m="azulOsc" />
      <Caja x={112} y={60} w={8} d={1} h={16} m="azulOsc" />
      {/* Tarjeta */}
      <g className="ax-flota">
        <Caja x={8} y={78} z={24} w={52} d={32} h={4} m="azulOsc" sombra>
          <Linea a={[8, 104, 28]} b={[60, 104, 28]} color="rgba(255,255,255,0.35)" ancho={3} />
          <Linea a={[38, 86, 28]} b={[54, 86, 28]} color="rgba(255,255,255,0.6)" ancho={1.6} />
        </Caja>
        <Caja x={14} y={84} z={28} w={10} d={8} h={1} m="ambar" />
      </g>
      {/* Monedas que viajan de la tarjeta al banco */}
      <path d={camino} fill="none" stroke="rgba(59,155,255,0.4)" strokeWidth="1.5" strokeDasharray="3 5" className="ax-hormiga" />
      {[0, 1, 2].map((i) => (
        <g key={i} opacity="0">
          <g className="ax-gira">
            <ellipse rx="7" ry="4" cy="2" fill="#d48a0c" />
            <ellipse rx="7" ry="4" fill="#fcd34d" />
          </g>
          <animateMotion dur="3s" begin={`${i}s`} repeatCount="indefinite" path={camino} />
          <animate attributeName="opacity" values="0;1;1;0" keyTimes="0;0.15;0.8;1" dur="3s" begin={`${i}s`} repeatCount="indefinite" />
        </g>
      ))}
      {/* Pila de monedas */}
      {(() => {
        const [sx, sy] = P(26, 22, 0)
        return <ellipse cx={sx + 4} cy={sy + 4} rx="14" ry="6" fill="rgba(20,60,120,0.18)" filter="url(#axe-blur)" />
      })()}
      {[2, 7, 12, 17].map((z) => (
        <Moneda key={z} x={26} y={22} z={z} r={10} />
      ))}
      <g className="ax-flota" style={{ animationDelay: '-1s' }}>
        <Moneda x={26} y={22} z={30} r={10} gira />
      </g>
      {/* Confirmación */}
      <g className="ax-pulso" style={{ transformOrigin: `${kx}px ${ky}px`, transformBox: 'view-box', animationDelay: '0.8s' }}>
        <circle cx={kx} cy={ky} r="11" fill="#10b981" />
        <path d={`M${kx - 4.5} ${ky} l3 3 l6 -6.5`} fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
      </g>
    </>
  )
}

function Ventas() {
  const [sx, sy] = P(66, 66, 58)
  const orbita = `M${sx - 104} ${sy} a104 30 0 1 0 208 0 a104 30 0 1 0 -208 0`
  const [px, py] = P(96, 64, 26)
  return (
    <>
      <Plataforma />
      <path d={orbita} fill="none" stroke="rgba(59,155,255,0.18)" strokeWidth="1" strokeDasharray="2 5" />
      {/* Mostrador */}
      <Caja x={20} y={44} w={92} d={44} h={24} m="azul" sombra />
      <Caja x={18} y={42} z={24} w={96} d={48} h={3} m="blanco" />
      {/* Caja registradora */}
      <Caja x={36} y={52} z={27} w={38} d={28} h={16} m="blanco" sombra />
      <Caja x={40} y={56} z={43} w={22} d={3} h={14} m="azulOsc">
        <Linea a={[44, 59, 52]} b={[56, 59, 52]} color="rgba(255,255,255,0.8)" ancho={1.5} />
      </Caja>
      {[0, 1, 2].map((i) => (
        <Caja key={i} x={42 + i * 9} y={70} z={43} w={6} d={6} h={2} m="gris" />
      ))}
      {/* Ticket que se imprime */}
      <Caja x={64} y={62} z={43} w={9} d={1} h={28} m="blanco" className="ax-imprime">
        <Linea a={[66, 63, 64]} b={[71, 63, 64]} ancho={1} />
        <Linea a={[66, 63, 58]} b={[71, 63, 58]} ancho={1} />
      </Caja>
      {/* Plato servido sobre el mostrador */}
      <g className="ax-flota" style={{ animationDelay: '-2s' }}>
        <ellipse cx={px} cy={py + 3} rx="17" ry="8.5" fill="#d9e4f2" />
        <ellipse cx={px} cy={py} rx="17" ry="8.5" fill="#fff" />
        <ellipse cx={px - 3} cy={py - 1} rx="6" ry="3" fill="#ee9c16" />
        <ellipse cx={px + 5} cy={py + 1} rx="4" ry="2" fill="#10b981" />
      </g>
      {/* Sol y luna recorriendo la órbita: los dos turnos */}
      {[
        { c: '#f5a524', halo: 'rgba(245,165,36,0.22)', luna: false, begin: '0s' },
        { c: '#3b9bff', halo: 'rgba(59,155,255,0.2)', luna: true, begin: '-6s' },
      ].map((a) => (
        <g key={a.begin}>
          <circle r="17" fill={a.halo} />
          <circle r="11" fill={a.c} />
          {a.luna ? <circle cx="5" cy="-4" r="9" fill="#f4f8ff" /> : <circle cx="-3" cy="-3" r="4" fill="rgba(255,255,255,0.55)" />}
          <animateMotion dur="12s" begin={a.begin} repeatCount="indefinite" path={orbita} />
        </g>
      ))}
    </>
  )
}

function CajaCarton({ x, y, z = 0, className }: { x: number; y: number; z?: number; className?: string }) {
  return (
    <g className={className}>
      <Caja x={x} y={y} z={z} w={28} d={28} h={22} m="carton" sombra={z === 4} />
      <Caja x={x + 12} y={y} z={z + 22} w={4} d={28} h={0.4} m="cinta" />
    </g>
  )
}

function Stock() {
  const [ax, ay] = P(78, 110, 40)
  return (
    <>
      <Plataforma />
      {/* Estantería metálica */}
      <Caja x={88} y={8} w={3} d={3} h={60} m="gris" />
      <Caja x={120} y={8} w={3} d={3} h={60} m="gris" />
      {[0, 28, 56].map((z) => (
        <Caja key={z} x={88} y={8} z={z} w={35} d={20} h={2.5} m="blanco" />
      ))}
      <Caja x={93} y={12} z={2.5} w={10} d={10} h={12} m="verde" />
      <Caja x={107} y={12} z={2.5} w={10} d={10} h={9} m="azul" />
      <Caja x={95} y={12} z={30.5} w={9} d={9} h={10} m="ambar" />
      <Caja x={108} y={13} z={30.5} w={9} d={9} h={7} m="rojo" />
      <Caja x={88} y={25} w={3} d={3} h={60} m="gris" />
      <Caja x={120} y={25} w={3} d={3} h={60} m="gris" />
      {/* Pallet con cajas */}
      <Caja x={16} y={44} w={66} d={66} h={4} m="carton" sombra />
      <CajaCarton x={20} y={48} z={4} />
      <CajaCarton x={50} y={48} z={4} />
      <CajaCarton x={20} y={78} z={4} />
      <CajaCarton x={50} y={78} z={4} />
      <CajaCarton x={35} y={63} z={26} />
      <CajaCarton x={35} y={63} z={48} className="ax-apila" />
      {/* Alerta de stock bajo */}
      <g className="ax-pulso" style={{ transformOrigin: `${ax}px ${ay}px`, transformBox: 'view-box' }}>
        <circle cx={ax} cy={ay} r="17" fill="rgba(239,68,68,0.16)" />
        <circle cx={ax} cy={ay} r="11.5" fill="#ef4444" />
        <rect x={ax - 1.4} y={ay - 6.5} width="2.8" height="8" rx="1.4" fill="#fff" />
        <circle cx={ax} cy={ay + 4.5} r="1.6" fill="#fff" />
      </g>
      <Particulas
        lista={[
          [20, 20, 40, '#f5a524', 0.3],
          [120, 110, 20, '#7cc4ff', 1.4],
        ]}
      />
    </>
  )
}

function Recetas() {
  const [vx, vy] = P(50, 68, 58)
  const [px, py] = P(100, 100, 2)
  return (
    <>
      <Plataforma />
      {/* Tabla de picar con ingredientes y cuchillo */}
      <Caja x={72} y={12} w={50} d={36} h={5} m="carton" sombra />
      <Caja x={78} y={18} z={5} w={10} d={10} h={10} m="verde" sombra className="ax-flota" />
      <Caja x={93} y={16} z={5} w={9} d={9} h={7} m="ambar" sombra className="ax-flota" style={{ animationDelay: '-1.2s' }} />
      <Caja x={106} y={30} z={5} w={10} d={10} h={8} m="rojo" sombra className="ax-flota" style={{ animationDelay: '-2.4s' }} />
      <Caja x={80} y={38} z={5} w={34} d={4} h={1} m="gris" />
      <Caja x={66} y={38} z={5} w={14} d={4} h={2} m="carton" />
      {/* Olla con asas y tapa que tiembla */}
      <Caja x={24} y={46} w={48} d={46} h={30} m="azul" sombra />
      <Caja x={18} y={64} z={20} w={6} d={10} h={4} m="azulOsc" />
      <Caja x={72} y={64} z={20} w={6} d={10} h={4} m="azulOsc" />
      <g className="ax-tapa">
        <Caja x={22} y={44} z={30} w={52} d={50} h={4} m="azulOsc" />
        <Caja x={44} y={65} z={34} w={8} d={8} h={6} m="blanco" />
      </g>
      {/* Vapor ondulante */}
      {[-16, 0, 16].map((dx, i) => (
        <path
          key={dx}
          d={`M${vx + dx} ${vy} c-6 -8 6 -14 0 -22 c-6 -8 6 -14 0 -22`}
          fill="none"
          stroke="#7cc4ff"
          strokeOpacity="0.9"
          strokeWidth="3.6"
          strokeLinecap="round"
          className="ax-humo"
          style={{ animationDelay: `${i * 0.7}s` }}
        />
      ))}
      {/* Plato servido */}
      <g className="ax-flota" style={{ animationDelay: '-3s' }}>
        <ellipse cx={px + 4} cy={py + 8} rx="30" ry="13" fill="rgba(20,60,120,0.16)" filter="url(#axe-blur)" />
        <ellipse cx={px} cy={py + 3} rx="30" ry="15" fill="#d9e4f2" />
        <ellipse cx={px} cy={py} rx="30" ry="15" fill="#fff" />
        <ellipse cx={px} cy={py} rx="20" ry="10" fill="#f1f5fb" />
        <ellipse cx={px - 5} cy={py - 2} rx="9" ry="4.5" fill="#ee9c16" />
        <ellipse cx={px + 7} cy={py + 1} rx="6" ry="3" fill="#10b981" />
        <ellipse cx={px + 1} cy={py + 4} rx="4" ry="2" fill="#ef4444" />
      </g>
    </>
  )
}

function Informes() {
  const [cx, cy] = P(40, 90, 1)
  const partes = [
    { c: '#3b9bff', v: 42 },
    { c: '#f5a524', v: 26 },
    { c: '#10b981', v: 18 },
    { c: '#a78bfa', v: 14 },
  ]
  let acum = 0
  const barras = [16, 26, 20, 34, 42]
  const [sx, sy] = P(120, 34, 104)
  return (
    <>
      <Plataforma />
      {/* Pantalla con barras */}
      <Caja x={64} y={16} w={62} d={6} h={68} m="blanco" sombra />
      <Caja x={68} y={22} z={4} w={54} d={0.6} h={60} m="base" />
      {barras.map((h, i) => (
        <Caja
          key={i}
          x={72 + i * 10}
          y={22.6}
          z={10}
          w={6}
          d={1.5}
          h={h}
          m={i === barras.length - 1 ? 'azulOsc' : 'azul'}
          className="ax-crece"
          style={{ animationDelay: `${i * 110}ms, ${1300 + i * 250}ms` }}
        />
      ))}
      <Caja x={88} y={22} w={14} d={14} h={2} m="gris" />
      {/* Dona apoyada en el piso, con espesor */}
      <ellipse cx={cx + 4} cy={cy + 10} rx="44" ry="20" fill="rgba(20,60,120,0.16)" filter="url(#axe-blur)" />
      <ellipse cx={cx} cy={cy + 5} rx="40" ry="20" fill="none" stroke="#1d66c4" strokeOpacity="0.35" strokeWidth="11" />
      {partes.map((p) => {
        const inicio = acum
        acum += p.v
        return (
          <ellipse
            key={p.c}
            cx={cx}
            cy={cy}
            rx="40"
            ry="20"
            fill="none"
            stroke={p.c}
            strokeWidth="11"
            pathLength={100}
            strokeDasharray={`${p.v - 1.2} ${101.2 - p.v}`}
            strokeDashoffset={-inicio}
            className="ax-dona"
          />
        )
      })}
      <ellipse cx={cx} cy={cy} rx="34.5" ry="17" fill="none" stroke="rgba(255,255,255,0.6)" strokeWidth="1" />
      {/* Destello de proyecciones IA */}
      <path
        className="ax-destello"
        style={{ transformOrigin: `${sx}px ${sy}px`, transformBox: 'view-box' }}
        d={`M${sx} ${sy - 13} C${sx + 2} ${sy - 3} ${sx + 3} ${sy - 2} ${sx + 13} ${sy} C${sx + 3} ${sy + 2} ${sx + 2} ${sy + 3} ${sx} ${sy + 13} C${sx - 2} ${sy + 3} ${sx - 3} ${sy + 2} ${sx - 13} ${sy} C${sx - 3} ${sy - 2} ${sx - 2} ${sy - 3} ${sx} ${sy - 13}Z`}
        fill="#f5a524"
      />
      <Particulas
        lista={[
          [110, 40, 90, '#f5a524', 0.5],
          [10, 60, 40, '#7cc4ff', 1.3],
          [60, 120, 20, '#a78bfa', 2.2],
        ]}
      />
    </>
  )
}

function Rueda({ x, y }: { x: number; y: number }) {
  const [cx, cy] = P(x, y, 4)
  return (
    <g>
      <ellipse cx={cx} cy={cy} rx="6" ry="7" fill="#334155" />
      <ellipse cx={cx} cy={cy} rx="2.6" ry="3" fill="#cbd5e1" />
    </g>
  )
}

function Proveedores() {
  const [ax, ay] = P(56, 92, 6)
  const [bx, by] = P(96, 60, 2)
  const [rx, ry] = P(26, 70, 64)
  return (
    <>
      <Plataforma />
      {/* Tu local, con toldo */}
      <Caja x={78} y={10} w={46} d={42} h={34} m="blanco" sombra />
      <Caja x={74} y={6} z={34} w={54} d={50} h={5} m="azul" />
      <Caja x={78} y={52} z={22} w={46} d={7} h={3} m="ambar" />
      {[82, 94, 106, 118].map((x) => (
        <Caja key={x} x={x} y={58.5} z={22} w={5} d={0.5} h={3} m="blanco" />
      ))}
      <Caja x={88} y={52} w={12} d={0.6} h={18} m="azulOsc" />
      <Caja x={106} y={52} z={8} w={12} d={0.6} h={10} m="azul" />
      {/* Cajas recibidas en la puerta */}
      <Caja x={100} y={66} w={14} d={14} h={11} m="carton" sombra />
      <Caja x={102} y={68} z={11} w={11} d={11} h={9} m="carton" className="ax-apila" />
      {/* Camino del reparto */}
      <path d={`M${ax} ${ay} Q${(ax + bx) / 2} ${Math.max(ay, by) + 6} ${bx} ${by}`} fill="none" stroke="rgba(59,155,255,0.45)" strokeWidth="1.5" strokeDasharray="3 5" className="ax-hormiga" />
      {/* Camión */}
      <g className="ax-reparto">
        <Caja x={10} y={78} w={42} d={24} h={28} m="azul" sombra>
          <Linea a={[14, 102, 18]} b={[46, 102, 18]} color="rgba(255,255,255,0.6)" ancho={2.4} />
        </Caja>
        <Caja x={52} y={80} w={18} d={22} h={20} m="azulOsc" sombra>
          <Linea a={[70, 84, 15]} b={[70, 98, 15]} color="rgba(255,255,255,0.75)" ancho={4} />
        </Caja>
        <Rueda x={20} y={102} />
        <Rueda x={42} y={102} />
        <Rueda x={62} y={102} />
      </g>
      {/* Remito / factura que acompaña la entrega */}
      <g className="ax-flota" style={{ animationDelay: '-1.2s' }}>
        <Caja x={20} y={46} z={58} w={26} d={18} h={2} m="blanco" sombra>
          <Linea a={[24, 50, 60]} b={[36, 50, 60]} color="#3b9bff" ancho={1.8} />
          <Linea a={[24, 55, 60]} b={[42, 55, 60]} />
          <Linea a={[24, 60, 60]} b={[38, 60, 60]} />
        </Caja>
      </g>
      <g className="ax-pulso" style={{ transformOrigin: `${rx}px ${ry}px`, transformBox: 'view-box' }}>
        <circle cx={rx} cy={ry} r="10" fill="#10b981" />
        <path d={`M${rx - 4} ${ry} l3 3 l5.5 -6`} fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      </g>
      <Particulas
        lista={[
          [120, 110, 20, '#7cc4ff', 0.6],
          [60, 20, 50, '#f5a524', 1.8],
        ]}
      />
    </>
  )
}

function Items() {
  const [ex, ey] = P(84, 34, 70)
  return (
    <>
      <Plataforma />
      {/* Productos */}
      <Caja x={16} y={56} w={22} d={22} h={30} m="verde" sombra />
      <Caja x={42} y={60} w={18} d={18} h={22} m="ambar" sombra />
      <Caja x={20} y={84} w={26} d={20} h={16} m="carton" sombra>
        <Caja x={31} y={84} z={16} w={4} d={20} h={0.4} m="cinta" />
      </Caja>
      <Caja x={52} y={86} w={14} d={14} h={26} m="rojo" sombra />
      {/* Lector que escanea */}
      <g className="ax-escanea-corto">
        <polygon points={pts([[14, 60, 32], [40, 60, 32], [40, 60, 52], [14, 60, 52]])} fill="url(#axe-laser)" />
        <Linea a={[14, 60, 32]} b={[40, 60, 32]} color="#ef4444" ancho={1.6} />
      </g>
      {/* Etiqueta de precio con código de barras */}
      <g className="ax-flota" style={{ animationDelay: '-1.5s' }}>
        <Caja x={74} y={18} z={44} w={44} d={30} h={3} m="blanco" sombra>
          {[0, 3, 5, 9, 12, 14, 18, 21, 23, 27].map((dx) => (
            <Linea key={dx} a={[80 + dx, 22, 47]} b={[80 + dx, 34, 47]} color="#334155" ancho={dx % 3 === 0 ? 1.8 : 1} />
          ))}
          <Linea a={[80, 40, 47]} b={[100, 40, 47]} color="#3b9bff" ancho={2.2} />
        </Caja>
        <Caja x={108} y={36} z={47} w={8} d={10} h={1} m="ambar" />
      </g>
      <path
        className="ax-destello"
        style={{ transformOrigin: `${ex}px ${ey}px`, transformBox: 'view-box' }}
        d={`M${ex} ${ey - 10} C${ex + 1.5} ${ey - 2} ${ex + 2} ${ey - 1.5} ${ex + 10} ${ey} C${ex + 2} ${ey + 1.5} ${ex + 1.5} ${ey + 2} ${ex} ${ey + 10} C${ex - 1.5} ${ey + 2} ${ex - 2} ${ey + 1.5} ${ex - 10} ${ey} C${ex - 2} ${ey - 1.5} ${ex - 1.5} ${ey - 2} ${ex} ${ey - 10}Z`}
        fill="#f5a524"
      />
      <Particulas
        lista={[
          [110, 100, 20, '#a78bfa', 0.3],
          [10, 30, 40, '#7cc4ff', 1.4],
        ]}
      />
    </>
  )
}

function Configuracion() {
  const [gx, gy] = P(30, 40, 70)
  const dientes = Array.from({ length: 8 }, (_, i) => i * 45)
  return (
    <>
      <Plataforma />
      {/* Panel con interruptores */}
      <Caja x={56} y={22} w={64} d={8} h={60} m="blanco" sombra />
      {[0, 1, 2].map((i) => {
        const z = 64 - i * 20
        return (
          <g key={i}>
            <Linea a={[62, 30.2, z]} b={[78, 30.2, z]} color="#c7d3e3" ancho={2} />
            <Caja x={88} y={30} z={z - 5} w={24} d={1.5} h={10} m={i === 1 ? 'gris' : 'azul'} />
            <g className="ax-interruptor" style={{ animationDelay: `${i * 0.9}s` }}>
              <Caja x={i === 1 ? 89 : 101} y={30.5} z={z - 4} w={10} d={2} h={8} m="blanco" />
            </g>
          </g>
        )
      })}
      {/* Engranaje */}
      <g className="ax-engranaje" style={{ transformOrigin: `${gx}px ${gy}px`, transformBox: 'view-box' }}>
        {dientes.map((a) => (
          <rect key={a} x={gx - 4} y={gy - 25} width="8" height="10" rx="2" fill="#3b9bff" transform={`rotate(${a} ${gx} ${gy})`} />
        ))}
        <circle cx={gx} cy={gy} r="18" fill="#3b9bff" />
        <circle cx={gx} cy={gy} r="7" fill="#eef5ff" />
      </g>
      <Caja x={14} y={84} w={30} d={24} h={14} m="azulOsc" sombra />
      <Particulas
        lista={[
          [120, 110, 20, '#f5a524', 0.5],
          [20, 20, 60, '#7cc4ff', 1.6],
        ]}
      />
    </>
  )
}

function Generica() {
  const [cx, cy] = P(65, 65, 46)
  return (
    <>
      <Plataforma />
      <ellipse cx={cx} cy={cy} rx="96" ry="28" fill="none" stroke="rgba(59,155,255,0.25)" strokeWidth="1" strokeDasharray="2 5" />
      <Caja x={30} y={50} w={40} d={40} h={40} m="azul" sombra className="ax-flota" />
      <Caja x={78} y={30} w={28} d={28} h={28} m="azulOsc" sombra className="ax-flota" style={{ animationDelay: '-1.6s' }} />
      <Caja x={40} y={18} z={40} w={24} d={24} h={24} m="ambar" className="ax-flota" style={{ animationDelay: '-3.2s' }} />
      <g>
        <circle r="5" fill="#f5a524" />
        <animateMotion dur="9s" repeatCount="indefinite" path={`M${cx - 96} ${cy} a96 28 0 1 0 192 0 a96 28 0 1 0 -192 0`} />
      </g>
      <Particulas
        lista={[
          [10, 30, 50, '#7cc4ff', 0],
          [120, 90, 30, '#3b9bff', 1.5],
        ]}
      />
    </>
  )
}

const ESCENAS: Record<NombreEscena, () => React.JSX.Element> = {
  inicio: Inicio,
  comprobantes: Comprobantes,
  pagos: Pagos,
  ventas: Ventas,
  stock: Stock,
  recetas: Recetas,
  informes: Informes,
  proveedores: Proveedores,
  items: Items,
  configuracion: Configuracion,
  generica: Generica,
}

export function Escena({ nombre }: { nombre: NombreEscena }) {
  const Dibujo = ESCENAS[nombre]
  return (
    <svg viewBox="10 -6 300 244" className="ax-esc h-full w-full overflow-visible" aria-hidden="true">
      <defs>
        <linearGradient id="axe-luz-t" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#fff" stopOpacity="0.55" />
          <stop offset="70%" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="axe-luz-l" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#fff" stopOpacity="0.28" />
          <stop offset="100%" stopColor="#0b2a55" stopOpacity="0.06" />
        </linearGradient>
        <linearGradient id="axe-luz-r" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#fff" stopOpacity="0.12" />
          <stop offset="100%" stopColor="#0b2a55" stopOpacity="0.14" />
        </linearGradient>
        <linearGradient id="axe-haz" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#7cc4ff" stopOpacity="0" />
          <stop offset="100%" stopColor="#3b9bff" stopOpacity="0.4" />
        </linearGradient>
        <linearGradient id="axe-laser" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ef4444" stopOpacity="0" />
          <stop offset="100%" stopColor="#ef4444" stopOpacity="0.35" />
        </linearGradient>
        <radialGradient id="axe-halo">
          <stop offset="0%" stopColor="#3b9bff" stopOpacity="0.22" />
          <stop offset="100%" stopColor="#3b9bff" stopOpacity="0" />
        </radialGradient>
        <filter id="axe-blur" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="3" />
        </filter>
      </defs>
      <Dibujo />
    </svg>
  )
}
