import { LiquidityConcern } from '../types';
import { TokenBalance } from '@/types';
import { BigNumber, parseFixed, formatFixed } from '@ethersproject/bignumber';

export class StablePoolLiquidity implements LiquidityConcern {
    calcTotal(tokenBalances: TokenBalance[]): string {
        // TODO implementation
        console.log(tokenBalances);
        throw new Error('To be implemented');
        return '1000';
    }
}
