/* eslint-disable @typescript-eslint/no-inferrable-types */
import { IERC20Detailed } from '../../generated/templates/PoolConfigurator/IERC20Detailed';
import { IERC20DetailedBytes } from '../../generated/templates/PoolConfigurator/IERC20DetailedBytes';
import {
  BToken as BTokenContract,
  StableDebtToken as STokenContract,
  VariableDebtToken as VTokenContract,
} from '../../generated/templates';
import {
  createMapContractToPool,
  getOrInitSubToken,
  getOrInitReserve,
  getOrInitReserveConfigurationHistoryItem,
  getPoolByContract,
} from '../helpers/initializers';
import { Bytes, Address, ethereum, log, BigInt } from '@graphprotocol/graph-ts';
import {
  ReserveActive,
  ReserveBorrowing,
  ReserveStableRateBorrowing,
  ReserveFrozen,
  SiloedBorrowingChanged,
  CollateralConfigurationChanged,
  ReserveInterestRateStrategyChanged,
  ReserveFactorChanged,
  BTokenUpgraded,
  StableDebtTokenUpgraded,
  VariableDebtTokenUpgraded,
  ReserveInitialized,
  ReservePaused,
  ReserveDropped,
  BorrowCapChanged,
  SupplyCapChanged,
  LiquidationProtocolFeeChanged,
  UnbackedMintCapChanged,
  EModeAssetCategoryChanged,
  EModeCategoryAdded,
  DebtCeilingChanged,
  BridgeProtocolFeeUpdated,
  FlashloanPremiumTotalUpdated,
  FlashloanPremiumToProtocolUpdated,
  BorrowableInIsolationChanged,
} from '../../generated/templates/PoolConfigurator/PoolConfigurator';
import { DefaultReserveInterestRateStrategy } from '../../generated/templates/PoolConfigurator/DefaultReserveInterestRateStrategy';

import { EModeCategory, Pool, Reserve } from '../../generated/schema';
import { zeroAddress, zeroBI } from '../utils/converters';

export function saveReserve(reserve: Reserve, event: ethereum.Event): void {
  let timestamp = event.block.timestamp.toI32();
  let txHash = event.transaction.hash;

  reserve.lastUpdateTimestamp = timestamp;
  reserve.save();

  let configurationHistoryItem = getOrInitReserveConfigurationHistoryItem(txHash, reserve);
  configurationHistoryItem.usageAsCollateralEnabled = reserve.usageAsCollateralEnabled;
  configurationHistoryItem.borrowingEnabled = reserve.borrowingEnabled;
  configurationHistoryItem.stableBorrowRateEnabled = reserve.stableBorrowRateEnabled;
  configurationHistoryItem.isActive = reserve.isActive;
  configurationHistoryItem.isFrozen = reserve.isFrozen;
  configurationHistoryItem.reserveInterestRateStrategy = reserve.reserveInterestRateStrategy;
  configurationHistoryItem.baseLTVasCollateral = reserve.baseLTVasCollateral;
  configurationHistoryItem.reserveLiquidationThreshold = reserve.reserveLiquidationThreshold;
  configurationHistoryItem.reserveLiquidationBonus = reserve.reserveLiquidationBonus;
  configurationHistoryItem.timestamp = timestamp;
  configurationHistoryItem.save();
}

export function updateInterestRateStrategy(
  reserve: Reserve,
  strategy: Bytes,
  init: boolean = false
): void {
  let interestRateStrategyContract = DefaultReserveInterestRateStrategy.bind(
    Address.fromString(strategy.toHexString())
  );

  reserve.reserveInterestRateStrategy = strategy;
  let baseVariableBorrowRateCall = interestRateStrategyContract.try_getBaseVariableBorrowRate();
  if (!baseVariableBorrowRateCall.reverted) {
    reserve.baseVariableBorrowRate = baseVariableBorrowRateCall.value
  }
  if (init) {
    reserve.variableBorrowRate = reserve.baseVariableBorrowRate;
  }
  let optimalUsageRatioCall = interestRateStrategyContract.try_OPTIMAL_USAGE_RATIO();
  if (!optimalUsageRatioCall.reverted) {
    reserve.optimalUtilisationRate = optimalUsageRatioCall.value;
  }
  let variableRateSlope1Call = interestRateStrategyContract.try_getVariableRateSlope1();
  if (!variableRateSlope1Call.reverted) {
    reserve.variableRateSlope1 = variableRateSlope1Call.value
  }

  let variableRateSlope2Call = interestRateStrategyContract.try_getVariableRateSlope2();
  if (!variableRateSlope2Call.reverted) {
    reserve.variableRateSlope2 = variableRateSlope2Call.value
  }

  let stableRateSlope1Call = interestRateStrategyContract.try_getStableRateSlope1();
  if (!stableRateSlope1Call.reverted) {
    reserve.stableRateSlope1 = stableRateSlope1Call.value
  }

  let stableRateSlope2Call = interestRateStrategyContract.try_getStableRateSlope2();
  if (!stableRateSlope2Call.reverted) {
    reserve.stableRateSlope2 = stableRateSlope2Call.value
  }
}

export function handleReserveInterestRateStrategyChanged(
  event: ReserveInterestRateStrategyChanged
): void {
  let reserve = getOrInitReserve(event.params.asset, event);
  // if reserve is not initialize, needed to handle ropsten wrong deployment
  if (reserve.bToken == zeroAddress().toHexString()) {
    return;
  }
  updateInterestRateStrategy(reserve, event.params.newStrategy, false);
  saveReserve(reserve, event);
}

export function handleReserveBorrowing(event: ReserveBorrowing): void {
  let reserve = getOrInitReserve(event.params.asset, event);
  reserve.borrowingEnabled = event.params.enabled;
  saveReserve(reserve, event);
}

export function handleSiloedBorrowingChanged(event: SiloedBorrowingChanged): void {
  let reserve = getOrInitReserve(event.params.asset, event);
  reserve.siloedBorrowing = event.params.newState;
  saveReserve(reserve, event);
}

export function handleReserveStableRateBorrowing(event: ReserveStableRateBorrowing): void {
  let reserve = getOrInitReserve(event.params.asset, event);
  reserve.stableBorrowRateEnabled = event.params.enabled;
  saveReserve(reserve, event);
}

export function handleReserveActivated(event: ReserveActive): void {
  let reserve = getOrInitReserve(event.params.asset, event);
  reserve.isActive = event.params.active;
  saveReserve(reserve, event);
}

export function handleReserveFrozen(event: ReserveFrozen): void {
  let reserve = getOrInitReserve(event.params.asset, event);
  reserve.isFrozen = event.params.frozen;
  saveReserve(reserve, event);
}

export function handleCollateralConfigurationChanged(event: CollateralConfigurationChanged): void {
  let reserve = getOrInitReserve(event.params.asset, event);
  reserve.usageAsCollateralEnabled = false;
  if (event.params.liquidationThreshold.gt(zeroBI())) {
    reserve.usageAsCollateralEnabled = true;
  }

  reserve.baseLTVasCollateral = event.params.ltv;
  reserve.reserveLiquidationThreshold = event.params.liquidationThreshold;
  reserve.reserveLiquidationBonus = event.params.liquidationBonus;
  saveReserve(reserve, event);
}

export function handleReserveFactorChanged(event: ReserveFactorChanged): void {
  let reserve = getOrInitReserve(event.params.asset, event);
  reserve.reserveFactor = event.params.newReserveFactor;
  saveReserve(reserve, event);
}

export function handleBTokenUpgraded(event: BTokenUpgraded): void {
  let bToken = getOrInitSubToken(event.params.proxy);
  bToken.tokenContractImpl = event.params.implementation;
  bToken.save();
}

export function handleStableDebtTokenUpgraded(event: StableDebtTokenUpgraded): void {
  let sToken = getOrInitSubToken(event.params.proxy);
  sToken.tokenContractImpl = event.params.implementation;
  sToken.save();
}
export function handleVariableDebtTokenUpgraded(event: VariableDebtTokenUpgraded): void {
  let vToken = getOrInitSubToken(event.params.proxy);
  vToken.tokenContractImpl = event.params.implementation;
  vToken.save();
}

export function handleReservePaused(event: ReservePaused): void {
  let reserve = getOrInitReserve(event.params.asset, event);
  reserve.isPaused = event.params.paused;
  reserve.save();
}

export function handleReserveDropped(event: ReserveDropped): void {
  let reserve = getOrInitReserve(event.params.asset, event);
  reserve.isDropped = true;
  reserve.save();
}

export function handleBorrowCapChanged(event: BorrowCapChanged): void {
  let reserve = getOrInitReserve(event.params.asset, event);
  reserve.borrowCap = event.params.newBorrowCap;
  reserve.save();
}
export function handleSupplyCapChanged(event: SupplyCapChanged): void {
  let reserve = getOrInitReserve(event.params.asset, event);
  reserve.supplyCap = event.params.newSupplyCap;
  reserve.save();
}
export function handleLiquidationProtocolFeeChanged(event: LiquidationProtocolFeeChanged): void {
  let reserve = getOrInitReserve(event.params.asset, event);
  reserve.liquidationProtocolFee = event.params.newFee;
  reserve.save();
}

export function handleUnbackedMintCapChanged(event: UnbackedMintCapChanged): void {
  let reserve = getOrInitReserve(event.params.asset, event);

  reserve.save();
}

export function handleEModeAssetCategoryChanged(event: EModeAssetCategoryChanged): void {
  let reserve = getOrInitReserve(event.params.asset, event);
  reserve.eMode = BigInt.fromI32(event.params.newCategoryId).toString();
  reserve.save();
}

export function handleEModeCategoryAdded(event: EModeCategoryAdded): void {
  let id = BigInt.fromI32(event.params.categoryId).toString();
  let eModeCategory = EModeCategory.load(id);
  if (!eModeCategory) {
    eModeCategory = new EModeCategory(id);
    eModeCategory.ltv = event.params.ltv;
    eModeCategory.oracle = event.params.oracle;
    eModeCategory.liquidationBonus = event.params.liquidationBonus;
    eModeCategory.liquidationThreshold = event.params.liquidationThreshold;
    eModeCategory.label = event.params.label;

    eModeCategory.save();
  } else {
    log.error('Category with id: {} already existed', [id]);
    return;
  }
}

export function handleDebtCeilingChanged(event: DebtCeilingChanged): void {
  let reserve = getOrInitReserve(event.params.asset, event);
  reserve.debtCeiling = event.params.newDebtCeiling;
  reserve.save();
}

export function handleBridgeProtocolFeeUpdated(event: BridgeProtocolFeeUpdated): void {
  let poolId = getPoolByContract(event);
  let pool = Pool.load(poolId) as Pool;
  pool.bridgeProtocolFee = event.params.newBridgeProtocolFee;
  pool.save();
}

export function handleFlashloanPremiumTotalUpdated(event: FlashloanPremiumTotalUpdated): void {
  let poolId = getPoolByContract(event);
  let pool = Pool.load(poolId) as Pool;
  pool.flashloanPremiumTotal = event.params.newFlashloanPremiumTotal;
  pool.save();
}

export function handleFlashloanPremiumToProtocolUpdated(
  event: FlashloanPremiumToProtocolUpdated
): void {
  let poolId = getPoolByContract(event);
  let pool = Pool.load(poolId) as Pool;
  pool.flashloanPremiumToProtocol = event.params.newFlashloanPremiumToProtocol;
  pool.save();
}

export function handleBorrowableInIsolationChanged(event: BorrowableInIsolationChanged): void {
  let reserve = getOrInitReserve(event.params.asset, event);
  reserve.borrowableInIsolation = event.params.borrowable;
  reserve.save();
}

export function handleReserveInitialized(event: ReserveInitialized): void {
  let underlyingAssetAddress = event.params.asset; //_reserve;
  let reserve = getOrInitReserve(underlyingAssetAddress, event);

  let ERC20ReserveContract = IERC20Detailed.bind(underlyingAssetAddress);
  let ERC20DetailedBytesContract = IERC20DetailedBytes.bind(underlyingAssetAddress);

  let nameStringCall = ERC20ReserveContract.try_name();
  if (nameStringCall.reverted) {
    let bytesNameCall = ERC20DetailedBytesContract.try_name();
    if (bytesNameCall.reverted) {
      reserve.name = '';
    } else {
      reserve.name = bytesNameCall.value.toString();
    }
  } else {
    reserve.name = nameStringCall.value;
  }

  let symbolCall = ERC20ReserveContract.try_symbol();
  if (symbolCall.reverted) {
    let bytesSymbolCall = ERC20DetailedBytesContract.try_symbol();
    if (bytesSymbolCall.reverted) {
      reserve.symbol = '';
    } else {
      reserve.symbol = bytesSymbolCall.value.toString();
    }
  } else {
    reserve.symbol = symbolCall.value;
  }

  reserve.decimals = ERC20ReserveContract.decimals();

  updateInterestRateStrategy(reserve, event.params.interestRateStrategyAddress, true);

  BTokenContract.create(Address.fromString(event.params.bToken.toHexString()));
  createMapContractToPool(event.params.bToken, reserve.pool);
  let bToken = getOrInitSubToken(event.params.bToken);
  bToken.underlyingAssetAddress = reserve.underlyingAsset;
  bToken.underlyingAssetDecimals = reserve.decimals;
  bToken.pool = reserve.pool;
  bToken.save();

  STokenContract.create(event.params.stableDebtToken);
  createMapContractToPool(event.params.stableDebtToken, reserve.pool);
  let sToken = getOrInitSubToken(event.params.stableDebtToken);
  sToken.underlyingAssetAddress = reserve.underlyingAsset;
  sToken.underlyingAssetDecimals = reserve.decimals;
  sToken.pool = reserve.pool;
  sToken.save();

  VTokenContract.create(event.params.variableDebtToken);
  createMapContractToPool(event.params.variableDebtToken, reserve.pool);
  let vToken = getOrInitSubToken(event.params.variableDebtToken);
  vToken.underlyingAssetAddress = reserve.underlyingAsset;
  vToken.underlyingAssetDecimals = reserve.decimals;
  vToken.pool = reserve.pool;
  vToken.save();

  reserve.bToken = bToken.id;
  reserve.sToken = sToken.id;
  reserve.vToken = vToken.id;
  reserve.isActive = true;
  saveReserve(reserve, event);
}