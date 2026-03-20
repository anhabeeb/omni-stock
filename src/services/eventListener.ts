import axios from 'axios';
import { QueryClient } from '@tanstack/react-query';
import { LocalSyncService } from './localSync';

export class EventListenerService {
  private static intervalId: number | null = null;
  private static lastEventTimestamp: string = new Date().toISOString();
  private static isPolling = false;

  static start(queryClient: QueryClient) {
    if (this.intervalId) return;

    // Initial timestamp should be slightly in the past to catch missed events during load
    this.lastEventTimestamp = new Date(Date.now() - 30000).toISOString();

    this.intervalId = window.setInterval(() => {
      this.poll(queryClient);
    }, 5000); // Poll every 5 seconds
  }

  static stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  private static async poll(queryClient: QueryClient) {
    if (this.isPolling) return;
    this.isPolling = true;

    try {
      const response = await axios.get(`/api/events/poll?since=${encodeURIComponent(this.lastEventTimestamp)}`);
      const events = response.data;

      if (Array.isArray(events) && events.length > 0) {
        for (const event of events) {
          await this.handleEvent(event, queryClient);
          this.lastEventTimestamp = event.created_at;
        }
      }
    } catch (error) {
      console.error("Event polling failed:", error);
    } finally {
      this.isPolling = false;
    }
  }

  private static async handleEvent(event: any, queryClient: QueryClient) {
    const { event_type, entity_type, entity_id } = event;

    console.log(`Handling event: ${event_type}`, event);

    // 1. Invalidate TanStack Query
    if (entity_type === 'item') {
      queryClient.invalidateQueries({ queryKey: ["master-data", "items"] });
      await LocalSyncService.syncMasterData('item');
    } else if (entity_type === 'supplier') {
      queryClient.invalidateQueries({ queryKey: ["master-data", "suppliers"] });
      await LocalSyncService.syncMasterData('supplier');
    } else if (entity_type === 'godown') {
      queryClient.invalidateQueries({ queryKey: ["master-data", "godowns"] });
      await LocalSyncService.syncMasterData('godown');
    } else if (entity_type === 'outlet') {
      queryClient.invalidateQueries({ queryKey: ["master-data", "outlets"] });
      await LocalSyncService.syncMasterData('outlet');
    } else if (entity_type === 'category') {
      queryClient.invalidateQueries({ queryKey: ["master-data", "categories"] });
      await LocalSyncService.syncMasterData('category');
    } else if (entity_type === 'unit') {
      queryClient.invalidateQueries({ queryKey: ["master-data", "units"] });
      await LocalSyncService.syncMasterData('unit');
    } else if (entity_type === 'inventory' || entity_type === 'grn') {
      queryClient.invalidateQueries({ queryKey: ["inventory"] });
      queryClient.invalidateQueries({ queryKey: ["stock-batches"] });
    }

    // Generic invalidation for any change
    if (event_type.includes('updated') || event_type.includes('created') || event_type.includes('deleted')) {
       // Optional: more specific invalidations
    }
  }
}
