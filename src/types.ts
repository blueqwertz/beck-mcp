export interface SearchResult {
  title: string;
  snippet: string;
  vpath: string;
  url: string;
}

export interface DocumentContent {
  title: string;
  citation?: string;
  markdownContent: string;
  vpath: string;
}
