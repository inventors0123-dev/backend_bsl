const data = {
    "mac_address": "AA:BB:CC:DD:EE:FF",

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

async function sendData() {
    try {
        console.log('Sending data to http://localhost:5000/api/readings...');
        const response = await fetch('http://localhost:5000/api/readings', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(data)
        });

        const responseData = await response.json();
        console.log('Response Status:', response.status);
        console.log('Response Data:', responseData);
    } catch (error) {
        console.error('Error sending data:', error);
    }
}

sendData();
