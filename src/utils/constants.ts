import { BigInt, TypedMap } from '@graphprotocol/graph-ts';

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


export function getDiaKeyToAssetEdu(): TypedMap<string, string> {
  const map = new TypedMap<string, string>();
  map.set("USDT/USD", "0x7277cc818e3f3ffbb169c6da9cc77fc2d2a34895");
  map.set("USDC/USD", "0x836d275563bab5e93fd6ca62a95db7065da94342");
  map.set("ETH/USD", "0xa572bf655f61930b6f0d4546a67cd1376220081a");
  map.set("WBTC/USD", "0xac0313f97398b585f23f8e50952f10d62350697c");
  map.set("EDU/USD", "0xd02e8c38a8e3db71f8b2ae30b8186d7874934e12");
  return map;
}

// export const DIA_KEY_TO_SOURCE_EDU = {
//   "USDT/USD": "0x340fd07423dd5ddd34574801136db0e5d9a2abb1",
//   "USDC/USD": "0x8cdd3bffb583eb7c2c020fda98d21613d1be1e62",
//   "ETH/USD": "0x340fd07423dd5ddd34574801136db0e5d9a2abb1",
//   "WBTC/USD": "0x90e75dfbcb4b2f020395eb0458a77b2d5555cae0",
//   "EDU/USD": "0xabc46a1e315e6bb775de8d26f7625858dd77a63d",
// }
