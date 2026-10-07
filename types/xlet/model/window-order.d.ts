// GENERATED from lib/ by scripts/generate-xlet-types.mjs — do not edit;
// regenerate with: npm run gen:types
export const ORDER_VERSION: number;
export const ORDER_MAX_PER_SURFACE: number;
export const ORDER_MAX_SURFACES: number;
export const ORDER_MAX_KEY: number;
export const ORDER_ID_RE: RegExp;
export function orderKey(mkey: MonitorKey, wskey: WsKey): string;
export function orderItemValid(id: unknown): boolean;
export function orderIds(raw: unknown): string[] | null;
export function orderParse(text: unknown): {
    v: number;
    s: Record<string, string[]>;
} | null;
export function orderGet(store: {
    v: number;
    s: Record<string, string[]>;
} | null, key: string): string[] | null;
export function orderSet(store: {
    v: number;
    s: Record<string, string[]>;
} | null, key: string, ids: unknown[]): {
    v: number;
    s: Record<string, string[]>;
};
export function orderSort(ids: string[] | null, windows: CinnamonWindow[], descOf: (w: CinnamonWindow) => string | null): CinnamonWindow[];
