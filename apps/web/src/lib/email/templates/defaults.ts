export interface TemplateVariables {
  empresa: string
  empresaCuit: string
  proveedor: string
  proveedorCuit?: string | undefined
  monto?: string | undefined
  numero?: string | undefined
  fecha?: string | undefined
  nota?: string | undefined
  documentos?: string | undefined
  metodos?: string | undefined
  mensaje?: string | undefined
}

export const DEFAULT_TEMPLATES = {
  ORDEN_PAGO: {
    asunto: 'Orden de pago #{{numero}} - {{empresa}}',
    cuerpo: `<p>Estimado/a <strong>{{proveedor}}</strong>,</p>

<p>Le informamos que <strong>{{empresa}}</strong> (CUIT: {{empresaCuit}}) ha emitido la orden de pago <strong>#{{numero}}</strong> por un monto total de <strong>{{monto}}</strong> con fecha {{fecha}}.</p>

{{#documentos}}
<h3>Documentos incluidos</h3>
<table style="width:100%;border-collapse:collapse;margin:16px 0;">
<thead>
<tr style="background:#f5f5f5;">
<th style="text-align:left;padding:8px;border-bottom:1px solid #ddd;">Documento</th>
<th style="text-align:left;padding:8px;border-bottom:1px solid #ddd;">Fecha</th>
<th style="text-align:right;padding:8px;border-bottom:1px solid #ddd;">Total</th>
</tr>
</thead>
<tbody>
{{documentos}}
</tbody>
</table>
{{/documentos}}

{{#metodos}}
<h3>Formas de pago</h3>
<table style="width:100%;border-collapse:collapse;margin:16px 0;">
<thead>
<tr style="background:#f5f5f5;">
<th style="text-align:left;padding:8px;border-bottom:1px solid #ddd;">Método</th>
<th style="text-align:right;padding:8px;border-bottom:1px solid #ddd;">Importe</th>
</tr>
</thead>
<tbody>
{{metodos}}
</tbody>
</table>
{{/metodos}}

{{#nota}}
<p><strong>Nota:</strong> {{nota}}</p>
{{/nota}}

<p>Adjunto encontrará el comprobante en formato PDF.</p>

<p>Saludos cordiales,<br/><strong>{{empresa}}</strong></p>`,
  },
  COMPARTIR_DOCUMENTOS: {
    asunto: 'Documentos compartidos - {{empresa}}',
    cuerpo: `<p>Estimado/a,</p>

<p><strong>{{empresa}}</strong> le comparte los siguientes documentos adjuntos en formato PDF.</p>

{{#mensaje}}
<p><strong>Mensaje:</strong> {{mensaje}}</p>
{{/mensaje}}

<p>Saludos cordiales,<br/><strong>{{empresa}}</strong></p>`,
  },
} as const
