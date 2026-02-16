export const landingCopy = {
  badge: 'Pensado para gastronomia y pymes en Argentina',
  heroTitle:
    'Controla tus facturas de proveedores y detecta aumentos antes de que te coman el margen.',
  heroSubtitle:
    'AXP automatiza la carga con OCR, mide confianza (confidenceScore), detecta cambios de precio y te ayuda a armar ordenes de pago.',
  problemTitle: 'Lo que hoy te frena',
  problemBullets: [
    'Carga manual lenta',
    'Errores humanos',
    'Aumentos invisibles factura a factura',
    'Falta de historial por proveedor/producto',
    'Pagos desordenados y sin trazabilidad',
  ],
  solutionTitle: 'Beneficios concretos para tu operacion',
  solutions: [
    {
      title: 'OCR automatico',
      description: 'Captura datos clave de cada factura sin carga manual.',
    },
    {
      title: 'confidenceScore por documento',
      description: 'Prioriza revision humana donde realmente hace falta.',
    },
    {
      title: 'Deteccion de duplicados',
      description: 'Evita doble carga y reduce errores operativos.',
    },
    {
      title: 'Historial y variacion de precios',
      description: 'Compara proveedor y producto para detectar aumentos.',
    },
    {
      title: 'Export a Excel/CSV',
      description: 'Llevate la informacion a tus reportes actuales.',
    },
    {
      title: 'Ordenes de pago multipago',
      description: 'Efectivo, transferencia y echeq en un mismo flujo.',
    },
  ],
  howItWorksTitle: 'Como funciona',
  steps: [
    'Subis facturas (scanner/mail/drag&drop)',
    'AXP extrae datos y calcula confidenceScore',
    'Detecta cambios/aumentos y consolida historial',
    'Seleccionas a pagar y generas orden de pago',
  ],
  impactTitle: 'Impacto en numeros (ejemplo)',
  impact: [
    { label: 'Horas ahorradas/mes', value: '+35 h' },
    { label: 'Errores evitados', value: '-72%' },
    { label: 'Aumentos detectados', value: '+18% visibilidad' },
    { label: 'Mejor control de costos', value: '+11% margen protegido' },
  ],
  pricingTitle: 'Planes',
  pricingSubtitle: 'Escala segun tu volumen de comprobantes.',
  faqTitle: 'Preguntas frecuentes',
  finalTitle: 'Empeza a ordenar tus compras y pagos',
  finalSubtitle:
    'Agenda una demo y te mostramos en vivo como AXP se adapta a tu operacion.',
};

interface PricingPlan {
  name: string;
  docs: string;
  price: string;
  features: string[];
  highlighted?: boolean;
}

export const pricingPlans: PricingPlan[] = [
  {
    name: 'Starter',
    docs: 'Hasta 200 docs/mes',
    price: 'Consultar',
    features: ['OCR basico', 'Panel de documentos', 'Export Excel/CSV'],
  },
  {
    name: 'Pro',
    docs: 'Hasta 1000 docs/mes + alertas',
    price: 'Desde $... (segun volumen)',
    features: ['Todo Starter', 'Alertas por variacion', 'Ordenes de pago avanzadas'],
    highlighted: true,
  },
  {
    name: 'Enterprise',
    docs: 'Ilimitado + multi-sucursal + soporte',
    price: 'Consultar',
    features: ['Todo Pro', 'Multi-sucursal', 'Acompanamiento dedicado'],
  },
];

export const faqs = [
  {
    q: 'Que tan preciso es el OCR?',
    a: 'Depende de la calidad del PDF, pero AXP te muestra confidenceScore para validar rapido lo que necesita revision manual.',
  },
  {
    q: 'Que es el confidenceScore?',
    a: 'Es un indicador de confianza de extraccion. Te ayuda a priorizar donde intervenir y donde aprobar mas rapido.',
  },
  {
    q: 'Como detecta duplicados?',
    a: 'AXP compara metadatos y huella del documento para evitar doble carga del mismo comprobante.',
  },
  {
    q: 'Puedo exportar a Excel?',
    a: 'Si. Podes exportar en Excel/CSV para conciliaciones y reportes.',
  },
  {
    q: 'Sirve para varias sucursales?',
    a: 'Si, en planes avanzados podes trabajar multi-sucursal con control centralizado.',
  },
  {
    q: 'Como arranco?',
    a: 'Completa el formulario de demo y coordinamos una prueba guiada segun tu flujo actual.',
  },
] as const;
