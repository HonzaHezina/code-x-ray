import { database } from '@/data/database';
import { refund } from './payments';
export function cancelReservation(id: string): void {
  database.reservations.delete(id);
  refund(id);
}
export function reservationExists(id: string): boolean { return database.reservations.has(id); }
