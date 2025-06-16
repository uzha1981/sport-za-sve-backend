// test-runner.js
import { createServer } from 'http';
import app from './app.js';
import { exec } from 'child_process';

const PORT = process.env.PORT || 3001;

// Pokreni server
const server = createServer(app);

server.listen(PORT, () => {
  console.log(`🟢 Test server pokrenut na http://localhost:${PORT}`);

  // Pokreni testove kad je server spreman
  const jestCmd = 'cross-env NODE_ENV=test node --experimental-vm-modules node_modules/jest/bin/jest.js --runInBand';

  const jestProcess = exec(jestCmd);

  jestProcess.stdout.on('data', (data) => process.stdout.write(data));
  jestProcess.stderr.on('data', (data) => process.stderr.write(data));

  jestProcess.on('close', (code) => {
    console.log(`🔚 Testovi završeni s kodom: ${code}`);
    server.close(() => process.exit(code));
  });
});
