import axios from 'axios';
import { localDb } from '../db/localDb';

export class LocalSyncService {
  static async syncMasterData(type: 'item' | 'supplier' | 'godown' | 'outlet' | 'category' | 'unit') {
    const endpointMap = {
      item: '/api/items',
      supplier: '/api/suppliers',
      godown: '/api/godowns',
      outlet: '/api/outlets',
      category: '/api/categories',
      unit: '/api/units'
    };

    const endpoint = endpointMap[type];
    if (!endpoint) return;

    try {
      const response = await axios.get(endpoint);
      const data = response.data;

      if (Array.isArray(data)) {
        await localDb.transaction('rw', localDb.masterData, async () => {
          // Clear existing data of this type
          await localDb.masterData.where('type').equals(type).delete();
          
          // Bulk add new data
          const now = Date.now();
          const records = data.map(item => ({
            id: `${type}_${item.id}`,
            type,
            data: item,
            updatedAt: now
          }));
          
          await localDb.masterData.bulkAdd(records);
        });
      }
    } catch (error) {
      console.error(`Failed to sync ${type}:`, error);
    }
  }

  static async getLocalData(type: 'item' | 'supplier' | 'godown' | 'outlet' | 'category' | 'unit') {
    const records = await localDb.masterData.where('type').equals(type).toArray();
    return records.map(r => r.data);
  }

  static async syncAll() {
    const types: ('item' | 'supplier' | 'godown' | 'outlet' | 'category' | 'unit')[] = [
      'item', 'supplier', 'godown', 'outlet', 'category', 'unit'
    ];
    await Promise.all(types.map(t => this.syncMasterData(t)));
  }
}
