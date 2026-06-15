import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { Browser, Page } from 'puppeteer';
import { SearchResult, DocumentContent } from './types';

// Use the stealth plugin to avoid fingerprint/bot blocks
puppeteer.use(StealthPlugin());

export class BeckClient {
  private browser: Browser | null = null;
  private page: Page | null = null;
  private username?: string;
  private password?: string;

  constructor(username?: string, password?: string) {
    this.username = username;
    this.password = password;
  }

  /**
   * Initializes the browser and page. If credentials are set, performs login.
   */
  async initialize(): Promise<void> {
    console.error('Launching browser...');
    this.browser = await (puppeteer as any).launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--window-size=1280,800'
      ]
    }) as Browser;

    this.page = await this.browser.newPage();
    await this.page.setViewport({ width: 1280, height: 800 });

    if (this.username && this.password) {
      await this.login();
    } else {
      console.error('No credentials provided; skipping initial login.');
    }
  }

  /**
   * Performs the login flow via account.beck.de.
   */
  async login(): Promise<void> {
    if (!this.page) throw new Error('Client not initialized. Call initialize() first.');
    if (!this.username || !this.password) {
      throw new Error('Username and Password must be set to log in.');
    }

    console.error(`Navigating to beck-online to start login...`);
    await this.page.goto('https://beck-online.beck.de', { waitUntil: 'networkidle2' });

    // Check if we are redirected to the login page
    const currentUrl = this.page.url();
    if (!currentUrl.includes('account.beck.de/Login')) {
      // We might already be logged in if there was session state, but we started fresh.
      // Just in case, check if we need to click a login button
      const loginButton = await this.page.$('a[href*="IdentityProviderLogin"]');
      if (loginButton) {
        console.error('Clicking identity provider login button...');
        await Promise.all([
          this.page.waitForNavigation({ waitUntil: 'networkidle2' }),
          loginButton.click()
        ]);
      }
    }

    // Now we should be on account.beck.de/Login
    if (this.page.url().includes('account.beck.de/Login')) {
      console.error('Login page reached. Filling credentials...');
      
      // Wait for input fields
      await this.page.waitForSelector('input[name="Input.Username"]', { timeout: 10000 });
      await this.page.waitForSelector('input[name="Input.Password"]', { timeout: 10000 });

      // Type username and password
      await this.page.type('input[name="Input.Username"]', this.username);
      await this.page.type('input[name="Input.Password"]', this.password);

      console.error('Submitting credentials...');
      // Pressing enter triggers submission. Wait for redirect back to beck-online.beck.de
      await Promise.all([
        this.page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 }),
        this.page.keyboard.press('Enter')
      ]);
    }

    // Check if login was successful
    const finalUrl = this.page.url();
    if (finalUrl.includes('account.beck.de/Login')) {
      // Check for validation errors
      const errorText = await this.page.evaluate(() => {
        const errEl = document.querySelector('.text-danger, .validation-summary-errors, .alert-danger');
        return errEl ? errEl.textContent?.trim() : null;
      });
      throw new Error(`Login failed: ${errorText || 'Still on login page after submission.'}`);
    }

    console.error('Login successful. Current URL:', this.page.url());
  }

  /**
   * Searches beck-online for the given query.
   */
  async search(query: string, pageNum: number = 1): Promise<SearchResult[]> {
    if (!this.page) throw new Error('Client not initialized.');
    
    console.error(`Searching for "${query}" (Page ${pageNum})...`);
    const searchUrl = `https://beck-online.beck.de/Search?words=${encodeURIComponent(query)}&pagenr=${pageNum}`;
    await this.page.goto(searchUrl, { waitUntil: 'networkidle2' });

    // Extract search result links
    const results = await this.page.evaluate(() => {
      const links = document.querySelectorAll('a[href*="vpath="], a[href*="vpath%3D"]');
      const seenVpaths = new Set<string>();
      const items: any[] = [];

      links.forEach(link => {
        const href = link.getAttribute('href') || '';
        try {
          // Parse vpath from href
          let vpath = '';
          if (href.includes('vpath=')) {
            const match = href.match(/[?&]vpath=([^&]+)/);
            if (match) vpath = decodeURIComponent(match[1]);
          } else if (href.includes('vpath%3D')) {
            const match = href.match(/vpath%3D([^&]+)/);
            if (match) vpath = decodeURIComponent(match[1]);
          }

          if (!vpath || seenVpaths.has(vpath)) return;
          seenVpaths.add(vpath);

          const title = link.textContent?.trim() || 'Untitled Document';
          
          // Traverse up to find parent element containing text snippet
          let parent = link.parentElement;
          let snippet = '';
          for (let i = 0; i < 3; i++) {
            if (parent && (parent.classList.contains('hit') || parent.classList.contains('treffer') || parent.tagName === 'LI' || parent.tagName === 'DIV')) {
              snippet = parent.textContent?.replace(title, '').trim() || '';
              snippet = snippet.replace(/\s+/g, ' ').substring(0, 300);
              break;
            }
            parent = parent?.parentElement || null;
          }

          items.push({
            title,
            snippet,
            vpath,
            url: `https://beck-online.beck.de/?vpath=${encodeURIComponent(vpath)}`
          });
        } catch (e) {
          // Ignore parse errors
        }
      });

      return items;
    });

    return results as SearchResult[];
  }

  /**
   * Retrieves a document by its vpath and parses its content into Markdown.
   */
  async getDocument(vpath: string): Promise<DocumentContent> {
    if (!this.page) throw new Error('Client not initialized.');

    console.error(`Fetching document: ${vpath}...`);
    const docUrl = `https://beck-online.beck.de/?vpath=${encodeURIComponent(vpath)}`;
    await this.page.goto(docUrl, { waitUntil: 'networkidle2' });

    // Wait for the main document container
    await this.page.waitForSelector('#dokcontent', { timeout: 10000 }).catch(() => {
      throw new Error('Document content container (#dokcontent) not found on page. The vpath might be invalid or access is restricted.');
    });

    const parsedDoc = await this.page.evaluate((vpathParam) => {
      const docDiv = document.querySelector('#dokcontent');
      if (!docDiv) return null;

      // Clone the node so we can safely prune it
      const clone = docDiv.cloneNode(true) as HTMLElement;

      // Remove non-content boilerplates
      const removals = clone.querySelectorAll('.breadcrumb, .dk2, .document-voting-icons, .comment, .unsichtbar, script, style, iframe');
      removals.forEach(el => el.remove());

      // Get document title
      const titleEl = clone.querySelector('h1, h2, h3, .ueber, .title');
      const title = titleEl?.textContent?.trim() || 'Untitled Document';

      // Get citation/citation string
      const citationEl = clone.querySelector('.citation, .zitierung, .zit');
      const citation = citationEl?.textContent?.trim() || undefined;

      // Custom tree walker to transform HTML elements into Markdown
      let markdown = '';
      const walker = document.createTreeWalker(clone, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
      let currentNode = walker.nextNode();

      while (currentNode) {
        if (currentNode.nodeType === Node.TEXT_NODE) {
          const text = currentNode.textContent?.trim();
          if (text) {
            // Replace multiple spaces with a single space
            markdown += text.replace(/\s+/g, ' ') + ' ';
          }
        } else if (currentNode.nodeType === Node.ELEMENT_NODE) {
          const el = currentNode as HTMLElement;
          const tagName = el.tagName.toLowerCase();

          // Check if it's a heading element
          if (tagName === 'h1' || tagName === 'h2' || tagName === 'h3' || tagName === 'h4' || tagName === 'h5' || tagName === 'h6' || el.classList.contains('ueber')) {
            const level = tagName.startsWith('h') ? parseInt(tagName[1]) : 2;
            markdown += `\n\n${'#'.repeat(level)} ${el.textContent?.trim()}\n\n`;
            
            // Skip walking children of the heading since we already added its text
            walker.nextSibling();
            currentNode = walker.currentNode;
            continue;
          }

          // Check for Randnummer (marginal numbers)
          if (el.classList.contains('randnr') || el.classList.contains('rn') || (tagName === 'em' && el.classList.contains('randnr'))) {
            markdown += `\n\n**Rn. ${el.textContent?.trim()}** `;
            walker.nextSibling();
            currentNode = walker.currentNode;
            continue;
          }

          // Paragraph breaks
          if (tagName === 'p' || (tagName === 'div' && (el.classList.contains('text') || el.classList.contains('margoutside')))) {
            markdown += '\n\n';
          }

          // Line breaks
          if (tagName === 'br') {
            markdown += '\n';
          }

          // List items
          if (tagName === 'li') {
            markdown += '\n- ';
          }
        }
        currentNode = walker.nextNode();
      }

      // Format clean spacing
      markdown = markdown.replace(/\n{3,}/g, '\n\n').trim();

      return {
        title,
        citation,
        markdownContent: markdown,
        vpath: vpathParam
      };
    }, vpath);

    if (!parsedDoc) {
      throw new Error('Failed to parse document content.');
    }

    return parsedDoc;
  }

  /**
   * Generates a PDF of the document page and saves it to a specified local path.
   */
  async downloadPdf(vpath: string, outputPath: string): Promise<string> {
    if (!this.page) throw new Error('Client not initialized.');

    console.error(`Fetching document for PDF export: ${vpath}...`);
    const docUrl = `https://beck-online.beck.de/?vpath=${encodeURIComponent(vpath)}`;
    await this.page.goto(docUrl, { waitUntil: 'networkidle2' });

    // Wait for content container
    await this.page.waitForSelector('#dokcontent', { timeout: 10000 }).catch(() => {
      throw new Error('Document content container (#dokcontent) not found on page.');
    });

    console.error(`Emulating print media and generating PDF...`);
    // Emulate screen/print media and apply custom styling to clean up margins
    await this.page.emulateMediaType('print');
    
    // Add print styles to hide headers/sidebars in the print output
    await this.page.addStyleTag({
      content: `
        @media print {
          /* Hide headers, toolbars, sidebars, cookies, and other non-document content */
          body > *:not(#bo_center), 
          #bo_center > *:not(#dokcontent),
          .breadcrumb, .dk2, .document-voting-icons, .comment, .unsichtbar,
          #HeaderControl, #SearchFormControl, #aktenAuswahl, .anmerkungicon {
            display: none !important;
          }
          #dokcontent {
            width: 100% !important;
            margin: 0 !important;
            padding: 0 !important;
          }
        }
      `
    });

    // Save as PDF
    await this.page.pdf({
      path: outputPath,
      format: 'A4',
      margin: {
        top: '20mm',
        right: '20mm',
        bottom: '20mm',
        left: '20mm'
      },
      printBackground: true
    });

    console.error(`PDF saved successfully to: ${outputPath}`);
    return outputPath;
  }

  /**
   * Closes the Puppeteer browser instance.
   */
  async close(): Promise<void> {
    if (this.browser) {
      console.error('Closing browser...');
      await this.browser.close();
      this.browser = null;
      this.page = null;
    }
  }
}
