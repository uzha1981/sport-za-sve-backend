// __tests__/clubs.test.js
import request from 'supertest';
import dotenv from 'dotenv';

dotenv.config();

const API_URL = process.env.TEST_API_URL || 'http://localhost:3001';

describe('✅ CLUBS API', () => {
  test('📥 GET /api/clubs vraća 200 OK', async () => {
    try {
      const res = await request(API_URL).get('/api/clubs');
      console.log('📄 /api/clubs response:', res.statusCode, res.body);
      expect(res.statusCode).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    } catch (err) {
      console.error('❌ Greška u testu GET /api/clubs:', err);
      throw err;
    }
  });
});
