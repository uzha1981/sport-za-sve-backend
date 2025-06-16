import request from "supertest";
import express from "express";
import setupRoutes from "../routes.js";

const app = express();
app.use(express.json());
setupRoutes(app);

let klubToken;
let aktivnostId;

describe("✅ ACTIVITIES API", () => {
  beforeAll(async () => {
    const res = await request(app).post("/api/register-klub").send({
      email: `klub_${Date.now()}@resend.dev`,
      password: "test12345",
      naziv_kluba: "Test Klub",
      grad: "Zagreb",
      oib: "12345678901",
      referral_percentage: 10,
    });
    klubToken = res.body.token;

    await request(app).get(
      `/api/verify-email?token=${klubToken}`
    );
  });

  it("🆕 POST /api/activities – dodavanje aktivnosti", async () => {
    const res = await request(app)
      .post("/api/activities")
      .set("Authorization", `Bearer ${klubToken}`)
      .send({
        naziv: "Trening",
        opis: "Grupni trening",
        lokacija: "Dvorana 1",
        datum: "2025-05-15",
        vrijeme: "18:00",
      });

    expect(res.statusCode).toBe(201);
    expect(res.body.message).toMatch(/uspješno dodana/i);
  });

  it("📥 GET /api/my-activities – dohvaćanje aktivnosti", async () => {
    const res = await request(app)
      .get("/api/my-activities")
      .set("Authorization", `Bearer ${klubToken}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.aktivnosti.length).toBeGreaterThan(0);
    aktivnostId = res.body.aktivnosti[0].id;
  });

  it("✏️ PUT /api/activities/:id – ažuriranje aktivnosti", async () => {
    const res = await request(app)
      .put(`/api/activities/${aktivnostId}`)
      .set("Authorization", `Bearer ${klubToken}`)
      .send({ naziv: "Novi naziv", opis: "Novi opis" });

    expect(res.statusCode).toBe(200);
    expect(res.body.message).toMatch(/uspješno uređena/i);
  });

  it("🗑 DELETE /api/activities/:id – brisanje aktivnosti", async () => {
    const res = await request(app)
      .delete(`/api/activities/${aktivnostId}`)
      .set("Authorization", `Bearer ${klubToken}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.message).toMatch(/uspješno obrisana/i);
  });
});
