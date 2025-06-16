// __tests__/referral.test.js
import request from 'supertest';
import app from '../app.js';
import { resetDatabase } from '../test-utils.js';

let userToken;
let klubId;

beforeAll(async () => {
  await resetDatabase();
});

test('✅ Registracija korisnika s referral kodom', async () => {
  // Prvo registriramo klub koji će generirati referral kod
  const klubRes = await request(app).post('/api/register').send({
  email: `klub_${Date.now()}@resend.dev`,
  password: 'lozinka123',
  role: 'klub',
  naziv_kluba: 'Referral Klub',
  grad: 'Split',
  oib: '12345678901',
  referral_percentage: 10,
});

  expect(klubRes.status).toBe(201);
  klubId = klubRes.body.data.id;
  const referralCode = klubRes.body.data.referral_code;

  // Verificiramo klub
  await request(app).get(`/api/verify-email?token=${klubRes.body.token}`);

  // Registriramo korisnika s referral kodom
  const userRes = await request(app).post('/api/register').send({
    email: `user_${Date.now()}@resend.dev`,
    password: 'lozinka123',
    role: 'user',
    referral_code: referralCode,
  });
  expect(userRes.status).toBe(201);
  userToken = userRes.body.token;

  // Verificiramo korisnika
  await request(app).get(`/api/verify-email?token=${userToken}`);
});

test('✅ Provjera da je korisnik registriran s ispravnim referred_by', async () => {
  const res = await request(app)
    .get('/api/user-profile')
    .set('Authorization', `Bearer ${userToken}`);
  expect(res.status).toBe(200);
  expect(res.body.user.referred_by).toBeDefined();
});
