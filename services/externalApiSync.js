/**
 * External API Sync Service
 * Fetches data from Hostinger and stores it in MongoDB
 */

const axios = require('axios');
const DeviceMacAddress = require('../models/DeviceMacAddress');
const DeviceParameter = require('../models/DeviceParameter');

const EXTERNAL_API_URL = process.env.EXTERNAL_API_URL || 'https://darksalmon-crow-640021.hostingersite.com/api_get_readings.php';
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

            // Handle new API response format
            if (!response.data || !response.data.success) {
                console.log('⚠️ API returned error or no data');
                if (response.data && response.data.error) {
                    console.error('API Error:', response.data.message);
                }
                return;
            }

            const readings = response.data.data || [];
            console.log(`✅ Received ${readings.length} readings from Hostinger`);

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
        if (!reading.mac_address) return false;

        const macAddress = reading.mac_address.toUpperCase().trim();
        const macRecord = await DeviceMacAddress.findOne({
            mac_address: { $regex: new RegExp(`^${macAddress}$`, 'i') }
        }).populate('device_id');

        if (!macRecord || !macRecord.device_id) {
            // console.log(`⚠️ MAC Address ${macAddress} not registered or deviceless`);
            return false;
        }

        const readingTime = new Date(reading.reading_time);
        if (isNaN(readingTime.getTime())) {
            console.error(`❌ Invalid reading time: ${reading.reading_time}`);
            return false;
        }

        const exists = await DeviceParameter.findOne({
            device_id: macRecord.device_id._id,
            reading_time: readingTime
        });

        if (exists) return false;

        const deviceParameter = new DeviceParameter({
            device_id: macRecord.device_id._id,
            reading_time: readingTime,

            // Phase R
            r_voltage: reading.r_voltage,
            r_voltage_line_to_line: reading.r_voltage_line_to_line,
            r_current: reading.r_current,
            r_active_power: reading.r_active_power,
            r_reactive_power: reading.r_reactive_power,
            r_apparent_power: reading.r_apparent_power,
            r_power_factor: reading.r_power_factor,
            r_thd_voltage: reading.r_thd_voltage,
            r_thd_current: reading.r_thd_current,
            r_voltage_neutral: reading.r_voltage_neutral,

            // Phase Y
            y_voltage: reading.y_voltage,
            y_voltage_line_to_line: reading.y_voltage_line_to_line,
            y_current: reading.y_current,
            y_active_power: reading.y_active_power,
            y_reactive_power: reading.y_reactive_power,
            y_apparent_power: reading.y_apparent_power,
            y_power_factor: reading.y_power_factor,
            y_thd_voltage: reading.y_thd_voltage,
            y_thd_current: reading.y_thd_current,
            y_voltage_neutral: reading.y_voltage_neutral,

            // Phase B
            b_voltage: reading.b_voltage,
            b_voltage_line_to_line: reading.b_voltage_line_to_line,
            b_current: reading.b_current,
            b_active_power: reading.b_active_power,
            b_reactive_power: reading.b_reactive_power,
            b_apparent_power: reading.b_apparent_power,
            b_power_factor: reading.b_power_factor,
            b_thd_voltage: reading.b_thd_voltage,
            b_thd_current: reading.b_thd_current,
            b_voltage_neutral: reading.b_voltage_neutral,

            // Line voltages
            ry_voltage: reading.ry_voltage,
            yb_voltage: reading.yb_voltage,
            br_voltage: reading.br_voltage,

            // Common parameters
            neutral_current: reading.neutral_current,
            voltage_unbalance: reading.voltage_unbalance,
            current_unbalance: reading.current_unbalance,
            frequency: reading.frequency,
            total_energy_kwh: reading.total_energy_kwh,
            total_energy_kvah: reading.total_energy_kvah,
            total_energy_kvarh: reading.total_energy_kvarh,
            transient_event_count: reading.transient_event_count,
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
