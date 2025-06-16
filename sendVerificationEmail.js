import axios from "axios";

console.log("🌍 ENV | TEST_MODE:", process.env.TEST_MODE, "| NODE_ENV:", process.env.NODE_ENV);

export default async function sendVerificationEmail(email, token) {
  // Generiraj link za verifikaciju
  const baseUrl = process.env.BASE_URL || "http://localhost:3001";
  const verificationLink = `${baseUrl}/api/verify-email?token=${token}`;
  console.log("🔗 Verifikacijski link:", verificationLink);

  // ⛔️ Preskoči slanje emaila u testnom okruženju, ali logiraj link
  if (process.env.TEST_MODE === "true" || process.env.NODE_ENV === "test") {
    console.log("📭 [TEST MODE] Email se ne šalje:", email);
    console.log("📭 [TEST MODE] Koristi ovaj link za verifikaciju:", verificationLink);
    return { id: "mock-email-id", verificationLink };
  }

  try {
    // Pripremi i pošalji stvarni email putem Resend servisa
    const response = await axios.post(
      "https://api.resend.com/emails",
      {
        from: "Sport za sve <noreply@sportzasve.app>",
        to: email,
        subject: "Verifikacija emaila",
        html: `
          <div style="font-family: sans-serif; padding: 20px;">
            <h2>Dobrodošli u Sport za sve!</h2>
            <p>Molimo potvrdite svoju email adresu klikom na poveznicu ispod:</p>
            <a href="${verificationLink}" style="display: inline-block; margin-top: 10px; padding: 10px 20px; background-color: #3B82F6; color: white; text-decoration: none; border-radius: 5px;">Potvrdi email</a>
            <p style="margin-top: 20px;">Ako niste vi zatražili registraciju, slobodno ignorirajte ovu poruku.</p>
          </div>
        `,
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
          "Content-Type": "application/json",
        },
      }
    );

    console.log("📧 Verifikacijski email poslan:", response.data);
    return response.data;
  } catch (error) {
    console.error("❌ Greška pri slanju emaila:", error?.response?.data || error.message);
    throw new Error("Slanje emaila nije uspjelo.");
  }
}
