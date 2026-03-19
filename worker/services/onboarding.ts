/// <reference types="@cloudflare/workers-types" />

export class OnboardingService {
  constructor(private db: D1Database) {}

  async getStatus(userId: string): Promise<any> {
    const result = await this.db.prepare(`
      SELECT * FROM user_onboarding WHERE user_id = ?
    `).bind(userId).first();

    if (!result) {
      // If no record, create one (default to needing tutorial)
      const newOnboarding = {
        user_id: userId,
        tutorial_completed: 0,
        tutorial_version: 'v1',
        force_tutorial: 1,
        updated_at: new Date().toISOString()
      };
      await this.db.prepare(`
        INSERT INTO user_onboarding (user_id, tutorial_completed, tutorial_version, force_tutorial)
        VALUES (?, ?, ?, ?)
      `).bind(userId, 0, 'v1', 1).run();
      return newOnboarding;
    }

    return result;
  }

  async startTutorial(userId: string): Promise<void> {
    await this.db.prepare(`
      UPDATE user_onboarding SET
        last_started_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
      WHERE user_id = ?
    `).bind(userId).run();
  }

  async completeTutorial(userId: string): Promise<void> {
    await this.db.prepare(`
      UPDATE user_onboarding SET
        tutorial_completed = 1,
        force_tutorial = 0,
        last_completed_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
      WHERE user_id = ?
    `).bind(userId).run();
  }

  async resetTutorial(userId: string): Promise<void> {
    await this.db.prepare(`
      UPDATE user_onboarding SET
        tutorial_completed = 0,
        force_tutorial = 1,
        updated_at = CURRENT_TIMESTAMP
      WHERE user_id = ?
    `).bind(userId).run();
  }

  async getAllStatuses(): Promise<any[]> {
    const { results } = await this.db.prepare(`
      SELECT u.username, u.full_name, o.*
      FROM user_onboarding o
      JOIN users u ON o.user_id = u.id
    `).all();
    return results;
  }
}
