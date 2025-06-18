// routes.js

// učitaj env varijable
import "./config.js";

// core moduli
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

// auth i hash
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

// file upload
import multer from "multer";

// validacija body-ja
import { body, validationResult } from "express-validator";

// vlastiti moduli
import sendVerificationEmail from "./sendVerificationEmail.js";
import authenticateToken, { authenticateAdmin } from "./middleware/authenticateToken.js";
import supabase from "./supabaseClient.js";

import { stripe } from "./app.js";
import { io, onlineUsers } from "./app.js"




export default function setupRoutes(app) {
  // --- TEST-ONLY: auto-reset baze na startu
  if (process.env.TEST_MODE) {
    (async () => {
      try {
        await supabase.from("referrals").delete().neq("id", "");
        await supabase.from("payments").delete().neq("id", "");
        await supabase.from("activities").delete().neq("id", "");
        await supabase.from("users").delete().neq("id", "");
        await supabase.from("clubs").delete().neq("id", "");
      } catch (err) {
        console.error("❌ Auto-reset baze:", err);
      }
    })();
  }

// Stripe onboarding ruta
  app.get("/api/stripe/onboard-club", authenticateToken, async (req, res) => {
  console.log("🔍 [DEBUG] /api/stripe/onboard-club - req.user:", req.user);
  try {
    const { sub: userId, role } = req.user;
    if (role !== "klub") {
      return res.status(403).json({ error: "Samo klubovi mogu se onboardati." });
    }

    // 1) Dohvati email kluba iz baze (da ga proslijediš Stripeu)
    const { data: klubRec, error: klubError } = await supabase
      .from("users")
      .select("email, stripe_account_id")
      .eq("id", userId)
      .single();

    if (klubError || !klubRec) {
      console.error("❌ Greška pri dohvaćanju kluba:", klubError);
      return res.status(404).json({ error: "Klub nije pronađen." });
    }

    // Ako već imaš stripe_account_id, generiraj samo AccountLink:
    if (klubRec.stripe_account_id) {
      console.log("🔍 [DEBUG] Klub već ima Stripe ID, kreiramo AccountLink…");
      const accountLink = await stripe.accountLinks.create({
        account: klubRec.stripe_account_id,
        refresh_url: `${process.env.BASE_URL}/club-profile`,
        return_url: `${process.env.BASE_URL}/club-profile`,
        type: "account_onboarding",
      });
      return res.json({ url: accountLink.url });
    }

    // 2) Ako nemamo stripe_account_id, prvo kreirajmo novi Express account
    console.log("🔍 [DEBUG] Kreiram novi Express account na Stripeu…");
    const account = await stripe.accounts.create({
      type: "express",
      country: "HR", // može i “US” ili drugi, ali obično želite zemlju poslovanja
      email: klubRec.email,
      capabilities: {
        card_payments: { requested: true },
        transfers:    { requested: true }
      },
    });
    console.log("🔍 [DEBUG] Novi Stripe Account ID:", account.id);

    // 3) Spremi stripe_account_id u bazu
    const { error: saveErr } = await supabase
      .from("users")
      .update({ stripe_account_id: account.id })
      .eq("id", userId);
    if (saveErr) {
      console.error("❌ Greška pri spremanju stripe_account_id:", saveErr);
      // Ipak nastavimo s generiranjem AccountLink; baza nije kritična za onboarding korisnika u Stripe
    }

    // 4) Kreiraj AccountLink za onboard proces
    const accountLink = await stripe.accountLinks.create({
      account: account.id,
      refresh_url: `${process.env.BASE_URL}/club-profile`,
      return_url: `${process.env.BASE_URL}/club-profile`,
      type: "account_onboarding",
    });
    console.log("🔍 [DEBUG] Stripe AccountLink URL:", accountLink.url);

    return res.json({ url: accountLink.url });
  } catch (err) {
    console.error("❌ [ERROR] /api/stripe/onboard-club:", err);
    return res.status(500).json({ error: "Ne mogu pokrenuti Stripe onboarding." });
  }
});

  
  // === TEST-ONLY: resetiranje baze preko API-ja ===
  if (process.env.TEST_MODE) {
    app.delete("/api/test-utils/reset", async (req, res) => {
      try {
        await supabase.from("referrals").delete().neq("id", "");
        await supabase.from("payments").delete().neq("id", "");
        await supabase.from("activities").delete().neq("id", "");
        await supabase.from("users").delete().neq("id", "");
        await supabase.from("clubs").delete().neq("id", "");
        return res.sendStatus(200);
      } catch (err) {
        console.error("❌ Greška pri /api/test-utils/reset:", err);
        return res.status(500).json({ error: "Ne mogu resetirati bazu" });
      }
    });
  }

  // helperi
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const upload = multer({ dest: "uploads/" });

  function generateToken(user) {
    return jwt.sign(
      { sub: user.id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: "1h" }
    );
  }

  function generateReferralCode(length = 8) {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    let code = "";
    for (let i = 0; i < length; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
  }

  // ✅ Health check
  app.get("/health", (req, res) => {
    res.status(200).send("OK");
  });

  // ✅ Verifikacija emaila s HTML prikazom
  app.get("/api/verify-email", async (req, res) => {
    const { token } = req.query;
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const { error } = await supabase
        .from("users")
        .update({ is_verified: true })
        .eq("id", decoded.sub);

      if (error) return res.status(500).send("Greška pri verifikaciji korisnika.");

      res.send(`<!DOCTYPE html><html lang="hr"><head><meta charset="UTF-8" />
        <title>Email potvrđen ✅</title><meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <style>body { font-family: 'Segoe UI', sans-serif; background-color: #f6f9fc; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; }
        .card { background: white; padding: 40px; border-radius: 12px; box-shadow: 0 8px 24px rgba(0, 0, 0, 0.08); text-align: center; max-width: 400px; }
        h1 { color: #28a745; } a.button { display: inline-block; margin-top: 20px; padding: 10px 20px; background-color: #28a745; color: white; text-decoration: none; border-radius: 6px; }
        a.button:hover { background-color: #218838; } .logo { width: 100px; margin-bottom: 20px; }</style></head><body>
        <div class="card"><img src="https://jcrfxnwogbbpaasxaiov.supabase.co/storage/v1/object/public/public-assets/Logo-Sportzasve.png" alt="Logo" class="logo" />
        <h1>Email potvrđen ✅</h1><p>Hvala što ste potvrdili svoju email adresu.<br />Sada se možete prijaviti u aplikaciju.</p>
        <a class="button" href="http://localhost:3000/login">Prijavi se</a></div></body></html>`);
    } catch {
      res.status(400).send("❌ Token nije ispravan ili je istekao.");
    }
  });

  // ✅ Registracija korisnika
  app.post(
    "/api/register",
    [ body("email").isEmail(), body("password").isLength({ min: 6 }) ],
    async (req, res) => {
      try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

        const { email, password, role, naziv_kluba, grad, oib, referral, referral_percentage } = req.body;
        const { data: existingUser } = await supabase.from("users").select("id").eq("email", email).single();
        if (existingUser) return res.status(400).json({ error: "Korisnik već postoji." });

        let referred_by = null;
        if (referral) {
          const { data: refUser } = await supabase.from("users").select("id").eq("referral_code", referral).single();
          if (!refUser) return res.status(400).json({ error: "Neispravan referral kod." });
          referred_by = refUser.id;
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        const newReferralCode = generateReferralCode();

        const insertData = {
          email,
          password: hashedPassword,
          is_verified: false,
          role: role || "user",
          referral_code: newReferralCode,
          referred_by,
        };
        if (role === "klub") {
          insertData.naziv_kluba = naziv_kluba;
          insertData.grad = grad;
          insertData.oib = oib;
          insertData.referral_percentage = referral_percentage || 10;
        }

        const { data, error } = await supabase.from("users").insert([insertData]).select().single();
        if (error) return res.status(500).json({ error: "Greška kod spremanja korisnika." });

        const token = generateToken(data);
        await sendVerificationEmail(email, token);
        res.status(201).json({ message: "Korisnik uspješno registriran!", data, token });
      } catch (err) {
        console.error("❌ Greška u /api/register:", err);
        res.status(500).json({ error: "Greška na serveru." });
      }
    }
  );

  // ✅ Registracija kluba
  app.post(
    "/api/register-klub",
    [
      body("email").isEmail(),
      body("password").isLength({ min: 6 }),
      body("naziv_kluba").notEmpty(),
      body("grad").notEmpty(),
      body("oib").matches(/^\d{11}$/),
      body("referral_percentage").isInt({ min: 0, max: 100 }).optional()
    ],
    async (req, res) => {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

      const { email, password, naziv_kluba, grad, oib, referred_by, referral_percentage = 0 } = req.body;
      const { data: existingUser } = await supabase.from("users").select("id").eq("email", email).single();
      if (existingUser) return res.status(400).json({ error: "Korisnik već postoji." });

      let validReferrer = null;
      if (referred_by) {
        const { data: refUser } = await supabase.from("users").select("id").eq("referral_code", referred_by).single();
        if (!refUser) return res.status(400).json({ error: "Neispravan referral kod." });
        validReferrer = referred_by;
      }

      const hashedPassword = await bcrypt.hash(password, 10);
      const referral_code = generateReferralCode();

      const { data, error } = await supabase.from("users").insert([{
        email,
        password: hashedPassword,
        is_verified: false,
        role: "klub",
        naziv_kluba,
        grad,
        oib,
        referral_code,
        referred_by: validReferrer,
        referral_percentage
      }]).select().single();
      if (error) return res.status(500).json({ error: "Greška kod registracije kluba." });

      const token = generateToken(data);
      await sendVerificationEmail(email, token);
      res.status(201).json({ message: "Klub uspješno registriran!", data, token });
    }
  );

  // ✅ Login
  app.post("/api/login", async (req, res) => {
    const { email, password } = req.body;
    const { data: user, error } = await supabase.from("users").select("*").eq("email", email).single();
    if (error || !user) return res.status(401).json({ error: "Neispravan email ili lozinka." });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(401).json({ error: "Neispravan email ili lozinka." });
    if (!user.is_verified) return res.status(403).json({ error: "Molimo verificirajte email." });

    const token = generateToken(user);
    res.json({ message: "Prijava uspješna!", token });
  });

 // ✅ USER PROFILE
app.get("/api/user-profile", authenticateToken, async (req, res) => {
  const userId = req.user.sub;
  const { data, error } = await supabase
    .from("users")
    .select("id, email, referral_code, ime, prezime, datum_rodenja, role, klub_id, referred_by")
    .eq("id", userId)
    .single();
  if (error) return res.status(500).json({ error: "Greška na serveru." });
  res.json({ user: data });
});


app.put("/api/user-profile", authenticateToken, async (req, res) => {
  const { sub: id } = req.user;
  const { ime, prezime, datum_rodenja } = req.body;
  const { error } = await supabase
    .from("users")
    .update({ ime, prezime, datum_rodenja })
    .eq("id", id);
  if (error) return res.status(500).json({ error: "Greška kod ažuriranja profila." });
  res.json({ message: "✅ Profil ažuriran." });
});

// ► Popravljena ruta za dohvat profila kluba s detaljnim debug logom
app.get("/api/club-profile", authenticateToken, async (req, res) => {
  console.log("🔍 [DEBUG] /api/club-profile - req.user:", req.user);

  try {
    const { sub: userId, role } = req.user;
    console.log(`🔍 [DEBUG] Tražim red u users gdje id="${userId}" i role="${role}"`);

    if (role !== "klub") {
      console.log("🔍 [DEBUG] Nemate ispravnu ulogu za ovu rutu.");
      return res.status(403).json({ error: "Samo klubovi mogu vidjeti svoje podatke." });
    }

    // Pokrenemo upit i spremimo rezultat u promenljive
    const query = supabase
      .from("users")
      .select("id, email, naziv_kluba, grad, oib, logo_url, referral_percentage, stripe_account_id")
      .eq("id", userId)
      .eq("role", "klub")
      .single();
    
    // Ovdje eksplicitno čekamo ispis errora/data
    const { data: klub, error } = await query;
    console.log("🔍 [DEBUG] supabase response - data:", klub, " | error:", error);

    if (error || !klub) {
      console.log("🔍 [DEBUG] Nema pronađenog reda za ove uvjete ili je error:", error);
      return res.status(404).json({ error: "Klub nije pronađen." });
    }

    console.log("🔍 [DEBUG] Klub pronađen, vraćam JSON s objektom:", klub);
    return res.json({ klub });
  } catch (err) {
    console.error("❌ [ERROR] Nepredviđena greška na /api/club-profile:", err);
    return res.status(500).json({ error: "Greška pri dohvaćanju profila kluba." });
  }
});




// ► Ispravljena ruta za Stripe onboarding kluba (bez nepostojećeg stupca)
app.get("/api/stripe/onboard-club", authenticateToken, async (req, res) => {
  console.log("🔍 [DEBUG] /api/stripe/onboard-club - req.user:", req.user);
  try {
    const { sub: userId, role } = req.user;
    console.log(`🔍 [DEBUG] Pokušavam onboarding za userId="${userId}", role="${role}"`);

    if (role !== "klub") {
      console.log("🔍 [DEBUG] Nemate ispravnu ulogu za Stripe onboarding.");
      return res.status(403).json({ error: "Samo klubovi mogu ovo pozvati." });
    }

    // 1) Dohvati samo email iz tablice users (stripe_account_id ne postoji)
    const { data: klub, error } = await supabase
       .from("users")
        .select("id, email, naziv_kluba, grad, oib, logo_url, referral_percentage, stripe_account_id")
        .eq("id", userId)
        .eq("role", "klub")
        .single();

    console.log("🔍 [DEBUG] supabase response za fetching email - data:", user, "| error:", userError);

    if (userError) {
      console.log("🔍 [DEBUG] Greška pri dohvaćanju korisnika iz baze:", userError);
      return res.status(500).json({ error: "Greška kod dohvaćanja korisnika." });
    }

    if (!user) {
      console.log("🔍 [DEBUG] Nema korisnika s tim ID-jem:", userId);
      return res.status(404).json({ error: "Korisnik nije pronađen." });
    }

    // 2) S obzirom da stripe_account_id ne postoji u bazi, uvijek ćemo kreirati novi account
    console.log("🔍 [DEBUG] Kreiram novi Express account na Stripeu...");
    const acct = await stripe.accounts.create({
      type: "express",
      country: "HR",
      email: user.email,
    });
    const accountId = acct.id;
    console.log("🔍 [DEBUG] Novi Stripe Account ID:", accountId);

    // 3) Spremi novi accountId u Supabase – prethodno dodaj stupac u bazu
    const { error: updateError } = await supabase
      .from("users")
      .update({ stripe_account_id: accountId })
      .eq("id", userId);

    if (updateError) {
      console.log("🔍 [DEBUG] Greška pri spremanju stripe_account_id u bazu:", updateError);
      return res.status(500).json({ error: "Greška pri spremanju Stripe account ID-ja." });
    }

    // 4) Kreiraj AccountLink za onboarding flow
    console.log("🔍 [DEBUG] Kreiram Stripe AccountLink...");
    const accountLink = await stripe.accountLinks.create({
      account: accountId,
      refresh_url: `${process.env.BASE_URL}/dashboard`,
      return_url: `${process.env.BASE_URL}/dashboard`,
      type: "account_onboarding",
    });

    console.log("🔍 [DEBUG] Stripe AccountLink URL:", accountLink.url);
    return res.json({ url: accountLink.url });
  } catch (err) {
    console.error("Stripe onboarding error:", err);
    return res.status(500).json({ error: "Ne mogu pokrenuti Stripe onboarding." });
  }
});

// routes.js (dodaš ispod postojećih routa)

app.post("/api/stripe/create-payment-intent", authenticateToken, async (req, res) => {
    console.log("🔍 [DEBUG] /api/stripe/create-payment-intent - req.user:", req.user);
    try {
      // 1) Uzmemo userId i provjerimo ulogu
      const { sub: issuerId, role } = req.user;
      if (role !== "klub") {
        return res.status(403).json({ error: "Samo klubovi mogu kreirati PaymentIntent." });
      }

      // 2) Iz request body-a dohvatimo podatke: member_id i amount (€)
      const { member_id, amount } = req.body;
      if (!member_id || typeof amount !== "number") {
        return res
          .status(400)
          .json({ error: "Nedostaju ili su neispravni parametri: member_id, amount" });
      }

      // 3) Provjerimo da member doista pripada klubu issuerId
      //    i dohvatimo referred_by iz članova
      const { data: member, error: memberError } = await supabase
        .from("users")
        .select("id, klub_id, referred_by")
        .eq("id", member_id)
        .single();
      if (memberError || !member) {
        return res.status(404).json({ error: "Novi član nije pronađen." });
      }
      if (member.klub_id !== issuerId) {
        return res.status(400).json({ error: "Korisnik nije član ovog kluba." });
      }

      // 4) Dohvatimo referral_percentage i stripe_account_id iz kluba
      const { data: klub, error: klubError } = await supabase
        .from("users")
        .select("referral_percentage, stripe_account_id")
        .eq("id", issuerId)
        .single();
      if (klubError || !klub) {
        return res
          .status(404)
          .json({ error: "Klub nije pronađen ili nema postavljen referral postotak." });
      }
      const referralPct = klub.referral_percentage || 0;
      const clubStripeAccount = klub.stripe_account_id;
      if (!clubStripeAccount) {
        return res.status(400).json({ error: "Klub nije povezao Stripe račun." });
      }

      // 5) Izračunamo iznose u centima
      const amountCents = Math.round(amount * 100);
      const referralAmt = Math.floor((amountCents * referralPct) / 100); // npr. 10%
      const platformFeeAmt = Math.floor((amountCents * 3) / 100); // 3%
      const applicationFeeAmt = referralAmt + platformFeeAmt;

      console.log(
        "🔍 [DEBUG] amountCents:", amountCents,
        "| referralAmt:", referralAmt,
        "| platformFeeAmt:", platformFeeAmt,
        "| applicationFeeAmt:", applicationFeeAmt
      );

      // 6) Kreiramo Stripe PaymentIntent
      const paymentIntent = await stripe.paymentIntents.create({
        amount: amountCents,
        currency: "eur",
        application_fee_amount: applicationFeeAmt,
        transfer_data: {
          destination: clubStripeAccount,
        },
        metadata: {
          member_id,
          club_id: issuerId,
          referred_by: member.referred_by || "",
        },
      });

      console.log("🔍 [DEBUG] PaymentIntent created:", paymentIntent.id);
      return res.json({ client_secret: paymentIntent.client_secret });
    } catch (err) {
      console.error("❌ [ERROR] /api/stripe/create-payment-intent:", err);
      return res.status(500).json({ error: "Ne mogu kreirati PaymentIntent." });
    }
  });

app.get("/api/club-members", authenticateToken, async (req, res) => {
  try {
    // 1) Preuzmi userId i provjeri ulogu
    const { sub: userId, role } = req.user;
    if (role !== "klub") {
      // Ako nije klub, ne može dohvatiti svoje članove
      return res.status(403).json({ error: "Samo klubovi mogu vidjeti članove." });
    }

    // 2) Izvrši upit u Supabaseu: SELECT id, email FROM users WHERE klub_id = userId AND role = "user"
    const { data: members, error } = await supabase
      .from("users")
      .select("id, email")
      .eq("klub_id", userId)
      .eq("role", "user"); // dohvatimo samo obične korisnike

    if (error) {
      console.error("❌ Greška pri dohvaćanju članova kluba:", error);
      return res.status(500).json({ error: "Greška pri dohvaćanju članova." });
    }

    // 3) Vrati JSON s poljem members (array objekata { id, email })
    return res.json({ members });
  } catch (err) {
    console.error("❌ [ERROR] /api/club-members:", err);
    return res.status(500).json({ error: "Greška na serveru." });
  }
});


  // ✅ UPLOAD LOGO
  app.post("/api/upload-logo", authenticateToken, upload.single("logo"), async (req, res) => {
    const { role, sub: id } = req.user;
    if (role !== "klub") return res.status(403).json({ error: "Samo klubovi mogu uploadati logo." });
    const file = req.file;
    if (!file) return res.status(400).json({ error: "Logo nije poslan." });

    const fileExt = path.extname(file.originalname);
    const fileName = `logo-${id}-${Date.now()}${fileExt}`;
    const buffer = fs.readFileSync(file.path);
    fs.unlinkSync(file.path);

    const { error: uploadError } = await supabase.storage
      .from("public-assets")
      .upload(`club-logos/${fileName}`, buffer, { contentType: file.mimetype, upsert: true });
    if (uploadError) return res.status(500).json({ error: "Greška kod uploada." });

    const { data: publicUrlData } = supabase.storage.from("public-assets").getPublicUrl(`club-logos/${fileName}`);
    const { error: updateError } = await supabase.from("users").update({ logo_url: publicUrlData.publicUrl }).eq("id", id);
    if (updateError) return res.status(500).json({ error: "Logo je uploadan, ali nije spremljen u bazu." });

    res.json({ message: "✅ Logo uspješno postavljen!", logo_url: publicUrlData.publicUrl });
  });

  // ✅ MY KLUB
  app.get("/api/my-klub", authenticateToken, async (req, res) => {
    const { sub: userId, role } = req.user;
    if (role !== "user") return res.status(403).json({ error: "Samo korisnici imaju pristup ovom podatku." });
    const { data: user, error: userError } = await supabase.from("users").select("klub_id").eq("id", userId).single();
    if (userError || !user.klub_id) return res.status(404).json({ error: "Korisnik nije pridružen nijednom klubu." });

    const { data: klub, error: klubError } = await supabase
      .from("users")
      .select("id, email, naziv_kluba, grad, oib, logo_url")
      .eq("id", user.klub_id)
      .eq("role", "klub")
      .single();
    if (klubError) return res.status(404).json({ error: "Klub nije pronađen." });
    res.json({ klub });
  });

  // ✅ CLUBS
  app.get("/api/clubs", async (req, res) => {
    const { data, error } = await supabase.from("users").select("id, naziv_kluba, grad, oib, logo_url").eq("role", "klub");
    if (error) return res.status(500).json({ error: "Greška pri dohvaćanju klubova." });
    res.json(data);
  });

  // ✅ DODAJ AKTIVNOST
app.post("/api/activities", authenticateToken, async (req, res) => {
  const { role, sub: klub_id } = req.user;
  if (role !== "klub") return res.status(403).json({ error: "Samo klubovi mogu dodavati aktivnosti." });

  const { naziv, opis, lokacija, datum, vrijeme } = req.body;
  const { error } = await supabase
    .from("activities")
    .insert([{ klub_id, naziv, opis, lokacija, datum, vrijeme }]);

  if (error) {
    console.error("❌ Greška pri unosu aktivnosti:", error);
    return res.status(500).json({ error: "Greška pri unosu aktivnosti." });
  }

  // emit notifikaciju (npr. korisnicima kluba)
  const socketId = onlineUsers.get(klub_id);
  if (socketId) {
    io.to(socketId).emit("notification", {
      title: "Nova aktivnost",
      message: `Dodana je nova aktivnost: ${naziv}.`
    });
  }

  return res.status(201).json({ message: "✅ Aktivnost uspješno dodana!" });
});


// ✅ SVE AKTIVNOSTI (za kalendar)
app.get("/api/activities", authenticateToken, async (req, res) => {
  try {
    // Dohvati sve aktivnosti, uključujući naziv kluba
    const { data, error } = await supabase
      .from("activities")
      .select(`
        id,
        naziv,
        opis,
        lokacija,
        datum,
        vrijeme,
        klub:users(id, naziv_kluba)
      `)
      .order("datum", { ascending: true });

    if (error) {
      console.error("❌ Greška pri dohvaćanju aktivnosti:", error);
      return res.status(500).json({ error: "Greška pri dohvaćanju aktivnosti." });
    }

    return res.json(data);
  } catch (err) {
    console.error("❌ Nepredviđena greška na /api/activities:", err);
    return res.status(500).json({ error: "Greška pri dohvaćanju aktivnosti." });
  }
});



  app.get("/api/my-activities", authenticateToken, async (req, res) => {
    const { role, sub: klub_id } = req.user;
    if (role !== "klub") return res.status(403).json({ error: "Samo klubovi mogu vidjeti svoje aktivnosti." });
    const { data, error } = await supabase.from("activities").select("*").eq("klub_id", klub_id);
    if (error) return res.status(500).json({ error: "Greška kod dohvaćanja aktivnosti." });
    res.json({ aktivnosti: data });
  });

  app.put("/api/activities/:id", authenticateToken, async (req, res) => {
    const { role, sub: klub_id } = req.user;
    if (role !== "klub") return res.status(403).json({ error: "Samo klubovi mogu uređivati aktivnosti." });
    const { id } = req.params;
    const { naziv, opis, lokacija, datum, vrijeme } = req.body;
    const { error } = await supabase
      .from("activities")
      .update({ naziv, opis, lokacija, datum, vrijeme })
      .eq("id", id)
      .eq("klub_id", klub_id);
    if (error) return res.status(500).json({ error: "Greška pri uređivanju aktivnosti." });
    res.json({ message: "✅ Aktivnost uspješno uređena!" });
  });

  app.delete("/api/activities/:id", authenticateToken, async (req, res) => {
    const { role, sub: klub_id } = req.user;
    if (role !== "klub") return res.status(403).json({ error: "Samo klubovi mogu brisati aktivnosti." });
    const { id } = req.params;
    const { error } = await supabase.from("activities").delete().eq("id", id).eq("klub_id", klub_id);
    if (error) return res.status(500).json({ error: "Greška pri brisanju aktivnosti." });
    res.json({ message: "✅ Aktivnost uspješno obrisana!" });
  });

  // ✅ JOIN KLUB
app.post("/api/join-klub", authenticateToken, async (req, res) => {
  try {
    const { sub: userId, role } = req.user;
    if (role !== "user") {
      return res.status(403).json({ error: "Samo korisnici se mogu pridružiti klubu." });
    }

    const { klub_id } = req.body;
    if (!klub_id || typeof klub_id !== "string") {
      return res.status(400).json({ error: "Neispravan ili nedostaje klub_id." });
    }

    // Provjera da klub postoji
    const { data: klub, error: klubError } = await supabase
      .from("users")
      .select("id, email, naziv_kluba")
      .eq("id", klub_id)
      .eq("role", "klub")
      .single();
    if (klubError || !klub) {
      return res.status(400).json({ error: "Klub ne postoji." });
    }

    // Ažuriraj korisnika da bude član kluba
    const { error: updateError } = await supabase
      .from("users")
      .update({ klub_id })
      .eq("id", userId);
    if (updateError) {
      console.error("❌ [ERROR] Pridruživanje klubu:", updateError);
      return res.status(500).json({ error: "Greška pri pridruživanju klubu." });
    }

    // Emit real-time notifikacije klubu
    const socketId = onlineUsers.get(klub_id);
    if (socketId) {
      io.to(socketId).emit("notification", {
        title: "Novi član u klubu",
        message: `Korisnik ${userId} (${req.user.email || "email nepoznat"}) se pridružio vašem klubu ${klub.naziv_kluba}.`
      });
    }

    return res.json({ message: "Uspješno si se pridružio klubu." });
  } catch (err) {
    console.error("❌ [ERROR] /api/join-klub:", err);
    return res.status(500).json({ error: "Greška pri pridruživanju klubu." });
  }
});

  // ✅ NOTIFICATIONS
  app.post("/api/notifications", authenticateToken, async (req, res) => {
    const { sub: sender_id } = req.user;
    const { recipient_id, naslov, poruka } = req.body;
    if (!recipient_id || !naslov || !poruka) return res.status(400).json({ error: "Nedostaju obavezna polja." });
    const { error } = await supabase.from("notifications").insert([{ recipient_id, sender_id, naslov, poruka }]);
    if (error) return res.status(500).json({ error: "Greška pri slanju notifikacije." });
    res.status(201).json({ message: "✅ Notifikacija uspješno poslana." });
  });

  app.get("/api/my-notifications", authenticateToken, async (req, res) => {
    const { sub: user_id } = req.user;
    const { data, error } = await supabase.from("notifications").select("*").eq("recipient_id", user_id).order("created_at", { ascending: false });
    if (error) return res.status(500).json({ error: "Greška kod dohvaćanja notifikacija." });
    res.json({ notifikacije: data });
  });

  app.patch("/api/notifications/:id/read", authenticateToken, async (req, res) => {
    const { sub: user_id } = req.user;
    const { id } = req.params;
    const { error } = await supabase.from("notifications").update({ is_read: true }).eq("id", id).eq("recipient_id", user_id);
    if (error) return res.status(500).json({ error: "Greška pri označavanju notifikacije." });
    res.json({ message: "✅ Notifikacija označena kao pročitana." });
  });

  // ✅ MESSAGES
  app.post("/api/messages", authenticateToken, async (req, res) => {
    const { sub: sender_id } = req.user;
    const { recipient_id, message } = req.body;
    if (!recipient_id || !message) return res.status(400).json({ error: "Nedostaju obavezna polja." });
    const { error } = await supabase.from("messages").insert([{ sender_id, recipient_id, message }]);
    if (error) return res.status(500).json({ error: "Greška pri slanju poruke." });
    res.status(201).json({ message: "✅ Poruka uspješno poslana." });
  });

  // ✅ MY REFERRALS (preuzimanje iz tablice referrals)
app.get("/api/my-referrals", authenticateToken, async (req, res) => {
  try {
    const { sub: user_id, role } = req.user;

    // Samo obični korisnici mogu vidjeti svoje referral isplate
    if (role !== "user") {
      return res.status(403).json({ error: "Samo korisnici mogu vidjeti svoje preporuke." });
    }

    // Dohvati sve zapise za tog korisnika iz tablice referrals
    const { data: referrals, error } = await supabase
      .from("referrals")
      .select(`
        id,
        referred_user_id,
        amount,
        commission_amount,
        created_at
      `)
      .eq("user_id", user_id)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("❌ Greška kod dohvaćanja referral zapisa:", error);
      return res.status(500).json({ error: "Greška kod dohvaćanja preporučenih korisnika." });
    }

    res.json({ referrals });
  } catch (err) {
    console.error("❌ Neočekivana greška na /api/my-referrals:", err);
    res.status(500).json({ error: "Server error." });
  }
});


  // ✅ MY EARNINGS
  app.get("/api/my-earnings", authenticateToken, async (req, res) => {
    const { sub: user_id, role } = req.user;
    if (role !== "user") return res.status(403).json({ error: "Samo korisnici mogu vidjeti svoju zaradu od preporuka." });
    const { data, error } = await supabase.from("referrals").select("commission_amount").eq("user_id", user_id);
    if (error) return res.status(500).json({ error: "Greška kod dohvaćanja zarade." });
    const ukupno = data.reduce((sum, ref) => sum + (ref.commission_amount || 0), 0);
    res.json({ total_earnings: Number(ukupno.toFixed(2)) });
  });

  

// ✅ RECORD PAYMENT
app.post("/api/record-payment", authenticateToken, async (req, res) => {
  console.log("🔍 [DEBUG] /api/record-payment - req.user:", req.user, "body:", req.body);
  try {
    // 1) Samo klubovi mogu evidentirati uplate
    const { sub: klub_id, role } = req.user;
    if (role !== "klub") {
      return res.status(403).json({ error: "Samo klubovi mogu evidentirati uplate." });
    }

    // 2) Parametri iz body-ja
    const { member_id, amount } = req.body;
    if (!member_id || typeof amount !== "number") {
      return res
        .status(400)
        .json({ error: "Nedostaju ili su neispravni parametri: member_id, amount." });
    }

    // 3) Provjera da je member_id zaista član kluba
    const { data: user, error: userError } = await supabase
      .from("users")
      .select("klub_id, referred_by, email")
      .eq("id", member_id)
      .single();
    if (userError || !user) {
      return res.status(400).json({ error: "Korisnik nije pronađen." });
    }
    if (user.klub_id !== klub_id) {
      return res.status(400).json({ error: "Korisnik nije član vašeg kluba." });
    }

    // 4) Izračun provizije (ako je član bio preporučen)
    let commission = 0;
    if (user.referred_by) {
      const { data: klub, error: klubError } = await supabase
        .from("users")
        .select("referral_percentage")
        .eq("id", klub_id)
        .single();
      if (klubError || !klub) {
        return res.status(404).json({ error: "Klub nije pronađen." });
      }
      commission = (amount * klub.referral_percentage) / 100;
    }

    console.log(
      "🔍 [DEBUG] Evidentiram uplatu:",
      { klub_id, member_id, amount, commission }
    );

    // 5) Spremi u referrals tablicu
    const { error: saveError } = await supabase
      .from("referrals")
      .insert([{
        user_id: user.referred_by || null,      // kome ide provizija
        referred_user_id: member_id,
        club_id: klub_id,
        amount,
        commission_amount: commission
      }]);
    if (saveError) {
      console.error("❌ [ERROR] Spremanje referral isplate:", saveError);
      return res.status(500).json({ error: "Greška kod spremanja isplate." });
    }

    // 6) Emit real-time notifikaciju ako je netko preporučen
    if (user.referred_by) {
      const referrerId = user.referred_by;
      const socketId = onlineUsers.get(referrerId);
      if (socketId) {
        io.to(socketId).emit("notification", {
          title: "Nova provizija",
          message: `Dobio si ${commission.toFixed(2)} € od uplata člana ${user.email}.`
        });
      }
    }

    // 7) Vrati uspjeh
    return res
      .status(201)
      .json({
        message: "Uplata evidentirana i provizija isplaćena (ako je primjenjivo).",
        commission
      });
  } catch (err) {
    console.error("❌ [ERROR] /api/record-payment:", err);
    return res.status(500).json({ error: "Greška pri evidentiranju uplate." });
  }
});


  // ✅ ADMIN: referral payouts & total
  app.get("/api/admin/referral-payouts", authenticateAdmin, async (req, res) => {
    const { data, error } = await supabase.from("referrals").select(`
      id, created_at, amount, commission_amount,
      user_id:id, referred_user_id,
      club_id(id,naziv_kluba,grad,email)
    `).order("created_at",{ ascending: false });
    if (error) return res.status(500).json({ error: "Greška kod dohvaćanja isplata." });
    res.json({ isplate: data });
  });

  app.get("/api/admin/total-referral-payouts", authenticateAdmin, async (req, res) => {
    const { data, error } = await supabase.from("referrals").select("commission_amount");
    if (error) return res.status(500).json({ error: "Greška kod dohvaćanja isplata." });
    const ukupno = data.reduce((sum, r) => sum + (r.commission_amount||0), 0);
    res.json({ ukupno_isplaceno_eur: ukupno.toFixed(2) });
  });

// u routes.js, negdje ispod ostalih ruta
app.get("/api/club-members", authenticateToken, async (req, res) => {
  console.log("🔍 [DEBUG] /api/club-members - req.user:", req.user);
  try {
    const { sub: klubId, role } = req.user;

    if (role !== "klub") {
      return res.status(403).json({ error: "Samo klubovi mogu vidjeti članove." });
    }

    const { data: members, error } = await supabase
      .from("users")
      .select("id, email")
      .eq("klub_id", klubId)
      .eq("role", "user");

    console.log("🔍 [DEBUG] supabase /api/club-members - data:", members, "| error:", error);

    if (error) {
      return res.status(500).json({ error: "Greška pri dohvaćanju članova." });
    }
    return res.json({ members });
  } catch (err) {
    console.error("❌ [ERROR] /api/club-members:", err);
    return res.status(500).json({ error: "Greška na serveru." });
  }
});

// POST /api/request-payout
app.post(
  "/api/request-payout",
  authenticateToken,
  async (req, res) => {
    const { sub: userId, role } = req.user;
    if (role !== "user") {
      return res.status(403).json({ error: "Samo korisnici mogu zatražiti isplatu." });
    }

    // TODO: stvarno pohranjivati request u bazu ili poslati notifikaciju adminu
    console.log(`🔔 [PAYOUT] Korisnik ${userId} je zatražio isplatu.`);

    return res.json({ message: "Zahtjev za isplatu poslan. Uskoro ćemo te kontaktirati." });
  }
);


  // --- TEST-ONLY: reset baze ---
  if (process.env.TEST_MODE) {
    app.delete("/api/test-utils/reset", async (req, res) => {
      try {
        await supabase.from("referrals").delete().neq("id", "");
        await supabase.from("activities").delete().neq("id", "");
        await supabase.from("users").delete().neq("id", "");
        return res.status(200).json({ message: "Baza očišćena." });
      } catch (err) {
        console.error("Reset baze nije uspio:", err);
        return res.status(500).json({ error: "Greška pri resetiranju baze." });
      }
    });
  }
}
