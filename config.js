// config.js
import dotenv from 'dotenv';

if (process.env.NODE_ENV === 'test') {
  dotenv.config({ path: '.env.test' });
} else {
  dotenv.config();
}

console.log(`🌍 ENV | TEST_MODE: ${process.env.TEST_MODE} | NODE_ENV: ${process.env.NODE_ENV}`);
