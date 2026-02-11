// chat/services/room-data-provider.interface.ts

import {InjectionToken} from '@angular/core';
import {
  RoomModel,
  UserModelSummary,
} from '../models';

export const ROOM_DATA_PROVIDER = new InjectionToken<RoomDataProvider>('ROOM_DATA_PROVIDER');

export interface RoomDataProvider {
  getUserRooms(userId: string, options?: LoadUserRoomsOptions): Promise<RoomModel[]>;
  getRoomById(roomId: string, options?: GetRoomOptions): Promise<RoomModel>;
  markRoomAsRead(roomId: string, userId: string): Promise<void>;
  archiveRoom(roomId: string, userId: string): Promise<void>;
  unarchiveRoom(roomId: string, userId: string): Promise<void>;
  favoriteRoom(roomId: string, userId: string): Promise<void>;
  unfavoriteRoom(roomId: string, userId: string): Promise<void>;
  muteRoom(roomId: string, userId: string, duration?: number): Promise<void>;
  unmuteRoom(roomId: string, userId: string): Promise<void>;
  leaveRoom(roomId: string, userId: string): Promise<void>;
  deleteRoom(roomId: string): Promise<void>;
}

export interface GetRoomOptions {
  signal?: AbortSignal;
  forceRefresh?: boolean;
}

export interface LoadUserRoomsOptions {
  signal?: AbortSignal;
  includeArchived?: boolean;
  includeDeleted?: boolean;
  forceRefresh?: boolean;
}
