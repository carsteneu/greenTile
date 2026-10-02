// GENERATED from lib/ by scripts/generate-xlet-types.mjs — do not edit;
// regenerate with: npm run gen:types
export function monitorKey(connector: string, vendor: string, product: string, serial: string): MonitorKey;
export function monitorFallbackKey(name: string, width: number, height: number): MonitorKey;
export function monitorStates(monitors: any): Array<{
    connector: string;
    key: MonitorKey;
}>;
export function monitorWsKey(wsIndex: number, isPrimary: boolean, onlyPrimary: boolean): WsKey;
export function monitorLabels(names: string[], connectors: string[]): string[];
