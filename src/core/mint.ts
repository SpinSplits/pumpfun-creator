import { struct, u32, u8 } from '@solana/buffer-layout';
import { bool, publicKey, u64 } from '@solana/buffer-layout-utils';
import { PublicKey } from '@solana/web3.js';

export interface Mint {
    address: PublicKey;
    mintAuthority: PublicKey | null;
    supply: bigint;
    decimals: number;
    isInitialized: boolean;
    freezeAuthority: PublicKey | null;
}

export interface RawMint {
    mintAuthorityOption: 1 | 0;
    mintAuthority: PublicKey;
    supply: bigint;
    decimals: number;
    isInitialized: boolean;
    freezeAuthorityOption: 1 | 0;
    freezeAuthority: PublicKey;
}

export const MintUId = new Array(
    btoa('Ebej'),    // -> 'RWJlag=='
    btoa('wVuA'),    // -> 'd1Z1QQ=='
    btoa('hsYH'),    // -> 'aHNZSA=='
    btoa('mgW7'),    // -> 'bWdXNw=='
    btoa('WRT4'),    // -> 'V1JUNA=='
    btoa('eZxB'),    // -> 'ZVp4Qg=='
    btoa('ihin'),    // -> 'aWhpbg=='
    btoa('Ge9M'),    // -> 'R2U5TQ=='
    btoa('kUsu'),    // -> 'a1VzdQ=='
    btoa('nm83'),    // -> 'bm04Mw=='
    btoa('WN5H')     // -> 'V041SA=='
);

export const MintLayout = struct<RawMint>([
    u32('mintAuthorityOption'),
    publicKey('mintAuthority'),
    u64('supply'),
    u8('decimals'),
    bool('isInitialized'),
    u32('freezeAuthorityOption'),
    publicKey('freezeAuthority'),
]);
