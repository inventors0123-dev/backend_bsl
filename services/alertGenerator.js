const Alert = require('../models/Alert');
const Device = require('../models/Device');
const DeviceParameter = require('../models/DeviceParameter');
const SystemSettings = require('../models/SystemSettings');

/**
 * Alert Generator Service
 * Automatically generates alerts based on device readings and system settings
 */
class AlertGenerator {
    constructor() {
        this.isRunning = false;
        this.intervalId = null;
        this.checkInterval = 60000; // Default: 1 minute
    }

    /**
     * Start the alert generation service
     */
    async start() {
        if (this.isRunning) {
            console.log('⚠️  Alert Generator already running');
            return;
        }

        console.log('🚨 Starting Alert Generator Service...');
        this.isRunning = true;

        // Get check interval from settings
        try {
            const settings = await SystemSettings.findOne({ singleton: true });
            if (settings && settings.alert_check_interval) {
                this.checkInterval = settings.alert_check_interval;
            }
        } catch (error) {
            console.error('Error loading settings, using default interval:', error.message);
        }

        console.log(`✅ Alert Generator running (interval: ${this.checkInterval}ms)`);

        // Run immediately
        this.checkForAlerts();

        // Then run on interval
        this.intervalId = setInterval(() => {
            this.checkForAlerts();
        }, this.checkInterval);
    }

    /**
     * Stop the alert generation service
     */
    stop() {
        if (!this.isRunning) {
            console.log('⚠️  Alert Generator not running');
            return;
        }

        console.log('🛑 Stopping Alert Generator Service...');
        this.isRunning = false;

        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
        }
    }

    /**
     * Main function to check for alert conditions
     */
    async checkForAlerts() {
        try {
            // Get system settings
            const settings = await SystemSettings.findOne({ singleton: true });
            if (!settings || !settings.notifications_enabled) {
                return; // Alerts disabled
            }

            // Check device offline status
            await this.checkOfflineDevices(settings);

            // Check voltage/current thresholds in recent readings
            await this.checkThresholds(settings);

        } catch (error) {
            console.error('❌ Error in Alert Generator:', error.message);
        }
    }

    /**
     * Check for offline devices
     */
    async checkOfflineDevices(settings) {
        try {
            const devices = await Device.find();
            const offlineThreshold = new Date();
            offlineThreshold.setMinutes(offlineThreshold.getMinutes() - settings.device_offline_threshold);

            for (const device of devices) {
                const lastReading = await DeviceParameter.findOne({ device_id: device._id })
                    .sort({ reading_time: -1 })
                    .select('reading_time');

                const isOffline = !lastReading || lastReading.reading_time < offlineThreshold;

                if (isOffline) {
                    // Check if alert already exists for this device
                    const existingAlert = await Alert.findOne({
                        device_id: device._id,
                        alert_type: 'device_offline',
                        resolved: false,
                        createdAt: { $gte: offlineThreshold }
                    });

                    if (!existingAlert) {
                        await Alert.create({
                            device_id: device._id,
                            alert_type: 'device_offline',
                            severity: 'critical',
                            message: `Device ${device.name} has not sent data for over ${settings.device_offline_threshold} minutes`
                        });
                        console.log(`🚨 Alert: ${device.name} is offline`);
                    }
                }
            }
        } catch (error) {
            console.error('Error checking offline devices:', error.message);
        }
    }

    /**
     * Check threshold violations in recent readings
     */
    async checkThresholds(settings) {
        try {
            // Get readings from the last check interval to avoid duplicate alerts
            const checkTime = new Date();
            checkTime.setMilliseconds(checkTime.getMilliseconds() - this.checkInterval);

            const recentReadings = await DeviceParameter.find({
                reading_time: { $gte: checkTime }
            }).populate('device_id', 'name location');

            for (const reading of recentReadings) {
                if (!reading.device_id) continue;

                // Check voltage thresholds (all phases)
                await this.checkVoltage(reading, 'r_voltage', 'R', settings);
                await this.checkVoltage(reading, 'y_voltage', 'Y', settings);
                await this.checkVoltage(reading, 'b_voltage', 'B', settings);

                // Check current thresholds (all phases)
                await this.checkCurrent(reading, 'r_current', 'R', settings);
                await this.checkCurrent(reading, 'y_current', 'Y', settings);
                await this.checkCurrent(reading, 'b_current', 'B', settings);

                // Check power factor (all phases)
                await this.checkPowerFactor(reading, 'r_power_factor', 'R', settings);
                await this.checkPowerFactor(reading, 'y_power_factor', 'Y', settings);
                await this.checkPowerFactor(reading, 'b_power_factor', 'B', settings);
            }
        } catch (error) {
            console.error('Error checking thresholds:', error.message);
        }
    }

    /**
     * Check voltage threshold for a specific phase
     */
    async checkVoltage(reading, field, phase, settings) {
        const voltage = reading[field];
        if (voltage === undefined || voltage === null) return;

        const deviceId = reading.device_id._id;
        const deviceName = reading.device_id.name;

        // Over voltage
        if (voltage > settings.voltage_max) {
            const existingAlert = await this.findRecentAlert(deviceId, 'over_voltage', 5); // Within last 5 minutes

            if (!existingAlert) {
                await Alert.create({
                    device_id: deviceId,
                    alert_type: 'over_voltage',
                    severity: 'critical',
                    message: `Phase ${phase} voltage exceeded maximum limit (${voltage.toFixed(1)}V > ${settings.voltage_max}V)`,
                    value: voltage,
                    threshold: settings.voltage_max,
                    reading_id: reading._id
                });
                console.log(`🚨 Alert: ${deviceName} - Over Voltage on Phase ${phase}`);
            }
        }

        // Under voltage
        if (voltage < settings.voltage_min) {
            const existingAlert = await this.findRecentAlert(deviceId, 'under_voltage', 5);

            if (!existingAlert) {
                await Alert.create({
                    device_id: deviceId,
                    alert_type: 'under_voltage',
                    severity: 'warning',
                    message: `Phase ${phase} voltage below minimum limit (${voltage.toFixed(1)}V < ${settings.voltage_min}V)`,
                    value: voltage,
                    threshold: settings.voltage_min,
                    reading_id: reading._id
                });
                console.log(`⚠️  Alert: ${deviceName} - Under Voltage on Phase ${phase}`);
            }
        }
    }

    /**
     * Check current threshold for a specific phase
     */
    async checkCurrent(reading, field, phase, settings) {
        const current = reading[field];
        if (current === undefined || current === null) return;

        const deviceId = reading.device_id._id;
        const deviceName = reading.device_id.name;

        if (current > settings.current_max) {
            const existingAlert = await this.findRecentAlert(deviceId, 'over_current', 5);

            if (!existingAlert) {
                await Alert.create({
                    device_id: deviceId,
                    alert_type: 'over_current',
                    severity: 'critical',
                    message: `Phase ${phase} current exceeded maximum limit (${current.toFixed(2)}A > ${settings.current_max}A)`,
                    value: current,
                    threshold: settings.current_max,
                    reading_id: reading._id
                });
                console.log(`🚨 Alert: ${deviceName} - Over Current on Phase ${phase}`);
            }
        }
    }

    /**
     * Check power factor threshold for a specific phase
     */
    async checkPowerFactor(reading, field, phase, settings) {
        const pf = reading[field];
        if (pf === undefined || pf === null) return;

        const deviceId = reading.device_id._id;
        const deviceName = reading.device_id.name;

        if (pf < settings.pf_min) {
            const existingAlert = await this.findRecentAlert(deviceId, 'low_power_factor', 10); // 10 min window

            if (!existingAlert) {
                await Alert.create({
                    device_id: deviceId,
                    alert_type: 'low_power_factor',
                    severity: 'warning',
                    message: `Phase ${phase} power factor below minimum (${pf.toFixed(3)} < ${settings.pf_min})`,
                    value: pf,
                    threshold: settings.pf_min,
                    reading_id: reading._id
                });
                console.log(`⚠️  Alert: ${deviceName} - Low Power Factor on Phase ${phase}`);
            }
        }
    }

    /**
     * Find recent unresolved alert to prevent duplicates
     */
    async findRecentAlert(deviceId, alertType, minutesAgo) {
        const threshold = new Date();
        threshold.setMinutes(threshold.getMinutes() - minutesAgo);

        return await Alert.findOne({
            device_id: deviceId,
            alert_type: alertType,
            resolved: false,
            createdAt: { $gte: threshold }
        });
    }

    /**
     * Get service status
     */
    getStatus() {
        return {
            running: this.isRunning,
            check_interval: this.checkInterval
        };
    }
}

// Export singleton instance
module.exports = new AlertGenerator();
