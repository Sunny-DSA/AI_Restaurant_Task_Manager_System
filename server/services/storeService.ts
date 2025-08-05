import { storage } from "../storage";
import { InsertStore } from "@shared/schema";
import QRCode from "qrcode";
import crypto from "crypto";

export class StoreService {
  static async createStore(storeData: InsertStore) {
    const store = await storage.createStore(storeData);

    // Generate QR code for the new store
    await this.generateQRCode(store.id);

    return store;
  }

  static async generateQRCode(storeId: number) {
    const store = await storage.getStore(storeId);
    if (!store) {
      throw new Error("Store not found");
    }

    const secret = crypto.randomBytes(32).toString("hex");

    const qrData = {
      storeId: store.id,
      employeeId: store.id, // Assuming employeeId = storeId temporarily
      secret,
      version: 1,
    };

    const qrCodeData = JSON.stringify(qrData);
    const qrCode = await QRCode.toDataURL(qrCodeData);

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30);

    await storage.updateStore(storeId, {
      qrCode,
      qrCodeSecret: secret,
      qrCodeExpiresAt: expiresAt,
    });

    return qrCode;
  }

  static async verifyQRCode(qrData: string): Promise<{ storeId: number; employeeId?: number; isValid: boolean }> {
    try {
      const parsed = JSON.parse(qrData);
      const { storeId, secret, employeeId } = parsed;

      if (!storeId || !secret || !employeeId) {
        return { storeId: 0, isValid: false };
      }

      const store = await storage.getStore(storeId);
      if (!store || !store.qrCodeSecret || !store.qrCodeExpiresAt) {
        return { storeId, isValid: false };
      }

      if (new Date() > store.qrCodeExpiresAt) {
        return { storeId, isValid: false };
      }

      const isValid = crypto.timingSafeEqual(
        Buffer.from(store.qrCodeSecret),
        Buffer.from(secret)
      );

      return { storeId, employeeId, isValid };
    } catch (error) {
      return { storeId: 0, isValid: false };
    }
  }

  static validateGeofence(
    store: { latitude: string | null; longitude: string | null; geofenceRadius?: number },
    userLat: number,
    userLon: number
  ): { isValid: boolean; distance: number; allowedRadius: number } {
    if (!store.latitude || !store.longitude) {
      return { isValid: false, distance: 0, allowedRadius: store.geofenceRadius || 100 };
    }

    const storeLat = parseFloat(store.latitude);
    const storeLon = parseFloat(store.longitude);

    const distance = this.calculateDistance(storeLat, storeLon, userLat, userLon);
    const allowedRadius = store.geofenceRadius || 100;
    const isValid = distance <= allowedRadius;

    return { isValid, distance, allowedRadius };
  }

  private static calculateDistance(
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number
  ): number {
    const R = 6371e3;
    const φ1 = (lat1 * Math.PI) / 180;
    const φ2 = (lat2 * Math.PI) / 180;
    const Δφ = ((lat2 - lat1) * Math.PI) / 180;
    const Δλ = ((lon2 - lon1) * Math.PI) / 180;

    const a = Math.sin(Δφ / 2) ** 2 +
              Math.cos(φ1) * Math.cos(φ2) *
              Math.sin(Δλ / 2) ** 2;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c;
  }

  static async getStoreStats(storeId: number) {
    const [taskStats, userStats] = await Promise.all([
      storage.getTaskStats(storeId),
      storage.getUserStats(storeId),
    ]);

    return {
      ...taskStats,
      ...userStats,
    };
  }
}
