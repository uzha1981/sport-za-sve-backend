// index.js
import server from "./app.js";

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`✅ Server je pokrenut na portu ${PORT}`);
});
