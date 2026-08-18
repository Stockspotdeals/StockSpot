/**
 * productPrice
 *
 * Shared product-price contract for StockSpot.
 *
 * A product is eligible for price-driven Signal Engine processing only when it
 * has a usable current numeric price: a finite number strictly greater than
 * zero. null / undefined / NaN / 0 / negative / non-numeric values are all
 * treated as "no usable price".
 *
 * This helper centralizes the contract so the ingestion boundary (productUpsert)
 * and the Signal Engine boundary (signalEngine) do not duplicate the rule.
 */
function isValidProductPrice(value) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

module.exports = { isValidProductPrice };