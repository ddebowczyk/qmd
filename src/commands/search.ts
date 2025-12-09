import { Command, Flags, Args } from '@oclif/core';
import { Database } from 'bun:sqlite';
import { resolve } from 'path';
import { existsSync } from 'fs';
import type { SearchResult, OutputOptions } from '../models/types.ts';

export default class SearchCommand extends Command {
  static description = 'Full-text search using BM25';

  static args = {
    query: Args.string({
      description: 'Search query',
      required: true,
    }),
  };

  static flags = {
    index: Flags.string({
      description: 'Index name',
      default: 'default',
    }),
    n: Flags.integer({
      description: 'Number of results',
      default: 10,
    }),
    'min-score': Flags.string({
      description: 'Minimum score threshold',
    }),
    full: Flags.boolean({
      description: 'Show full document content',
      default: false,
    }),
    json: Flags.boolean({
      description: 'Output as JSON',
      default: false,
    }),
    csv: Flags.boolean({
      description: 'Output as CSV',
      default: false,
    }),
    md: Flags.boolean({
      description: 'Output as Markdown',
      default: false,
    }),
    xml: Flags.boolean({
      description: 'Output as XML',
      default: false,
    }),
    files: Flags.boolean({
      description: 'Output file paths only',
      default: false,
    }),
    all: Flags.boolean({
      description: 'Show all results (no limit)',
      default: false,
    }),
  };

  async run(): Promise<void> {
    const { args, flags } = await this.parse(SearchCommand);

    const cacheDir = process.env.XDG_CACHE_HOME || resolve(process.env.HOME || '~', '.cache');
    const dbPath = resolve(cacheDir, 'qmd', `${flags.index}.sqlite`);

    if (!existsSync(dbPath)) {
      this.error(`No index found at: ${dbPath}\nRun: qmd add <files> to create an index`);
    }

    const db = new Database(dbPath, { readonly: true });

    try {
      // Determine output format
      let format: 'cli' | 'json' | 'csv' | 'md' | 'xml' | 'files' = 'cli';
      if (flags.json) format = 'json';
      else if (flags.csv) format = 'csv';
      else if (flags.md) format = 'md';
      else if (flags.xml) format = 'xml';
      else if (flags.files) format = 'files';

      const opts: OutputOptions = {
        format,
        full: flags.full,
        limit: flags.all ? 100000 : flags.n,
        minScore: flags['min-score'] ? parseFloat(flags['min-score']) : 0,
        all: flags.all,
      };

      // Search
      const fetchLimit = opts.all ? 100000 : Math.max(50, opts.limit * 2);
      const results = this.searchFTS(db, args.query, fetchLimit);

      // Add context
      const resultsWithContext = results.map(r => ({
        ...r,
        context: this.getContextForFile(db, r.file),
      }));

      if (resultsWithContext.length === 0) {
        this.log('No results found.');
        return;
      }

      // Output
      this.outputResults(resultsWithContext, args.query, opts);

    } finally {
      db.close();
    }
  }

  private searchFTS(db: Database, query: string, limit: number = 20): SearchResult[] {
    const ftsQuery = this.buildFTS5Query(query);
    if (!ftsQuery) return [];

    // BM25 weights: title=10, body=1
    const stmt = db.prepare(`
      SELECT d.filepath, d.display_path, d.title, d.body, bm25(documents_fts, 10.0, 1.0) as score
      FROM documents_fts f
      JOIN documents d ON d.id = f.rowid
      WHERE documents_fts MATCH ? AND d.active = 1
      ORDER BY score
      LIMIT ?
    `);

    const results = stmt.all(ftsQuery, limit) as { filepath: string; display_path: string; title: string; body: string; score: number }[];

    return results.map(r => ({
      file: r.filepath,
      displayPath: r.display_path,
      title: r.title,
      body: r.body,
      score: this.normalizeBM25(r.score),
      source: 'fts' as const,
    }));
  }

  private buildFTS5Query(input: string): string | null {
    const trimmed = input.trim();
    if (!trimmed) return null;

    // If already has FTS5 operators, use as-is
    if (/[*"{}]/.test(trimmed) || /\b(AND|OR|NOT)\b/.test(trimmed)) {
      return trimmed;
    }

    // Simple quote escape
    const escaped = trimmed.replace(/"/g, '""');
    return `"${escaped}"`;
  }

  private normalizeBM25(rawScore: number): number {
    // Normalize BM25 score (negative) to 0-1 range
    const normalized = 1 / (1 + Math.abs(rawScore) / 10);
    return Math.round(normalized * 1000) / 1000;
  }

  private getContextForFile(db: Database, filepath: string): string | null {
    const stmt = db.prepare(`
      SELECT context_text FROM path_contexts
      WHERE ? LIKE path_prefix || '%'
      ORDER BY LENGTH(path_prefix) DESC
      LIMIT 1
    `);
    const result = stmt.get(filepath) as { context_text: string } | undefined;
    return result?.context_text || null;
  }

  private outputResults(results: any[], query: string, opts: OutputOptions): void {
    // Apply filtering
    let filtered = results;

    if (opts.minScore > 0) {
      filtered = filtered.filter(r => r.score >= opts.minScore);
    }

    if (!opts.all) {
      filtered = filtered.slice(0, opts.limit);
    }

    // Output based on format
    if (opts.format === 'json') {
      this.log(JSON.stringify({ query, results: filtered }, null, 2));
    } else if (opts.format === 'csv') {
      this.log('file,title,score,context');
      for (const r of filtered) {
        this.log(`"${r.displayPath}","${r.title}",${r.score},"${r.context || ''}"`);
      }
    } else if (opts.format === 'files') {
      for (const r of filtered) {
        this.log(r.displayPath);
      }
    } else {
      // CLI format
      this.log(`\n🔍 Found ${filtered.length} result${filtered.length === 1 ? '' : 's'}\n`);
      for (const r of filtered) {
        this.log(`📄 ${r.displayPath}`);
        this.log(`   ${r.title}`);
        this.log(`   Score: ${Math.round(r.score * 100)}%`);
        if (r.context) {
          this.log(`   Context: ${r.context}`);
        }
        if (opts.full) {
          this.log(`\n${r.body}\n`);
        }
        this.log('');
      }
    }
  }
}
