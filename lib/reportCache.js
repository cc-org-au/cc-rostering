/**
 * Report Caching Strategy
 * Caches report data for 1 hour, with manual refresh capability
 */

class ReportCache {
  constructor(cacheTimeMs = 3600000) { // 1 hour default
    this.cache = new Map();
    this.cacheTimeMs = cacheTimeMs;
  }

  /**
   * Get cached report data
   * @param {string} reportKey - Unique key for report (e.g., "financial_2024_01")
   * @returns {Object|null} Cached data or null if expired/missing
   */
  get(reportKey) {
    if (!this.cache.has(reportKey)) return null;

    const { data, timestamp } = this.cache.get(reportKey);
    const now = Date.now();

    if (now - timestamp > this.cacheTimeMs) {
      this.cache.delete(reportKey);
      return null;
    }

    return data;
  }

  /**
   * Set cached report data
   * @param {string} reportKey - Unique key for report
   * @param {Object} data - Data to cache
   */
  set(reportKey, data) {
    this.cache.set(reportKey, {
      data,
      timestamp: Date.now(),
    });
  }

  /**
   * Clear specific cached report
   * @param {string} reportKey - Report key to clear
   */
  clear(reportKey) {
    this.cache.delete(reportKey);
  }

  /**
   * Clear all cache
   */
  clearAll() {
    this.cache.clear();
  }

  /**
   * Get cache stats
   * @returns {Object} {total_entries, cache_size_kb, oldest_entry_age_ms}
   */
  getStats() {
    let oldestAge = 0;
    let totalSize = 0;

    for (const { data, timestamp } of this.cache.values()) {
      const age = Date.now() - timestamp;
      if (age > oldestAge) oldestAge = age;
      totalSize += JSON.stringify(data).length;
    }

    return {
      total_entries: this.cache.size,
      cache_size_kb: Math.round(totalSize / 1024),
      oldest_entry_age_ms: oldestAge,
    };
  }
}

// Global cache instance
export const reportCache = new ReportCache();

/**
 * Generate report cache key
 * @param {string} reportType - Type of report
 * @param {number} year - Year
 * @param {number} month - Month
 * @param {Object} filters - Optional filters
 * @returns {string} Cache key
 */
export function generateCacheKey(reportType, year, month, filters = {}) {
  const filterStr = Object.keys(filters).length > 0
    ? `_${Object.values(filters).join('_')}`
    : '';
  return `${reportType}_${year}_${month}${filterStr}`;
}

/**
 * Get or generate report with caching
 * @param {string} reportType - Type of report
 * @param {Function} generator - Function to generate report data
 * @param {number} year - Year
 * @param {number} month - Month
 * @param {Object} filters - Optional filters
 * @returns {Promise<Object>} Report data (cached or fresh)
 */
export async function getCachedReport(reportType, generator, year, month, filters = {}) {
  const cacheKey = generateCacheKey(reportType, year, month, filters);
  const cached = reportCache.get(cacheKey);

  if (cached) {
    return { ...cached, from_cache: true };
  }

  const fresh = await generator();
  reportCache.set(cacheKey, fresh);

  return { ...fresh, from_cache: false };
}

export default reportCache;
