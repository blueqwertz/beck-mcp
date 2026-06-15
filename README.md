# Beck-Online MCP Server

An MCP (Model Context Protocol) server that allows AI models to search, fetch, and export documents from **beck-online.beck.de**. It uses headless browser automation (Puppeteer with stealth configurations) to bypass anti-bot fingerprinting and interact with beck-online.

## Features

- **Search**: Query beck-online for articles, comments, laws, or other legal publications.
- **Get Document**: Fetch the content of any document by its virtual path (`vpath`) and parse it into clean, readable Markdown.
- **Download PDF**: Print document pages to PDF files and save them to a specified local directory.

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

## Integrating with Claude Desktop

To use this server with Claude Desktop, add it to your `claude_desktop_config.json` configuration file:

### On macOS
Location: `~/Library/Application Support/Claude/claude_desktop_config.json`

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
