import { BigInt } from '@graphprotocol/graph-ts';

export const MOCK_ETHEREUM_ADDRESS = '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';
export const MOCK_USD_ADDRESS = '0xc3b634a9884F29850e94f22cda72F95Db3C4A62f';
export const PROPOSAL_STATUS_INITIALIZING = 'Initializing';
export const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
export const ETH_PRECISION = BigInt.fromI32(10)
  .pow(18)
  .toBigDecimal();
export const USD_PRECISION = BigInt.fromI32(10)
  .pow(8)
  .toBigDecimal();
