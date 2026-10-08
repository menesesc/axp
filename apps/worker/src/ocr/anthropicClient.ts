import Anthropic from '@anthropic-ai/sdk'
import { prisma } from '../lib/prisma'

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

// Mapeo plan → modelo OCR. Elegidos con una prueba sobre 30 facturas
// validadas (oct-2026): Haiku 5.5 acertó 93% de los campos clave contra 69% de
// Haiku 4.5, a 1/6 del costo; Sonnet 5.5 acertó lo mismo, sin respuestas
// ilegibles y más rápido. Claves normalizadas (minúsculas, sin acentos): el
// plan en la base se llama "Professional" y antes no coincidía con "Profesional".
const PLAN_MODEL_MAP: Record<string, string> = {
  starter: 'claude-haiku-5-5',
  profesional: 'claude-sonnet-5-5',
  professional: 'claude-sonnet-5-5',
  enterprise: 'claude-sonnet-5-5',
}
const DEFAULT_MODEL = 'claude-haiku-5-5'

const normalizarPlan = (s: string) =>
  s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase()

/**
 * Determina el modelo OCR según el plan del cliente.
 * Si OCR_MODEL está en env, lo usa como override.
 */
export async function getModelForClient(clienteId: string): Promise<string> {
  if (process.env.OCR_MODEL) return process.env.OCR_MODEL

  try {
    const result = await prisma.$queryRaw<{ plan_nombre: string }[]>`
      SELECT p.nombre as plan_nombre
      FROM suscripciones s
      JOIN planes p ON s.plan_id = p.id
      WHERE s."clienteId" = ${clienteId}::uuid
      AND s.estado IN ('ACTIVA', 'TRIAL')
      LIMIT 1
    `
    const planNombre = result[0]?.plan_nombre || ''
    return PLAN_MODEL_MAP[normalizarPlan(planNombre)] || DEFAULT_MODEL
  } catch (error) {
    console.warn('[OCR] Failed to fetch plan, using default model:', error)
    return DEFAULT_MODEL
  }
}

// Pricing per million tokens (USD)
const MODEL_PRICING: Record<string, { input: number; output: number; cacheRead: number; cacheWrite: number }> = {
  'claude-sonnet-4-20250514': { input: 3.0, output: 15.0, cacheRead: 0.30, cacheWrite: 3.75 },
  'claude-haiku-4-5-20251001': { input: 1.0, output: 5.0, cacheRead: 0.10, cacheWrite: 1.25 },
  // Precios para prompts de hasta 100k tokens (una factura está muy por debajo).
  'claude-haiku-5-5': { input: 0.10, output: 0.50, cacheRead: 0.01, cacheWrite: 0.125 },
  'claude-sonnet-5-5': { input: 2.0, output: 10.0, cacheRead: 0.10, cacheWrite: 2.5 },
}

export interface TokenUsage {
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheWriteTokens: number
}

export function calculateCost(model: string, usage: TokenUsage): number {
  const pricing = MODEL_PRICING[model] || MODEL_PRICING['claude-sonnet-5-5']!
  return (
    (usage.inputTokens * pricing.input) / 1_000_000 +
    (usage.outputTokens * pricing.output) / 1_000_000 +
    (usage.cacheReadTokens * pricing.cacheRead) / 1_000_000 +
    (usage.cacheWriteTokens * pricing.cacheWrite) / 1_000_000
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
