import { PantallaComprobantes } from '@/components/prototipo/pantallas/comprobantes'
import { PantallaVentas } from '@/components/prototipo/pantallas/ventas'
import { PantallaCompras } from '@/components/prototipo/pantallas/compras'
import { PantallaPagos } from '@/components/prototipo/pantallas/pagos'
import { PantallaRecetas } from '@/components/prototipo/pantallas/recetas'
import { PantallaInformes, PantallaPrecios } from '@/components/prototipo/pantallas/informes'
import { PantallaGenerica } from '@/components/prototipo/pantallas/generica'

const PANTALLAS: Record<string, () => JSX.Element> = {
  '/documentos': PantallaComprobantes,
  '/ventas': PantallaVentas,
  '/compras': PantallaCompras,
  '/pagos': PantallaPagos,
  '/recetas': PantallaRecetas,
  '/informes': PantallaInformes,
  '/informes/precios': PantallaPrecios,
}

export default async function Page(props: { params: Promise<{ seccion: string[] }> }) {
  const params = await props.params;
  const href = `/${params.seccion.join('/')}`
  const Pantalla = PANTALLAS[href]
  return Pantalla ? <Pantalla /> : <PantallaGenerica href={href} />
}
