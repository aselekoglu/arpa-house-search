/*
 * ARPA House Search intentionally disables the telemetry endpoint inherited from
 * the Fredy MIT baseline. Product telemetry, if it is ever introduced, must be
 * designed as an ARPA-owned feature with an explicit destination and consent flow.
 */

export const trackMainEvent = async () => undefined;

export async function trackDemoAccessed() {
  return undefined;
}
