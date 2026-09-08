import { cancelReservation } from '@/services/reservations';
// Intentional architectural violation: UI bypasses the service layer.
import { database } from '@/data/database';
export function onCancel(id: string): void {
  cancelReservation(id);
  database.audit.push(`UI directly wrote cancellation ${id}`);
}
