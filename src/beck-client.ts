import { URL } from 'url';
import * as cheerio from 'cheerio';
import PDFDocument from 'pdfkit';
import * as fs from 'fs';
import { SearchResult, DocumentContent } from './types';

export class CookieJar {
  private cookies: Map<string, Map<string, string>> = new Map(); // domain -> (name -> value)

  setCookie(cookieStr: string, requestUrl: string) {
    const url = new URL(requestUrl);
    const parts = cookieStr.split(';').map(p => p.trim());
    if (parts.length === 0) return;

    const [nameValue] = parts;
    const eqIdx = nameValue.indexOf('=');
    if (eqIdx === -1) return;

    const name = nameValue.substring(0, eqIdx);
    const value = nameValue.substring(eqIdx + 1);

    // Determine domain, default to current host
    let domain = url.hostname;
    for (const part of parts) {
      if (part.toLowerCase().startsWith('domain=')) {
        domain = part.substring('domain='.length).trim();
        if (domain.startsWith('.')) {
          domain = domain.substring(1);
        }
      }
    }

    if (!this.cookies.has(domain)) {
      this.cookies.set(domain, new Map());
    }
    this.cookies.get(domain)!.set(name, value);
  }

  getCookieHeader(requestUrl: string): string {
    const url = new URL(requestUrl);
    const host = url.hostname;
    const matchedCookies: string[] = [];

    for (const [domain, cookieMap] of this.cookies.entries()) {
      if (host === domain || host.endsWith('.' + domain)) {
        for (const [name, value] of cookieMap.entries()) {
          matchedCookies.push(`${name}=${value}`);
        }
      }
    }

    return matchedCookies.join('; ');
  }
}

export class HttpClient {
  private jar = new CookieJar();
  private userAgent = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

  async request(url: string, options: RequestInit = {}): Promise<Response> {
    const headers = new Headers(options.headers || {});
    
    const cookieHeader = this.jar.getCookieHeader(url);
    if (cookieHeader) {
      headers.set('Cookie', cookieHeader);
    }
    
    if (!headers.has('User-Agent')) {
      headers.set('User-Agent', this.userAgent);
    }

    const res = await fetch(url, {
      ...options,
      headers,
      redirect: 'manual'
    });

    // Capture cookies
    const setCookieHeaders = res.headers.getSetCookie 
      ? res.headers.getSetCookie() 
      : (res.headers.get('set-cookie')?.split(',').map(s => s.trim()) || []);
      
    for (const cookieStr of setCookieHeaders) {
      this.jar.setCookie(cookieStr, url);
    }

    // Handle redirects manually
    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get('location');
      if (location) {
        const nextUrl = new URL(location, url).toString();
        console.error(`HTTP Client: Following redirect to ${nextUrl}`);
        
        // Form post redirects are usually followed as GET requests
        return this.request(nextUrl, {
          method: 'GET',
          headers: {
            'Referer': url
          }
        });
      }
    }

    return res;
  }
}

export class BeckClient {
  private client: HttpClient;
  private username?: string;
  private password?: string;

  constructor(username?: string, password?: string) {
    this.client = new HttpClient();
    this.username = username;
    this.password = password;
  }

  async initialize(): Promise<void> {
    if (this.username && this.password) {
      await this.login();
    } else {
      console.error('No credentials provided; skipping initial login.');
    }
  }

  async login(): Promise<void> {
    if (!this.username || !this.password) {
      throw new Error('Username and Password must be set to log in.');
    }

    console.error('Starting login redirect chain...');
    const startUrl = 'https://beck-online.beck.de/Konto/IdentityProviderLogin?referrer=Model.Referer.ReferrerUrl';
    const response = await this.client.request(startUrl);

    const loginPageHtml = await response.text();
    
    // Parse anti-forgery token from HTML
    const tokenMatch = loginPageHtml.match(/name="__RequestVerificationToken"\s+type="hidden"\s+value="([^"]+)"/i)
      || loginPageHtml.match(/value="([^"]+)"\s+name="__RequestVerificationToken"/i);
      
    if (!tokenMatch) {
      // Check if we are already logged in (redirected directly to home page)
      if (response.url.includes('beck-online.beck.de') && !response.url.includes('account.beck.de/Login')) {
        console.error('Already logged in or bypassed login page.');
        return;
      }
      throw new Error('Failed to find __RequestVerificationToken on the login page.');
    }

    const token = tokenMatch[1];
    console.error('Extracted __RequestVerificationToken. Submitting credentials...');

    // Build Form POST body
    const params = new URLSearchParams();
    params.append('Input.Username', this.username);
    params.append('Input.Password', this.password);
    params.append('Input.RememberMe', 'true');
    params.append('__RequestVerificationToken', token);
    params.append('Input.RememberMe', 'false');

    const loginRes = await this.client.request(response.url, {
      method: 'POST',
      body: params,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    });

    const finalUrl = loginRes.url;
    if (finalUrl.includes('account.beck.de/Login')) {
      const $ = cheerio.load(await loginRes.text());
      const errorText = $('.text-danger, .validation-summary-errors, .alert-danger').text().trim();
      throw new Error(`Login failed: ${errorText || 'Invalid credentials or validation error'}`);
    }

    console.error('Login successful. Landed on:', finalUrl);
  }

  async search(query: string, pageNum: number = 1): Promise<SearchResult[]> {
    console.error(`Searching for "${query}" (Page ${pageNum})...`);
    const searchUrl = `https://beck-online.beck.de/Search?words=${encodeURIComponent(query)}&pagenr=${pageNum}`;
    const res = await this.client.request(searchUrl);
    const html = await res.text();
    const $ = cheerio.load(html);

    const results: SearchResult[] = [];
    const seenVpaths = new Set<string>();

    $('a').each((_, el) => {
      const $link = $(el);
      const href = $link.attr('href') || '';
      if (!href.includes('vpath=') && !href.includes('vpath%3D')) return;

      let vpath = '';
      const match = href.match(/[?&]vpath=([^&]+)/) || href.match(/vpath%3D([^&]+)/);
      if (match) {
        vpath = decodeURIComponent(match[1]);
      }

      if (!vpath || seenVpaths.has(vpath)) return;
      seenVpaths.add(vpath);

      const title = $link.text().trim() || 'Untitled Document';
      
      // Attempt to extract snippet from parent container
      let parent = $link.parent();
      let snippet = '';
      for (let i = 0; i < 3; i++) {
        if (parent.length > 0 && (parent.hasClass('hit') || parent.hasClass('treffer') || parent.hasClass('bo-treffer') || parent.prop('tagName') === 'LI' || parent.prop('tagName') === 'DIV')) {
          snippet = parent.text().replace(title, '').trim();
          snippet = snippet.replace(/\s+/g, ' ').substring(0, 300);
          break;
        }
        parent = parent.parent();
      }

      results.push({
        title,
        snippet,
        vpath,
        url: `https://beck-online.beck.de/?vpath=${encodeURIComponent(vpath)}`
      });
    });

    return results;
  }

  async getDocument(vpath: string): Promise<DocumentContent> {
    console.error(`Fetching document: ${vpath}...`);
    const docUrl = `https://beck-online.beck.de/?vpath=${encodeURIComponent(vpath)}`;
    const res = await this.client.request(docUrl);
    const html = await res.text();
    const $ = cheerio.load(html);

    const dokcontent = $('#dokcontent');
    if (dokcontent.length === 0) {
      throw new Error('Document content container (#dokcontent) not found on page. The vpath might be invalid or access is restricted.');
    }

    // Remove unwanted elements
    dokcontent.find('.breadcrumb, .dk2, .document-voting-icons, .comment, .unsichtbar, script, style, iframe').remove();

    const title = dokcontent.find('h1, h2, h3, .ueber, .title').first().text().trim() || 'Untitled Document';
    const citation = dokcontent.find('.citation, .zitierung, .zit').first().text().trim() || undefined;

    const blocks: string[] = [];
    dokcontent.find('h1, h2, h3, h4, h5, h6, .ueber, p, div.text, div.margoutside, li').each((_, el) => {
      const $el = $(el);
      const tagName = el.tagName.toLowerCase();

      if ($el.parents('p, div.text, div.margoutside, li').length > 0) {
        return;
      }

      const text = $el.text().trim();
      if (!text) return;

      if (tagName.startsWith('h') || $el.hasClass('ueber')) {
        const level = tagName.startsWith('h') ? parseInt(tagName[1]) : 2;
        blocks.push(`\n\n${'#'.repeat(level)} ${text}\n\n`);
      } else if (tagName === 'li') {
        blocks.push(`\n- ${text}`);
      } else {
        const randnrEl = $el.find('.randnr, .rn');
        if (randnrEl.length > 0) {
          const rnText = randnrEl.first().text().trim();
          let cleanText = text;
          if (cleanText.startsWith(rnText)) {
            cleanText = cleanText.substring(rnText.length).trim();
          }
          blocks.push(`\n\n**Rn. ${rnText}** ${cleanText}`);
        } else {
          blocks.push(`\n\n${text}`);
        }
      }
    });

    const markdown = blocks.join('').replace(/\n{3,}/g, '\n\n').trim();

    return {
      title,
      citation,
      markdownContent: markdown,
      vpath
    };
  }

  async downloadPdf(vpath: string, outputPath: string): Promise<string> {
    const docInfo = await this.getDocument(vpath);

    return new Promise<string>((resolve, reject) => {
      try {
        const doc = new PDFDocument({ margin: 50 });
        const stream = fs.createWriteStream(outputPath);
        doc.pipe(stream);

        // Title
        doc.font('Helvetica-Bold').fontSize(20).text(docInfo.title, { align: 'center' });
        doc.moveDown();

        // Citation
        if (docInfo.citation) {
          doc.font('Helvetica-Oblique').fontSize(12).text(docInfo.citation, { align: 'center' });
          doc.moveDown();
        }

        // Separator
        doc.moveTo(50, doc.y).lineTo(562, doc.y).strokeColor('#cccccc').stroke();
        doc.moveDown(2);

        // Content body
        const paragraphs = docInfo.markdownContent.split('\n\n');
        for (const p of paragraphs) {
          const trimmed = p.trim();
          if (!trimmed) continue;

          if (trimmed.startsWith('#')) {
            const match = trimmed.match(/^(#+)\s+(.*)/);
            if (match) {
              const level = match[1].length;
              const text = match[2];
              doc.font('Helvetica-Bold').fontSize(18 - level * 2).text(text);
              doc.moveDown(0.5);
            }
          } else if (trimmed.startsWith('**Rn.')) {
            const match = trimmed.match(/^\*\*Rn\.\s+([^\*]+)\*\*(.*)/);
            if (match) {
              const rn = match[1];
              const rest = match[2].trim();
              doc.font('Helvetica-Bold').fontSize(10).text(`Rn. ${rn} `, { continued: true })
                 .font('Helvetica').fontSize(10).text(rest);
              doc.moveDown();
            } else {
              doc.font('Helvetica').fontSize(10).text(trimmed);
              doc.moveDown();
            }
          } else if (trimmed.startsWith('-')) {
            doc.font('Helvetica').fontSize(10).text(trimmed);
            doc.moveDown(0.5);
          } else {
            doc.font('Helvetica').fontSize(10).text(trimmed);
            doc.moveDown();
          }
        }

        doc.end();
        stream.on('finish', () => resolve(outputPath));
        stream.on('error', (err) => reject(err));
      } catch (err) {
        reject(err);
      }
    });
  }

  async close(): Promise<void> {
    // No-op since we don't have a Puppeteer browser to close
    console.error('HttpClient session finished.');
  }
}
