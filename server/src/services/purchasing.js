import { config } from '../config.js';

/**
 * Interface every supplier integration implements. Swap in a real grocer by
 * adding a class here and a case in getAdapter().
 *
 * placeOrder({ purchase, supplier, ingredient }) → { confirmationId, expectedArrival }
 */
export class SupplierAdapter {
  async placeOrder() {
    throw new Error('placeOrder not implemented');
  }
}

/** Simulates ordering: records a confirmation and arrival after the supplier's lead time. */
export class MockSupplierAdapter extends SupplierAdapter {
  async placeOrder({ supplier }) {
    return {
      confirmationId: `MOCK-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`.toUpperCase(),
      expectedArrival: new Date(Date.now() + supplier.leadTimeHours * 3600e3),
    };
  }
}

export function getAdapter() {
  switch (config.supplierMode) {
    case 'mock':
      return new MockSupplierAdapter();
    default:
      throw new Error(`Unknown SUPPLIER_MODE "${config.supplierMode}"`);
  }
}
