import { Context } from 'hono';

export class CacheManager {
  static async get(c: Context, ttl: number) {
    if (!c.env.OMNI_STOCK) return null;
    const cache = (caches as any).default;
    const url = new URL(c.req.url);
    
    // Use a custom header to track cache version for invalidation
    // This is a simple way to invalidate all caches by changing the version
    const cacheVersion = await c.env.OMNI_STOCK.get('CACHE_VERSION') || 'v1';
    url.searchParams.set('cv', cacheVersion);
    
    const cacheKey = new Request(url.toString(), c.req.raw);
    const response = await cache.match(cacheKey);
    
    if (response) {
      return response;
    }
    return null;
  }

  static async put(c: Context, response: Response, ttl: number) {
    if (!c.env.OMNI_STOCK) return response;
    const cache = (caches as any).default;
    const url = new URL(c.req.url);
    const cacheVersion = await c.env.OMNI_STOCK.get('CACHE_VERSION') || 'v1';
    url.searchParams.set('cv', cacheVersion);
    
    const cacheKey = new Request(url.toString(), c.req.raw);
    
    // Clone response to modify headers
    const newResponse = new Response(response.body, response);
    newResponse.headers.set('Cache-Control', `public, max-age=${ttl}`);
    
    await cache.put(cacheKey, newResponse.clone());
    return newResponse;
  }

  static async invalidate(c: Context) {
    if (!c.env.OMNI_STOCK) return;
    // Increment cache version to effectively invalidate all Cache API entries
    const currentVersion = await c.env.OMNI_STOCK.get('CACHE_VERSION') || 'v1';
    const newVersion = `v${parseInt(currentVersion.substring(1)) + 1}`;
    await c.env.OMNI_STOCK.put('CACHE_VERSION', newVersion);
    
    // Also clear specific KV summaries if needed
    // For now, we'll just let them be overwritten
  }
}
