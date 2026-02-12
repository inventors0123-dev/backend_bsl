/**
 * Simple In-Memory Cache Middleware
 * Caches GET responses for specified duration
 */

const NodeCache = require('node-cache');

// Create cache instance with 60 second default TTL
const cache = new NodeCache({
    stdTTL: 60,
    checkperiod: 120,
    useClones: false // Better performance, but be careful with mutations
});

/**
 * Cache middleware factory
 * @param {number} duration - Cache duration in seconds (default: 60)
 * @returns {Function} Express middleware
 */
const cacheMiddleware = (duration = 60) => {
    return (req, res, next) => {
        // Only cache GET requests
        if (req.method !== 'GET') {
            return next();
        }

        // Create cache key from URL and query params
        const key = req.originalUrl || req.url;
        const cachedResponse = cache.get(key);

        if (cachedResponse) {
            console.log(`✅ Cache HIT: ${key}`);
            return res.json(cachedResponse);
        }

        console.log(`❌ Cache MISS: ${key}`);

        // Store original json function
        res.originalJson = res.json;

        // Override json function to cache response
        res.json = (body) => {
            cache.set(key, body, duration);
            res.originalJson(body);
        };

        next();
    };
};

/**
 * Clear cache for a specific key or all
 * @param {string} key - Cache key to clear (optional)
 */
const clearCache = (key) => {
    if (key) {
        cache.del(key);
        console.log(`🗑️ Cache cleared for: ${key}`);
    } else {
        cache.flushAll();
        console.log('🗑️ All cache cleared');
    }
};

/**
 * Get cache statistics
 * @returns {object} Cache stats
 */
const getCacheStats = () => {
    return cache.getStats();
};

module.exports = cacheMiddleware;
module.exports.clearCache = clearCache;
module.exports.getCacheStats = getCacheStats;
module.exports.cache = cache;
