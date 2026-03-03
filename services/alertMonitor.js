const DeviceParameter = require('../models/DeviceParameter');
const Alert = require('../models/Alert');
const Device = require('../models/Device');
const SystemSettings = require('../models/SystemSettings');

/**
 * Alert Monitoring Service
 * Checks device readings against thresholds and generates alerts
 */

// Store alert states to track duration and avoid duplicates
const alertStates = new Map();

// Alert configurations with time delays
const ALERT_CONFIGS = {
    // Phase Over Current
    PHASE_OVERCURRENT_WARNING: {
        threshold: 0.85, // 85% of rated current
        duration: 60000, // 60 seconds
        severity: 'warning',
        type: 'over_current'
    },
    PHASE_OVERCURRENT_CRITICAL: {
        threshold: 1.0, // 100% of rated current
        duration: 10000, // 10 seconds
        severity: 'critical',
        type: 'over_current'
    },

    // Current Imbalance
    CURRENT_IMBALANCE_WARNING: {
        threshold: 10, // 10%
        duration: 120000, // 120 seconds
        severity: 'warning',
        type: 'current_imbalance'
    },
    CURRENT_IMBALANCE_CRITICAL: {
        threshold: 20, // 20%
        duration: 60000, // 60 seconds
        severity: 'critical',
        type: 'current_imbalance'
    },

    // Voltage Alerts
    VOLTAGE_LOW_WARNING: {
        threshold: 210, // Volts
        duration: 30000, // 30 seconds
        severity: 'warning',
        type: 'under_voltage'
    },
    VOLTAGE_LOW_CRITICAL: {
        threshold: 190,
        duration: 10000,
        severity: 'critical',
        type: 'under_voltage'
    },
    VOLTAGE_HIGH_WARNING: {
        threshold: 250,
        duration: 30000,
        severity: 'warning',
        type: 'over_voltage'
    },
    VOLTAGE_HIGH_CRITICAL: {
        threshold: 260,
        duration: 10000,
        severity: 'critical',
        type: 'over_voltage'
    },

    // Voltage Imbalance
    VOLTAGE_IMBALANCE_WARNING: {
        threshold: 2, // 2%
        duration: 0,
        severity: 'warning',
        type: 'voltage_imbalance'
    },
    VOLTAGE_IMBALANCE_CRITICAL: {
        threshold: 3, // 3%
        duration: 0,
        severity: 'critical',
        type: 'voltage_imbalance'
    },

    // Phase Loss
    PHASE_LOSS: {
        threshold: 50, // Volts
        duration: 5000, // 5 seconds
        severity: 'critical',
        type: 'phase_loss'
    },

    // Low Power Factor
    LOW_PF_WARNING: {
        threshold: 0.95,
        duration: 600000, // 10 minutes
        severity: 'warning',
        type: 'low_power_factor'
    },
    LOW_PF_CRITICAL: {
        threshold: 0.95,
        duration: 60000, // 1 minute
        severity: 'critical',
        type: 'low_power_factor'
    },

    // Frequency
    FREQ_LOW_WARNING: {
        threshold: 49.5,
        duration: 30000,
        severity: 'warning',
        type: 'frequency_deviation'
    },
    FREQ_LOW_CRITICAL: {
        threshold: 49,
        duration: 10000,
        severity: 'critical',
        type: 'frequency_deviation'
    },
    FREQ_HIGH_WARNING: {
        threshold: 50.5,
        duration: 30000,
        severity: 'warning',
        type: 'frequency_deviation'
    },
    FREQ_HIGH_CRITICAL: {
        threshold: 51,
        duration: 10000,
        severity: 'critical',
        type: 'frequency_deviation'
    },

    // Temperature
    TEMP_WARNING: {
        threshold: 55,
        duration: 300000, // 5 minutes
        severity: 'warning',
        type: 'high_temperature'
    },
    TEMP_CRITICAL: {
        threshold: 65,
        duration: 120000, // 2 minutes
        severity: 'critical',
        type: 'high_temperature'
    },

    // Device Health
    NO_DATA_WARNING: {
        duration: 300000, // 5 minutes
        severity: 'warning',
        type: 'device_offline'
    },
    NO_DATA_CRITICAL: {
        duration: 1800000, // 30 minutes
        severity: 'critical',
        type: 'device_offline'
    }
};

/**
 * Calculate current imbalance percentage
 */
function calculateCurrentImbalance(r_current, y_current, b_current) {
    const avg = (r_current + y_current + b_current) / 3;
    if (avg === 0) return 0;

    const maxDiff = Math.max(
        Math.abs(r_current - avg),
        Math.abs(y_current - avg),
        Math.abs(b_current - avg)
    );

    return (maxDiff / avg) * 100;
}

/**
 * Calculate voltage imbalance percentage
 */
function calculateVoltageImbalance(r_voltage, y_voltage, b_voltage) {
    const avg = (r_voltage + y_voltage + b_voltage) / 3;
    if (avg === 0) return 0;

    const maxDiff = Math.max(
        Math.abs(r_voltage - avg),
        Math.abs(y_voltage - avg),
        Math.abs(b_voltage - avg)
    );

    return (maxDiff / avg) * 100;
}

/**
 * Check if alert condition is met and has persisted for required duration
 */
function checkAlertCondition(alertKey, deviceId, conditionMet) {
    const now = Date.now();
    const stateKey = `${deviceId}_${alertKey}`;

    if (conditionMet) {
        if (!alertStates.has(stateKey)) {
            // First time condition is met
            alertStates.set(stateKey, { startTime: now, lastNotified: 0 });
            return false; // Not yet, need to wait for duration
        }

        const state = alertStates.get(stateKey);
        const duration = now - state.startTime;

        // Extract base config name (remove phase suffix like _R, _Y, _B)
        let baseConfigKey = alertKey.replace(/_[RYB]$/, '');
        const config = ALERT_CONFIGS[baseConfigKey] || ALERT_CONFIGS[alertKey];

        if (!config) {
            console.warn(`⚠️ Unknown alert config: ${alertKey}`);
            return false;
        }

        // Check if duration threshold is met
        if (duration >= config.duration) {
            // Check notification rate limiting (max once per 15 min)
            if (now - state.lastNotified >= 900000) { // 15 minutes
                state.lastNotified = now;
                return true;
            }
        }
        return false;
    } else {
        // Condition not met, clear state (hysteresis)
        alertStates.delete(stateKey);
        return false;
    }
}

/**
 * Create an alert in the database
 */
async function createAlert(device, alertType, severity, message, value, threshold, reading) {
    try {
        // Check if similar unresolved alert exists
        const existingAlert = await Alert.findOne({
            device_id: device._id,
            alert_type: alertType,
            severity: severity,
            resolved: false
        });

        if (existingAlert) {
            // Update existing alert timestamp
            existingAlert.updatedAt = new Date();
            await existingAlert.save();
            return existingAlert;
        }

        // Create new alert
        const alert = new Alert({
            device_id: device._id,
            alert_type: alertType,
            severity: severity,
            message: message,
            value: value,
            threshold: threshold,
            reading_id: reading._id,
            resolved: false
        });

        await alert.save();
        console.log(`✅ Alert created: ${message}`);
        return alert;
    } catch (error) {
        console.error('Error creating alert:', error);
    }
}

/**
 * Monitor a single device for alerts
 */
async function monitorDevice(device, settings) {
    try {
        // Get latest reading
        const latestReading = await DeviceParameter.findOne({ device_id: device._id })
            .sort({ reading_time: -1 });

        if (!latestReading) {
            // No data alert
            const lastDataTime = await DeviceParameter.findOne({ device_id: device._id })
                .sort({ reading_time: -1 })
                .select('reading_time');

            if (lastDataTime) {
                const timeSinceLastData = Date.now() - new Date(lastDataTime.reading_time).getTime();

                if (checkAlertCondition('NO_DATA_CRITICAL', device._id, timeSinceLastData >= ALERT_CONFIGS.NO_DATA_CRITICAL.duration)) {
                    await createAlert(
                        device,
                        'device_offline',
                        'critical',
                        `No data from ${device.name} for over 30 minutes`,
                        timeSinceLastData / 60000,
                        30,
                        null
                    );
                } else if (checkAlertCondition('NO_DATA_WARNING', device._id, timeSinceLastData >= ALERT_CONFIGS.NO_DATA_WARNING.duration)) {
                    await createAlert(
                        device,
                        'device_offline',
                        'warning',
                        `No data from ${device.name} for over 5 minutes`,
                        timeSinceLastData / 60000,
                        5,
                        null
                    );
                }
            }
            return;
        }

        const rated_current = settings.current_max || 20; // Default 20A if not set

        // 1. Phase Over Current Alerts
        const phases = [
            { name: 'R', current: latestReading.r_current || 0 },
            { name: 'Y', current: latestReading.y_current || 0 },
            { name: 'B', current: latestReading.b_current || 0 }
        ];

        for (const phase of phases) {
            const percentOfRated = phase.current / rated_current;

            if (checkAlertCondition(`PHASE_OVERCURRENT_CRITICAL_${phase.name}`, device._id, percentOfRated >= 1.0)) {
                await createAlert(
                    device,
                    'over_current',
                    'critical',
                    `${phase.name} phase current high: ${phase.current.toFixed(1)}A (limit ${rated_current}A)`,
                    phase.current,
                    rated_current,
                    latestReading
                );
            } else if (checkAlertCondition(`PHASE_OVERCURRENT_WARNING_${phase.name}`, device._id, percentOfRated >= 0.85)) {
                await createAlert(
                    device,
                    'over_current',
                    'warning',
                    `${phase.name} phase current: ${phase.current.toFixed(1)}A (85% of ${rated_current}A limit)`,
                    phase.current,
                    rated_current * 0.85,
                    latestReading
                );
            }
        }

        // 2. Current Imbalance
        const currentImbalance = calculateCurrentImbalance(
            latestReading.r_current || 0,
            latestReading.y_current || 0,
            latestReading.b_current || 0
        );

        if (checkAlertCondition('CURRENT_IMBALANCE_CRITICAL', device._id, currentImbalance >= 20)) {
            await createAlert(
                device,
                'current_imbalance',
                'critical',
                `Current imbalance: ${currentImbalance.toFixed(1)}% (limit 20%)`,
                currentImbalance,
                20,
                latestReading
            );
        } else if (checkAlertCondition('CURRENT_IMBALANCE_WARNING', device._id, currentImbalance >= 10)) {
            await createAlert(
                device,
                'current_imbalance',
                'warning',
                `Current imbalance: ${currentImbalance.toFixed(1)}% (limit 10%)`,
                currentImbalance,
                10,
                latestReading
            );
        }

        // 3. Voltage Alerts
        const voltages = [
            { name: 'R', voltage: latestReading.r_voltage || 0 },
            { name: 'Y', voltage: latestReading.y_voltage || 0 },
            { name: 'B', voltage: latestReading.b_voltage || 0 }
        ];

        for (const phase of voltages) {
            // Phase Loss
            if (checkAlertCondition(`PHASE_LOSS_${phase.name}`, device._id, phase.voltage < 50)) {
                await createAlert(
                    device,
                    'phase_loss',
                    'critical',
                    `${phase.name} phase missing: ${phase.voltage.toFixed(1)}V`,
                    phase.voltage,
                    50,
                    latestReading
                );
            }

            // Low Voltage
            else if (checkAlertCondition(`VOLTAGE_LOW_CRITICAL_${phase.name}`, device._id, phase.voltage < 190)) {
                await createAlert(
                    device,
                    'under_voltage',
                    'critical',
                    `${phase.name} phase voltage critically low: ${phase.voltage.toFixed(1)}V`,
                    phase.voltage,
                    190,
                    latestReading
                );
            } else if (checkAlertCondition(`VOLTAGE_LOW_WARNING_${phase.name}`, device._id, phase.voltage < 210 && phase.voltage >= 190)) {
                await createAlert(
                    device,
                    'under_voltage',
                    'warning',
                    `${phase.name} phase voltage low: ${phase.voltage.toFixed(1)}V`,
                    phase.voltage,
                    210,
                    latestReading
                );
            }

            // High Voltage
            else if (checkAlertCondition(`VOLTAGE_HIGH_CRITICAL_${phase.name}`, device._id, phase.voltage > 260)) {
                await createAlert(
                    device,
                    'over_voltage',
                    'critical',
                    `${phase.name} phase voltage critically high: ${phase.voltage.toFixed(1)}V`,
                    phase.voltage,
                    260,
                    latestReading
                );
            } else if (checkAlertCondition(`VOLTAGE_HIGH_WARNING_${phase.name}`, device._id, phase.voltage > 250 && phase.voltage <= 260)) {
                await createAlert(
                    device,
                    'over_voltage',
                    'warning',
                    `${phase.name} phase voltage high: ${phase.voltage.toFixed(1)}V`,
                    phase.voltage,
                    250,
                    latestReading
                );
            }
        }

        // 4. Voltage Imbalance
        const voltageImbalance = calculateVoltageImbalance(
            latestReading.r_voltage || 0,
            latestReading.y_voltage || 0,
            latestReading.b_voltage || 0
        );

        if (voltageImbalance >= 3) {
            await createAlert(
                device,
                'voltage_imbalance',
                'critical',
                `Voltage imbalance: ${voltageImbalance.toFixed(1)}% (limit 3%)`,
                voltageImbalance,
                3,
                latestReading
            );
        } else if (voltageImbalance >= 2) {
            await createAlert(
                device,
                'voltage_imbalance',
                'warning',
                `Voltage imbalance: ${voltageImbalance.toFixed(1)}% (limit 2%)`,
                voltageImbalance,
                2,
                latestReading
            );
        }

        // 5. Low Power Factor
        const totalKw = (latestReading.r_active_power || 0) +
            (latestReading.y_active_power || 0) +
            (latestReading.b_active_power || 0);
        const totalKva = (latestReading.r_apparent_power || 0) +
            (latestReading.y_apparent_power || 0) +
            (latestReading.b_apparent_power || 0);
        const pf = totalKva > 0 ? Math.abs(totalKw / totalKva) : 1;
        const pfMinThreshold = Math.max(settings?.pf_min || 0, ALERT_CONFIGS.LOW_PF_CRITICAL.threshold);

        if (checkAlertCondition('LOW_PF_CRITICAL', device._id, pf < pfMinThreshold)) {
            await createAlert(
                device,
                'low_power_factor',
                'critical',
                `Power factor critically low: ${pf.toFixed(2)} (limit ${pfMinThreshold.toFixed(2)})`,
                pf,
                pfMinThreshold,
                latestReading
            );
        }

        // 6. Frequency Alerts
        const freq = latestReading.frequency || 50;

        if (checkAlertCondition('FREQ_LOW_CRITICAL', device._id, freq < 49)) {
            await createAlert(
                device,
                'frequency_deviation',
                'critical',
                `Frequency critically low: ${freq.toFixed(2)} Hz`,
                freq,
                49,
                latestReading
            );
        } else if (checkAlertCondition('FREQ_LOW_WARNING', device._id, freq < 49.5 && freq >= 49)) {
            await createAlert(
                device,
                'frequency_deviation',
                'warning',
                `Frequency low: ${freq.toFixed(2)} Hz`,
                freq,
                49.5,
                latestReading
            );
        } else if (checkAlertCondition('FREQ_HIGH_CRITICAL', device._id, freq > 51)) {
            await createAlert(
                device,
                'frequency_deviation',
                'critical',
                `Frequency critically high: ${freq.toFixed(2)} Hz`,
                freq,
                51,
                latestReading
            );
        } else if (checkAlertCondition('FREQ_HIGH_WARNING', device._id, freq > 50.5 && freq <= 51)) {
            await createAlert(
                device,
                'frequency_deviation',
                'warning',
                `Frequency high: ${freq.toFixed(2)} Hz`,
                freq,
                50.5,
                latestReading
            );
        }

        // 7. Temperature Alerts (if available)
        if (latestReading.temperature && latestReading.temperature > -100) {
            const temp = latestReading.temperature;

            if (checkAlertCondition('TEMP_CRITICAL', device._id, temp > 65)) {
                await createAlert(
                    device,
                    'high_temperature',
                    'critical',
                    `Temperature critically high: ${temp.toFixed(1)}°C`,
                    temp,
                    65,
                    latestReading
                );
            } else if (checkAlertCondition('TEMP_WARNING', device._id, temp > 55 && temp <= 65)) {
                await createAlert(
                    device,
                    'high_temperature',
                    'warning',
                    `Temperature high: ${temp.toFixed(1)}°C`,
                    temp,
                    55,
                    latestReading
                );
            }
        }

    } catch (error) {
        console.error(`Error monitoring device ${device.name}:`, error);
    }
}

/**
 * Run alert monitoring for all devices
 */
async function runAlertMonitor() {
    try {
        console.log('🔍 Running alert monitor...');

        // Get system settings for thresholds
        const settings = await SystemSettings.findOne({ singleton: true });
        if (!settings) {
            console.error('⚠️ No system settings found');
            return;
        }

        // Get all devices
        const devices = await Device.find();

        // Monitor each device
        for (const device of devices) {
            await monitorDevice(device, settings);
        }

        console.log('✅ Alert monitor completed');
    } catch (error) {
        console.error('❌ Alert monitor error:', error);
    }
}

module.exports = {
    runAlertMonitor,
    monitorDevice
};
