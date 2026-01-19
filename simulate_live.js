const axios = require('axios');

// CONFIGURATION
const API_URL = 'http://localhost:5000/api/readings';
const MAC_ADDRESS = "AA:BB:CC:DD:EE:FF"; // The MAC from your curl command
const INTERVAL_MS = 3000; // Send every 3 seconds

// The exact base data structure you provided
const baseData = {
    "mac_address": MAC_ADDRESS,

    "r_voltage": 230.5,
    "r_voltage_line_to_line": 398.5,
    "r_current": 10.2,
    "r_active_power": 2200.5,
    "r_reactive_power": 150.3,
    "r_apparent_power": 2205.6,
    "r_power_factor": 0.998,
    "r_thd_voltage": 2.5,
    "r_thd_current": 3.2,
    "r_harmonics_voltage": [230.5, 5.2, 3.1, 2.0, 1.5],
    "r_harmonics_current": [10.2, 0.3, 0.2, 0.1, 0.05],
    "r_voltage_neutral": 230.2,

    "y_voltage": 231.2,
    "y_voltage_line_to_line": 399.1,
    "y_current": 10.5,
    "y_active_power": 2250.0,
    "y_reactive_power": 155.0,
    "y_apparent_power": 2255.3,
    "y_power_factor": 0.997,
    "y_thd_voltage": 2.3,
    "y_thd_current": 3.0,
    "y_harmonics_voltage": [231.2, 5.0, 3.0, 1.8, 1.4],
    "y_harmonics_current": [10.5, 0.31, 0.21, 0.11, 0.06],
    "y_voltage_neutral": 231.0,

    "b_voltage": 229.8,
    "b_voltage_line_to_line": 397.9,
    "b_current": 10.0,
    "b_active_power": 2180.0,
    "b_reactive_power": 148.5,
    "b_apparent_power": 2185.1,
    "b_power_factor": 0.998,
    "b_thd_voltage": 2.6,
    "b_thd_current": 3.3,
    "b_harmonics_voltage": [229.8, 5.3, 3.2, 2.1, 1.6],
    "b_harmonics_current": [10.0, 0.33, 0.22, 0.12, 0.07],
    "b_voltage_neutral": 229.5,

    "ry_voltage": 398.5,
    "yb_voltage": 399.1,
    "br_voltage": 397.9,

    "neutral_current": 0.5,
    "voltage_unbalance": 0.8,
    "current_unbalance": 1.2,
    "frequency": 50.02,
    "total_energy_kwh": 1234.56,
    "total_energy_kvah": 1240.23,
    "total_energy_kvarh": 125.45,
    "transient_event_count": 3,
    "temperature": 35.5,
    "humidity": 65.2
};

// Helper: Add random noise to simulate sensor fluctuation
function fuzz(value, range) {
    if (typeof value === 'number') {
        const delta = (Math.random() - 0.5) * range;
        return Number((value + delta).toFixed(2));
    }
    return value;
}

async function sendReading() {
    const data = { ...baseData };

    // Simulate real-time changes for ALL parameters to make it look realistic

    // Phase R - with realistic variations
    data.r_voltage = fuzz(230.5, 5);
    data.r_current = fuzz(10.2, 2);
    data.r_active_power = fuzz(2200, 200);
    data.r_power_factor = fuzz(0.998, 0.05);

    // Phase Y - with realistic variations
    data.y_voltage = fuzz(231.2, 5);
    data.y_current = fuzz(10.5, 2);
    data.y_active_power = fuzz(2250, 200);
    data.y_power_factor = fuzz(0.997, 0.05);

    // Phase B - with realistic variations
    data.b_voltage = fuzz(229.8, 5);
    data.b_current = fuzz(10.0, 2);
    data.b_active_power = fuzz(2180, 200);
    data.b_power_factor = fuzz(0.998, 0.05);

    // Common parameters
    data.frequency = fuzz(50.0, 0.1);
    data.temperature = fuzz(35.5, 0.5);
    data.total_energy_kwh = fuzz(1234.56, 5); // Energy slowly increases
    data.reading_time = new Date();

    try {
        const response = await axios.post(API_URL, data);
        console.log(`[${new Date().toLocaleTimeString()}] ✅ Data Sent! Power: ${data.r_active_power}W | Response: ${response.status}`);
    } catch (error) {
        if (error.response) {
            if (error.response.status === 403) {
                console.error(`❌ ERROR 403: Forbidden - MAC Address '${MAC_ADDRESS}' is not registered.`);
                console.error("   -> Go to Dashboard > Manage Devices > MAC Management to fix this.");
            } else {
                console.error(`❌ ERROR ${error.response.status}: ${JSON.stringify(error.response.data)}`);
            }
        } else {
            console.error(`❌ Connection Error: Is the backend running at ${API_URL}?`);
        }
    }
}

console.log("🚀 Starting Real-Time Data Simulation...");
console.log(`TARGET: ${API_URL}`);
console.log(`DEVICE: ${MAC_ADDRESS}`);
console.log("Press Ctrl+C to stop.\n");

sendReading(); // Send first immediately
setInterval(sendReading, INTERVAL_MS);
