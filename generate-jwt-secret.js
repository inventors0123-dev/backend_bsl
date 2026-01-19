// JWT Secret Key Generator
// Run this file to generate a secure JWT secret

const crypto = require('crypto');

console.log('\n🔐 JWT Secret Key Generator\n');
console.log('Generating secure random keys...\n');

// Generate a 64-byte (512-bit) random key and convert to hex
const jwtSecret1 = crypto.randomBytes(64).toString('hex');
const jwtSecret2 = crypto.randomBytes(64).toString('base64');
const jwtSecret3 = crypto.randomBytes(32).toString('hex');

console.log('═══════════════════════════════════════════════════════════════');
console.log('Option 1: 512-bit Hex Key (Recommended)');
console.log('═══════════════════════════════════════════════════════════════');
console.log(jwtSecret1);
console.log('');

console.log('═══════════════════════════════════════════════════════════════');
console.log('Option 2: 512-bit Base64 Key');
console.log('═══════════════════════════════════════════════════════════════');
console.log(jwtSecret2);
console.log('');

console.log('═══════════════════════════════════════════════════════════════');
console.log('Option 3: 256-bit Hex Key (Shorter)');
console.log('═══════════════════════════════════════════════════════════════');
console.log(jwtSecret3);
console.log('');

console.log('📋 Usage:');
console.log('1. Copy one of the keys above');
console.log('2. Add to your .env file:');
console.log('   JWT_SECRET=<paste_key_here>');
console.log('');
console.log('💡 Recommendation: Use Option 1 (512-bit hex) for maximum security');
console.log('');
console.log('⚠️  IMPORTANT:');
console.log('   - Never commit this key to version control');
console.log('   - Keep it secret and secure');
console.log('   - Use different keys for dev and production');
console.log('');
