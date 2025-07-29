import { db } from "../db";
import { 
  inventoryItems, 
  inventoryCategories, 
  storeInventory, 
  inventoryTransactions, 
  stockAlerts,
  stores,
  users,
  type InsertInventoryItem,
  type InsertStoreInventory,
  type InsertInventoryTransaction,
  type InsertStockAlert,
  type InventoryItem,
  type StoreInventory,
  type StockAlert
} from "@shared/schema";
import { eq, and, sql, desc, lt, gte } from "drizzle-orm";

export class InventoryService {
  // Get all inventory items with category information
  async getInventoryItems(storeId?: number): Promise<any[]> {
    let query = db
      .select({
        id: inventoryItems.id,
        name: inventoryItems.name,
        description: inventoryItems.description,
        sku: inventoryItems.sku,
        unit: inventoryItems.unit,
        minimumStock: inventoryItems.minimumStock,
        maximumStock: inventoryItems.maximumStock,
        unitCost: inventoryItems.unitCost,
        supplier: inventoryItems.supplier,
        expirationDays: inventoryItems.expirationDays,
        isActive: inventoryItems.isActive,
        categoryName: inventoryCategories.name,
        categoryId: inventoryItems.categoryId,
        currentStock: storeId ? storeInventory.currentStock : sql<number>`0`,
        reservedStock: storeId ? storeInventory.reservedStock : sql<number>`0`,
        lastStockCheck: storeId ? storeInventory.lastStockCheck : null,
      })
      .from(inventoryItems)
      .leftJoin(inventoryCategories, eq(inventoryItems.categoryId, inventoryCategories.id));

    if (storeId) {
      query = query.leftJoin(
        storeInventory, 
        and(
          eq(storeInventory.itemId, inventoryItems.id),
          eq(storeInventory.storeId, storeId)
        )
      );
    }

    return await query.where(eq(inventoryItems.isActive, true));
  }

  // Get out of stock items for a store
  async getOutOfStockItems(storeId: number): Promise<any[]> {
    return await db
      .select({
        id: inventoryItems.id,
        name: inventoryItems.name,
        description: inventoryItems.description,
        sku: inventoryItems.sku,
        unit: inventoryItems.unit,
        minimumStock: inventoryItems.minimumStock,
        currentStock: storeInventory.currentStock,
        categoryName: inventoryCategories.name,
        supplier: inventoryItems.supplier,
        unitCost: inventoryItems.unitCost,
        lastStockCheck: storeInventory.lastStockCheck,
      })
      .from(inventoryItems)
      .leftJoin(inventoryCategories, eq(inventoryItems.categoryId, inventoryCategories.id))
      .leftJoin(
        storeInventory, 
        and(
          eq(storeInventory.itemId, inventoryItems.id),
          eq(storeInventory.storeId, storeId)
        )
      )
      .where(
        and(
          eq(inventoryItems.isActive, true),
          sql`COALESCE(${storeInventory.currentStock}, 0) = 0`
        )
      );
  }

  // Get low stock items for a store
  async getLowStockItems(storeId: number): Promise<any[]> {
    return await db
      .select({
        id: inventoryItems.id,
        name: inventoryItems.name,
        description: inventoryItems.description,
        sku: inventoryItems.sku,
        unit: inventoryItems.unit,
        minimumStock: inventoryItems.minimumStock,
        currentStock: storeInventory.currentStock,
        categoryName: inventoryCategories.name,
        supplier: inventoryItems.supplier,
        unitCost: inventoryItems.unitCost,
        lastStockCheck: storeInventory.lastStockCheck,
      })
      .from(inventoryItems)
      .leftJoin(inventoryCategories, eq(inventoryItems.categoryId, inventoryCategories.id))
      .leftJoin(
        storeInventory, 
        and(
          eq(storeInventory.itemId, inventoryItems.id),
          eq(storeInventory.storeId, storeId)
        )
      )
      .where(
        and(
          eq(inventoryItems.isActive, true),
          sql`COALESCE(${storeInventory.currentStock}, 0) > 0`,
          sql`COALESCE(${storeInventory.currentStock}, 0) <= ${inventoryItems.minimumStock}`
        )
      );
  }

  // Get all stock alerts for a store
  async getStockAlerts(storeId: number, unreadOnly: boolean = false): Promise<any[]> {
    let whereConditions = [eq(stockAlerts.storeId, storeId)];
    
    if (unreadOnly) {
      whereConditions.push(eq(stockAlerts.isResolved, false));
    }

    return await db
      .select({
        id: stockAlerts.id,
        alertType: stockAlerts.alertType,
        alertLevel: stockAlerts.alertLevel,
        currentStock: stockAlerts.currentStock,
        threshold: stockAlerts.threshold,
        message: stockAlerts.message,
        isResolved: stockAlerts.isResolved,
        createdAt: stockAlerts.createdAt,
        itemName: inventoryItems.name,
        itemSku: inventoryItems.sku,
        categoryName: inventoryCategories.name,
      })
      .from(stockAlerts)
      .leftJoin(inventoryItems, eq(stockAlerts.itemId, inventoryItems.id))
      .leftJoin(inventoryCategories, eq(inventoryItems.categoryId, inventoryCategories.id))
      .where(and(...whereConditions))
      .orderBy(desc(stockAlerts.createdAt));
  }

  // Update stock levels
  async updateStock(
    storeId: number,
    itemId: number,
    newStock: number,
    transactionType: string,
    reason: string,
    performedBy: number,
    referenceId?: string
  ): Promise<void> {
    await db.transaction(async (tx) => {
      // Get current stock
      const [currentInventory] = await tx
        .select()
        .from(storeInventory)
        .where(
          and(
            eq(storeInventory.storeId, storeId),
            eq(storeInventory.itemId, itemId)
          )
        );

      const oldStock = currentInventory?.currentStock || 0;
      const quantity = newStock - oldStock;

      // Update or insert store inventory
      if (currentInventory) {
        await tx
          .update(storeInventory)
          .set({
            currentStock: newStock,
            lastStockCheck: new Date(),
            lastStockCheckBy: performedBy,
            updatedAt: new Date(),
          })
          .where(eq(storeInventory.id, currentInventory.id));
      } else {
        await tx.insert(storeInventory).values({
          storeId,
          itemId,
          currentStock: newStock,
          lastStockCheck: new Date(),
          lastStockCheckBy: performedBy,
        });
      }

      // Record transaction
      await tx.insert(inventoryTransactions).values({
        storeId,
        itemId,
        transactionType,
        quantity,
        reason,
        referenceId,
        performedBy,
      });

      // Check for stock alerts
      await this.checkAndCreateStockAlerts(tx, storeId, itemId, newStock);
    });
  }

  // Check and create stock alerts
  private async checkAndCreateStockAlerts(
    tx: any,
    storeId: number,
    itemId: number,
    currentStock: number
  ): Promise<void> {
    // Get item details
    const [item] = await tx
      .select()
      .from(inventoryItems)
      .where(eq(inventoryItems.id, itemId));

    if (!item) return;

    // Check for out of stock
    if (currentStock === 0) {
      await tx.insert(stockAlerts).values({
        storeId,
        itemId,
        alertType: 'out_of_stock',
        alertLevel: 'critical',
        currentStock,
        threshold: 0,
        message: `${item.name} is completely out of stock`,
      });
    }
    // Check for low stock
    else if (currentStock <= item.minimumStock) {
      await tx.insert(stockAlerts).values({
        storeId,
        itemId,
        alertType: 'low_stock',
        alertLevel: 'warning',
        currentStock,
        threshold: item.minimumStock,
        message: `${item.name} is running low (${currentStock} ${item.unit} remaining)`,
      });
    }
    // Check for overstock
    else if (item.maximumStock && currentStock >= item.maximumStock) {
      await tx.insert(stockAlerts).values({
        storeId,
        itemId,
        alertType: 'overstocked',
        alertLevel: 'info',
        currentStock,
        threshold: item.maximumStock,
        message: `${item.name} is overstocked (${currentStock} ${item.unit})`,
      });
    }
  }

  // Resolve stock alert
  async resolveStockAlert(alertId: number, resolvedBy: number): Promise<void> {
    await db
      .update(stockAlerts)
      .set({
        isResolved: true,
        resolvedBy,
        resolvedAt: new Date(),
      })
      .where(eq(stockAlerts.id, alertId));
  }

  // Get inventory statistics for a store
  async getInventoryStats(storeId: number): Promise<any> {
    const [stats] = await db
      .select({
        totalItems: sql<number>`COUNT(DISTINCT ${inventoryItems.id})`,
        outOfStockCount: sql<number>`COUNT(CASE WHEN COALESCE(${storeInventory.currentStock}, 0) = 0 THEN 1 END)`,
        lowStockCount: sql<number>`COUNT(CASE WHEN COALESCE(${storeInventory.currentStock}, 0) > 0 AND COALESCE(${storeInventory.currentStock}, 0) <= ${inventoryItems.minimumStock} THEN 1 END)`,
        totalValue: sql<number>`SUM(COALESCE(${storeInventory.currentStock}, 0) * COALESCE(${inventoryItems.unitCost}, 0))`,
      })
      .from(inventoryItems)
      .leftJoin(
        storeInventory,
        and(
          eq(storeInventory.itemId, inventoryItems.id),
          eq(storeInventory.storeId, storeId)
        )
      )
      .where(eq(inventoryItems.isActive, true));

    return stats;
  }

  // Create inventory item
  async createInventoryItem(itemData: InsertInventoryItem): Promise<InventoryItem> {
    const [item] = await db
      .insert(inventoryItems)
      .values(itemData)
      .returning();
    return item;
  }

  // Create inventory category
  async createInventoryCategory(name: string, description?: string): Promise<any> {
    const [category] = await db
      .insert(inventoryCategories)
      .values({ name, description })
      .returning();
    return category;
  }

  // Get all inventory categories
  async getInventoryCategories(): Promise<any[]> {
    return await db
      .select()
      .from(inventoryCategories)
      .where(eq(inventoryCategories.isActive, true))
      .orderBy(inventoryCategories.name);
  }
}

export const inventoryService = new InventoryService();