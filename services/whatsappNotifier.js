const { spawn } = require('child_process');
const path = require('path');
const Device = require('../models/Device');

const TRUE_VALUES = new Set(['1', 'true', 'yes', 'on']);
const debugMode = TRUE_VALUES.has(String(process.env.WHATSAPP_DEBUG || '').toLowerCase());

function isWhatsappAlertsEnabled() {
    return TRUE_VALUES.has(String(process.env.WHATSAPP_ALERTS_ENABLED || '').toLowerCase());
}

async function resolveDeviceName(deviceId) {
    if (!deviceId) return 'Unknown Device';

    try {
        const device = await Device.findById(deviceId).select('name').lean();
        return device?.name || 'Unknown Device';
    } catch (error) {
        console.error('Error fetching device name for WhatsApp alert:', error.message);
        return 'Unknown Device';
    }
}

function formatAlertText(alert, deviceName) {
    const lines = [
        'Dashboard Alert',
        `Device: ${deviceName}`,
        `Severity: ${String(alert.severity || 'info').toUpperCase()}`,
        `Type: ${alert.alert_type || 'unknown'}`,
        `Message: ${alert.message || ''}`
    ];

    if (alert.value !== undefined && alert.value !== null) {
        lines.push(`Value: ${alert.value}`);
    }
    if (alert.threshold !== undefined && alert.threshold !== null) {
        lines.push(`Threshold: ${alert.threshold}`);
    }
    if (alert.createdAt) {
        lines.push(`Time: ${new Date(alert.createdAt).toISOString()}`);
    }

    // Keep a single-line text because WhatsApp template params reject new lines.
    return lines.join(' | ');
}

async function sendDashboardAlertWhatsapp(alertDoc) {
    if (!isWhatsappAlertsEnabled()) {
        if (debugMode) console.log('[whatsapp] Skipped: WHATSAPP_ALERTS_ENABLED is false');
        return;
    }
    if (!alertDoc || alertDoc.resolved) {
        if (debugMode) console.log('[whatsapp] Skipped: empty/resolved alert');
        return;
    }

    const pythonBin = process.env.PYTHON_BIN || (process.platform === 'win32' ? 'python' : 'python3');
    const scriptPath = path.join(__dirname, '..', 'messege.py');
    const templateName = process.env.WHATSAPP_ALERT_TEMPLATE || 'factory_alert';

    const deviceName = await resolveDeviceName(alertDoc.device_id);
    const alertText = formatAlertText(alertDoc, deviceName);

    const args = [
        scriptPath,
        '--mode',
        'dashboard-alert',
        '--alert-text',
        alertText,
        '--template',
        templateName
    ];

    if (debugMode) {
        console.log(`[whatsapp] Executing: ${pythonBin} ${args.join(' ')}`);
    }

    const child = spawn(pythonBin, args, {
        cwd: path.join(__dirname, '..'),
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe']
    });

    let stderr = '';

    child.stdout.on('data', (data) => {
        const output = data.toString().trim();
        if (output) console.log(`[whatsapp] ${output}`);
    });

    child.stderr.on('data', (data) => {
        stderr += data.toString();
    });

    child.on('error', (error) => {
        console.error(`Failed to start WhatsApp notifier Python process: ${error.message}`);
    });

    child.on('close', (code) => {
        if (code === 0) return;
        const details = stderr.trim() ? ` Details: ${stderr.trim()}` : '';
        console.error(`WhatsApp notifier exited with code ${code}.${details}`);
    });
}

module.exports = {
    sendDashboardAlertWhatsapp
};
