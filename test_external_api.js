/**
 * Test External API Connection
 * 
 * This script tests if your external API is accessible and returning data
 */

const axios = require('axios');

const EXTERNAL_API_URL = process.env.EXTERNAL_API_URL || 'https://slategray-gull-320411.hostingersite.com/post_device_readings.php';

async function testExternalApi() {
    console.log('🧪 Testing External API Connection...\n');
    console.log(`📡 URL: ${EXTERNAL_API_URL}\n`);

    try {
        console.log('⏳ Sending GET request...');
        const response = await axios.get(EXTERNAL_API_URL, {
            timeout: 10000,
            headers: {
                'Accept': 'application/json'
            }
        });

        console.log('✅ Success!\n');
        console.log('Status Code:', response.status);
        console.log('Status Text:', response.statusText);
        console.log('\n📊 Response Data:');
        console.log(JSON.stringify(response.data, null, 2));

        // Check data format
        console.log('\n🔍 Data Analysis:');
        if (Array.isArray(response.data)) {
            console.log(`✅ Format: Array with ${response.data.length} item(s)`);
            if (response.data.length > 0 && response.data[0].mac_address) {
                console.log(`✅ First item has mac_address: ${response.data[0].mac_address}`);
            }
        } else if (response.data.readings && Array.isArray(response.data.readings)) {
            console.log(`✅ Format: Object with readings array (${response.data.readings.length} items)`);
        } else if (response.data.mac_address) {
            console.log(`✅ Format: Single reading object`);
            console.log(`✅ MAC Address: ${response.data.mac_address}`);
        } else {
            console.log('⚠️ Unknown data format. Expected mac_address field.');
        }

    } catch (error) {
        console.log('❌ Failed!\n');

        if (error.code === 'ECONNABORTED') {
            console.error('⏱️ Timeout: API took longer than 10 seconds to respond');
        } else if (error.response) {
            console.error(`📛 HTTP Error: ${error.response.status} - ${error.response.statusText}`);
            console.error('Response:', error.response.data);
        } else if (error.request) {
            console.error('🌐 Network Error: Could not reach the API');
            console.error('Possible reasons:');
            console.error('  - API server is down');
            console.error('  - No internet connection');
            console.error('  - Firewall blocking the request');
            console.error('  - Incorrect URL');
        } else {
            console.error('❌ Error:', error.message);
        }
    }

    console.log('\n' + '='.repeat(60));
    console.log('Test complete!');
    console.log('='.repeat(60));
}

// Run the test
testExternalApi();
