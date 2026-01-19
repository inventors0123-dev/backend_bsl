/**
 * External API Sync Service
 * 
 * This service fetches data from your external API and stores it in MongoDB
 * URL: https://slategray-gull-320411.hostingersite.com/post_device_readings.php
 */

const axios = require('axios');
const DeviceMacAddress = require('../models/DeviceMacAddress');
const DeviceParameter = require('../models/DeviceParameter');

// Configuration from environment variables
const EXTERNAL_API_URL = process.env.EXTERNAL_API_URL || 'https://slategray-gull-320411.hostingersite.com/post_device_readings.php';
const POLL_INTERVAL = parseInt(process.env.POLL_INTERVAL) || 30000; // 30 seconds default

class ExternalApiSync {
    constructor() {
        this.isRunning = false;
        this.intervalId = null;
        this.lastSyncTime = null;
        this.errorCount = 0;
        this.successCount = 0;
    }

    /**
     * Start polling the external API
     */
    start() {
        if (this.isRunning) {
            console.log('⚠️ External API sync is already running');
            return;
        }

        console.log('🔄 Starting External API sync service...');
        console.log(`📡 Polling: ${EXTERNAL_API_URL}`);
        console.log(`⏱️ Interval: ${POLL_INTERVAL / 1000} seconds`);

        this.isRunning = true;

        // Fetch immediately on start
        this.fetchAndStore();

        // Then poll at regular intervals
        this.intervalId = setInterval(() => {
            this.fetchAndStore();
        }, POLL_INTERVAL);
    }

    /**
     * Stop polling
     */
    stop() {
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
        }
        this.isRunning = false;
        console.log('🛑 External API sync service stopped');
    }

    /**
     * Fetch data from external API and store in MongoDB
     */
    async fetchAndStore() {
        try {
            console.log(`\n[${new Date().toISOString()}] 📥 Fetching data from external API...`);

            // Fetch data from external API
            const response = await axios.get(EXTERNAL_API_URL, {
                timeout: 10000, // 10 second timeout
                headers: {
                    'Accept': 'application/json'
                }
            });

            // Check if we got data
            if (!response.data) {
                console.log('⚠️ No data received from external API');
                return;
            }

            console.log('✅ Data received from external API');
            console.log('📊 Data:', JSON.stringify(response.data).substring(0, 100) + '...');

            // Process the data
            await this.processData(response.data);

            this.lastSyncTime = new Date();
            this.successCount++;
            this.errorCount = 0; // Reset error count on success

            console.log(`✅ Sync successful! (Total: ${this.successCount})`);

        } catch (error) {
            this.errorCount++;

            if (error.code === 'ECONNABORTED') {
                console.error('❌ Timeout: External API took too long to respond');
            } else if (error.response) {
                console.error(`❌ API Error: ${error.response.status} - ${error.response.statusText}`);
            } else if (error.request) {
                console.error('❌ Network Error: Could not reach external API');
            } else {
                console.error('❌ Error:', error.message);
            }

            // Stop polling if too many consecutive errors
            if (this.errorCount >= 5) {
                console.error('🛑 Too many errors. Stopping sync service.');
                this.stop();
            }
        }
    }

    /**
     * Process and store the fetched data
     */
    async processData(data) {
        // Handle different data formats
        let readings = [];

        if (Array.isArray(data)) {
            readings = data;
        } else if (data.readings && Array.isArray(data.readings)) {
            readings = data.readings;
        } else if (data.mac_address) {
            // Single reading object
            readings = [data];
        } else {
            console.log('⚠️ Unknown data format');
            return;
        }

        console.log(`📝 Processing ${readings.length} reading(s)...`);

        for (const reading of readings) {
            try {
                await this.storeReading(reading);
            } catch (error) {
                console.error('❌ Error storing reading:', error.message);
            }
        }
    }

    /**
     * Store a single reading in MongoDB
     */
    async storeReading(reading) {
        const macAddress = reading.mac_address;

        if (!macAddress) {
            console.log('⚠️ Reading missing mac_address, skipping');
            return;
        }

        // Find device by MAC address
        const macRecord = await DeviceMacAddress.findOne({ mac_address: macAddress })
            .populate('device_id');

        if (!macRecord) {
            console.log(`⚠️ MAC address ${macAddress} not registered. Skipping.`);
            console.log(`   Run: node backend/seed_device.js to register this device`);
            return;
        }

        // Create device parameter record
        const deviceParameter = new DeviceParameter({
            device_id: macRecord.device_id._id,
            reading_time: reading.reading_time || new Date(),

            // R Phase
            r_voltage: reading.r_voltage,
            r_voltage_line_to_line: reading.r_voltage_line_to_line,
            r_current: reading.r_current,
            r_active_power: reading.r_active_power,
            r_reactive_power: reading.r_reactive_power,
            r_apparent_power: reading.r_apparent_power,
            r_power_factor: reading.r_power_factor,
            r_thd_voltage: reading.r_thd_voltage,
            r_thd_current: reading.r_thd_current,
            r_harmonics_voltage: reading.r_harmonics_voltage,
            r_harmonics_current: reading.r_harmonics_current,
            r_voltage_neutral: reading.r_voltage_neutral,

            // Y Phase
            y_voltage: reading.y_voltage,
            y_voltage_line_to_line: reading.y_voltage_line_to_line,
            y_current: reading.y_current,
            y_active_power: reading.y_active_power,
            y_reactive_power: reading.y_reactive_power,
            y_apparent_power: reading.y_apparent_power,
            y_power_factor: reading.y_power_factor,
            y_thd_voltage: reading.y_thd_voltage,
            y_thd_current: reading.y_thd_current,
            y_harmonics_voltage: reading.y_harmonics_voltage,
            y_harmonics_current: reading.y_harmonics_current,
            y_voltage_neutral: reading.y_voltage_neutral,

            // B Phase
            b_voltage: reading.b_voltage,
            b_voltage_line_to_line: reading.b_voltage_line_to_line,
            b_current: reading.b_current,
            b_active_power: reading.b_active_power,
            b_reactive_power: reading.b_reactive_power,
            b_apparent_power: reading.b_apparent_power,
            b_power_factor: reading.b_power_factor,
            b_thd_voltage: reading.b_thd_voltage,
            b_thd_current: reading.b_thd_current,
            b_harmonics_voltage: reading.b_harmonics_voltage,
            b_harmonics_current: reading.b_harmonics_current,
            b_voltage_neutral: reading.b_voltage_neutral,

            // Line voltages
            ry_voltage: reading.ry_voltage,
            yb_voltage: reading.yb_voltage,
            br_voltage: reading.br_voltage,

            // Other parameters
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

        console.log(`✅ Stored reading for device: ${macRecord.device_id.name} (${macAddress})`);
    }

    /**
     * Get sync status
     */
    getStatus() {
        return {
            isRunning: this.isRunning,
            lastSyncTime: this.lastSyncTime,
            successCount: this.successCount,
            errorCount: this.errorCount,
            pollInterval: POLL_INTERVAL,
            apiUrl: EXTERNAL_API_URL
        };
    }
}

// Create singleton instance
const externalApiSync = new ExternalApiSync();

module.exports = externalApiSync;
