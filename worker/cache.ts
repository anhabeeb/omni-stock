import { Context } from 'hono';

export class CacheManager {
  private static readonly VERSION_KEY = 'CACHE_VERSION';

  static async get(c: Context, ttl: number) {
    if (c.req.method !== 'GET') return null;
    if (!c.env.KV) return null;

    const cache = (caches as any).default;
    const url = new URL(c.req.url);
    
    const cacheVersion = await c.env.KV.get(this.VERSION_KEY) || 'v1';
    url.searchParams.set('cv', cacheVersion);
    
    const cacheKey = new Request(url.toString(), c.req.raw);
    const response = await cache.match(cacheKey);
    
    if (response) {
      const newResponse = new Response(response.body, response);
      newResponse.headers.set('X-Cache-Version', cacheVersion);
      return newResponse;
    }
    return null;
  }

  static async put(c: Context, response: Response, ttl: number) {
    if (c.req.method !== 'GET') return response;
    if (!c.env.KV) return response;

    const cache = (caches as any).default;
    const url = new URL(c.req.url);
    const cacheVersion = await c.env.KV.get(this.VERSION_KEY) || 'v1';
    url.searchParams.set('cv', cacheVersion);
    
    const cacheKey = new Request(url.toString(), c.req.raw);
    
    const newResponse = new Response(response.body, response);
    newResponse.headers.set('Cache-Control', `public, max-age=${ttl}`);
    newResponse.headers.set('X-Cache-Version', cacheVersion);
    
    await cache.put(cacheKey, newResponse.clone());
    return newResponse;
  }

  static async invalidate(c: Context) {
    if (!c.env.KV) return;
    const currentVersion = await c.env.KV.get(this.VERSION_KEY) || 'v1';
    const versionNumber = parseInt(currentVersion.substring(1)) || 1;
    const newVersion = `v${versionNumber + 1}`;
    await c.env.KV.put(this.VERSION_KEY, newVersion);
  }
}
