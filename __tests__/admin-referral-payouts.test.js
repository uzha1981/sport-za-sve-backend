import request from "supertest";
import app from "../app.js";
import { getAdminToken, createVerifiedUser } from "../test-utils.js";

describe("🛠️ Admin: total-referral-payouts", () => {
  it("🚫 bez tokena vraća 401", async () => {
    const res = await request(app).get("/api/admin/total-referral-payouts");
    expect(res.status).toBe(401);
  });

  it("🚫 non-admin vraća 403", async () => {
    const { token: userToken } = await createVerifiedUser();
    const res = await request(app)
      .get("/api/admin/total-referral-payouts")
      .set("Authorization", `Bearer ${userToken}`);
    expect(res.status).toBe(403);
  });

  it("✅ vraća zbroj svih commission_amount iz referrals", async () => {
    const adminToken = await getAdminToken();

    // 1) napravi referrera
    const { referralCode } = await createVerifiedUser();

    // 2) napravi referred korisnika uz referralCode
    const referred = await createVerifiedUser(referralCode);

    // 3) dva puta zabilježi uplatu za referred usera
    await request(app)
      .post("/api/record-payment")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ member_id: referred.userId, amount: 10 });

    await request(app)
      .post("/api/record-payment")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ member_id: referred.userId, amount: 10 });

    // 4) dohvati total referral payouts
    const res = await request(app)
      .get("/api/admin/total-referral-payouts")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("ukupno_isplaceno_eur", "20.00");
  });
});
