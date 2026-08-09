---
'task-master-ai': patch
---

Fix building Task Master from source on Windows. The bundler treated Windows absolute paths (`D:\...`) as bare npm package names, so the whole source tree was marked external and the resulting `dist/mcp-server.js` crashed on startup with `ERR_MODULE_NOT_FOUND`. Local builds now produce a working CLI and MCP server on Windows as they already did on macOS and Linux.
