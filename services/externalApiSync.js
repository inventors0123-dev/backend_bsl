/**
 * External API Sync Service
 * Fetches data from Hostinger and stores it in MongoDB
 */

const axios = require('axios');
const Device = require('../models/Device');
const DeviceMacAddress = require('../models/DeviceMacAddress');
const DeviceParameter = require('../models/DeviceParameter');

const EXTERNAL_API_URL = process.env.EXTERNAL_API_URL || 'https://darksalmon-crow-640021.hostingersite.com/api_get_readings.php';
const POLL_INTERVAL = parseInt(process.env.POLL_INTERVAL, 10) || 30000;
const AUTO_REGISTER_EXTERNAL_MACS = String(process.env.AUTO_REGISTER_EXTERNAL_MACS || 'true').toLowerCase() === 'true';
const ON_DEMAND_SYNC_ENABLED = String(process.env.ENABLE_ON_DEMAND_EXTERNAL_SYNC || 'true').toLowerCase() !== 'false';

const escapeRegExp = (value = '') => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

class ExternalApiSync {
    constructor() {
        this.isRunning = false;
        this.intervalId = null;
        this.lastSyncTime = null;
        this.errorCount = 0;
        this.successCount = 0;
        this.unmappedMacWarnings = new Set();
        this.inFlightSync = null;
        this.lastOnDemandAttemptAt = null;
        this.lastOnDemandResult = null;
    }

    start() {
        if (this.isRunning) {
            console.log('External API sync is already running');
            return;
        }

        console.log('Starting External API sync service...');
        console.log(`Polling: ${EXTERNAL_API_URL}`);

        this.isRunning = true;
        this.fetchAndStore('scheduled');

        this.intervalId = setInterval(() => {
            this.fetchAndStore('scheduled');
        }, POLL_INTERVAL);
    }

    stop() {
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
        }
        this.isRunning = false;
        console.log('External API sync service stopped');
    }

    async fetchAndStore(reason = 'manual') {
        try {
            console.log(`\n[${new Date().toISOString()}] Fetching data from external API (${reason})...`);

            const response = await axios.get(EXTERNAL_API_URL, {
                timeout: 10000,
                headers: { Accept: 'application/json' }
            });

            if (!response.data || !response.data.success) {
                console.log('API returned no data or an error state');
                if (response.data && response.data.message) {
                    console.error('API Error:', response.data.message);
                }
                return {
                    success: false,
                    reason,
                    storedCount: 0,
                    duplicateCount: 0,
                    unmappedMacCount: 0,
                    skippedCount: 0,
                    error: response.data?.message || 'API returned no data'
                };
            }

            const readings = response.data.data || [];
            console.log(`Received ${readings.length} readings from external API`);

            let summary = {
                success: true,
                reason,
                receivedCount: readings.length,
                storedCount: 0,
                duplicateCount: 0,
                unmappedMacCount: 0,
                skippedCount: 0
            };

            if (readings.length > 0) {
                summary = {
                    ...summary,
                    ...(await this.processData(readings))
                };
            }

            this.lastSyncTime = new Date();
            this.successCount += 1;
            this.errorCount = 0;
            return summary;
        } catch (error) {
            this.errorCount += 1;
            console.error('Sync error:', error.message);

            if (this.errorCount >= 20) {
                console.error('Too many errors. Stopping sync service.');
                this.stop();
            }

            return {
                success: false,
                reason,
                storedCount: 0,
                duplicateCount: 0,
                unmappedMacCount: 0,
                skippedCount: 0,
                error: error.message
            };
        }
    }

    async processData(readings) {
        let storedCount = 0;
        let duplicateCount = 0;
        let unmappedMacCount = 0;
        let skippedCount = 0;

        for (const reading of readings) {
            try {
                const result = await this.storeReading(reading);

                if (result === 'stored') {
                    storedCount += 1;
                } else if (result === 'duplicate') {
                    duplicateCount += 1;
                } else if (result === 'unmapped_mac') {
                    unmappedMacCount += 1;
                } else {
                    skippedCount += 1;
                }
            } catch (error) {
                skippedCount += 1;
                console.error('Error storing reading:', error.message);
            }
        }

        console.log(
            `Sync summary: stored=${storedCount}, duplicate=${duplicateCount}, unmapped_mac=${unmappedMacCount}, skipped=${skippedCount}`
        );

        return {
            storedCount,
            duplicateCount,
            unmappedMacCount,
            skippedCount
        };
    }

    async syncOnceIfStale(options = {}) {
        if (!ON_DEMAND_SYNC_ENABLED) {
            return { skipped: true, reason: 'on_demand_sync_disabled' };
        }

        const maxAgeMs = Number(options.maxAgeMs) || Math.max(POLL_INTERVAL * 2, 60000);
        const minIntervalMs = Number(options.minIntervalMs) || Math.min(POLL_INTERVAL, 30000);
        const now = Date.now();

        if (this.inFlightSync) {
            return this.inFlightSync;
        }

        if (this.lastOnDemandAttemptAt && now - this.lastOnDemandAttemptAt.getTime() < minIntervalMs) {
            return {
                skipped: true,
                reason: 'recent_on_demand_attempt',
                lastAttemptAt: this.lastOnDemandAttemptAt,
                lastResult: this.lastOnDemandResult
            };
        }

        const latestReading = await DeviceParameter.findOne()
            .sort({ reading_time: -1 })
            .select('reading_time')
            .lean();

        if (latestReading?.reading_time) {
            const latestTime = new Date(latestReading.reading_time).getTime();
            if (!Number.isNaN(latestTime) && now - latestTime < maxAgeMs) {
                return {
                    skipped: true,
                    reason: 'readings_fresh',
                    latestReadingTime: latestReading.reading_time
                };
            }
        }

        this.lastOnDemandAttemptAt = new Date(now);
        this.inFlightSync = this.fetchAndStore('on-demand')
            .then((result) => {
                this.lastOnDemandResult = result;
                return result;
            })
            .finally(() => {
                this.inFlightSync = null;
            });

        return this.inFlightSync;
    }

    async storeReading(reading) {
        if (!reading || !reading.mac_address) return 'skipped';

        const macAddress = String(reading.mac_address).toUpperCase().trim();
        const macRecord = await this.resolveMacRecord(macAddress, reading);

        if (!macRecord || !macRecord.device_id) {
            return 'unmapped_mac';
        }

        const rawTime = typeof reading.reading_time === 'string' ? reading.reading_time.trim() : '';
        if (!rawTime) {
            console.error(`Invalid reading time: ${reading.reading_time}`);
            return 'skipped';
        }

        // If external API sends naive timestamp, treat it as UTC.
        let timeStr = rawTime;
        if (!(/[zZ]$|[+\-]\d{2}:\d{2}$/.test(timeStr))) {
            timeStr = `${timeStr.replace(' ', 'T')}Z`;
        }

        const readingTime = new Date(timeStr);
        if (isNaN(readingTime.getTime())) {
            console.error(`Invalid reading time: ${reading.reading_time}`);
            return 'skipped';
        }

        const exists = await DeviceParameter.findOne({
            device_id: macRecord.device_id._id,
            reading_time: readingTime
        });

        if (exists) return 'duplicate';

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
            r_harmonics_voltage: reading.r_harmonics_voltage,
            r_harmonics_current: reading.r_harmonics_current,
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
            y_harmonics_voltage: reading.y_harmonics_voltage,
            y_harmonics_current: reading.y_harmonics_current,
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
            b_harmonics_voltage: reading.b_harmonics_voltage,
            b_harmonics_current: reading.b_harmonics_current,
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
        return 'stored';
    }

    async resolveMacRecord(macAddress, reading) {
        const macRegex = new RegExp(`^${escapeRegExp(macAddress)}$`, 'i');

        let macRecord = await DeviceMacAddress.findOne({
            mac_address: { $regex: macRegex }
        }).populate('device_id');

        if (macRecord && macRecord.device_id) {
            return macRecord;
        }

        if (!AUTO_REGISTER_EXTERNAL_MACS) {
            if (!this.unmappedMacWarnings.has(macAddress)) {
                this.unmappedMacWarnings.add(macAddress);
                console.warn(`Unmapped MAC ${macAddress}. Register this MAC to ingest its readings.`);
            }
            return null;
        }

        const externalName = typeof reading.device_name === 'string' ? reading.device_name.trim() : '';
        const externalLocation = typeof reading.device_location === 'string' ? reading.device_location.trim() : '';
        const fallbackDeviceName = `Auto Device ${macAddress.slice(-8).replace(/:/g, '')}`;
        const deviceName = externalName || fallbackDeviceName;

        let device = null;
        if (externalName) {
            const nameRegex = new RegExp(`^${escapeRegExp(externalName)}$`, 'i');
            device = await Device.findOne({ name: { $regex: nameRegex } });
        }

        if (!device) {
            device = await Device.create({
                name: deviceName,
                location: externalLocation || ''
            });
            console.log(`Auto-created device "${device.name}" for MAC ${macAddress}`);
        } else if (externalLocation && !device.location) {
            device.location = externalLocation;
            await device.save();
        }

        try {
            await DeviceMacAddress.create({
                device_id: device._id,
                mac_address: macAddress
            });
            console.log(`Auto-registered MAC ${macAddress} to device "${device.name}"`);
        } catch (error) {
            // Ignore duplicate-key race and fetch the existing record below.
            if (error.code !== 11000) {
                throw error;
            }
        }

        return await DeviceMacAddress.findOne({
            mac_address: { $regex: macRegex }
        }).populate('device_id');
    }

    getStatus() {
        return {
            isRunning: this.isRunning,
            lastSyncTime: this.lastSyncTime,
            successCount: this.successCount,
            errorCount: this.errorCount,
            onDemandSyncEnabled: ON_DEMAND_SYNC_ENABLED,
            lastOnDemandAttemptAt: this.lastOnDemandAttemptAt,
            lastOnDemandResult: this.lastOnDemandResult
        };
    }
}

module.exports = new ExternalApiSync();
