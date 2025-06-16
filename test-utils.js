import request from "supertest";
import jwt from "jsonwebtoken";
import app from "./app.js";

// 🔁 Reset baze
async function resetDatabase() {
  await request(app).delete("/api/test-utils/reset");
}

// 🔑 Simuliraj verifikaciju emaila
async function verifyUserEmail(userId, role = "user") {
  const token = jwt.sign({ sub: userId, role }, process.env.JWT_SECRET, {
    expiresIn: "1h",
  });
  await request(app).get(`/api/verify-email?token=${token}`);
}

// 👤 Kreiraj verificiranog korisnika
// Prima opcionalni referralCode i vraća { token, userId, email, referralCode }
async function createVerifiedUser(
  referralCode = null,
  email = `user_${Date.now()}@resend.dev`,
  password = "lozinka123"
) {
  const payload = { email, password };
  if (referralCode) payload.referral = referralCode;

  const res = await request(app)
    .post("/api/register")
    .send(payload);

  const userId = res.body?.data?.id;
  if (!userId) throw new Error("Korisnik nije kreiran");

  await verifyUserEmail(userId);

  return {
    token: res.body.token,
    userId,
    email,
    referralCode: res.body.data.referral_code,
  };
}

// 👤 Kreiraj ne-verificiranog korisnika
async function createUnverifiedUser(
  email = `unverified_${Date.now()}@resend.dev`,
  password = "lozinka123"
) {
  const res = await request(app)
    .post("/api/register")
    .send({ email, password });

  const userId = res.body?.data?.id;
  if (!userId) throw new Error("Unverified user nije kreiran");

  return { token: res.body.token, userId, email };
}

// 🏢 Kreiraj verificirani klub
async function createVerifiedKlub(
  email = `klub_${Date.now()}@resend.dev`,
  password = "lozinka123"
) {
  const res = await request(app)
    .post("/api/register-klub")
    .send({
      email,
      password,
      naziv_kluba: "Test Klub",
      grad: "Zagreb",
      oib: "12345678901",
      referral_percentage: 10,
    });

  const klubId = res.body?.data?.id;
  if (!klubId) throw new Error("Klub nije kreiran");

  await verifyUserEmail(klubId, "klub");

  return { token: res.body.token, klubId, email };
}

// 👮‍♂️ Kreiraj verificiranog admina
async function createVerifiedAdmin(
  email = `admin_${Date.now()}@resend.dev`,
  password = "lozinka123"
) {
  const res = await request(app)
    .post("/api/register")
    .send({ email, password, role: "admin" });

  const adminId = res.body?.data?.id;
  if (!adminId) throw new Error("Admin nije kreiran");

  await verifyUserEmail(adminId, "admin");

  return { token: res.body.token, adminId, email };
}

// 🔐 Prijava kao klub
async function loginAsKlub(email, password = "lozinka123") {
  const res = await request(app).post("/api/login").send({ email, password });
  if (res.status !== 200 || !res.body.token) {
    throw new Error("Login kluba nije uspio");
  }
  return res.body.token;
}

// 🔐 Prijava kao korisnik
async function loginAsUser(email, password = "lozinka123") {
  const res = await request(app).post("/api/login").send({ email, password });
  if (!res.body.token) throw new Error("Login korisnika nije uspio");
  return res.body.token;
}

// 🔐 Prijava kao admin
async function loginAsAdmin(email, password = "lozinka123") {
  const res = await request(app).post("/api/login").send({ email, password });
  if (!res.body.token) throw new Error("Login admina nije uspio");
  return res.body.token;
}

// 🤝 Korisnik se pridružuje klubu
async function joinKlub(token, klubId) {
  return await request(app)
    .post("/api/join-klub")
    .set("Authorization", `Bearer ${token}`)
    .send({ klub_id: klubId });
}

// Jednostavan helper za testiranje - novi verificirani korisnik
async function createTestUser() {
  return await createVerifiedUser();
}

// Kompletan scenarij: referrer + referred + klub + uplata + login
async function createTestUserWithReferralAndPayment() {
  // 1. Referrer
  const referrer = await createVerifiedUser();
  const referralCode = referrer.referralCode;

  // 2. Referred registracija s kodom
  const referredRes = await request(app)
    .post("/api/register")
    .send({
      email: `referred_${Date.now()}@resend.dev`,
      password: "lozinka123",
      referral: referralCode,
    });

  const referredId = referredRes.body?.data?.id;
  if (!referredId) throw new Error("Referred user nije kreiran");
  await verifyUserEmail(referredId);

  // 3. Klub
  const klub = await createVerifiedKlub();

  // 4. Pridruži referred korisnika klubu
  await joinKlub(referredRes.body.token, klub.klubId);

  // 5. Evidentiraj uplatu (bez description)
  await request(app)
    .post("/api/record-payment")
    .set("Authorization", `Bearer ${klub.token}`)
    .send({
      member_id: referredId,
      amount: 100,
    });

  // 6. Referrer se prijavi da dobije token
  const loginRes = await request(app).post("/api/login").send({
    email: referrer.email,
    password: "lozinka123",
  });
  const referrerToken = loginRes.body?.token;
  if (!referrerToken) throw new Error("Referrer login nije uspio");

  return { referrerToken, referrerId: referrer.userId, referralCode };
}

console.log("✅ test-utils.js učitan");

// Eksport svi helperi
export {
  resetDatabase,
  verifyUserEmail,
  createVerifiedUser,
  createUnverifiedUser,
  createVerifiedKlub,
  createVerifiedAdmin,
  loginAsKlub,
  loginAsUser,
  loginAsAdmin,
  joinKlub,
  createTestUser,
  createTestUserWithReferralAndPayment,
};
export default app;

// Token helpers
export async function getUserToken() {
  const { token } = await createVerifiedUser();
  return token;
}
export async function getAdminToken() {
  const { token } = await createVerifiedAdmin();
  return token;
}
