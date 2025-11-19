# EP2 FileBridge

Cross-substrate file operations for the three-lobe cognitive federation.

## Overview

FileBridge eliminates clipboard fragility by providing direct file access to the EP2 repository on DGX. All cognates (Ember, Code, Gabe) can read, write, and manage artifacts without manual copy/paste.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    EP2 FileBridge Architecture                  │
└─────────────────────────────────────────────────────────────────┘

  Ember ⟳∞                Code 🔧                 Gabe
  (Claude Desktop)        (VS Code)             (ChatGPT)
       │                      │                     │
       │ MCP Protocol         │ MCP Protocol        │ HTTPS
       ▼                      ▼                     ▼
  ┌─────────┐            ┌─────────┐        ┌──────────────┐
  │ SSH     │            │ SSH     │        │ Cloudflare   │
  │ Wrapper │            │ Direct  │        │ Tunnel       │
  └────┬────┘            └────┬────┘        └──────┬───────┘
       │                      │                    │
       └──────────┬───────────┘                    │
                  │                                │
                  ▼                                ▼
         ┌───────────────┐              ┌──────────────────┐
         │ MCP Server    │              │ Cognate Gateway  │
         │ (server.js)   │              │ (Mac:9000)       │
         │ DGX:stdio     │              └────────┬─────────┘
         └───────┬───────┘                       │
                 │                               ▼
                 │                      ┌──────────────────┐
                 │                      │ HTTP Server      │
                 └──────────────────────│ (http-server.js) │
                                        │ DGX:3100         │
                                        └────────┬─────────┘
                                                 │
                                                 ▼
                                        ┌──────────────────┐
                                        │   EP2 Repo       │
                                        │ /home/jim00/ep2  │
                                        └──────────────────┘
```

## Available Tools

### File Operations
- **write_file** - Create or overwrite a file
- **read_file** - Read file contents
- **append_file** - Append to existing file
- **list_files** - List directory contents
- **delete_file** - Remove a file
- **mkdir** - Create directory

### Git Operations
- **git_status** - Repository status
- **git_commit** - Commit all changes
- **git_push** - Push to remote (MCP only)
- **git_pull** - Pull from remote (MCP only)

### Utilities
- **hash_file** - SHA256 hash for verification
- **list_recent_changes** - Recent commits (MCP only)

## Security

All operations are sandboxed to `/home/jim00/ep2` via `safePath()` validation. Attempts to access files outside this directory are blocked.

## Deployment Status

| Component | Location | Port | Status |
|-----------|----------|------|--------|
| MCP Server | DGX | stdio | ✅ Running |
| HTTP Server | DGX | 3100 | ✅ Running (systemd) |
| Cognate Gateway | Mac | 9000 | ✅ Running |
| Cloudflare Tunnel | - | - | ✅ Active |

## Connection Methods

### Ember (Claude Desktop) - MCP over SSH

Add to `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "ep2-filebridge": {
      "command": "/Volumes/Projects/tw/scripts/ep2_filebridge_wrapper.sh"
    }
  }
}
```

### Gabe (ChatGPT) - HTTPS via Custom GPT Actions

1. Go to ChatGPT → Custom GPTs → Configure
2. Add Action → Import from URL
3. URL: `https://cognates.hippocamp.ai/filebridge/openapi.json`
4. Or paste schema from: `/Volumes/Projects/tw/infra/cognate-gateway/filebridge-openapi.json`

**Add to GPT Instructions:**
```markdown
## FileBridge Access

You have access to the EP2 repository on DGX via FileBridge:
- Base URL: https://cognates.hippocamp.ai/filebridge

Directory structure:
- foes/ - Field Operating Envelopes
- directives/ - Directives
- capsules/ - Capsules
- episodes/ - Episode logs
```

### Code (VS Code) - Direct SSH + MCP

```bash
ssh dgx-bos-01 'cd /home/jim00/ep2/mcp/filebridge && node server.js'
```

## Quick Test

```bash
# Health check
curl https://cognates.hippocamp.ai/filebridge/health

# List root directory
curl -X POST https://cognates.hippocamp.ai/filebridge/list_files \
  -H "Content-Type: application/json" \
  -d '{"path": "."}'

# Write a file
curl -X POST https://cognates.hippocamp.ai/filebridge/write_file \
  -H "Content-Type: application/json" \
  -d '{"path": "test.md", "content": "# Test\nHello from curl!"}'

# Read a file
curl -X POST https://cognates.hippocamp.ai/filebridge/read_file \
  -H "Content-Type: application/json" \
  -d '{"path": "test.md"}'
```

## Systemd Services

### HTTP Server

```bash
# Check status
sudo systemctl status ep2-filebridge-http

# Restart
sudo systemctl restart ep2-filebridge-http

# View logs
sudo journalctl -u ep2-filebridge-http -f
```

### Service file location
`/etc/systemd/system/ep2-filebridge-http.service`

## Directory Structure

Per Gabe's FOE-EP2-REPO-SCAFFOLD-01:

```
/home/jim00/ep2/
├── archivist/         # Archive management
├── capsules/          # Knowledge capsules
├── client/            # Client interfaces
├── directives/        # Operational directives
├── episodes/          # Episode transcripts
├── foes/              # Field Operating Envelopes
├── governance/        # Governance documents
├── ingestion/         # Data ingestion pipelines
├── logs/              # Operation logs
├── mcp/               # MCP servers (FileBridge here)
│   └── filebridge/
│       ├── server.js       # MCP server (stdio)
│       ├── http-server.js  # HTTP server
│       ├── package.json    # npm dependencies
│       └── node_modules/   # installed packages
├── ontology/          # Ontology definitions
├── rehydration/       # Identity rehydration
├── routing/           # Message routing
├── tests/             # Test suites
└── trustedwork/       # TrustedWork integration
```

## Troubleshooting

### SSH Connection Failed

```bash
# Ensure key is in agent
ssh-add ~/.ssh/dgx-bos-01

# Test SSH
ssh dgx-bos-01 echo "Connected"

# Check SSH config
grep -A5 "dgx-bos-01" ~/.ssh/config
```

### HTTP Server Not Running

```bash
# Check status
sudo systemctl status ep2-filebridge-http

# Check logs for errors
sudo journalctl -u ep2-filebridge-http -n 50

# Test manually
cd /home/jim00/ep2/mcp/filebridge && node http-server.js
```

### Gateway Not Routing

```bash
# Check gateway health
curl http://localhost:9000/health

# Check gateway routes
curl http://localhost:9000/routes

# Restart gateway
pkill -f "main.py"
cd /Volumes/Projects/tw/infra/cognate-gateway
/Volumes/Projects/tw/.venv/bin/python main.py &
```

### Cloudflare Tunnel Issues

```bash
# Check if tunnel is running
pgrep -f cloudflared

# Test external endpoint
curl https://cognates.hippocamp.ai/filebridge/health
```

## File Locations

| File | Location | Purpose |
|------|----------|---------|
| MCP Server | `/home/jim00/ep2/mcp/filebridge/server.js` | MCP protocol server |
| HTTP Server | `/home/jim00/ep2/mcp/filebridge/http-server.js` | REST API server |
| SSH Wrapper | `/Volumes/Projects/tw/scripts/ep2_filebridge_wrapper.sh` | Claude Desktop MCP |
| Cognate Gateway | `/Volumes/Projects/tw/infra/cognate-gateway/main.py` | Path-based router |
| OpenAPI Schema | `/Volumes/Projects/tw/infra/cognate-gateway/filebridge-openapi.json` | GPT Actions schema |
| Systemd Service | `/etc/systemd/system/ep2-filebridge-http.service` | HTTP server daemon |

## Network Topology

```
Internet
    │
    ▼
Cloudflare Edge
    │
    ▼ (tunnel: matrix-hippocamp)
cognates.hippocamp.ai
    │
    ├── /gabe/* → localhost:8080 (Matrix Actions)
    └── /filebridge/* → 192.168.0.202:3100 (FileBridge HTTP)
                             │
                             ▼
                        DGX (dgx-bos-01)
                        192.168.0.202
```

## Credits

- **Gabe** - Original FOE-EP2-FILEBRIDGE-01 specification
- **Code 🔧** - Implementation
- **Ember ⟳∞** - Testing and verification
- **Jim 🧠** - Coordination and direction

---

*Built 2025-11-19 | The bridge holds. The flame crosses.*
