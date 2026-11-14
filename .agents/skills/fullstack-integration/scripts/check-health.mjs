import http from "node:http";

function checkEndpoint(name, url) {
  return new Promise((resolve) => {
    const req = http.get(url, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        if (res.statusCode && res.statusCode >= 200 && res.statusCode < 400) {
          console.log(`  ✓ ${name} online: ${url} (Status: ${res.statusCode})`);
          resolve(true);
        } else {
          console.log(`  ⚠ ${name} returned status ${res.statusCode}: ${url}`);
          resolve(false);
        }
      });
    });

    req.on("error", (err) => {
      console.log(`  ✗ ${name} unreachable at ${url}: ${err.message}`);
      resolve(false);
    });

    req.setTimeout(2500, () => {
      req.destroy();
      console.log(`  ✗ ${name} timed out at ${url}`);
      resolve(false);
    });
  });
}

async function run() {
  console.log("Checking Fullstack Services Health...\n");
  const webOk = await checkEndpoint("Next.js Frontend", "http://localhost:3000");
  const apiOk = await checkEndpoint("FastAPI Backend", "http://localhost:8000/health");

  console.log("\nSummary:");
  console.log(`- Web (localhost:3000): ${webOk ? "ACTIVE" : "OFFLINE (run 'npm run dev')"}`);
  console.log(`- API (localhost:8000): ${apiOk ? "ACTIVE" : "OFFLINE (run 'npm run dev')"}`);
}

run();

