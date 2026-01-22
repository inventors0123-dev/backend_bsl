// Test voltage trends API
const axios = require('axios');

async function testVoltageTrends() {
    try {
        const response = await axios.get('http://localhost:5000/api/stats/chart-data?type=voltage-trends');
        console.log('\n=== VOLTAGE TRENDS DATA ===');
        console.log('Data points:', response.data.length);
        console.log('\nFirst 5 data points:');
        console.log(JSON.stringify(response.data.slice(0, 5), null, 2));
    } catch (error) {
        console.error('Error:', error.message);
        if (error.response) {
            console.error('Response:', error.response.data);
        }
    }
}

testVoltageTrends();
