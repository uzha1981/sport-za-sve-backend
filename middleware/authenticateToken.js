import jwt from "jsonwebtoken";

export default function authenticateToken(req, res, next) {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) return res.status(401).json({ error: "Token nije poslan" });
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: "Neispravan token" });
  }
}

// novi middleware za admin-only rute
export function authenticateAdmin(req, res, next) {
  authenticateToken(req, res, () => {
    if (req.user.role !== "admin") {
      return res.status(403).json({ error: "Pristup dozvoljen samo adminima." });
    }
    next();
  });
}
