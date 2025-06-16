import { jest } from "@jest/globals";
import request from "supertest";
import {
  createTestUserWithReferralAndPayment,
  createUnverifiedUser,
  verifyUserEmail,
} from "../test-utils.js";
import supabase from "../supabaseClient.js";

jest.setTimeout(20000);

let app;
let referrerToken;

describe("💸 MY EARNINGS API", () => {
  beforeAll(async () => {
    const mod = await import("../app.js");
    app = mod.default || mod;

    // Kreiraj korisnika koji je nekoga preporučio i ima proviziju
    const result = await createTestUserWithReferralAndPayment();
    referrerToken = result.referrerToken;
  });

  test("✅ Dohvaća zaradu od referral provizije", async () => {
    const res = await request(app)
      .get("/api/my-earnings")
      .set("Authorization", `Bearer ${referrerToken}`);

    expect(res.status).toBe(200);
    expect(res.body.total_earnings).toBeDefined();
    expect(typeof res.body.total_earnings).toBe("number");
    expect(res.body.total_earnings).toBeGreaterThanOrEqual(0);

  });

  test("❌ Neuspjeh bez tokena", async () => {
    const res = await request(app).get("/api/my-earnings");

    expect(res.status).toBe(401);
    expect(res.body.error).toBe("Token nije poslan");

  });

  test("✅ Korisnik bez referral zarade vraća 0", async () => {
    const result = await createUnverifiedUser();
    const userId = result.userId;

    await verifyUserEmail(userId); // Potrebno da se može logirati
    const token = result.token;

    const res = await request(app)
      .get("/api/my-earnings")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.total_earnings).toBe(0);
  });
});
