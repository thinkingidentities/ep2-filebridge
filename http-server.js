/**
 * EP2 FileBridge HTTP Server
 *
 * REST API wrapper for FileBridge operations.
 * Used by ChatGPT Custom GPT Actions via Cloudflare tunnel.
 * Configurable via FILEBRIDGE_ROOT environment variable.
 */

import express from "express";
import fs from "fs";
import path from "path";
import simpleGit from "simple-git";
import crypto from "crypto";

// Configurable root directory
const FILEBRIDGE_ROOT = process.env.FILEBRIDGE_ROOT || "/home/jim00/ep2";
const git = simpleGit(FILEBRIDGE_ROOT);
const app = express();
app.use(express.json());

function safePath(p) {
  const resolved = path.resolve(FILEBRIDGE_ROOT, p);
  if (!resolved.startsWith(FILEBRIDGE_ROOT)) {
    throw new Error("Access outside repository not permitted.");
  }
  return resolved;
}

// File operations
app.post("/write_file", async (req, res) => {
  try {
    const abs = safePath(req.body.path);
    await fs.promises.mkdir(path.dirname(abs), { recursive: true });
    await fs.promises.writeFile(abs, req.body.content, "utf8");
    res.json({ status: "ok", path: req.body.path });
  } catch (e) { res.status(500).json({ status: "error", error: e.message }); }
});

app.post("/read_file", async (req, res) => {
  try {
    const abs = safePath(req.body.path);
    const content = await fs.promises.readFile(abs, "utf8");
    res.json({ status: "ok", content });
  } catch (e) { res.status(500).json({ status: "error", error: e.message }); }
});

app.post("/append_file", async (req, res) => {
  try {
    const abs = safePath(req.body.path);
    await fs.promises.appendFile(abs, req.body.content, "utf8");
    res.json({ status: "ok", path: req.body.path });
  } catch (e) { res.status(500).json({ status: "error", error: e.message }); }
});

app.post("/list_files", async (req, res) => {
  try {
    const abs = safePath(req.body.path);
    const files = await fs.promises.readdir(abs, { withFileTypes: true });
    const result = files.map(f => ({ name: f.name, isDirectory: f.isDirectory() }));
    res.json({ status: "ok", files: result });
  } catch (e) { res.status(500).json({ status: "error", error: e.message }); }
});

app.post("/delete_file", async (req, res) => {
  try {
    const abs = safePath(req.body.path);
    await fs.promises.unlink(abs);
    res.json({ status: "ok", path: req.body.path });
  } catch (e) { res.status(500).json({ status: "error", error: e.message }); }
});

app.post("/mkdir", async (req, res) => {
  try {
    const abs = safePath(req.body.path);
    await fs.promises.mkdir(abs, { recursive: true });
    res.json({ status: "ok", path: req.body.path });
  } catch (e) { res.status(500).json({ status: "error", error: e.message }); }
});

// Git operations
app.post("/git_status", async (req, res) => {
  try {
    const status = await git.status();
    res.json({ status: "ok", git_status: status });
  } catch (e) { res.status(500).json({ status: "error", error: e.message }); }
});

app.post("/git_commit", async (req, res) => {
  try {
    await git.add(".");
    const result = await git.commit(req.body.message);
    res.json({ status: "ok", commit: result });
  } catch (e) { res.status(500).json({ status: "error", error: e.message }); }
});

app.post("/hash_file", async (req, res) => {
  try {
    const abs = safePath(req.body.path);
    const content = await fs.promises.readFile(abs);
    const hash = crypto.createHash("sha256").update(content).digest("hex");
    res.json({ status: "ok", hash });
  } catch (e) { res.status(500).json({ status: "error", error: e.message }); }
});

app.get("/health", (req, res) => res.json({
  status: "ok",
  service: "EP2-FileBridge",
  root: FILEBRIDGE_ROOT
}));

const PORT = process.env.PORT || 3100;
app.listen(PORT, () => console.log(`EP2-FileBridge HTTP server on port ${PORT} (root: ${FILEBRIDGE_ROOT})`));
