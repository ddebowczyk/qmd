import { Command, Flags } from '@oclif/core';
import { Database } from 'bun:sqlite';
import { resolve } from 'path';
import { existsSync } from 'fs';

export default class StatusCommand extends Command {
  static description = 'Show index status and collections';

  static flags = {
    index: Flags.string({
      description: 'Index name',
      default: 'default',
    }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(StatusCommand);

    const cacheDir = process.env.XDG_CACHE_HOME || resolve(process.env.HOME || '~', '.cache');
    const dbPath = resolve(cacheDir, 'qmd', `${flags.index}.sqlite`);

    if (!existsSync(dbPath)) {
      this.log(`No index found at: ${dbPath}`);
      this.log('Run: qmd add <files> to create an index');
      return;
    }

    const db = new Database(dbPath, { readonly: true });

    try {
      // Get collections
      const collections = db.prepare(`
        SELECT id, pwd, glob_pattern, created_at
        FROM collections
        ORDER BY created_at DESC
      `).all() as any[];

      // Get document counts per collection
      const docCounts = db.prepare(`
        SELECT collection_id, COUNT(*) as count
        FROM documents
        WHERE active = 1
        GROUP BY collection_id
      `).all() as any[];

      const countMap = new Map(docCounts.map((r: any) => [r.collection_id, r.count]));

      // Display results
      this.log(`\n📊 Index: ${flags.index}`);
      this.log(`📁 Location: ${dbPath}\n`);

      if (collections.length === 0) {
        this.log('No collections found. Run: qmd add <files>');
        return;
      }

      this.log(`Collections (${collections.length}):`);
      for (const col of collections) {
        const count = countMap.get(col.id) || 0;
        this.log(`  ${col.pwd}`);
        this.log(`    Pattern: ${col.glob_pattern}`);
        this.log(`    Documents: ${count}`);
        this.log(`    Created: ${new Date(col.created_at).toLocaleString()}`);
        this.log('');
      }

      // Get total counts
      const totals = db.prepare(`
        SELECT
          COUNT(*) as total_docs,
          COUNT(DISTINCT collection_id) as total_collections
        FROM documents
        WHERE active = 1
      `).get() as any;

      this.log(`Total: ${totals.total_docs} documents in ${totals.total_collections} collections`);

    } finally {
      db.close();
    }
  }
}
