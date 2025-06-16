// __tests__/auth.test.js
import request from 'supertest';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config();

const API_URL = process.env.TEST_API_URL || 'http://localhost:3001';
const testEmail = `testuser_${Date.now()}@resend.dev`; // ✅ važeći testni email
const testPassword = 'Test1234';

let token = null;

describe('✅ AUTH API', () => {
  test('📨 Registracija korisnika', async () => {
    try {
      const res = await request(API_URL)
        .post('/api/register')
        .send({ email: testEmail, password: testPassword });

      console.log("🟡 FULL REGISTER RESPONSE:", res.body);

      if (res.body.error) {
        console.error("❌ REGISTER GREŠKA:", res.body.error);
      }

      expect(res.statusCode).toBe(201);
      expect(res.body).toHaveProperty('data');
      expect(res.body.data).toHaveProperty('email', testEmail);
      expect(res.body).toHaveProperty('token');
    } catch (err) {
      console.error("❌ UNUTARNJA GREŠKA U TESTU:", err);
      throw err;
    }
  });

  test('🚫 Neuspješna prijava bez verifikacije', async () => {
    const res = await request(API_URL)
      .post('/api/login')
      .send({ email: testEmail, password: testPassword });

    console.log("🟡 LOGIN (unverified) RESPONSE:", res.statusCode, res.body);

    expect(res.statusCode).toBe(403);
    expect(res.body.error).toMatch(/verificirajte email/i);
  });

  test('✅ Simulirana verifikacija emaila u Supabase', async () => {
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    const { data: user, error } = await supabase
      .from('users')
      .select('*')
      .eq('email', testEmail)
      .single();

    console.log("🟢 Supabase user lookup:", { user, error });

    expect(error).toBeNull();
    expect(user).toBeTruthy();

    const { error: updateError } = await supabase
      .from('users')
      .update({ is_verified: true })
      .eq('id', user.id);

    expect(updateError).toBeNull();
  });

  test('🔑 Uspješna prijava nakon verifikacije', async () => {
    const res = await request(API_URL)
      .post('/api/login')
      .send({ email: testEmail, password: testPassword });

    console.log("🟢 LOGIN (verified) RESPONSE:", res.statusCode, res.body);

    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty('token');
    token = res.body.token;
  });
});
