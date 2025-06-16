// __tests__/register-klub.test.js
import request from "supertest";
import jwt from "jsonwebtoken";

const API_URL = "http://localhost:3001";

describe("✅ REGISTER KLUB API", () => {
  let testEmail = `klubtest_${Date.now()}@resend.dev`;
  let testPassword = "lozinka123";
  let token;

  it("✅ Registracija kluba", async () => {
    const res = await request(API_URL)
      .post("/api/register-klub")
      .send({
        email: testEmail,
        password: testPassword,
        naziv_kluba: "Test Klub",
        grad: "Zagreb",
        oib: "12345678901",
        referral_percentage: 10,
      });

    console.log("🟢 REGISTER KLUB RESPONSE:", res.statusCode, res.body);

    if (res.body.error) {
      console.error("❌ GREŠKA kod registracije kluba:", res.body.error);
    }

    expect(res.statusCode).toBe(201);
    expect(res.body).toHaveProperty("data");
    expect(res.body.data.email).toBe(testEmail);
    expect(res.body).toHaveProperty("token");

    token = res.body.token;
  });

  it("🔓 Simulirana verifikacija emaila kluba", async () => {
    const decoded = jwt.decode(token);
    const verifyRes = await request(API_URL).get(`/api/verify-email?token=${token}`);

    console.log("🟢 VERIFIKACIJA ODGOVOR:", verifyRes.statusCode);
    expect(verifyRes.statusCode).toBe(200);
    expect(decoded).toHaveProperty("sub");
  });

  it("🔑 Login kluba nakon verifikacije", async () => {
    const res = await request(API_URL)
      .post("/api/login")
      .send({
        email: testEmail,
        password: testPassword,
      });

    console.log("🟢 LOGIN KLUB RESPONSE:", res.statusCode, res.body);

    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty("message", "Prijava uspješna!");
    expect(res.body).toHaveProperty("token");
  });
});
