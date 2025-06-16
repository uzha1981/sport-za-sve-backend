import request from "supertest";
import express from "express";
import setupRoutes from "../routes.js";

const app = express();
app.use(express.json());
setupRoutes(app);

let klubToken, userToken;

describe("✅ MY KLUB API", () => {
  beforeAll(async () => {
    // 1. Registracija kluba
    const klubRes = await request(app).post("/api/register-klub").send({
      email: `klubtest_${Date.now()}@resend.dev`,
      password: "test12345",
      naziv_kluba: "Test Klub",
      grad: "Zagreb",
      oib: "12345678901",
      referral_percentage: 10,
    });
    klubToken = klubRes.body.token;

    // 2. Verifikacija
    await request(app).get(
      `/api/verify-email?token=${klubToken}`
    );

    // 3. Registracija korisnika
    const userRes = await request(app).post("/api/register").send({
      email: `user_${Date.now()}@resend.dev`,
      password: "test12345",
    });
    userToken = userRes.body.token;

    await request(app).get(
      `/api/verify-email?token=${userToken}`
    );

    // 4. Korisnik se pridružuje klubu
    const klubId = klubRes.body.data.id;
    await request(app)
      .post("/api/join-klub")
      .set("Authorization", `Bearer ${userToken}`)
      .send({ klub_id: klubId });
  });

  it("📥 GET /api/my-klub vraća podatke o klubu", async () => {
    const res = await request(app)
      .get("/api/my-klub")
      .set("Authorization", `Bearer ${userToken}`);

    console.log("📄 /api/my-klub response:", res.statusCode, res.body);
    expect(res.statusCode).toBe(200);
    expect(res.body.klub).toHaveProperty("naziv_kluba", "Test Klub");
  });
});
