/// <reference types="@cloudflare/workers-types" />

import { IdService } from "./id";

export interface User {
  id: string;
  username: string;
  email: string;
  full_name: string;
  phone?: string;
  role_id: string;
  role_name?: string;
  is_active: number;
  last_login?: string;
  password_hash?: string; // Added for internal use
  created_at: string;
  updated_at: string;
}

export interface Role {
  id: string;
  name: string;
  description?: string;
  permissions?: string[];
}

export class UserService {
  private idService: IdService;

  constructor(private db: any) {
    this.idService = new IdService(db);
  }

  async getUsers(filters?: { role_id?: string; is_active?: number; search?: string }): Promise<User[]> {
    let query = `
      SELECT u.*, r.name as role_name 
      FROM users u 
      LEFT JOIN roles r ON u.role_id = r.id 
      WHERE 1=1
    `;
    const params: any[] = [];

    if (filters?.role_id) {
      query += ` AND u.role_id = ?`;
      params.push(filters.role_id);
    }

    if (filters?.is_active !== undefined) {
      query += ` AND u.is_active = ?`;
      params.push(filters.is_active);
    }

    if (filters?.search) {
      query += ` AND (u.username LIKE ? OR u.full_name LIKE ? OR u.email LIKE ?)`;
      const searchParam = `%${filters.search}%`;
      params.push(searchParam, searchParam, searchParam);
    }

    query += ` ORDER BY u.created_at DESC`;

    const { results } = await this.db.prepare(query).bind(...params).all();
    return results as User[];
  }

  async getUserByUsername(username: string): Promise<User | null> {
    return await this.db.prepare(`
      SELECT u.*, r.name as role_name 
      FROM users u 
      LEFT JOIN roles r ON u.role_id = r.id 
      WHERE LOWER(u.username) = LOWER(?) AND u.is_active = 1
    `).bind(username).first() as User;
  }

  async getUserForLogin(username: string): Promise<User | null> {
    return await this.db.prepare(`
      SELECT u.*, r.name as role_name 
      FROM users u 
      LEFT JOIN roles r ON u.role_id = r.id 
      WHERE LOWER(u.username) = LOWER(?) AND u.is_active = 1
    `).bind(username).first() as User;
  }

  async getUserById(id: string): Promise<User | null> {
    return await this.db.prepare(`
      SELECT u.*, r.name as role_name 
      FROM users u 
      LEFT JOIN roles r ON u.role_id = r.id 
      WHERE u.id = ?
    `).bind(id).first() as User;
  }

  async getUserPermissions(userId: string): Promise<string[]> {
    const query = `
      SELECT p.key
      FROM permissions p
      JOIN role_permissions rp ON p.id = rp.permission_id
      JOIN users u ON u.role_id = rp.role_id
      WHERE u.id = ?
    `;
    const { results } = await this.db.prepare(query).bind(userId).all();
    return results.map((r: any) => r.key);
  }

  async createUser(userData: Partial<User> & { password_hash: string }): Promise<string> {
    const id = await this.idService.generateId('usr');
    await this.db.prepare(`
      INSERT INTO users (id, username, email, password_hash, full_name, phone, role_id, is_active)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      id,
      userData.username,
      userData.email,
      userData.password_hash,
      userData.full_name,
      userData.phone || null,
      userData.role_id,
      userData.is_active ?? 1
    ).run();
    return id;
  }

  async updateUser(id: string, userData: Partial<User> & { password_hash?: string }): Promise<void> {
    const keys = Object.keys(userData).filter(k => k !== 'id' && k !== 'created_at' && k !== 'updated_at' && k !== 'role_name');
    if (keys.length === 0) return;

    const setClause = keys.map(k => `${k} = ?`).join(', ');
    const values = keys.map(k => userData[k as keyof typeof userData]);

    await this.db.prepare(`
      UPDATE users 
      SET ${setClause}, updated_at = CURRENT_TIMESTAMP 
      WHERE id = ?
    `).bind(...values, id).run();
  }

  async deactivateUser(id: string): Promise<void> {
    await this.db.prepare("UPDATE users SET is_active = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(id).run();
  }

  async reactivateUser(id: string): Promise<void> {
    await this.db.prepare("UPDATE users SET is_active = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(id).run();
  }

  async resetPassword(id: string, passwordHash: string): Promise<void> {
    await this.db.prepare("UPDATE users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(passwordHash, id).run();
  }

  async getRoles(): Promise<Role[]> {
    const { results } = await this.db.prepare("SELECT * FROM roles ORDER BY name ASC").all();
    return results as Role[];
  }

  async getRolePermissions(roleId: string): Promise<string[]> {
    const query = `
      SELECT p.key
      FROM permissions p
      JOIN role_permissions rp ON p.id = rp.permission_id
      WHERE rp.role_id = ?
    `;
    const { results } = await this.db.prepare(query).bind(roleId).all();
    return results.map((r: any) => r.key);
  }

  async updateLastLogin(id: string): Promise<void> {
    await this.db.prepare("UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?").bind(id).run();
  }
}
