import { storage } from "../storage";
import { InsertStore } from "@shared/schema";
import QRCode from "qrcode";
import crypto from "crypto";
import { haversineMeters } from "../utils/geo";

export class StoreService {
  static async createStore(storeData: InsertStore) {
    const store = await storage.createStore(storeData);
    await this.generateQRCode(store.id);
    return store;
  }

  static async generateQRCode(storeId: number) {
    const store = await storage.getStore(storeId);
    if (!store) {
      throw new Error("Store not found");
    }

    const secret = crypto.randomBytes(32).toString("hex");

    // NOTE: employeeId can be encoded if you want store-specific employee codes
    const qrData = {
      storeId: store.id,
      employeeId: store.id, // TODO: replace with real employeeId if encoding per-employee
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
    } catch {
      return { storeId: 0, isValid: false };
    }
  }

  // Store-level geofence check; returns distance for UI/debug
  static validateGeofence(
    store: { latitude: string | null; longitude: string | null; geofenceRadius?: number },
    userLat: number,
    userLon: number
  ): { isValid: boolean; distance: number; allowedRadius: number } {
    const allowedRadius = store.geofenceRadius || 2000; // Increased from 1000m to 2000m for better GPS tolerance

    if (!store.latitude || !store.longitude) {
      return { isValid: false, distance: 0, allowedRadius };
    }

    const storeLat = parseFloat(store.latitude);
    const storeLon = parseFloat(store.longitude);

    const distance = haversineMeters(
      { lat: storeLat, lng: storeLon },
      { lat: userLat, lng: userLon }
    );

    return { isValid: distance <= allowedRadius, distance, allowedRadius };
  }

  static async getStoreStats(storeId: number) {
    const [taskStats, userStats] = await Promise.all([
      storage.getTaskStats(storeId),
      storage.getUserStats(storeId),
    ]);
    return { ...taskStats, ...userStats };
  }
}
