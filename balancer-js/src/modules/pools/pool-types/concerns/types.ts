/* eslint @typescript-eslint/no-explicit-any: ["error", { "ignoreRestArgs": true }] */

import { SubgraphPoolBase } from '@balancer-labs/sor';
import { JoinPoolRequest } from '@/types';
import { BigNumber } from '@ethersproject/bignumber';

export interface LiquidityConcern {
  calcTotal: (...args: any[]) => string;
}

export interface SpotPriceConcern {
  calcPoolSpotPrice: (
    tokenIn: string,
    tokenOut: string,
    pool: SubgraphPoolBase
  ) => string;
}

export interface JoinConcern {
  buildJoin: ({
    joiner,
    pool,
    tokensIn,
    amountsIn,
    slippage,
    wrappedNativeAsset,
  }: ExactTokensInJoinPoolParameters) => Promise<JoinPoolAttributes>;
}

export interface JoinPool {
  poolId: string;
  sender: string;
  recipient: string;
  joinPoolRequest: JoinPoolRequest;
}

export interface JoinPoolAttributes {
  to: string;
  functionName: string;
  attributes: JoinPool;
  data: string;
  value?: BigNumber;
  minBPTOut: string;
}

export interface ExactTokensInJoinPoolParameters {
  joiner: string;
  pool: SubgraphPoolBase;
  tokensIn: string[];
  amountsIn: string[];
  slippage: string;
  wrappedNativeAsset: string;
}
