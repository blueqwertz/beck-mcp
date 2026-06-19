#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError
} from '@modelcontextprotocol/sdk/types.js';
import { Command } from 'commander';
import dotenv from 'dotenv';
import { BeckClient } from './beck-client';

// Load .env file if present
dotenv.config();

const program = new Command();
program
  .name('beck-mcp')
  .description('Model Context Protocol (MCP) server for beck-online')
  .option('-u, --username <string>', 'Beck-Online Username (fallback: BECK_USERNAME env var)')
  .option('-p, --password <string>', 'Beck-Online Password (fallback: BECK_PASSWORD env var)')
  .parse(process.argv);

const options = program.opts();
const username = options.username || process.env.BECK_USERNAME;
const password = options.password || process.env.BECK_PASSWORD;

// We check credentials when starting, but let the user run it. We will throw an error on first tool invocation if credentials are missing.
if (!username || !password) {
  console.error('WARNING: BECK_USERNAME or BECK_PASSWORD credentials are not set.');
  console.error('Please set them in environment variables or pass via --username and --password flags.');
}

const server = new Server(
  {
    name: 'beck-mcp',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

let client: BeckClient | null = null;

async function getClient(): Promise<BeckClient> {
  if (!client) {
    if (!username || !password) {
      throw new McpError(
        ErrorCode.InvalidParams,
        'BECK_USERNAME and BECK_PASSWORD credentials must be set in environment variables or CLI flags.'
      );
    }
    client = new BeckClient(username, password);
    await client.initialize();
  }
  return client;
}

// 1. List tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'search',
        description: 'Search beck-online for articles, comments, laws, or other legal documents. Supports optional detailed search filters.',
        inputSchema: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'Search query keywords (e.g. "NIS-2 Richtlinie")',
            },
            page: {
              type: 'number',
              description: 'Page number of search results to retrieve (default: 1)',
            },
            caselaw: {
              type: 'boolean',
              description: 'Filter to case law (Rechtsprechung) only',
            },
            pendingProceedings: {
              type: 'boolean',
              description: 'Filter to pending proceedings (Anhängige Verfahren) only',
            },
            dateRange: {
              type: 'string',
              description: 'Date range filter in format "DD.MM.YYYY - DD.MM.YYYY" (e.g. "01.01.2024 - 31.12.2024")',
            },
            norm: {
              type: 'string',
              description: 'Limit search to documents referencing this norm/statute abbreviation (e.g. "BGB", "DSGVO", "StGB")',
            },
            court: {
              type: 'string',
              description: 'Limit case law to this court abbreviation (e.g. "BGH", "BVerwG", "BAG")',
            },
            journal: {
              type: 'string',
              description: 'Limit search to publications in this journal abbreviation (e.g. "NJW", "NVwZ", "AZR")',
            },
          },
          required: ['query'],
        },
      },
      {
        name: 'get_document',
        description: 'Retrieve the content of a beck-online document as readable Markdown by its vpath.',
        inputSchema: {
          type: 'object',
          properties: {
            vpath: {
              type: 'string',
              description: 'Virtual path (vpath) of the document to retrieve (e.g. "bibdata/komm/wehewaearbrhdb_3/cont/wehewaearbrhdb.glkap5.glii.gl2.htm")',
            },
          },
          required: ['vpath'],
        },
      },
      {
        name: 'download_pdf',
        description: 'Download a document from beck-online and save it as a PDF file to a specified local path.',
        inputSchema: {
          type: 'object',
          properties: {
            vpath: {
              type: 'string',
              description: 'Virtual path (vpath) of the document to download.',
            },
            outputPath: {
              type: 'string',
              description: 'Absolute path on the local filesystem where the PDF will be saved.',
            },
          },
          required: ['vpath', 'outputPath'],
        },
      },
    ],
  };
});

// 2. Call tool
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    const beckClient = await getClient();

    if (name === 'search') {
      const query = String(args?.query || '');
      const page = Number(args?.page || 1);

      if (!query) {
        throw new McpError(ErrorCode.InvalidParams, 'Search query cannot be empty.');
      }

      const searchOptions: Record<string, unknown> = {};
      if (args?.caselaw !== undefined) searchOptions.caselaw = Boolean(args.caselaw);
      if (args?.pendingProceedings !== undefined) searchOptions.pendingProceedings = Boolean(args.pendingProceedings);
      if (args?.dateRange) searchOptions.dateRange = String(args.dateRange);
      if (args?.norm) searchOptions.norm = String(args.norm);
      if (args?.court) searchOptions.court = String(args.court);
      if (args?.journal) searchOptions.journal = String(args.journal);

      const results = await beckClient.search(query, page, searchOptions as any);
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(results, null, 2),
          },
        ],
      };
    }

    if (name === 'get_document') {
      const vpath = String(args?.vpath || '');
      if (!vpath) {
        throw new McpError(ErrorCode.InvalidParams, 'vpath cannot be empty.');
      }

      const document = await beckClient.getDocument(vpath);
      return {
        content: [
          {
            type: 'text',
            text: `Title: ${document.title}\n` +
                  `Citation: ${document.citation || 'N/A'}\n` +
                  `Virtual Path: ${document.vpath}\n\n` +
                  `---\n\n` +
                  `${document.markdownContent}`,
          },
        ],
      };
    }

    if (name === 'download_pdf') {
      const vpath = String(args?.vpath || '');
      const outputPath = String(args?.outputPath || '');
      
      if (!vpath) {
        throw new McpError(ErrorCode.InvalidParams, 'vpath cannot be empty.');
      }
      if (!outputPath) {
        throw new McpError(ErrorCode.InvalidParams, 'outputPath cannot be empty.');
      }

      const savedPath = await beckClient.downloadPdf(vpath, outputPath);
      return {
        content: [
          {
            type: 'text',
            text: `Successfully downloaded PDF for document "${vpath}" and saved to "${savedPath}"`,
          },
        ],
      };
    }

    throw new McpError(ErrorCode.MethodNotFound, `Unknown tool name: ${name}`);
  } catch (error: any) {
    console.error(`Error in tool execution (${name}):`, error);
    return {
      isError: true,
      content: [
        {
          type: 'text',
          text: `Error executing ${name}: ${error.message || error}`,
        },
      ],
    };
  }
});

// Setup shutdown hooks to close the browser safely
const shutdown = async () => {
  console.error('Shutdown initiated...');
  if (client) {
    await client.close();
    client = null;
  }
  process.exit(0);
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

// Start the server using stdio transport
const transport = new StdioServerTransport();
console.error('Beck-Online MCP server running on stdio');
server.connect(transport).catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
