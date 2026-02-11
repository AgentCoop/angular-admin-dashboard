// mock-room-data.provider.ts
import { Injectable } from '@angular/core';
import {RoomDataProvider, LoadUserRoomsOptions, GetRoomOptions} from '../room-data-provider.interface';
import {
  RoomModel,
  RoomMember,
  UserModelSummary,
  RoomType,
  RoomPrivacy
} from '../../models';

@Injectable()
export class MockRoomDataProvider implements RoomDataProvider {
  private mockRooms: Map<string, RoomModel[]> = new Map();
  private mockRoomDetails: Map<string, RoomModel> = new Map();
  private mockMembers: Map<string, UserModelSummary[]> = new Map();
  private mockRoomMembers: Map<string, RoomMember[]> = new Map();
  private mockFavorites: Map<string, Set<string>> = new Map();
  private mockMuted: Map<string, { muted: boolean; until?: Date }> = new Map();
  private mockArchived: Map<string, boolean> = new Map();
  private mockUnreadCounts: Map<string, number> = new Map();

  constructor() {
    this.initializeMockData();
  }

  private initializeMockData(): void {
    const now = Date.now();
    const oneHour = 3600000;
    const oneDay = 86400000;
    const oneWeek = oneDay * 7;

    // ========== MOCK USERS ==========
    const currentUser: UserModelSummary = {
      id: 'user_1',
      name: 'John Doe',
      avatar: 'https://i.pravatar.cc/150?u=1'
    };

    const mockUsers: UserModelSummary[] = [
      currentUser,
      { id: 'user_2', name: 'Jane Smith', avatar: 'https://i.pravatar.cc/150?u=2' },
      { id: 'user_3', name: 'Bob Johnson', avatar: 'https://i.pravatar.cc/150?u=3' },
      { id: 'user_4', name: 'Alice Williams', avatar: 'https://i.pravatar.cc/150?u=4' },
      { id: 'user_5', name: 'Charlie Brown', avatar: 'https://i.pravatar.cc/150?u=5' },
    ];

    // ========== MOCK ROOM MEMBERS (RoomMember[]) ==========
    const generalMembers: RoomMember[] = [
      {
        user: mockUsers[0],
        joinedAt: new Date(now - oneDay * 30)
      },
      {
        user: mockUsers[1],
        joinedAt: new Date(now - oneDay * 29),
        invitedBy: mockUsers[0]
      },
      {
        user: mockUsers[2],
        joinedAt: new Date(now - oneDay * 28),
        invitedBy: mockUsers[1]
      },
      {
        user: mockUsers[3],
        joinedAt: new Date(now - oneDay * 27),
        invitedBy: mockUsers[0]
      },
      {
        user: mockUsers[4],
        joinedAt: new Date(now - oneDay * 26),
        invitedBy: mockUsers[0]
      },
    ];

    const directMembers: RoomMember[] = [
      { user: mockUsers[0], joinedAt: new Date(now - oneDay * 15) },
      { user: mockUsers[1], joinedAt: new Date(now - oneDay * 15) },
    ];

    const projectMembers: RoomMember[] = [
      { user: mockUsers[0], joinedAt: new Date(now - oneDay * 10) },
      { user: mockUsers[2], joinedAt: new Date(now - oneDay * 9) },
      { user: mockUsers[3], joinedAt: new Date(now - oneDay * 8) },
      { user: mockUsers[4], joinedAt: new Date(now - oneDay * 7) },
    ];

    // ========== MOCK ROOMS ==========
    const rooms: RoomModel[] = [
      {
        // General channel
        id: 'room_1',
        name: 'general',
        displayName: 'General',
        slug: 'general',
        description: 'General discussion for the team',
        topic: 'Welcome everyone! Please introduce yourself.',
        avatar: 'https://i.pravatar.cc/150?u=general',
        type: 'channel' as RoomType,
        privacy: 'public' as RoomPrivacy,
        createdAt: now - oneDay * 30,
        createdBy: mockUsers[0],
        updatedAt: now - oneHour,
        lastMessage: {
          id: 'msg_101',
          preview: 'Has anyone seen the latest design updates?',
          sender: mockUsers[1]
        },
        unreadCount: 3,
        participants: generalMembers
      },
      {
        // Direct message with Jane
        id: 'room_2',
        name: 'jane-smith',
        displayName: 'Jane Smith',
        slug: 'jane-smith',
        avatar: mockUsers[1].avatar,
        type: 'direct' as RoomType,
        privacy: 'private' as RoomPrivacy,
        createdAt: now - oneDay * 15,
        createdBy: mockUsers[0],
        updatedAt: now - oneHour * 2,
        lastMessage: {
          id: 'msg_201',
          preview: 'Sure, let me check the timeline',
          sender: mockUsers[1]
        },
        unreadCount: 5,
        participants: directMembers
      },
      {
        // Project Alpha group
        id: 'room_3',
        name: 'project-alpha',
        displayName: 'Project Alpha',
        slug: 'project-alpha',
        description: 'Alpha project coordination and updates',
        topic: 'Sprint planning every Monday at 10am',
        avatar: 'https://i.pravatar.cc/150?u=alpha',
        type: 'group' as RoomType,
        privacy: 'private' as RoomPrivacy,
        createdAt: now - oneDay * 10,
        createdBy: mockUsers[0],
        updatedAt: now - oneHour * 5,
        lastMessage: {
          id: 'msg_301',
          preview: 'The new feature is ready for QA',
          sender: mockUsers[2]
        },
        unreadCount: 2,
        participants: projectMembers
      },
      {
        // Thread about the new feature
        id: 'room_4',
        name: 'thread-new-feature',
        displayName: 'Thread: New Feature Discussion',
        slug: 'thread-new-feature',
        type: 'thread' as RoomType,
        privacy: 'private' as RoomPrivacy,
        createdAt: now - oneDay * 2,
        createdBy: mockUsers[2],
        updatedAt: now - oneHour * 1,
        lastMessage: {
          id: 'msg_401',
          preview: 'I think we should add more tests',
          sender: mockUsers[3]
        },
        unreadCount: 4,
        participants: projectMembers.slice(0, 3) // First 3 members
      },
      {
        // Archived room
        id: 'room_5',
        name: 'old-project',
        displayName: 'Legacy Project',
        slug: 'legacy-project',
        description: 'This project has been completed',
        type: 'group' as RoomType,
        privacy: 'private' as RoomPrivacy,
        createdAt: now - oneWeek * 8,
        createdBy: mockUsers[0],
        updatedAt: now - oneWeek * 4,
        lastMessage: {
          id: 'msg_501',
          preview: 'Great work everyone! Project complete.',
          sender: mockUsers[0]
        },
        unreadCount: 0,
        participants: [generalMembers[0], generalMembers[1], generalMembers[2]]
      }
    ];

    // ========== STORE MOCK DATA ==========

    // Store rooms for current user
    this.mockRooms.set('user_1', rooms.filter(r => r.id !== 'room_5')); // Exclude archived

    // Store all room details
    rooms.forEach(room => {
      this.mockRoomDetails.set(room.id, { ...room });
    });

    // Store members (UserModelSummary[])
    this.mockMembers.set('room_1', generalMembers.map(m => m.user));
    this.mockMembers.set('room_2', directMembers.map(m => m.user));
    this.mockMembers.set('room_3', projectMembers.map(m => m.user));
    this.mockMembers.set('room_4', projectMembers.slice(0, 3).map(m => m.user));
    this.mockMembers.set('room_5', generalMembers.slice(0, 3).map(m => m.user));

    // Store room members (RoomMember[])
    this.mockRoomMembers.set('room_1', generalMembers);
    this.mockRoomMembers.set('room_2', directMembers);
    this.mockRoomMembers.set('room_3', projectMembers);
    this.mockRoomMembers.set('room_4', projectMembers.slice(0, 3));
    this.mockRoomMembers.set('room_5', generalMembers.slice(0, 3));

    // Set unread counts
    // this.mockUnreadCounts.set('room_1_user_1', 3);
    // this.mockUnreadCounts.set('room_2_user_1', 5);
    // this.mockUnreadCounts.set('room_3_user_1', 2);
    // this.mockUnreadCounts.set('room_4_user_1', 4);
    // this.mockUnreadCounts.set('room_5_user_1', 0);

    // Set favorites
    const favorites = new Set<string>();
    favorites.add('room_1');
    favorites.add('room_3');
    this.mockFavorites.set('user_1', favorites);

    // Set muted
    this.mockMuted.set('room_2_user_1', {
      muted: true,
      until: new Date(now + oneDay)
    });

    // Set archived
    this.mockArchived.set('room_5', true);
  }

  async getUserRooms(userId: string, options?: LoadUserRoomsOptions): Promise<RoomModel[]> {
    await this.delay(500);

    let rooms = this.mockRooms.get(userId) || [];

    // Apply options
    if (options?.includeArchived) {
      // Add archived rooms
      const allRooms = Array.from(this.mockRoomDetails.values());
      const archivedRooms = allRooms.filter(room => this.mockArchived.get(room.id));
      rooms = [...rooms, ...archivedRooms];
    }

    // Sort by updatedAt (most recent first)
    return rooms.sort((a, b) => {
      const dateA = a.updatedAt || a.createdAt;
      const dateB = b.updatedAt || b.createdAt;
      return dateB - dateA;
    });
  }

  async getRoomById(roomId: string, options?: GetRoomOptions): Promise<RoomModel> {
    await this.delay(200);

    const room = this.mockRoomDetails.get(roomId);
    if (!room) {
      throw new Error(`Room ${roomId} not found`);
    }

    // Get fresh unread count
    const userId = 'user_1'; // In real implementation, this would come from auth
    const unreadKey = `${roomId}_${userId}`;
    //const unreadCount = this.mockUnreadCounts.get(unreadKey) || 0;

    return {
      ...room,
      //unreadCount // Ensure we have latest unread count
    };
  }

  async getRoomMembers(roomId: string, options?: LoadUserRoomsOptions): Promise<UserModelSummary[]> {
    await this.delay(300);

    const members = this.mockMembers.get(roomId);
    if (!members) {
      throw new Error(`Members for room ${roomId} not found`);
    }

    return members;
  }

  async markRoomAsRead(roomId: string, userId: string): Promise<void> {
    await this.delay(200);

    const key = `${roomId}_${userId}`;
    //this.mockUnreadCounts.set(key, 0);

    // Update room object
    const room = this.mockRoomDetails.get(roomId);
    if (room) {
      room.unreadCount = 0;
      this.mockRoomDetails.set(roomId, room);
    }
  }

  async archiveRoom(roomId: string, userId: string): Promise<void> {
    await this.delay(300);

    this.mockArchived.set(roomId, true);

    // Remove from user's active rooms
    const userRooms = this.mockRooms.get(userId) || [];
    const updatedRooms = userRooms.filter(room => room.id !== roomId);
    this.mockRooms.set(userId, updatedRooms);

    // Update room object
    const room = this.mockRoomDetails.get(roomId);
    if (room) {
      room.updatedAt = Date.now();
      this.mockRoomDetails.set(roomId, room);
    }
  }

  async unarchiveRoom(roomId: string, userId: string): Promise<void> {
    await this.delay(300);

    this.mockArchived.set(roomId, false);

    // Add back to user's active rooms
    const room = this.mockRoomDetails.get(roomId);
    if (room) {
      const userRooms = this.mockRooms.get(userId) || [];
      this.mockRooms.set(userId, [...userRooms, room]);

      room.updatedAt = Date.now();
      this.mockRoomDetails.set(roomId, room);
    }
  }

  async favoriteRoom(roomId: string, userId: string): Promise<void> {
    await this.delay(200);

    let favorites = this.mockFavorites.get(userId);
    if (!favorites) {
      favorites = new Set<string>();
    }
    favorites.add(roomId);
    this.mockFavorites.set(userId, favorites);

    // Update room object
    const room = this.mockRoomDetails.get(roomId);
    if (room) {
      // Note: RoomModel doesn't have isStarred, but we track separately
      this.mockRoomDetails.set(roomId, room);
    }
  }

  async unfavoriteRoom(roomId: string, userId: string): Promise<void> {
    await this.delay(200);

    const favorites = this.mockFavorites.get(userId);
    if (favorites) {
      favorites.delete(roomId);
      this.mockFavorites.set(userId, favorites);
    }
  }

  async muteRoom(roomId: string, userId: string, duration?: number): Promise<void> {
    await this.delay(200);

    this.mockMuted.set(`${roomId}_${userId}`, {
      muted: true,
      until: duration ? new Date(Date.now() + duration) : undefined
    });
  }

  async unmuteRoom(roomId: string, userId: string): Promise<void> {
    await this.delay(200);

    this.mockMuted.delete(`${roomId}_${userId}`);
  }

  async leaveRoom(roomId: string, userId: string): Promise<void> {
    await this.delay(400);

    // Remove from user's rooms
    const userRooms = this.mockRooms.get(userId) || [];
    const updatedRooms = userRooms.filter(room => room.id !== roomId);
    this.mockRooms.set(userId, updatedRooms);

    // Remove user from room members
    const roomMembers = this.mockRoomMembers.get(roomId) || [];
    const updatedMembers = roomMembers.filter(member => member.user.id !== userId);
    this.mockRoomMembers.set(roomId, updatedMembers);

    // Update members list (UserModelSummary[])
    const memberSummaries = updatedMembers.map(m => m.user);
    this.mockMembers.set(roomId, memberSummaries);

    // Update room memberCount if RoomModel had it (it doesn't in current types)
    // We track separately or just leave as is
  }

  async deleteRoom(roomId: string): Promise<void> {
    await this.delay(500);

    // Remove from all data structures
    this.mockRoomDetails.delete(roomId);
    this.mockMembers.delete(roomId);
    this.mockRoomMembers.delete(roomId);

    // Remove from all users' room lists
    this.mockRooms.forEach((rooms, userId) => {
      const updatedRooms = rooms.filter(room => room.id !== roomId);
      this.mockRooms.set(userId, updatedRooms);
    });

    // Clean up other maps
    this.mockArchived.delete(roomId);

    // Clean up unread counts
    const unreadKeys = Array.from(this.mockUnreadCounts.keys());
    unreadKeys.forEach(key => {
      if (key.startsWith(`${roomId}_`)) {
        //this.mockUnreadCounts.delete(key);
      }
    });
  }

  // ========== HELPER METHODS ==========

  /**
   * Get room members as RoomMember[] (not exposed by interface)
   */
  getRoomMembersDetails(roomId: string): RoomMember[] {
    return this.mockRoomMembers.get(roomId) || [];
  }

  /**
   * Check if room is favorited by user
   */
  isRoomFavorited(roomId: string, userId: string): boolean {
    const favorites = this.mockFavorites.get(userId);
    return favorites?.has(roomId) || false;
  }

  /**
   * Check if room is muted for user
   */
  isRoomMuted(roomId: string, userId: string): { muted: boolean; until?: Date } {
    return this.mockMuted.get(`${roomId}_${userId}`) || { muted: false };
  }

  /**
   * Check if room is archived
   */
  isRoomArchived(roomId: string): boolean {
    return this.mockArchived.get(roomId) || false;
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
