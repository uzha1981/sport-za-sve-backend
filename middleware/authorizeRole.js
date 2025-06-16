import jwt from "jsonwebtoken";

export default function authorizeRole(requiredRole) {
  return (req, res, next) => {
    const auth = req.headers["authorization"];
    if (!auth) return res.status(401).json({ error: "Token nije poslan." });

    const token = auth.split(" ")[1];
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      if (decoded.role !== requiredRole) {
        return res.status(403).json({ error: "Nedozvoljen pristup." });
      }
      req.user = decoded;
      next();
    } catch (err) {
      return res.status(401).json({ error: "Neispravan token." });
    }
  };
}
