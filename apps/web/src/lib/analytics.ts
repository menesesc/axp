export function track(eventName: string, props?: Record<string, unknown>) {
  // Placeholder para conectar GA/PostHog/Segment en el futuro.
  console.log('[analytics]', eventName, props ?? {});
}
