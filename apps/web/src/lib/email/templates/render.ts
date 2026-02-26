import { prisma } from '@/lib/prisma'
import { DEFAULT_TEMPLATES, type TemplateVariables } from './defaults'

type TemplateType = 'ORDEN_PAGO' | 'COMPARTIR_DOCUMENTOS'

interface RenderedTemplate {
  subject: string
  html: string
}

function replaceVariables(text: string, vars: TemplateVariables): string {
  let result = text

  // Replace simple variables {{var}}
  for (const [key, value] of Object.entries(vars)) {
    if (typeof value === 'string') {
      result = result.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value)
    }
  }

  // Handle conditional blocks {{#var}}...{{/var}}
  for (const [key, value] of Object.entries(vars)) {
    const blockRegex = new RegExp(`\\{\\{#${key}\\}\\}([\\s\\S]*?)\\{\\{/${key}\\}\\}`, 'g')
    if (value) {
      // Keep the content, remove the tags
      result = result.replace(blockRegex, '$1')
    } else {
      // Remove the entire block
      result = result.replace(blockRegex, '')
    }
  }

  // Clean any remaining conditional blocks that weren't matched
  result = result.replace(/\{\{#\w+\}\}[\s\S]*?\{\{\/\w+\}\}/g, '')

  return result
}

function wrapInLayout(bodyHtml: string): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
</head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:32px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;border:1px solid #e5e5e5;">
          <tr>
            <td style="background:#1a1a2e;padding:24px 32px;">
              <h1 style="margin:0;color:#ffffff;font-size:20px;font-weight:700;">AXP</h1>
            </td>
          </tr>
          <tr>
            <td style="padding:32px;">
              ${bodyHtml}
            </td>
          </tr>
          <tr>
            <td style="background:#f9f9f9;padding:16px 32px;border-top:1px solid #e5e5e5;">
              <p style="margin:0;font-size:12px;color:#999;">
                Este email fue enviado automáticamente por AXP. Por favor no responda a este correo.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}

export async function renderTemplate(
  clienteId: string,
  tipo: TemplateType,
  variables: TemplateVariables,
): Promise<RenderedTemplate> {
  // Try to find a custom template in the database
  const customTemplate = await prisma.email_templates.findUnique({
    where: { clienteId_tipo: { clienteId, tipo } },
  })

  const template = customTemplate && customTemplate.activo
    ? { asunto: customTemplate.asunto, cuerpo: customTemplate.cuerpo }
    : DEFAULT_TEMPLATES[tipo]

  const subject = replaceVariables(template.asunto, variables)
  const bodyHtml = replaceVariables(template.cuerpo, variables)

  return {
    subject,
    html: wrapInLayout(bodyHtml),
  }
}
