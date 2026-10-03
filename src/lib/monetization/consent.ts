/** An ordinary cookie banner is not a certified CMP. No localStorage consent bypass. */
export type TcfData = {cmpId?: number;cmpStatus?: string;eventStatus?: string;tcString?: string;listenerId?: number;
  purpose?: {consents?: Record<string, boolean>};vendor?: {consents?: Record<string, boolean>};
  publisher?: {restrictions?: Record<string, Record<string, number>>}};
export function adConsentGranted(data: TcfData | null | undefined, success: boolean, expectedCmpId: number): boolean {
  // Conservatively require explicit consent globally, even when gdprApplies=false.
  if (success !== true || !data || data.cmpId !== expectedCmpId || data.cmpStatus !== 'loaded'
    || !['tcloaded','useractioncomplete'].includes(data.eventStatus || '') || typeof data.tcString !== 'string'
    || !/^[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)*$/.test(data.tcString)
    || data.vendor?.consents?.['755'] !== true) return false;
  return ['1','3','4'].every(purpose => data.purpose?.consents?.[purpose] === true
    && data.publisher?.restrictions?.[purpose]?.['755'] === undefined);
}
export type TcfApi = (command: string, version: number, callback: (data: TcfData, success: boolean) => void, parameter?: number) => void;
