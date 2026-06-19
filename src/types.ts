export interface SearchResult {
  title: string;
  snippet: string;
  vpath: string;
  url: string;
}

export interface SearchOptions {
  /** Filter to case law (Rechtsprechung) only */
  caselaw?: boolean;
  /** Filter to pending proceedings (Anhängige Verfahren) */
  pendingProceedings?: boolean;
  /** Date range filter, format: "DD.MM.YYYY - DD.MM.YYYY" */
  dateRange?: string;
  /** Norm/statute abbreviation, e.g. "BGB", "DSGVO" */
  norm?: string;
  /** Court abbreviation, e.g. "BGH", "BVerwG" */
  court?: string;
  /** Journal abbreviation for publication source, e.g. "NJW", "AZR" */
  journal?: string;
}

export interface DocumentContent {
  title: string;
  citation?: string;
  markdownContent: string;
  vpath: string;
}
