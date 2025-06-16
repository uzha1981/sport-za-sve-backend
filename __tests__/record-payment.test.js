import request from 'supertest';
import app from '../app.js';
import {
  createVerifiedUser,
  createVerifiedKlub,
  joinKlub,
  loginAsKlub,
} from '../test-utils.js';

describe('💰 RECORD PAYMENT API', () => {
  let klubToken;
  let userToken;
  let userId;

  beforeAll(async () => {
    // 1. Kreiraj verificirani klub
    const klub = await createVerifiedKlub();
    klubToken = klub.token;

    // 2. Kreiraj verificiranog korisnika
    const user = await createVerifiedUser();
    userToken = user.token;
    userId = user.userId;

    // 3. Pridruži korisnika klubu
    await joinKlub(userToken, klub.klubId);
  });

  test('✅ Uspješno bilježenje uplate i isplata referral provizije', async () => {
    const res = await request(app)
      .post('/api/record-payment')
      .set('Authorization', `Bearer ${klubToken}`)
      .send({
        member_id: userId, // ✅ ispravljeno s "member_id"
        amount: 100,
        description: 'Mjesečna članarina',
      });

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty(
      'message',
      'Uplata evidentirana i provizija isplaćena (ako je primjenjivo).'
    );
  });

  test('🚫 Greška bez tokena', async () => {
    const res = await request(app)
      .post('/api/record-payment')
      .send({
        member_id: userId,
        amount: 100,
        description: 'Članarina bez tokena',
      });

    expect(res.status).toBe(401);
    expect(res.body).toHaveProperty('error');
  });

  test('🚫 Greška s nepostojećim member_id', async () => {
    const res = await request(app)
      .post('/api/record-payment')
      .set('Authorization', `Bearer ${klubToken}`)
      .send({
        member_id: '00000000-0000-0000-0000-000000000000', // ✅ field: member_id
        amount: 100,
        description: 'Nevažeći korisnik',
      });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });
});
