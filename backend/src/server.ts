import express from "express";

const app = express();
const port = Number(process.env.PORT ?? 8787);
const host = process.env.HOST ?? "127.0.0.1";

// Add backend routes here.
app.listen(port, host, () => {
  console.log(`Genie backend: http://${host}:${port}`);
});
