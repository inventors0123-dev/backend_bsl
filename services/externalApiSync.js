/**
 * External API Sync Service
 * Fetches data from Hostinger and stores it in MongoDB
 */

const axios = require('axios');
const DeviceMacAddress = require('../models/DeviceMacAddress');
const DeviceParameter = require('../models/DeviceParameter');

const EXTERNAL_API_URL = process.env.EXTERNAL_API_URL || 'https://slategray-gull-320411.hostingersite.com/get_device_readings.php';
const POLL_INTERVAL = parseInt(process.env.POLL_INTERVAL) || 30000;

class ExternalApiSync {
    constructor() {
        this.isRunning = false;
        this.intervalId = null;
        this.lastSyncTime = null;
        this.errorCount = 0;
        this.successCount = 0;
    }

    start() {
        if (this.isRunning) {
            console.log('⚠️ External API sync is already running');
            return;
        }

        console.log('🔄 Starting External API sync service...');
        console.log(`📡 Polling: ${EXTERNAL_API_URL}`);

        this.isRunning = true;
        this.fetchAndStore();

        this.intervalId = setInterval(() => {
            this.fetchAndStore();
        }, POLL_INTERVAL);
    }

    stop() {
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
        }
        this.isRunning = false;
        console.log('🛑 External API sync service stopped');
    }

    async fetchAndStore() {
        try {
            console.log(`\n[${new Date().toISOString()}] 📥 Fetching data from Hostinger...`);

            const response = await axios.get(EXTERNAL_API_URL, {
                timeout: 10000,
                headers: { 'Accept': 'application/json' }
            });

            if (!response.data || !Array.isArray(response.data)) {
                console.log('⚠️ No valid data received');
                return;
            }

            const readings = response.data;
            console.log(`✅ Received ${readings.length} readings`);

            if (readings.length > 0) {
                await this.processData(readings);
            }

            this.lastSyncTime = new Date();
            this.successCount++;
            this.errorCount = 0;

        } catch (error) {
            this.errorCount++;
            console.error('❌ Sync Error:', error.message);

            if (this.errorCount >= 20) {
                console.error('🛑 Too many errors. Stopping sync.');
                this.stop();
            }
        }
    }

    async processData(readings) {
        let storedCount = 0;
        for (const reading of readings) {
            try {
                if (await this.storeReading(reading)) {
                    storedCount++;
                }
            } catch (error) {
                console.error('❌ Error storing:', error.message);
            }
        }
        if (storedCount > 0) {
            console.log(`💾 Stored ${storedCount} new readings.`);
        }
    }

    async storeReading(reading) {
        const macAddress = reading.mac_address;
        if (!macAddress) return false;

        const macRecord = await DeviceMacAddress.findOne({ mac_address: macAddress })
            .populate('device_id');

        if (!macRecord) return false;

        const readingTime = new Date(reading.reading_time);
        const exists = await DeviceParameter.findOne({
            device_id: macRecord.device_id._id,
            reading_time: readingTime
        });

        if (exists) return false;

        const deviceParameter = new DeviceParameter({
            device_id: macRecord.device_id._id,
            reading_time: readingTime,
            r_voltage: reading.r_voltage,
            r_current: reading.r_current,
            r_active_power: reading.r_active_power,
            y_voltage: reading.y_voltage,
            y_current: reading.y_current,
            b_voltage: reading.b_voltage,
            b_current: reading.b_current,
            total_energy_kwh: reading.total_energy_kwh,
            frequency: reading.frequency,
            temperature: reading.temperature,
            humidity: reading.humidity
        });

        await deviceParameter.save();
        return true;
    }

    getStatus() {
        return {
            isRunning: this.isRunning,
            lastSyncTime: this.lastSyncTime,
            successCount: this.successCount,
            errorCount: this.errorCount
        };
    }
}

const externalApiSync = new ExternalApiSync();
module.exports = externalApiSync;
