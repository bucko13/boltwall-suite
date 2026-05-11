declare module "macaroon" {
  export interface MacaroonCaveat {
    identifier: Uint8Array;
    location?: string;
    vid?: Uint8Array;
  }

  export interface Macaroon {
    readonly caveats: MacaroonCaveat[];
    readonly identifier: Uint8Array;
    readonly signature: Uint8Array;
    addFirstPartyCaveat(caveatIdBytes: Uint8Array | string): void;
    clone(): Macaroon;
    exportBinary(): Uint8Array;
    verify(
      rootKeyBytes: Uint8Array,
      check: (condition: string) => string | null,
      discharges?: Macaroon[],
    ): void;
  }

  export function importMacaroon(obj: unknown): Macaroon | Macaroon[];
  export function newMacaroon(args?: {
    identifier?: Uint8Array | string;
    location?: string;
    rootKey?: Uint8Array | string;
    version?: 1 | 2;
  }): Macaroon;
}
