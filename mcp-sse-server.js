/**
 * MCP-over-SSE Server for FileBridge
 *
 * Wraps FileBridge REST API in MCP protocol over Server-Sent Events.
 * Enables ChatGPT Developer Mode to connect to FileBridge as Cognate Bridge.
 */

import express from "express";
import cors from "cors";

const app = express();
app.use(cors());
app.use(express.json());

// FileBridge REST API base URL
const FILEBRIDGE_URL = process.env.FILEBRIDGE_URL || "http://localhost:3100";

// MCP Tool definitions
const TOOLS = [
  {
    name: "read_file",
    description: "Read file contents from the DGX filesystem",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Relative path to file" }
      },
      required: ["path"]
    }
  },
  {
    name: "write_file",
    description: "Write content to a file on the DGX filesystem",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Relative path to file" },
        content: { type: "string", description: "File content to write" }
      },
      required: ["path", "content"]
    }
  },
  {
    name: "append_file",
    description: "Append content to an existing file",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Relative path to file" },
        content: { type: "string", description: "Content to append" }
      },
      required: ["path", "content"]
    }
  },
  {
    name: "list_files",
    description: "List files and directories at a path",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Relative path to directory" }
      },
      required: ["path"]
    }
  },
  {
    name: "delete_file",
    description: "Delete a file from the filesystem",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Relative path to file to delete" }
      },
      required: ["path"]
    }
  },
  {
    name: "mkdir",
    description: "Create a directory (and parent directories if needed)",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Relative path for new directory" }
      },
      required: ["path"]
    }
  },
  {
    name: "git_status",
    description: "Get the current git status of the repository",
    inputSchema: {
      type: "object",
      properties: {}
    }
  },
  {
    name: "git_commit",
    description: "Stage all changes and commit with a message",
    inputSchema: {
      type: "object",
      properties: {
        message: { type: "string", description: "Commit message" }
      },
      required: ["message"]
    }
  },
  {
    name: "hash_file",
    description: "Calculate SHA-256 hash of a file",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Relative path to file" }
      },
      required: ["path"]
    }
  }
];

// Map MCP tool names to FileBridge endpoints
const TOOL_ENDPOINTS = {
  read_file: "/read_file",
  write_file: "/write_file",
  append_file: "/append_file",
  list_files: "/list_files",
  delete_file: "/delete_file",
  mkdir: "/mkdir",
  git_status: "/git_status",
  git_commit: "/git_commit",
  hash_file: "/hash_file"
};

// Call FileBridge REST API
async function callFileBridge(endpoint, body) {
  const response = await fetch(`${FILEBRIDGE_URL}${endpoint}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  return response.json();
}

// Store active SSE connections
const sseConnections = new Map();

// SSE endpoint for MCP protocol - establishes the event stream
app.get("/sse", (req, res) => {
  // Set SSE headers
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("Access-Control-Allow-Origin", "*");

  // Generate session ID and store connection
  const sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  sseConnections.set(sessionId, res);

  // Send endpoint event so client knows where to POST messages
  res.write(`event: endpoint\ndata: /message?sessionId=${sessionId}\n\n`);

  // Keep connection alive
  const keepAlive = setInterval(() => {
    res.write(": keepalive\n\n");
  }, 30000);

  req.on("close", () => {
    clearInterval(keepAlive);
    sseConnections.delete(sessionId);
  });
});

// Message endpoint - receives MCP requests, sends responses via SSE
app.post("/message", async (req, res) => {
  const sessionId = req.query.sessionId;
  const sseRes = sseConnections.get(sessionId);

  if (!sseRes) {
    res.status(400).json({ error: "Invalid or expired session" });
    return;
  }

  const message = req.body;

  try {
    let result;

    // Handle different MCP methods
    if (message.method === "initialize") {
      result = {
        jsonrpc: "2.0",
        id: message.id,
        result: {
          protocolVersion: "2024-11-05",
          capabilities: {
            tools: {}
          },
          serverInfo: {
            name: "cognate-bridge",
            version: "1.0.0"
          }
        }
      };
    } else if (message.method === "tools/list") {
      result = {
        jsonrpc: "2.0",
        id: message.id,
        result: {
          tools: TOOLS
        }
      };
    } else if (message.method === "tools/call") {
      const { name, arguments: args } = message.params;
      const endpoint = TOOL_ENDPOINTS[name];

      if (!endpoint) {
        result = {
          jsonrpc: "2.0",
          id: message.id,
          error: {
            code: -32601,
            message: `Unknown tool: ${name}`
          }
        };
      } else {
        // Call FileBridge
        const fbResult = await callFileBridge(endpoint, args || {});

        result = {
          jsonrpc: "2.0",
          id: message.id,
          result: {
            content: [
              {
                type: "text",
                text: JSON.stringify(fbResult, null, 2)
              }
            ]
          }
        };
      }
    } else {
      result = {
        jsonrpc: "2.0",
        id: message.id,
        error: {
          code: -32601,
          message: `Method not found: ${message.method}`
        }
      };
    }

    // Send response via SSE stream
    sseRes.write(`event: message\ndata: ${JSON.stringify(result)}\n\n`);

    // Also respond to the POST request
    res.json({ status: "ok" });

  } catch (error) {
    const errorResult = {
      jsonrpc: "2.0",
      id: message.id,
      error: {
        code: -32603,
        message: error.message
      }
    };
    sseRes.write(`event: message\ndata: ${JSON.stringify(errorResult)}\n\n`);
    res.status(500).json({ error: error.message });
  }
});

// Legacy MCP endpoint (for testing)
app.post("/mcp", async (req, res) => {
  const message = req.body;

  try {
    // Handle different MCP methods
    if (message.method === "initialize") {
      res.json({
        jsonrpc: "2.0",
        id: message.id,
        result: {
          protocolVersion: "2024-11-05",
          capabilities: {
            tools: {}
          },
          serverInfo: {
            name: "cognate-bridge",
            version: "1.0.0"
          }
        }
      });
    } else if (message.method === "tools/list") {
      res.json({
        jsonrpc: "2.0",
        id: message.id,
        result: {
          tools: TOOLS
        }
      });
    } else if (message.method === "tools/call") {
      const { name, arguments: args } = message.params;
      const endpoint = TOOL_ENDPOINTS[name];

      if (!endpoint) {
        res.json({
          jsonrpc: "2.0",
          id: message.id,
          error: {
            code: -32601,
            message: `Unknown tool: ${name}`
          }
        });
        return;
      }

      // Call FileBridge
      const result = await callFileBridge(endpoint, args || {});

      res.json({
        jsonrpc: "2.0",
        id: message.id,
        result: {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2)
            }
          ]
        }
      });
    } else {
      res.json({
        jsonrpc: "2.0",
        id: message.id,
        error: {
          code: -32601,
          message: `Method not found: ${message.method}`
        }
      });
    }
  } catch (error) {
    res.json({
      jsonrpc: "2.0",
      id: message.id,
      error: {
        code: -32603,
        message: error.message
      }
    });
  }
});

// Health check
app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    service: "Cognate Bridge MCP-SSE",
    filebridge: FILEBRIDGE_URL
  });
});

const PORT = process.env.MCP_PORT || 3101;
app.listen(PORT, () => {
  console.log(`Cognate Bridge MCP-SSE server on port ${PORT}`);
  console.log(`FileBridge backend: ${FILEBRIDGE_URL}`);
});
