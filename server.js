#!/usr/bin/env node
/**
 * EP2 FileBridge MCP Server
 *
 * Provides file and git operations for cross-substrate collaboration.
 * Configurable via FILEBRIDGE_ROOT environment variable.
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import fs from "fs";
import path from "path";
import simpleGit from "simple-git";
import crypto from "crypto";

// Configurable root directory
const FILEBRIDGE_ROOT = process.env.FILEBRIDGE_ROOT || "/home/jim00/ep2";
const git = simpleGit(FILEBRIDGE_ROOT);

function safePath(p) {
  const resolved = path.resolve(FILEBRIDGE_ROOT, p);
  if (!resolved.startsWith(FILEBRIDGE_ROOT)) {
    throw new Error("Access outside repository not permitted.");
  }
  return resolved;
}

const server = new Server(
  {
    name: "EP2-FileBridge",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// List available tools
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    { name: "write_file", description: "Write content to a file", inputSchema: { type: "object", properties: { path: { type: "string", description: "Relative path within repository" }, content: { type: "string", description: "Content to write" } }, required: ["path", "content"] } },
    { name: "read_file", description: "Read content from a file", inputSchema: { type: "object", properties: { path: { type: "string", description: "Relative path within repository" } }, required: ["path"] } },
    { name: "append_file", description: "Append content to a file", inputSchema: { type: "object", properties: { path: { type: "string" }, content: { type: "string" } }, required: ["path", "content"] } },
    { name: "mkdir", description: "Create a directory", inputSchema: { type: "object", properties: { path: { type: "string" } }, required: ["path"] } },
    { name: "list_files", description: "List files in a directory", inputSchema: { type: "object", properties: { path: { type: "string" } }, required: ["path"] } },
    { name: "delete_file", description: "Delete a file", inputSchema: { type: "object", properties: { path: { type: "string" } }, required: ["path"] } },
    { name: "git_status", description: "Get git status", inputSchema: { type: "object", properties: {} } },
    { name: "git_commit", description: "Commit changes", inputSchema: { type: "object", properties: { message: { type: "string" } }, required: ["message"] } },
    { name: "git_push", description: "Push to remote", inputSchema: { type: "object", properties: { branch: { type: "string" } }, required: ["branch"] } },
    { name: "git_pull", description: "Pull from remote", inputSchema: { type: "object", properties: { branch: { type: "string" } }, required: ["branch"] } },
    { name: "hash_file", description: "Get SHA256 hash of a file", inputSchema: { type: "object", properties: { path: { type: "string" } }, required: ["path"] } },
    { name: "list_recent_changes", description: "List recent git commits", inputSchema: { type: "object", properties: {} } }
  ]
}));

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case "write_file": {
        const abs = safePath(args.path);
        await fs.promises.mkdir(path.dirname(abs), { recursive: true });
        await fs.promises.writeFile(abs, args.content, "utf8");
        return { content: [{ type: "text", text: JSON.stringify({ status: "ok", path: args.path }) }] };
      }
      case "read_file": {
        const abs = safePath(args.path);
        const content = await fs.promises.readFile(abs, "utf8");
        return { content: [{ type: "text", text: JSON.stringify({ status: "ok", content }) }] };
      }
      case "append_file": {
        const abs = safePath(args.path);
        await fs.promises.appendFile(abs, args.content, "utf8");
        return { content: [{ type: "text", text: JSON.stringify({ status: "ok", path: args.path }) }] };
      }
      case "mkdir": {
        const abs = safePath(args.path);
        await fs.promises.mkdir(abs, { recursive: true });
        return { content: [{ type: "text", text: JSON.stringify({ status: "ok", path: args.path }) }] };
      }
      case "list_files": {
        const abs = safePath(args.path);
        const files = await fs.promises.readdir(abs, { withFileTypes: true });
        const result = files.map(f => ({ name: f.name, isDirectory: f.isDirectory() }));
        return { content: [{ type: "text", text: JSON.stringify({ status: "ok", files: result }) }] };
      }
      case "delete_file": {
        const abs = safePath(args.path);
        await fs.promises.unlink(abs);
        return { content: [{ type: "text", text: JSON.stringify({ status: "ok", path: args.path }) }] };
      }
      case "git_status": {
        const status = await git.status();
        return { content: [{ type: "text", text: JSON.stringify({ status: "ok", git_status: status }) }] };
      }
      case "git_commit": {
        await git.add(".");
        const result = await git.commit(args.message);
        return { content: [{ type: "text", text: JSON.stringify({ status: "ok", commit: result }) }] };
      }
      case "git_push": {
        const result = await git.push("origin", args.branch);
        return { content: [{ type: "text", text: JSON.stringify({ status: "ok", push: result }) }] };
      }
      case "git_pull": {
        const result = await git.pull("origin", args.branch);
        return { content: [{ type: "text", text: JSON.stringify({ status: "ok", pull: result }) }] };
      }
      case "hash_file": {
        const abs = safePath(args.path);
        const content = await fs.promises.readFile(abs);
        const hash = crypto.createHash("sha256").update(content).digest("hex");
        return { content: [{ type: "text", text: JSON.stringify({ status: "ok", hash }) }] };
      }
      case "list_recent_changes": {
        const log = await git.log({ maxCount: 10 });
        return { content: [{ type: "text", text: JSON.stringify({ status: "ok", commits: log.all }) }] };
      }
      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error) {
    return { content: [{ type: "text", text: JSON.stringify({ status: "error", error: error.message }) }], isError: true };
  }
});

// Start server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(`EP2-FileBridge MCP server running (root: ${FILEBRIDGE_ROOT})`);
}

main().catch(console.error);
