import request from "supertest";
import app from "../app.js";
import {
  createVerifiedUser,
  createVerifiedKlub,
  verifyUserEmail,
} from "../test-utils.js";

describe("✅ JOIN KLUB API", () => {
  let userToken;
  let klubId;

  beforeAll(async () => {
    // Kreiraj i verificiraj klub
    const klub = await createVerifiedKlub();
    klubId = klub.klubId;

    // Kreiraj i verificiraj korisnika
    const email = `join_${Date.now()}@resend.dev`;
    const password = "lozinka123";

    const userRes = await request(app)
      .post("/api/register")
      .send({ email, password });

    const userId = userRes.body?.data?.id;
    await verifyUserEmail(userId);

    // Login korisnika
    const loginRes = await request(app)
      .post("/api/login")
      .send({ email, password });

    userToken = loginRes.body.token;
  });

  test("✅ POST /api/join-klub – korisnik se uspješno pridružuje klubu", async () => {
    const res = await request(app)
      .post("/api/join-klub")
      .set("Authorization", `Bearer ${userToken}`)
      .send({ klub_id: klubId });

    expect(res.statusCode).toBe(200);
    expect(res.body.message).toBe("Uspješno si se pridružio klubu.");
  });

  test("🚫 POST /api/join-klub bez tokena vraća 401", async () => {
    const res = await request(app)
      .post("/api/join-klub")
      .send({ klub_id: klubId });

    expect(res.statusCode).toBe(401);
    expect(res.body.error).toBe("Token nije poslan");

  });

  test("🚫 POST /api/join-klub s nepostojećim klub_id vraća 400", async () => {
    const res = await request(app)
      .post("/api/join-klub")
      .set("Authorization", `Bearer ${userToken}`)
      .send({ klub_id: "00000000-0000-0000-0000-000000000000" });

    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe("Klub ne postoji.");
  });
});
