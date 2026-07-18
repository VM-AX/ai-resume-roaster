const app = require("./app");
const env = require("./config/env");
const { connectDB } = require("./config/db");

async function start() {
  try {
    await connectDB();

    app.listen(env.port, () => {
      console.log(
        `Server listening on http://localhost:${env.port} (${env.nodeEnv})`
      );
    });
  } catch (err) {
    console.error("Failed to start server", err.message);
    process.exit(1);
  }
}

start();