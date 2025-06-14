import { PriceOracle, PriceOracleAsset } from '../../generated/schema';
import {
  ProtocolOracle,
  AssetSourceUpdated,
  BaseCurrencySet,
  FallbackOracleUpdated,
} from '../../generated/ProtocolOracle/ProtocolOracle';
import { Address, ethereum, log, Bytes } from '@graphprotocol/graph-ts';
import {
  formatUsdEthChainlinkPrice,
  getPriceOracleAssetType,
  PRICE_ORACLE_ASSET_TYPE_SIMPLE,
  zeroAddress,
  zeroBI,
} from '../utils/converters';
import { IExtendedPriceAggregator } from '../../generated/ProtocolOracle/IExtendedPriceAggregator';
import { EACAggregatorProxy } from '../../generated/ProtocolOracle/EACAggregatorProxy';
import { ChainlinkAggregator as ChainlinkAggregatorContract } from '../../generated/templates';
import {
  getChainlinkAggregator,
  getOrInitPriceOracle,
  getPriceOracleAsset,
} from '../helpers/initializers';
import { genericPriceUpdate, usdEthPriceUpdate } from '../helpers/price-updates';

import { PriceOracle as FallbackPriceOracle } from '../../generated/ProtocolOracle/PriceOracle';

import { FallbackPriceOracle as FallbackPriceOracleContract } from '../../generated/templates';
import { MOCK_USD_ADDRESS, ZERO_ADDRESS } from '../utils/constants';

export function handleFallbackOracleUpdated(event: FallbackOracleUpdated): void {
  let priceOracle = getOrInitPriceOracle();
  let address = event.address;

  priceOracle.fallbackPriceOracle = event.params.fallbackOracle;
  if (event.params.fallbackOracle.toHexString() != ZERO_ADDRESS) {
    FallbackPriceOracleContract.create(event.params.fallbackOracle);

    // update prices on assets which use fallback

    let proxyPriceProvider = ProtocolOracle.bind(address);
    for (let i = 0; i < priceOracle.tokensWithFallback.length; i++) {
      let token = priceOracle.tokensWithFallback[i];
      let priceOracleAsset = getPriceOracleAsset(token);
      if (
        priceOracleAsset.priceSource.equals(zeroAddress()) ||
        priceOracleAsset.isFallbackRequired
      ) {
        let price = proxyPriceProvider.try_getAssetPrice(Address.fromString(priceOracleAsset.id));
        if (!price.reverted) {
          genericPriceUpdate(priceOracleAsset, price.value, event);
        } else {
          log.error(
            'OracleAssetId: {} | ProxyPriceProvider: {} | FallbackOracle: {} | EventAddress: {}',
            [
              priceOracleAsset.id,
              event.address.toHexString(),
              event.params.fallbackOracle.toHexString(),
              event.address.toHexString(),
            ]
          );
        }
      }
    }

    // update USDETH price
    let fallbackOracle = FallbackPriceOracle.bind(event.params.fallbackOracle);
    let ethUsdPrice = formatUsdEthChainlinkPrice(
      fallbackOracle.getAssetPrice(Address.fromString(MOCK_USD_ADDRESS))
    );

    if (
      priceOracle.usdPriceEthFallbackRequired ||
      priceOracle.usdPriceEthMainSource.equals(zeroAddress())
    ) {
      usdEthPriceUpdate(priceOracle, ethUsdPrice, event);
    }
  }
}

export function priceFeedUpdated(
  event: ethereum.Event,
  assetAddress: Address,
  assetOracleAddress: Address,
  priceOracleAsset: PriceOracleAsset,
  priceOracle: PriceOracle
): void {
  let sAssetAddress = assetAddress.toHexString();

  // We get the current price from the oracle. Valid for chainlink source and custom oracle
  let proxyPriceProvider = ProtocolOracle.bind(
    Address.fromString(priceOracle.proxyPriceProvider.toHexString())
  );
  let priceFromOracle = zeroBI();
  let priceFromProxyCall = proxyPriceProvider.try_getAssetPrice(assetAddress);
  if (!priceFromProxyCall.reverted) {
    priceFromOracle = priceFromProxyCall.value;
  } else {
    log.error(`this asset has not been registered. || asset: {} | assetOracle: {}`, [
      sAssetAddress,
      assetOracleAddress.toHexString(),
    ]);
    return;
  }

  priceOracleAsset.isFallbackRequired = true;

  // if it's valid oracle address
  if (!assetOracleAddress.equals(zeroAddress())) {
    let priceAggregatorInstance = IExtendedPriceAggregator.bind(assetOracleAddress);

    // check is it composite or simple asset.
    // In case its chainlink source, this call will revert, and will not update priceOracleAsset type
    // so it will stay as simple, as it is the default type
    let tokenTypeCall = priceAggregatorInstance.try_getTokenType();
    if (!tokenTypeCall.reverted) {
      priceOracleAsset.type = getPriceOracleAssetType(tokenTypeCall.value);
    }

    // Type simple means that the source is chainlink source
    if (priceOracleAsset.type == PRICE_ORACLE_ASSET_TYPE_SIMPLE) {
      // get underlying aggregator from proxy (assetOracleAddress) address
      let chainlinkProxyInstance = EACAggregatorProxy.bind(assetOracleAddress);
      let aggregatorAddressCall = chainlinkProxyInstance.try_aggregator();
      // If we can't get the aggregator, it means that the source address is not a chainlink proxy
      // so it has been registered badly.
      if (aggregatorAddressCall.reverted) {
        log.error(
          `PROXY: Simple Type must be a chainlink proxy. || asset: {} | assetOracleAddress: {}`,
          [sAssetAddress, assetOracleAddress.toHexString()]
        );
        return;
      }
      let aggregatorAddress = aggregatorAddressCall.value;
      priceOracleAsset.priceSource = aggregatorAddress;
      // create ChainLink aggregator template entity
      ChainlinkAggregatorContract.create(aggregatorAddress);

      // Need to check latestAnswer and not use priceFromOracle because priceFromOracle comes from the oracle
      // and the value could be from the fallback already. So we need to check if we can get latestAnswer from the
      // chainlink aggregator
      let priceAggregatorlatestAnswerCall = priceAggregatorInstance.try_latestAnswer();
      priceOracleAsset.isFallbackRequired =
        priceAggregatorlatestAnswerCall.reverted || priceAggregatorlatestAnswerCall.value.isZero();

      // create chainlinkAggregator entity with new aggregator to be able to match asset and oracle after
      let chainlinkAggregator = getChainlinkAggregator(aggregatorAddress.toHexString());
      chainlinkAggregator.oracleAsset = assetAddress.toHexString();
      chainlinkAggregator.save();
    } else {
      // composite assets don't need fallback, it will work out of the box
      priceOracleAsset.isFallbackRequired = false;
      priceOracleAsset.priceSource = assetOracleAddress;

      // call contract and check on which assets we're dependent
      let dependencies = priceAggregatorInstance.getSubTokens();
      // add asset to all dependencies
      for (let i = 0; i < dependencies.length; i += 1) {
        let dependencyAddress = dependencies[i].toHexString();
        if (dependencyAddress == MOCK_USD_ADDRESS) {
          let usdDependentAssets = priceOracle.usdDependentAssets;
          if (!usdDependentAssets.includes(sAssetAddress)) {
            usdDependentAssets.push(sAssetAddress);
            priceOracle.usdDependentAssets = usdDependentAssets;
          }
        } else {
          let dependencyOracleAsset = getPriceOracleAsset(dependencyAddress);
          let dependentAssets = dependencyOracleAsset.dependentAssets;
          if (!dependentAssets.includes(sAssetAddress)) {
            dependentAssets.push(sAssetAddress);
            dependencyOracleAsset.dependentAssets = dependentAssets;
            dependencyOracleAsset.save();
          }
        }
      }
    }
  } else {
    log.error('registry of asset: {} | oracle: {} | price: {}', [
      assetAddress.toHexString(),
      assetOracleAddress.toHexString(),
      priceFromOracle.toString(),
    ]);
  }
  
  priceOracleAsset.priceSource = assetOracleAddress;
  // if (assetAddress.toHexString != MOCK_USD_ADDRESS)
  if (sAssetAddress == MOCK_USD_ADDRESS) {
    priceOracle.usdPriceEthFallbackRequired = priceOracleAsset.isFallbackRequired;
    priceOracle.usdPriceEthMainSource = priceOracleAsset.priceSource;
    usdEthPriceUpdate(priceOracle, formatUsdEthChainlinkPrice(priceFromOracle), event);
    // this is so we also save the assetOracle for usd chainlink
    genericPriceUpdate(priceOracleAsset, priceFromOracle, event);
  } else {
    // if chainlink was invalid before and valid now, remove from tokensWithFallback array
    if (
      !assetOracleAddress.equals(zeroAddress()) &&
      priceOracle.tokensWithFallback.includes(sAssetAddress) &&
      !priceOracleAsset.isFallbackRequired
    ) {
      let tokensWithFallback: string[] = [];
      for (let i = 0; i < priceOracle.tokensWithFallback.length; i++) {
        if (priceOracle.tokensWithFallback[i] != sAssetAddress) {
          tokensWithFallback.push(priceOracle.tokensWithFallback[i]);
        }
      }
      priceOracle.tokensWithFallback = tokensWithFallback;
    }

    if (
      !priceOracle.tokensWithFallback.includes(sAssetAddress) &&
      (assetOracleAddress.equals(zeroAddress()) || priceOracleAsset.isFallbackRequired)
    ) {
      let updatedTokensWithFallback = priceOracle.tokensWithFallback;
      updatedTokensWithFallback.push(sAssetAddress);
      priceOracle.tokensWithFallback = updatedTokensWithFallback;
    }
    priceOracle.save();

    genericPriceUpdate(priceOracleAsset, priceFromOracle, event);
  }
}

export function handleAssetSourceUpdated(event: AssetSourceUpdated): void {
  let assetAddress = event.params.asset;
  let assetOracleAddress = event.params.source;

  let priceOracle = getOrInitPriceOracle();
  if (priceOracle.proxyPriceProvider.equals(zeroAddress())) {
    priceOracle.proxyPriceProvider = event.address;
  }

  let priceOracleAsset = getPriceOracleAsset(assetAddress.toHexString());
  priceOracleAsset.fromChainlinkSourcesRegistry = false;
  priceFeedUpdated(event, assetAddress, assetOracleAddress, priceOracleAsset, priceOracle);
}

// export function handleChainlinkAggregatorUpdated(event: AggregatorUpdated): void {
//   let assetAddress = event.params.token;
//   let assetOracleAddress = event.params.aggregator; // its proxy . Wrong naming

//   let priceOracle = getOrInitPriceOracle();
//   let priceOracleAsset = getPriceOracleAsset(assetAddress.toHexString());
//   priceOracleAsset.fromChainlinkSourcesRegistry = true;
//   priceFeedUpdated(event, assetAddress, assetOracleAddress, priceOracleAsset, priceOracle);
// }

export function handleBaseCurrencySet(event: BaseCurrencySet): void {
  let priceOracle = getOrInitPriceOracle();

  priceOracle.baseCurrency = event.params.baseCurrency;
  priceOracle.baseCurrencyUnit = event.params.baseCurrencyUnit;

  priceOracle.save();
}
