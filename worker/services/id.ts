/// <reference types="@cloudflare/workers-types" />

export class IdService {
  constructor(private db: D1Database) {}

  /**
   * Generates a human-readable ID in the format: <prefix>-<5 digit number>
   * Uses atomic UPDATE ... RETURNING to ensure uniqueness and sequentiality under concurrency.
   */
  async generateId(prefix: string): Promise<string> {
    // 1. Attempt to increment and fetch the new value atomically
    const result = await this.db.prepare(`
      UPDATE id_sequences 
      SET current_value = current_value + 1, updated_at = CURRENT_TIMESTAMP
      WHERE prefix = ?
      RETURNING current_value
    `).bind(prefix).first<{ current_value: number }>();

    let val: number;

    if (!result) {
      // 2. If prefix doesn't exist, initialize it (should be seeded, but good to have fallback)
      await this.db.prepare(`
        INSERT OR IGNORE INTO id_sequences (prefix, current_value, updated_at)
        VALUES (?, 1, CURRENT_TIMESTAMP)
      `).bind(prefix).run();
      
      // 3. Fetch the value (might have been inserted by another request)
      const retry = await this.db.prepare(`
        SELECT current_value FROM id_sequences WHERE prefix = ?
      `).bind(prefix).first<{ current_value: number }>();
      
      val = retry?.current_value || 1;
    } else {
      val = result.current_value;
    }

    // 4. Format with zero-padding (minimum 5 digits)
    const paddedNumber = val.toString().padStart(5, '0');
    return `${prefix}-${paddedNumber}`;
  }

  /**
   * Helper to generate multiple IDs at once (optional, but useful for batch operations)
   */
  async generateIds(prefix: string, count: number): Promise<string[]> {
    const ids: string[] = [];
    
    // We can increment by 'count' in one go
    const result = await this.db.prepare(`
      UPDATE id_sequences 
      SET current_value = current_value + ?, updated_at = CURRENT_TIMESTAMP
      WHERE prefix = ?
      RETURNING current_value
    `).bind(count, prefix).first<{ current_value: number }>();

    if (!result) {
      // Fallback to individual generation if prefix missing
      for (let i = 0; i < count; i++) {
        ids.push(await this.generateId(prefix));
      }
      return ids;
    }

    const lastVal = result.current_value;
    const firstVal = lastVal - count + 1;

    for (let i = 0; i < count; i++) {
      const val = firstVal + i;
      const paddedNumber = val.toString().padStart(5, '0');
      ids.push(`${prefix}-${paddedNumber}`);
    }

    return ids;
  }
}
