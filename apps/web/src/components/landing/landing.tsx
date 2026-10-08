'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import type { Route } from 'next'
import {
  BellRing,
  Boxes,
  Camera,
  CircleCheck,
  FileText,
  Mail,
  MessageCircle,
  Plus,
  Printer,
  Receipt,
  ScanLine,
  ShieldCheck,
  ShoppingBasket,
  Store,
  TrendingUp,
  UsersRound,
  Wallet,
} from 'lucide-react'
import { EscenaFactura } from './escena-factura'
import './landing.css'

const DEMO = '/demo' as Route
const LOGIN = '/login' as Route

/* -------------------------------------------------------------- movimiento */

/** Revelado al hacer scroll, header que se oscurece y brillo que sigue al cursor. */
function useMovimiento(raiz: React.RefObject<HTMLDivElement>) {
  const [scroll, setScroll] = useState(false)

  useEffect(() => {
    const el = raiz.current
    if (!el) return
    el.classList.add('lx-mov')
    const io = new IntersectionObserver(
      (entradas) => {
        for (const e of entradas) {
          if (e.isIntersecting) {
            e.target.classList.add('visible')
            io.unobserve(e.target)
          }
        }
      },
      { threshold: 0.12, rootMargin: '0px 0px -6% 0px' }
    )
    el.querySelectorAll('[data-revelar]').forEach((n) => io.observe(n))

    const onScroll = () => setScroll(window.scrollY > 12)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      io.disconnect()
      window.removeEventListener('scroll', onScroll)
    }
  }, [raiz])

  const onPointerMove = (e: React.PointerEvent) => {
    const t = (e.target as HTMLElement).closest<HTMLElement>('.lx-tarjeta')
    if (!t) return
    const r = t.getBoundingClientRect()
    t.style.setProperty('--mx', `${e.clientX - r.left}px`)
    t.style.setProperty('--my', `${e.clientY - r.top}px`)
  }

  return { scroll, onPointerMove }
}

/* ------------------------------------------------------------------- marca */

function LogoAxp({ alto = 30 }: { alto?: number }) {
  return (
    <Image
      src="/marca/axp-logo-inverso.png"
      alt="AXP"
      width={Math.round((238 / 110) * alto)}
      height={alto}
      priority
      className="block"
    />
  )
}

/** Marca de Southbit (la Cruz del Sur en cinco bits). Gacrux es la única naranja. */
function MarcaSouthbit() {
  return (
    <span translate="no" className="inline-flex items-center gap-[0.45em] font-semibold tracking-[-0.02em] text-[var(--texto)] lx-display">
      <svg width="18" height="18" viewBox="0 0 40 40" fill="currentColor" aria-hidden>
        <rect x="16.5" y="1" width="6" height="6" fill="#ff7a45" />
        <rect x="30" y="10" width="4.5" height="4.5" />
        <rect x="3" y="15.5" width="6.5" height="6.5" />
        <rect x="24.5" y="20.5" width="3.5" height="3.5" />
        <rect x="18" y="31" width="7.5" height="7.5" />
      </svg>
      southbit
    </span>
  )
}

/* ------------------------------------------------------------------- hero */

const PALABRAS = ['compras', 'ventas', 'márgenes', 'depósitos', 'pagos']

function PalabraQueRota() {
  const [i, setI] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setI((n) => (n + 1) % PALABRAS.length), 2600)
    return () => clearInterval(id)
  }, [])
  const previa = (i - 1 + PALABRAS.length) % PALABRAS.length
  return (
    <span className="lx-rota" aria-live="off">
      {PALABRAS.map((p, n) => (
        <span key={p} data-estado={n === i ? 'activa' : n === previa ? 'previa' : undefined} aria-hidden={n !== i}>
          {p}
        </span>
      ))}
    </span>
  )
}

function Hero() {
  return (
    <section className="relative">
      <div className="lx-grilla" aria-hidden />
      <div className="relative mx-auto max-w-6xl px-5 sm:px-8 pt-14 pb-20 lg:pt-20 lg:pb-28 grid lg:grid-cols-[1.05fr_1fr] gap-14 lg:gap-10 items-center">
        <div>
          <p className="lx-entra inline-flex items-center gap-2 rounded-full border border-[var(--borde-fuerte)] bg-white/[0.04] px-3.5 py-1.5 text-[13px] text-[var(--sec)]">
            <span className="h-1.5 w-1.5 rounded-full bg-[var(--verde)] shadow-[0_0_0_3px_rgba(52,211,153,0.2)]" />
            Para restaurantes, bares y pymes con muchos proveedores
          </p>
          <h1 className="lx-display lx-entra lx-entra-2 mt-6 font-semibold leading-[1.02] text-[clamp(2.6rem,6.4vw,4.6rem)] tracking-[-0.045em]">
            <span className="lx-titulo-linea">Controlá tus</span>
            <PalabraQueRota />
            <span className="lx-titulo-linea">sin tipear nada.</span>
          </h1>
          <p className="lx-entra lx-entra-3 mt-6 max-w-[34rem] text-[1.075rem] leading-relaxed text-[var(--sec)]">
            Mandás la factura del proveedor por mail o WhatsApp y AXP la carga sola. Te avisa cuando algo sube, te
            muestra cuánto ganás con cada plato y te ordena el stock y los pagos.
          </p>
          <div className="lx-entra lx-entra-4 mt-9 flex flex-wrap items-center gap-3">
            <Link href={DEMO} className="lx-boton lx-boton-primario">
              Pedí una demo
            </Link>
            <Link href={LOGIN} className="lx-boton lx-boton-secundario">
              Ya tengo cuenta
            </Link>
          </div>
          <p className="lx-entra lx-entra-4 mt-5 text-sm text-[var(--ter)]">
            Funciona en la compu y en el celular. No hay nada que instalar.
          </p>
        </div>
        <EscenaFactura />
      </div>
    </section>
  )
}

/* ------------------------------------------------------- canales de entrada */

const CANALES = [
  { icono: Mail, texto: 'Por mail' },
  { icono: MessageCircle, texto: 'Por WhatsApp' },
  { icono: Camera, texto: 'Una foto desde el celular' },
  { icono: FileText, texto: 'El PDF del proveedor' },
  { icono: Printer, texto: 'El escáner de la oficina' },
]

function Canales() {
  return (
    <section className="mx-auto max-w-6xl px-5 sm:px-8 pb-20" data-revelar>
      <div className="flex flex-col lg:flex-row lg:items-center gap-5 lg:gap-8">
        <p className="lx-display text-lg font-medium shrink-0 text-[var(--texto)]">Las facturas te llegan como siempre:</p>
        <ul className="flex flex-wrap gap-2.5">
          {CANALES.map(({ icono: Icono, texto }) => (
            <li
              key={texto}
              className="inline-flex items-center gap-2 rounded-full border border-[var(--borde)] bg-white/[0.03] px-3.5 py-2 text-sm text-[var(--sec)]"
            >
              <Icono className="h-4 w-4 text-[var(--azul-2)]" />
              {texto}
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}

/* -------------------------------------------------------------------- bento */

function Tarjeta({
  icono: Icono,
  titulo,
  texto,
  tono,
  className = '',
  revelar,
  children,
}: {
  icono: typeof Mail
  titulo: string
  texto: string
  tono?: 'ambar' | 'verde'
  className?: string
  revelar?: string
  children?: React.ReactNode
}) {
  return (
    <article className={`lx-tarjeta flex flex-col p-6 sm:p-7 ${className}`} data-tono={tono} data-revelar={revelar ?? ''}>
      <span className="lx-icono">
        <Icono className="h-5 w-5" />
      </span>
      <h3 className="lx-display mt-5 text-[1.35rem] font-semibold leading-tight">{titulo}</h3>
      <p className="mt-2 text-[15px] leading-relaxed text-[var(--sec)] max-w-[30rem]">{texto}</p>
      {children && <div className="mt-6 flex-1 flex flex-col justify-end">{children}</div>}
    </article>
  )
}

function Bento() {
  return (
    <section id="que-hace" className="lx-seccion scroll-mt-20">
      <div className="mx-auto max-w-6xl px-5 sm:px-8 py-24 lg:py-28">
        <div className="max-w-2xl" data-revelar>
          <h2 className="lx-display text-[clamp(2rem,4vw,3rem)] font-semibold leading-[1.05]">
            Todo lo que pasa entre el proveedor y la mesa.
          </h2>
          <p className="mt-4 text-lg leading-relaxed lx-sec">
            Compras, ventas, stock y pagos conectados. Lo que entra en una factura termina en el margen de cada plato.
          </p>
        </div>

        <div className="mt-14 grid grid-cols-1 md:grid-cols-6 lg:grid-cols-12 gap-4">
          <Tarjeta
            icono={ScanLine}
            titulo="Las facturas se cargan solas"
            texto="AXP lee proveedor, número, fecha, artículos, precios e impuestos. Lo que no está claro te lo marca para que lo mires; lo demás queda listo."
            className="md:col-span-6 lg:col-span-7 lg:row-span-2"
          >
            <div className="mb-4 lx-mini p-4">
              <div className="flex items-baseline justify-between gap-3">
                <p className="lx-display text-3xl font-semibold tabular-nums">12</p>
                <p className="text-sm text-[var(--sec)] flex-1">facturas cargadas solas hoy</p>
                <span className="text-xs rounded-full px-2.5 py-1 bg-[rgba(245,165,36,0.14)] text-[var(--ambar-2)]">1 para revisar</span>
              </div>
              <div className="lx-barra mt-3">
                <i style={{ width: '92%' }} />
              </div>
            </div>
            <div className="lx-mini divide-y divide-white/[0.06]">
              {[
                ['Mayorista del Valle', 'Factura A 0012-00004871', 'Cargada'],
                ['Lácteos del Sur', 'Factura A 0003-00018254', 'Cargada'],
                ['Panificadora Centro', 'Factura A 0007-00002931', 'Cargada'],
                ['Ropa de Trabajo SRL', 'Factura A 0002-00000415', 'Revisar'],
              ].map(([prov, nro, estado]) => (
                <div key={nro} className="flex items-center gap-3 px-4 py-3">
                  <Receipt className="h-4 w-4 text-[var(--ter)] shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{prov}</p>
                    <p className="text-xs text-[var(--ter)] tabular-nums truncate">{nro}</p>
                  </div>
                  <span
                    className={`text-xs rounded-full px-2.5 py-1 ${
                      estado === 'Cargada'
                        ? 'bg-[rgba(52,211,153,0.12)] text-[var(--verde)]'
                        : 'bg-[rgba(245,165,36,0.14)] text-[var(--ambar-2)]'
                    }`}
                  >
                    {estado}
                  </span>
                </div>
              ))}
            </div>
            <p className="mt-3 text-xs text-[var(--ter)]">Cuando corregís algo, AXP lo aprende para la próxima.</p>
          </Tarjeta>

          <Tarjeta
            icono={TrendingUp}
            tono="ambar"
            titulo="Te avisa cuando algo sube"
            texto="Compara cada precio con lo que pagaste antes. Te enterás del aumento el día que llega la factura, no a fin de mes."
            className="md:col-span-3 lg:col-span-5"
            revelar="2"
          >
            <div className="flex flex-wrap gap-2">
              {[
                ['Aceite de girasol', '+18 %'],
                ['Harina 0000', '+6 %'],
                ['Crema de leche', '+11 %'],
              ].map(([art, v]) => (
                <span key={art} className="inline-flex items-center gap-2 rounded-full bg-[rgba(245,165,36,0.1)] border border-[rgba(245,165,36,0.3)] px-3 py-1.5 text-sm">
                  {art}
                  <b className="font-semibold text-[var(--ambar-2)] tabular-nums">{v}</b>
                </span>
              ))}
            </div>
          </Tarjeta>

          <Tarjeta
            icono={Wallet}
            tono="verde"
            titulo="Cuánto ganás con cada plato"
            texto="Cargás la receta una vez y AXP calcula el costo con los precios que estás pagando hoy."
            className="md:col-span-3 lg:col-span-5"
            revelar="3"
          >
            <div className="space-y-3">
              {[
                ['Bife de chorizo', 68],
                ['Ñoquis rellenos', 74],
                ['Trucha a la manteca', 59],
              ].map(([plato, m]) => (
                <div key={plato as string} className="text-sm">
                  <div className="flex justify-between mb-1.5">
                    <span>{plato}</span>
                    <span className="tabular-nums text-[var(--sec)]">{m} % de margen</span>
                  </div>
                  <div className="lx-barra">
                    <i style={{ width: `${m}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </Tarjeta>

          <Tarjeta
            icono={Store}
            titulo="Las ventas del día, sin planillas"
            texto="El cierre de caja entra solo: cuánto vendiste por turno, por forma de pago y por mozo."
            className="md:col-span-3 lg:col-span-4"
          >
            <div className="lx-mini p-4 flex items-end gap-2 h-28">
              {[38, 52, 46, 70, 64, 88, 76].map((h, n) => (
                <span
                  key={n}
                  className="flex-1 rounded-md bg-gradient-to-t from-[var(--azul-p)] to-[var(--azul)]"
                  style={{ height: `${h}%`, opacity: n === 5 ? 1 : 0.55 }}
                />
              ))}
            </div>
          </Tarjeta>

          <Tarjeta
            icono={Boxes}
            titulo="Stock en cada depósito"
            texto="Contás desde el celular y AXP sabe cuánto debería haber. Si algo baja del mínimo, te avisa."
            className="md:col-span-3 lg:col-span-4"
            revelar="2"
          >
            <div className="space-y-2.5 text-sm">
              {[
                ['Depósito', 82, false],
                ['Cocina', 46, false],
                ['Barra', 14, true],
              ].map(([dep, v, bajo]) => (
                <div key={dep as string} className="grid grid-cols-[4.5rem_1fr_auto] items-center gap-3">
                  <span className="text-[var(--sec)]">{dep}</span>
                  <div className="lx-barra">
                    <i
                      style={{
                        width: `${v}%`,
                        ...(bajo ? { background: 'linear-gradient(90deg, var(--ambar), var(--ambar-2))' } : {}),
                      }}
                    />
                  </div>
                  <span className={`text-xs w-12 text-right ${bajo ? 'text-[var(--ambar-2)]' : 'text-[var(--ter)]'}`}>
                    {bajo ? 'Reponer' : 'OK'}
                  </span>
                </div>
              ))}
            </div>
          </Tarjeta>

          <Tarjeta
            icono={ShoppingBasket}
            tono="ambar"
            titulo="Pedidos que se arman solos"
            texto="Con lo que vendiste, la cocina le pide al depósito. Y lo que falta comprar sale armado para mandárselo al proveedor por WhatsApp."
            className="md:col-span-6 lg:col-span-4"
            revelar="3"
          >
            <div className="lx-mini p-3.5">
              <div className="ml-auto max-w-[15rem] rounded-2xl rounded-br-md bg-[#0d4f3a] px-3.5 py-2.5 text-[13px] leading-relaxed text-emerald-50 shadow-lg">
                Buen día, te paso el pedido:
                <br />• 8 × Harina 0000 × 25 kg
                <br />• 6 × Aceite de girasol 5 L
                <br />
                Gracias!
              </div>
            </div>
          </Tarjeta>

          <Tarjeta
            icono={Receipt}
            titulo="Pagos sin perder el hilo"
            texto="Armás las órdenes de pago, ves qué cheques y eCheq vencen cada día y generás las transferencias de todo el lote para el banco."
            className="md:col-span-3 lg:col-span-6"
          >
            <div className="grid grid-cols-7 gap-1.5 text-center text-xs">
              {['L', 'M', 'M', 'J', 'V', 'S', 'D'].map((d, n) => (
                <span key={n} className="text-[var(--ter)]">
                  {d}
                </span>
              ))}
              {Array.from({ length: 14 }, (_, n) => {
                const marca = n === 2 ? 'eCheq' : n === 4 ? 'Lote' : n === 9 ? 'Cheque' : null
                return (
                  <span
                    key={n}
                    className={`rounded-lg py-2 tabular-nums ${
                      marca ? 'bg-[rgba(59,155,255,0.16)] text-[var(--azul-2)] border border-[rgba(59,155,255,0.35)]' : 'bg-white/[0.03] text-[var(--ter)]'
                    }`}
                    title={marca ?? undefined}
                  >
                    {n + 6}
                  </span>
                )
              })}
            </div>
            <p className="mt-3 flex items-center gap-2 text-xs text-[var(--ter)]">
              <span className="h-2.5 w-2.5 rounded-[3px] bg-[rgba(59,155,255,0.35)] border border-[rgba(59,155,255,0.5)]" />
              Días con cheques, eCheq o transferencias por salir
            </p>
          </Tarjeta>

          <Tarjeta
            icono={UsersRound}
            tono="verde"
            titulo="Cada uno ve lo que le toca"
            texto="Das acceso a tu equipo por sección. El encargado cuenta stock sin ver importes; el contador ve los pagos sin tocar las recetas."
            className="md:col-span-3 lg:col-span-6"
            revelar="2"
          >
            <div className="space-y-2 text-sm">
              {[
                ['Encargado de barra', 'Stock de Barra'],
                ['Cocina', 'Pedidos internos y recetas'],
                ['Administración', 'Pagos e informes'],
              ].map(([quien, que]) => (
                <div key={quien} className="flex items-center justify-between gap-3 lx-mini px-3.5 py-2.5">
                  <span>{quien}</span>
                  <span className="text-[var(--sec)] text-xs text-right">{que}</span>
                </div>
              ))}
            </div>
          </Tarjeta>
        </div>
      </div>
    </section>
  )
}

/* ---------------------------------------------------------- cómo funciona */

const PASOS = [
  {
    titulo: 'Mandás tus facturas',
    texto: 'Por mail, WhatsApp o una foto, como te llegan hoy. Los cierres de caja entran solos.',
  },
  {
    titulo: 'AXP las lee y las ordena',
    texto: 'Proveedor, artículos, precios e impuestos, sin tipear. Solo te pide que mires lo que no está claro.',
  },
  {
    titulo: 'Decidís con los números a la vista',
    texto: 'Qué pedir, qué pagar primero y dónde se te está yendo el margen.',
  },
]

function ComoFunciona() {
  return (
    <section id="como-funciona" className="lx-seccion scroll-mt-20">
      <div className="mx-auto max-w-6xl px-5 sm:px-8 py-24 lg:py-28">
        <h2 className="lx-display max-w-xl text-[clamp(2rem,4vw,3rem)] font-semibold leading-[1.05]" data-revelar>
          Arrancás el mismo día.
        </h2>
        <ol className="relative mt-14 grid gap-10 md:grid-cols-3 md:gap-8">
          <span
            className="hidden md:block absolute top-[1.375rem] left-[1.4rem] right-[calc(33%-1.4rem)] h-px bg-gradient-to-r from-[var(--azul)] via-[rgba(124,196,255,0.5)] to-transparent"
            aria-hidden
          />
          {PASOS.map((p, n) => (
            <li key={p.titulo} className="relative" data-revelar={String(n + 1)}>
              <span className="lx-paso-numero">{n + 1}</span>
              <h3 className="lx-display mt-6 text-xl font-semibold">{p.titulo}</h3>
              <p className="mt-2 text-[15px] leading-relaxed lx-sec max-w-[22rem]">{p.texto}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  )
}

/* ------------------------------------------------- dos vistas del producto */

function Punto({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex gap-3 text-[15px] leading-relaxed text-[var(--sec)]">
      <CircleCheck className="h-5 w-5 shrink-0 text-[var(--azul-2)] mt-0.5" />
      <span>{children}</span>
    </li>
  )
}

function Vistas() {
  return (
    <section className="lx-seccion">
      <div className="mx-auto max-w-6xl px-5 sm:px-8 py-24 lg:py-28 space-y-28">
        {/* Compra contra venta */}
        <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
          <div data-revelar>
            <h2 className="lx-display text-[clamp(1.9rem,3.6vw,2.7rem)] font-semibold leading-[1.08]">
              Sabé adónde se va la mercadería.
            </h2>
            <p className="mt-4 text-lg leading-relaxed lx-sec max-w-[34rem]">
              AXP cruza lo que compraste con lo que vendiste según tus recetas. Si se fue más lomo del que se vendió, lo
              ves en el momento y no en el balance.
            </p>
            <ul className="mt-7 space-y-3">
              <Punto>Comprado contra consumido, insumo por insumo.</Punto>
              <Punto>El costo de cada plato con el precio que pagaste esta semana.</Punto>
              <Punto>Avisos cuando la diferencia pasa el margen que vos definís.</Punto>
            </ul>
          </div>
          <div className="lx-tarjeta p-6 sm:p-7" data-revelar="2">
            <div className="flex items-center justify-between">
              <p className="lx-display font-semibold">Compra contra venta</p>
              <span className="text-xs text-[var(--ter)]">Últimos 30 días</span>
            </div>
            <div className="mt-5 space-y-4 text-sm">
              {[
                { ins: 'Lomo', comp: 42, cons: 40.5, u: 'kg' },
                { ins: 'Bife de chorizo', comp: 120, cons: 116, u: 'kg' },
                { ins: 'Trucha', comp: 64, cons: 51, u: 'kg', alerta: true },
              ].map((r) => (
                <div key={r.ins}>
                  <div className="flex justify-between mb-1.5">
                    <span>{r.ins}</span>
                    <span className={`tabular-nums ${r.alerta ? 'text-[var(--ambar-2)]' : 'text-[var(--sec)]'}`}>
                      {r.alerta
                        ? `Faltan ${(r.comp - r.cons).toLocaleString('es-AR')} ${r.u}`
                        : `${r.cons.toLocaleString('es-AR')} de ${r.comp.toLocaleString('es-AR')} ${r.u}`}
                    </span>
                  </div>
                  <div className="lx-barra">
                    <i
                      style={{
                        width: `${(r.cons / r.comp) * 100}%`,
                        ...(r.alerta ? { background: 'linear-gradient(90deg, var(--ambar), var(--ambar-2))' } : {}),
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-6 flex items-start gap-3 rounded-xl bg-[rgba(245,165,36,0.08)] border border-[rgba(245,165,36,0.28)] p-3.5 text-sm">
              <BellRing className="h-4 w-4 text-[var(--ambar-2)] mt-0.5 shrink-0" />
              <p className="text-[var(--sec)]">
                <span className="text-[var(--texto)] font-medium">Trucha: 13 kg sin explicar.</span> Revisá mermas o porciones
                en cocina.
              </p>
            </div>
          </div>
        </div>

        {/* Compras sugeridas */}
        <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
          <div className="lg:order-2" data-revelar>
            <h2 className="lx-display text-[clamp(1.9rem,3.6vw,2.7rem)] font-semibold leading-[1.08]">
              Comprá justo lo que hace falta.
            </h2>
            <p className="mt-4 text-lg leading-relaxed lx-sec max-w-[34rem]">
              Con el stock y lo que se viene vendiendo, AXP te dice qué pedir y cuándo, a quién comprárselo y a cuánto lo
              pagaste la última vez.
            </p>
            <ul className="mt-7 space-y-3">
              <Punto>Avisos cuando un insumo llega a su stock mínimo.</Punto>
              <Punto>Tiene en cuenta cuántos días tarda cada proveedor en entregar.</Punto>
              <Punto>Un pedido por proveedor, listo para mandar por WhatsApp.</Punto>
            </ul>
          </div>
          <div className="lx-tarjeta p-6 sm:p-7 lg:order-1" data-tono="ambar" data-revelar="2">
            <div className="flex items-center justify-between">
              <p className="lx-display font-semibold">Compras sugeridas</p>
              <span className="text-xs rounded-full bg-[rgba(245,165,36,0.14)] text-[var(--ambar-2)] px-2.5 py-1">3 para pedir</span>
            </div>
            <div className="mt-5 divide-y divide-white/[0.06] text-sm">
              {[
                ['Harina 0000', 'Mayorista del Valle', 'Quedan 2 días', 'Pedir ya'],
                ['Aceite de girasol', 'Distribuidora Norte', 'Quedan 3 días', 'Pedir ya'],
                ['Crema de leche', 'Lácteos del Sur', 'Quedan 5 días', 'Pedir pronto'],
              ].map(([art, prov, dias, estado]) => (
                <div key={art} className="flex items-center gap-3 py-3">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{art}</p>
                    <p className="text-xs text-[var(--ter)]">
                      {prov}, {dias?.toLowerCase()}
                    </p>
                  </div>
                  <span
                    className={`text-xs rounded-full px-2.5 py-1 ${
                      estado === 'Pedir ya'
                        ? 'bg-[rgba(245,165,36,0.16)] text-[var(--ambar-2)]'
                        : 'bg-white/[0.06] text-[var(--sec)]'
                    }`}
                  >
                    {estado}
                  </span>
                </div>
              ))}
            </div>
            <div className="mt-5 flex justify-end">
              <span className="inline-flex items-center gap-2 rounded-full bg-gradient-to-b from-[#16a34a] to-[#11883f] px-4 py-2 text-sm font-medium text-white shadow-[0_10px_30px_-10px_rgba(37,211,102,0.55)]">
                <MessageCircle className="h-4 w-4" />
                Mandar pedido por WhatsApp
              </span>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

/* -------------------------------------------------------------------- planes */

const PLANES = [
  {
    nombre: 'Starter',
    para: 'Para un local que recién empieza a ordenarse.',
    items: ['Hasta 100 facturas por mes', '2 usuarios', 'Lectura automática de facturas'],
  },
  {
    nombre: 'Professional',
    para: 'Para negocios con muchos proveedores y varios depósitos.',
    items: ['Hasta 500 facturas por mes', '5 usuarios', 'Lectura automática de facturas'],
    destacado: true,
  },
  {
    nombre: 'Enterprise',
    para: 'Para cadenas y grupos con varios locales.',
    items: ['Facturas sin límite', 'Usuarios sin límite', 'Soporte prioritario'],
  },
]

function Planes() {
  return (
    <section id="planes" className="lx-seccion scroll-mt-20">
      <div className="mx-auto max-w-6xl px-5 sm:px-8 py-24 lg:py-28">
        <div className="max-w-2xl" data-revelar>
          <h2 className="lx-display text-[clamp(2rem,4vw,3rem)] font-semibold leading-[1.05]">Elegí cómo empezar.</h2>
          <p className="mt-4 text-lg leading-relaxed lx-sec">
            Antes de decidir, te mostramos AXP funcionando con tus propias facturas.
          </p>
        </div>
        <div className="mt-14 grid gap-4 md:grid-cols-3">
          {PLANES.map((p, n) => (
            <article
              key={p.nombre}
              className={`lx-tarjeta p-7 flex flex-col ${p.destacado ? 'md:-translate-y-3 shadow-[0_40px_80px_-50px_rgba(59,155,255,0.9)]' : ''}`}
              data-revelar={String(n + 1)}
            >
              <div className="flex items-center justify-between gap-2">
                <h3 className="lx-display text-2xl font-semibold">{p.nombre}</h3>
                {p.destacado && (
                  <span className="text-xs rounded-full bg-[rgba(59,155,255,0.16)] text-[var(--azul-2)] px-2.5 py-1">
                    El más elegido
                  </span>
                )}
              </div>
              <p className="mt-2 text-[15px] lx-sec">{p.para}</p>
              <ul className="mt-6 space-y-3 flex-1">
                {p.items.map((i) => (
                  <li key={i} className="flex items-center gap-2.5 text-[15px]">
                    <CircleCheck className="h-[18px] w-[18px] text-[var(--azul-2)]" />
                    {i}
                  </li>
                ))}
              </ul>
              <Link href={DEMO} className={`lx-boton mt-8 ${p.destacado ? 'lx-boton-primario' : 'lx-boton-secundario'}`}>
                Consultá el precio
              </Link>
            </article>
          ))}
        </div>
      </div>
    </section>
  )
}

/* --------------------------------------------------------------- preguntas */

const PREGUNTAS = [
  {
    p: '¿Tengo que cargar las facturas a mano?',
    r: 'No. Las reenviás por mail o WhatsApp, sacás una foto o arrastrás el PDF, y AXP las carga solas. Vos solo mirás las que te marca como dudosas.',
  },
  {
    p: '¿Y si lee algo mal?',
    r: 'Lo corregís en un clic. AXP te muestra qué tan seguro está de cada factura y aprende de tus correcciones para la próxima vez.',
  },
  {
    p: '¿Funciona con mi sistema de ventas?',
    r: 'Hoy toma automáticamente los cierres de caja de Maxirest. Si usás otro sistema, podés subir las ventas en un archivo. Escribinos y vemos tu caso.',
  },
  {
    p: '¿Tengo que instalar algo?',
    r: 'No. AXP funciona desde el navegador, en la compu o en el celular.',
  },
  {
    p: '¿Puedo darle acceso a mi equipo?',
    r: 'Sí, y elegís qué ve cada uno: por ejemplo, el encargado puede contar stock sin ver los importes.',
  },
  {
    p: '¿Mis datos están seguros?',
    r: 'Cada empresa ve solamente su información, cada usuario entra con su cuenta y queda registrado quién cambió qué.',
  },
]

function Preguntas() {
  return (
    <section id="preguntas" className="lx-seccion scroll-mt-20">
      <div className="mx-auto max-w-6xl px-5 sm:px-8 py-24 lg:py-28 grid lg:grid-cols-[1fr_1.6fr] gap-10 lg:gap-16">
        <div data-revelar>
          <h2 className="lx-display text-[clamp(2rem,4vw,3rem)] font-semibold leading-[1.05]">Preguntas frecuentes</h2>
          <p className="mt-4 lx-sec leading-relaxed max-w-sm">
            ¿Te quedó alguna duda?{' '}
            <Link href={DEMO} className="text-[var(--azul-2)] hover:underline underline-offset-4">
              Escribinos
            </Link>
            .
          </p>
        </div>
        <div className="lx-faq divide-y divide-white/[0.08] border-y border-white/[0.08]" data-revelar="2">
          {PREGUNTAS.map(({ p, r }) => (
            <details key={p} className="group">
              <summary className="flex items-center justify-between gap-6 py-5 lx-display text-lg font-medium">
                {p}
                <Plus className="lx-mas h-5 w-5 shrink-0 text-[var(--sec)]" />
              </summary>
              <p className="pb-6 -mt-1 text-[15px] leading-relaxed lx-sec max-w-[38rem]">{r}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  )
}

/* ------------------------------------------------------------------ cierre */

function Cierre() {
  return (
    <section className="mx-auto max-w-6xl px-5 sm:px-8 pb-24 lg:pb-32" data-revelar>
      <div className="lx-cierre relative isolate overflow-hidden px-6 py-16 sm:px-14 sm:py-20 text-center">
        <div className="lx-cierre-brillo" aria-hidden />
        <ShieldCheck className="mx-auto h-9 w-9 text-[var(--azul-2)]" />
        <h2 className="lx-display mx-auto mt-5 max-w-2xl text-[clamp(2rem,4.4vw,3.2rem)] font-semibold leading-[1.05]">
          Probalo con tus propias facturas.
        </h2>
        <p className="mx-auto mt-4 max-w-xl text-lg leading-relaxed lx-sec">
          Te mostramos AXP funcionando con lo que ya te mandan tus proveedores. Sin compromiso.
        </p>
        <div className="mt-9 flex flex-wrap justify-center gap-3">
          <Link href={DEMO} className="lx-boton lx-boton-primario">
            Pedí una demo
          </Link>
          <Link href={LOGIN} className="lx-boton lx-boton-secundario">
            Ingresar
          </Link>
        </div>
      </div>
    </section>
  )
}

/* ------------------------------------------------------------------ página */

export function Landing({ fuenteDisplay }: { fuenteDisplay: string }) {
  const raiz = useRef<HTMLDivElement>(null)
  const { scroll, onPointerMove } = useMovimiento(raiz)

  return (
    <div ref={raiz} className={`lx ${fuenteDisplay}`} onPointerMove={onPointerMove}>
      <header className="lx-header" data-scroll={scroll ? '1' : '0'}>
        <div className="mx-auto max-w-6xl h-[4.25rem] px-5 sm:px-8 flex items-center justify-between gap-4">
          <Link href="/" aria-label="AXP, inicio" className="shrink-0">
            <LogoAxp alto={30} />
          </Link>
          <nav className="lx-nav hidden md:flex items-center gap-1 text-[15px]" aria-label="Secciones">
            <a href="#que-hace">Qué hace</a>
            <a href="#como-funciona">Cómo funciona</a>
            <a href="#planes">Planes</a>
            <a href="#preguntas">Preguntas</a>
          </nav>
          <div className="flex items-center gap-2">
            <span className="hidden sm:inline-flex">
              <Link href={LOGIN} className="lx-boton lx-boton-secundario lx-boton-chico">
                Ingresar
              </Link>
            </span>
            <Link href={DEMO} className="lx-boton lx-boton-primario lx-boton-chico">
              Pedí una demo
            </Link>
          </div>
        </div>
      </header>

      <main>
        <Hero />
        <Canales />
        <Bento />
        <ComoFunciona />
        <Vistas />
        <Planes />
        <Preguntas />
        <Cierre />
      </main>

      <footer className="border-t border-[var(--borde)] bg-gradient-to-b from-transparent to-white/[0.02]">
        <div className="mx-auto max-w-6xl px-5 sm:px-8 py-14 grid gap-10 sm:grid-cols-[2fr_1fr_1fr]">
          <div>
            <LogoAxp alto={28} />
            <p className="mt-4 text-sm lx-sec max-w-xs leading-relaxed">
              Compras, ventas, stock y pagos de tu negocio gastronómico, en un solo lugar.
            </p>
          </div>
          <div className="text-sm">
            <p className="font-medium text-[var(--texto)]">Producto</p>
            <ul className="mt-3 space-y-2 lx-sec">
              <li>
                <a href="#que-hace" className="hover:text-[var(--texto)]">
                  Qué hace
                </a>
              </li>
              <li>
                <a href="#planes" className="hover:text-[var(--texto)]">
                  Planes
                </a>
              </li>
              <li>
                <a href="#preguntas" className="hover:text-[var(--texto)]">
                  Preguntas frecuentes
                </a>
              </li>
            </ul>
          </div>
          <div className="text-sm">
            <p className="font-medium text-[var(--texto)]">Tu cuenta</p>
            <ul className="mt-3 space-y-2 lx-sec">
              <li>
                <Link href={LOGIN} className="hover:text-[var(--texto)]">
                  Ingresar
                </Link>
              </li>
              <li>
                <Link href={DEMO} className="hover:text-[var(--texto)]">
                  Pedí una demo
                </Link>
              </li>
              <li>
                <Link href={'/privacidad' as Route} className="hover:text-[var(--texto)]">
                  Política de privacidad
                </Link>
              </li>
            </ul>
          </div>
        </div>
        <div className="border-t border-[var(--borde)]">
          <div className="mx-auto max-w-6xl px-5 sm:px-8 py-6 flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between text-sm text-[var(--ter)]">
            <p>© {new Date().getFullYear()} AXP. Todos los derechos reservados.</p>
            <a href="https://southbit.dev" target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 hover:text-[var(--sec)]">
              Un producto de <MarcaSouthbit />
            </a>
          </div>
        </div>
      </footer>
    </div>
  )
}

