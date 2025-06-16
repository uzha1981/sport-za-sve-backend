// __tests__/user-profile.test.js
import request from "supertest";
import jwt from "jsonwebtoken";

const API_URL = "http://localhost:3001";

describe("✅ USER PROFILE API", () => {
  let userToken = "";

  beforeAll(async () => {
    // Registriraj korisnika
    const res = await request(API_URL)
      .post("/api/register")
      .send({
        email: `testuser_${Date.now()}@resend.dev`,
        password: "test1234"
      });

    expect(res.statusCode).toBe(201);
    expect(res.body).toHaveProperty("token");
    userToken = res.body.token;

    // Simuliraj verifikaciju
    const decoded = jwt.decode(userToken);
    const verifyRes = await request(API_URL)
      .get(`/api/verify-email?token=${userToken}`);

    expect(verifyRes.statusCode).toBe(200);
  });

  test("📥 GET /api/user-profile vraća podatke o korisniku", async () => {
    const res = await request(API_URL)
      .get("/api/user-profile")
      .set("Authorization", `Bearer ${userToken}`);

    console.log("🟢 GET /api/user-profile response:", res.statusCode, res.body);

    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty("user");
    expect(res.body.user).toHaveProperty("email");
  });

  test("✏️ PUT /api/user-profile ažurira podatke o korisniku", async () => {
    const updateData = {
      ime: "TestIme",
      prezime: "TestPrezime",
      datum_rodenja: "2000-01-01"
    };

    const res = await request(API_URL)
      .put("/api/user-profile")
      .set("Authorization", `Bearer ${userToken}`)
      .send(updateData);

    console.log("🟢 PUT /api/user-profile response:", res.statusCode, res.body);

    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty("message");
  });
});
