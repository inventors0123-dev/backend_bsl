const externalApiSync = require('../services/externalApiSync');
const { clearCache } = require('./cache');

const DEFAULT_MAX_STALENESS_MS = 60000;
const DEFAULT_MIN_INTERVAL_MS = 30000;

const toPositiveNumber = (value, fallback) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const onDemandExternalSync = async (req, res, next) => {
    try {
        const result = await externalApiSync.syncOnceIfStale({
            maxAgeMs: toPositiveNumber(process.env.ON_DEMAND_SYNC_MAX_STALENESS_MS, DEFAULT_MAX_STALENESS_MS),
            minIntervalMs: toPositiveNumber(process.env.ON_DEMAND_SYNC_MIN_INTERVAL_MS, DEFAULT_MIN_INTERVAL_MS)
        });

        if (result?.storedCount > 0) {
            clearCache();
        }
    } catch (error) {
        console.error('On-demand external sync failed:', error.message);
    }

    next();
};

module.exports = onDemandExternalSync;
