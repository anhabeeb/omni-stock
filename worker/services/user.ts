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
    // Fix legacy roles if any
    await this.fixLegacyRoles();

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

  private async fixLegacyRoles(): Promise<void> {
    try {
      await this.db.batch([
        this.db.prepare("UPDATE users SET role_id = 'role_super_admin' WHERE role_id = '1' OR role_id = 1"),
        this.db.prepare("UPDATE users SET role_id = 'role_admin' WHERE role_id = '2' OR role_id = 2"),
        this.db.prepare("UPDATE users SET role_id = 'role_warehouse_manager' WHERE role_id = '3' OR role_id = 3"),
        this.db.prepare("UPDATE users SET role_id = 'role_warehouse_staff' WHERE role_id = '4' OR role_id = 4")
      ]);
    } catch (e) {
      console.error("Failed to fix legacy roles:", e);
    }
  }

  async getUserByUsername(username: string): Promise<User | null> {
    return await this.db.prepare(`
      SELECT u.*, r.name as role_name 
      FROM users u 
      LEFT JOIN roles r ON u.role_id = r.id 
      WHERE LOWER(u.username) = LOWER(?) AND u.is_active = 1
    `).bind(username).first() as User;
  }

  async getUserForLogin(usernameOrEmail: string): Promise<User | null> {
    // Fix legacy roles if any (mapping old numeric IDs to new string IDs)
    await this.fixLegacyRoles();

    return await this.db.prepare(`
      SELECT u.*, r.name as role_name 
      FROM users u 
      LEFT JOIN roles r ON u.role_id = r.id 
      WHERE (LOWER(u.username) = LOWER(?) OR LOWER(u.email) = LOWER(?)) AND u.is_active = 1
    `).bind(usernameOrEmail, usernameOrEmail).first() as User;
  }

  async getUserById(id: string): Promise<User | null> {
    // Check if user has a legacy numeric role and fix it if so
    const userCheck = await this.db.prepare(`SELECT role_id FROM users WHERE id = ?`).bind(id).first() as any;
    if (userCheck && (typeof userCheck.role_id === 'number' || !isNaN(Number(userCheck.role_id)))) {
      await this.fixLegacyRoles();
    }

    return await this.db.prepare(`
      SELECT u.*, r.name as role_name 
      FROM users u 
      LEFT JOIN roles r ON u.role_id = r.id 
      WHERE u.id = ? AND u.is_active = 1
    `).bind(id).first() as User;
  }

  async getUserPermissions(userId: string): Promise<string[]> {
    // 1. Get permissions from role
    const rolePermissionsQuery = `
      SELECT p.key
      FROM permissions p
      JOIN role_permissions rp ON p.id = rp.permission_id
      WHERE rp.role_id = (SELECT role_id FROM users WHERE id = ?)
    `;
    const { results: roleResults } = await this.db.prepare(rolePermissionsQuery).bind(userId).all();
    const rolePermissions = new Set(roleResults.map((r: any) => r.key));

    // 2. Get granted permissions
    const grantsQuery = `
      SELECT p.key
      FROM permissions p
      JOIN user_permission_grants upg ON p.id = upg.permission_id
      WHERE upg.user_id = ?
    `;
    const { results: grantResults } = await this.db.prepare(grantsQuery).bind(userId).all();
    grantResults.forEach((r: any) => rolePermissions.add(r.key));

    // 3. Get denied permissions
    const denialsQuery = `
      SELECT p.key
      FROM permissions p
      JOIN user_permission_denials upd ON p.id = upd.permission_id
      WHERE upd.user_id = ?
    `;
    const { results: denialResults } = await this.db.prepare(denialsQuery).bind(userId).all();
    denialResults.forEach((r: any) => rolePermissions.delete(r.key));

    return Array.from(rolePermissions) as string[];
  }

  async getUserPermissionOverrides(userId: string): Promise<{ grants: string[], denials: string[] }> {
    const grantsQuery = `SELECT p.key FROM permissions p JOIN user_permission_grants upg ON p.id = upg.permission_id WHERE upg.user_id = ?`;
    const denialsQuery = `SELECT p.key FROM permissions p JOIN user_permission_denials upd ON p.id = upd.permission_id WHERE upd.user_id = ?`;
    
    const { results: grants } = await this.db.prepare(grantsQuery).bind(userId).all();
    const { results: denials } = await this.db.prepare(denialsQuery).bind(userId).all();
    
    return {
      grants: grants.map((r: any) => r.key),
      denials: denials.map((r: any) => r.key)
    };
  }

  async updateUserPermissions(userId: string, grants: string[], denials: string[], updatedBy: string): Promise<void> {
    // Start a transaction if possible, but D1 batch is better
    const batch = [];
    
    // Clear existing overrides
    batch.push(this.db.prepare("DELETE FROM user_permission_grants WHERE user_id = ?").bind(userId));
    batch.push(this.db.prepare("DELETE FROM user_permission_denials WHERE user_id = ?").bind(userId));
    
    // Add new grants
    for (const key of grants) {
      batch.push(this.db.prepare(`
        INSERT INTO user_permission_grants (user_id, permission_id, created_by)
        SELECT ?, id, ? FROM permissions WHERE key = ?
      `).bind(userId, updatedBy, key));
    }
    
    // Add new denials
    for (const key of denials) {
      batch.push(this.db.prepare(`
        INSERT INTO user_permission_denials (user_id, permission_id, created_by)
        SELECT ?, id, ? FROM permissions WHERE key = ?
      `).bind(userId, updatedBy, key));
    }
    
    await this.db.batch(batch);
  }

  async getAllPermissions(): Promise<{ id: string, key: string, description: string }[]> {
    const { results } = await this.db.prepare("SELECT * FROM permissions ORDER BY key ASC").all();
    return results as any[];
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
