// yarn test:only ./src/modules/pricing/picompare.integration.spec.ts
import { BigNumber, formatFixed, parseFixed } from '@ethersproject/bignumber';
import dotenv from 'dotenv';
import hardhat from 'hardhat';

import {
  Address,
  BalancerSDK,
  Network,
  PoolToken,
  PoolWithMethods,
  SwapType,
} from '@/.';
import { forkSetup, TestPoolHelper } from '@/test/lib/utils';
import { ADDRESSES, TEST_BLOCK } from '@/test/lib/constants';
import { queryBatchSwap } from '../swaps/queryBatchSwap';

dotenv.config();

const { ALCHEMY_URL: jsonRpcUrl } = process.env;
const { ethers } = hardhat;

const rpcUrl = 'http://127.0.0.1:8545';
const network = Network.MAINNET;
const sdk = new BalancerSDK({ network, rpcUrl });
const { contracts } = sdk;
const provider = new ethers.providers.JsonRpcProvider(rpcUrl, 1);
const signer = provider.getSigner();
const { balancerHelpers, vault } = contracts;

// Slots used to set the account balance for each token through hardhat_setStorageAt
// Info fetched using npm package slot20
const slots = [ADDRESSES[network].WBTC.slot, ADDRESSES[network].WETH.slot];
const initialBalance = '100000';
const testPoolId =
  '0x5c6ee304399dbdb9c8ef030ab642b10820db8f56000200000000000000000014'; // B_50WBTC_50WETH
const blockNumber = TEST_BLOCK[network];
const slippage = '0'; // does not affect result

describe('Weighted Pool - Join Functions', async () => {
  let pool: PoolWithMethods;
  let signerAddress: Address;
  let testPoolHelper: TestPoolHelper;

  before(async () => {
    signerAddress = await signer.getAddress();
    testPoolHelper = new TestPoolHelper(
      testPoolId,
      network,
      rpcUrl,
      blockNumber
    );
    pool = await testPoolHelper.getPool();
  });

  context('Integration Tests', async () => {
    // Setup chain
    beforeEach(async function () {
      const balances = pool.tokens.map((token) =>
        parseFixed(initialBalance, token.decimals).toString()
      );
      await forkSetup(
        signer,
        pool.tokensList,
        slots,
        balances,
        jsonRpcUrl as string,
        blockNumber
      );
      pool = await testPoolHelper.getPool(); // update the pool after the forkSetup;
    });

    context('single token join', async () => {
      let tokenIn: PoolToken;
      let amountIn: BigNumber;

      before(() => {
        tokenIn = pool.tokens[0];
        amountIn = parseFixed('10', tokenIn.decimals);
      });

      it('should calculate price impact - spot price method', async () => {
        const amountsIn = Array(pool.tokensList.length).fill('0');
        amountsIn[pool.tokensList.indexOf(tokenIn.address)] =
          amountIn.toString();

        const { priceImpact } = pool.buildJoin(
          signerAddress,
          pool.tokensList,
          amountsIn,
          slippage
        );

        const priceImpactFloat = parseFloat(
          formatFixed(BigNumber.from(priceImpact), 18)
        );
        console.log(`priceImpactFloat: ${priceImpactFloat}`);
      });

      it('should calculate price impact - ABA method', async () => {
        const maxAmountsInByToken = new Map<string, BigNumber>([
          [tokenIn.address, amountIn],
        ]);

        const joinParams = pool.buildQueryJoinExactIn({
          maxAmountsInByToken,
        });

        const { bptOut } = await balancerHelpers.callStatic.queryJoin(
          ...joinParams
        );

        const exitParams = pool.buildQueryExitToSingleToken({
          bptIn: bptOut,
          tokenOut: tokenIn.address,
        });

        const { amountsOut } = await balancerHelpers.callStatic.queryExit(
          ...exitParams
        );

        const initialA = parseFloat(formatFixed(amountIn, 8));
        const finalA = parseFloat(formatFixed(amountsOut[0], 8));
        const priceImpactABA = (initialA - finalA) / initialA / 2;
        console.log(`priceImpactABA  : ${priceImpactABA}`);
      });
    });

    context('unbalanced join - 2 tokens', async () => {
      let amountsIn: BigNumber[];

      before(() => {
        amountsIn = pool.tokens.map((token) =>
          parseFixed('10000', token.decimals)
        );
      });

      it('should calculate price impact - spot price method', async () => {
        const { priceImpact } = pool.buildJoin(
          signerAddress,
          pool.tokensList,
          amountsIn.map((amount) => amount.toString()),
          slippage
        );

        const priceImpactFloat = parseFloat(
          formatFixed(BigNumber.from(priceImpact), 18)
        );
        console.log(`priceImpactFloat: ${priceImpactFloat}`);
      });

      it('should calculate price impact - ABA method', async () => {
        const maxAmountsInByToken = new Map<string, BigNumber>(
          amountsIn.map((a, i) => [pool.tokensList[i], a])
        );

        // query unbalanced join
        const { bptOut } = await balancerHelpers.callStatic.queryJoin(
          ...pool.buildQueryJoinExactIn({
            maxAmountsInByToken,
          })
        );

        // calculate proportional amounts out
        const { amountsOut } = await balancerHelpers.callStatic.queryExit(
          ...pool.buildQueryExitProportionally({
            bptIn: bptOut,
          })
        );

        // diff between unbalanced and proportional amounts for token 1
        const diffs = amountsOut.map((a, i) => a.sub(amountsIn[i]));
        const excessIndex = diffs.findIndex((a) => a.gt(0));
        const otherIndex = diffs.findIndex((a) => a.lt(0));
        const diff1 = amountsOut[excessIndex].sub(amountsIn[excessIndex]);

        // swap that diff to token 0
        const returnAmounts = await queryBatchSwap(
          vault,
          SwapType.SwapExactIn,
          [
            {
              poolId: pool.id,
              assetInIndex: excessIndex,
              assetOutIndex: otherIndex,
              amount: diff1.toString(),
              userData: '0x',
            },
          ],
          pool.tokensList
        );

        // calculate final token 0 amount (using sub because returnAmounts[0] is negative)
        const token0Final = amountsOut[otherIndex].sub(
          BigNumber.from(returnAmounts[otherIndex])
        );

        // diff between unbalanced and proportional amounts for token 0
        const diff0 = amountsIn[otherIndex].sub(token0Final);

        // query join with diff0 in order to get BPT difference between unbalanced and proportional
        const diffAmounts = new Map<string, BigNumber>([
          [pool.tokensList[otherIndex], diff0],
        ]);

        const { bptOut: bptOutDiff } =
          await balancerHelpers.callStatic.queryJoin(
            ...pool.buildQueryJoinExactIn({
              maxAmountsInByToken: diffAmounts,
            })
          );

        const initialA = parseFloat(
          formatFixed(bptOut, pool.tokens[otherIndex].decimals)
        );
        const finalA = parseFloat(
          formatFixed(bptOut.sub(bptOutDiff), pool.tokens[otherIndex].decimals)
        );
        const priceImpactABA = (initialA - finalA) / initialA / 2;
        console.log(`priceImpactABA  : ${priceImpactABA}`);
      });
    });
  });
});
