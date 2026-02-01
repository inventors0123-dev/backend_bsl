const cron = require('node-cron');
const { runAlertMonitor } = require('../services/alertMonitor');

// Run alert monitor every 30 seconds
function startAlertMonitoring() {
    console.log('🚀 Starting Alert Monitoring Service...');

    // Run immediately on startup
    runAlertMonitor();

    // Then run every 30 seconds
    cron.schedule('*/30 * * * * *', () => {
        runAlertMonitor();
    });

    console.log('✅ Alert Monitoring Service started (runs every 30 seconds)');
}

module.exports = { startAlertMonitoring };
