# Beck-Online MCP Server

An MCP (Model Context Protocol) server that allows AI models to search, fetch, and export documents from **beck-online.beck.de**. It uses a lightweight, pure Node.js HTTP client to manage cookies and credentials, Cheerio to parse HTML documents, and PDFKit to generate PDFs, avoiding any heavy Chromium browser dependencies or Puppeteer runtime errors.

## Features

- **Search**: Query beck-online for articles, comments, laws, or other legal publications.
- **Get Document**: Fetch the content of any document by its virtual path (`vpath`) and parse it into clean, readable Markdown.
- **Download PDF**: Convert document text into a formatted PDF file and save it to a specified local directory.

---

## Configuration & Credentials

The server requires your Beck-Online username and password to log in. You can supply them using:

1. **Environment Variables**:
   `BECK_USERNAME` and `BECK_PASSWORD`
2. **Command Line Flags**:
   `--username <string>` and `--password <string>`

---

## Installation & Running

### Running directly via npx (Recommended)

You can run the MCP server directly using `npx` without cloning the repository. The package is set up to automatically compile TypeScript on install.

To run it via GitHub shorthand:
```bash
npx -y github:blueqwertz/beck-mcp --username "YOUR_USER" --password "YOUR_PASS"
```

Or using environment variables:
```bash
export BECK_USERNAME="your_username"
export BECK_PASSWORD="your_password"
npx -y github:blueqwertz/beck-mcp
```

---

## Integrating with AI Agents

To use this server with your favorite AI agents, follow the configuration steps below. Select your agent to view the setup instructions.

<details>
<summary><b>Claude Desktop</b></summary>

### Configuration Location
- **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

Add the following configuration block:

```json
{
  "mcpServers": {
    "beck-mcp": {
      "command": "npx",
      "args": [
        "-y",
        "github:blueqwertz/beck-mcp"
      ],
      "env": {
        "BECK_USERNAME": "YOUR_BECK_USERNAME",
        "BECK_PASSWORD": "YOUR_BECK_PASSWORD"
      }
    }
  }
}
```

Replace `YOUR_BECK_USERNAME` and `YOUR_BECK_PASSWORD` with your actual Beck-Online credentials. Restart Claude Desktop after making these changes.
</details>

<details>
<summary><b>Claude Code</b></summary>

### CLI Method (Recommended)
You can add the MCP server directly by running:
```bash
claude mcp add --env BECK_USERNAME="YOUR_BECK_USERNAME" --env BECK_PASSWORD="YOUR_BECK_PASSWORD" beck-mcp -- npx -y github:blueqwertz/beck-mcp
```

### Manual Configuration
Alternatively, edit your global configuration file `~/.claude.json` to include:
```json
{
  "mcpServers": {
    "beck-mcp": {
      "command": "npx",
      "args": [
        "-y",
        "github:blueqwertz/beck-mcp"
      ],
      "env": {
        "BECK_USERNAME": "YOUR_BECK_USERNAME",
        "BECK_PASSWORD": "YOUR_BECK_PASSWORD"
      }
    }
  }
}
```
</details>

<details>
<summary><b>Cursor</b></summary>

### UI Method
1. Open Cursor Settings and navigate to **Features** -> **MCP**.
2. Click **+ Add New MCP Server**.
3. Configure the fields:
   - **Name**: `beck-mcp`
   - **Type**: `stdio`
   - **Command**: `npx -y github:blueqwertz/beck-mcp`
4. Since Cursor's UI does not directly allow specifying environment variables for this command type, it is recommended to run Cursor from a terminal session where `BECK_USERNAME` and `BECK_PASSWORD` are exported, or use the configuration file method below.

### Configuration File Method
Edit your project-level `.cursor/mcp.json` or global `~/.cursor/mcp.json` file to include:
```json
{
  "mcpServers": {
    "beck-mcp": {
      "command": "npx",
      "args": [
        "-y",
        "github:blueqwertz/beck-mcp"
      ],
      "env": {
        "BECK_USERNAME": "YOUR_BECK_USERNAME",
        "BECK_PASSWORD": "YOUR_BECK_PASSWORD"
      }
    }
  }
}
```
</details>

<details>
<summary><b>Antigravity</b></summary>

### Configuration File Method
1. Open the Agent Panel in your IDE.
2. Click the **"..."** menu at the top of the panel and select **Manage MCP Servers**.
3. Click **View raw config** to open `mcp_config.json` (typically located at `~/.gemini/antigravity-cli/mcp_config.json` or `.agents/mcp_config.json`).
4. Add the following to the `mcpServers` object:
```json
{
  "mcpServers": {
    "beck-mcp": {
      "command": "npx",
      "args": [
        "-y",
        "github:blueqwertz/beck-mcp"
      ],
      "env": {
        "BECK_USERNAME": "YOUR_BECK_USERNAME",
        "BECK_PASSWORD": "YOUR_BECK_PASSWORD"
      }
    }
  }
}
```
</details>

<details>
<summary><b>Codex</b></summary>

### CLI Method
You can add the MCP server by running:
```bash
codex mcp add beck-mcp --env BECK_USERNAME="YOUR_BECK_USERNAME" --env BECK_PASSWORD="YOUR_BECK_PASSWORD" -- npx -y github:blueqwertz/beck-mcp
```

### Manual Configuration
Or edit your `config.toml` (located at `~/.codex/config.toml` globally or `.codex/config.toml` in your project root) and add:
```toml
[mcp_servers.beck-mcp]
command = "npx"
args = ["-y", "github:blueqwertz/beck-mcp"]
env = { BECK_USERNAME = "YOUR_BECK_USERNAME", BECK_PASSWORD = "YOUR_BECK_PASSWORD" }
```
</details>

<details>
<summary><b>OpenCode</b></summary>

### CLI Method
Add the server interactively by running:
```bash
opencode mcp add
```

### Manual Configuration
Or edit your project configuration file (e.g. `opencode.json` or `opencode.jsonc`) to include:
```json
{
  "mcp": {
    "beck-mcp": {
      "type": "local",
      "command": ["npx", "-y", "github:blueqwertz/beck-mcp"],
      "enabled": true,
      "environment": {
        "BECK_USERNAME": "YOUR_BECK_USERNAME",
        "BECK_PASSWORD": "YOUR_BECK_PASSWORD"
      }
    }
  }
}
```
</details>

---

## Exposed Tools

### 1. `search`
Search beck-online for articles, comments, laws, or other legal documents.
- **Arguments**:
  - `query` (string, required): The search keywords (e.g. `"NIS-2 Richtlinie"`).
  - `page` (number, optional): The page number of results to retrieve (default: `1`).
- **Returns**: A JSON array of results containing title, snippet, `vpath`, and a direct link.

### 2. `get_document`
Retrieve the text of a document as clean, readable Markdown.
- **Arguments**:
  - `vpath` (string, required): The virtual path of the document (e.g. `"bibdata/komm/wehewaearbrhdb_3/cont/wehewaearbrhdb.glkap5.glii.gl2.htm"`).
- **Returns**: Clean text representing the title, citation, virtual path, and document content.

### 3. `download_pdf`
Print and export a document page to a local PDF file.
- **Arguments**:
  - `vpath` (string, required): The virtual path of the document.
  - `outputPath` (string, required): The absolute file path where the PDF will be saved.
- **Returns**: A success message indicating where the PDF file was saved.

---

## Local Development & Installation

If you want to clone the repository and run it locally:

1. Clone the repository:
   ```bash
   git clone https://github.com/blueqwertz/beck-mcp.git
   cd beck-mcp
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Create a `.env` file in the root:
   ```env
   BECK_USERNAME=your_username
   BECK_PASSWORD=your_password
   ```
4. Build the TypeScript files:
   ```bash
   npm run build
   ```
5. Run the MCP server:
   ```bash
   npm start
   ```

## License

MIT License.
