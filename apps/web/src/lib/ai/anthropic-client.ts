import Anthropic from '@anthropic-ai/sdk'

let _client: Anthropic | null = null

export function getAnthropicClient(): Anthropic {
  if (!_client) {
    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) {
      throw new Error('ANTHROPIC_API_KEY is not configured')
    }
    _client = new Anthropic({ apiKey })
  }
  return _client
}

// Claude Sonnet 4 (claude-sonnet-4-20250514) fue dado de baja: la API devuelve 404.
export const AI_MODEL = 'claude-sonnet-5-5'

/**
 * Opciones para AI_MODEL: piensa por defecto (adaptive) y el thinking cuenta
 * dentro de max_tokens. Para extraer/resumir alcanza con esfuerzo bajo.
 */
export const AI_OPCIONES = { output_config: { effort: 'low' as const } }

/** Texto de la respuesta (puede venir precedido de un bloque de thinking). */
export function textoRespuesta(content: Array<{ type: string; text?: string }>): string {
  const b = content.find((c) => c.type === 'text')
  return b?.text ?? ''
}

// Pricing per million tokens (USD) - Claude Sonnet 5.5
const PRICING = {
  inputPerMToken: 2.0,
  outputPerMToken: 10.0,
} as const

export function calculateCost(inputTokens: number, outputTokens: number): number {
  return (
    (inputTokens * PRICING.inputPerMToken) / 1_000_000 +
    (outputTokens * PRICING.outputPerMToken) / 1_000_000
  )
}

export function parseAIResponse<T>(text: string): T {
  try {
    return JSON.parse(text)
  } catch {
    // Fallback: extract JSON from markdown code block
    const match = text.match(/```(?:json)?\s*([\s\S]*?)```/)
    if (match?.[1]) {
      return JSON.parse(match[1].trim())
    }
    throw new Error('No se pudo parsear la respuesta de la IA')
  }
}
