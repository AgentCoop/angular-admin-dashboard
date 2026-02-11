// room-manager.service.ts
import { Injectable, OnDestroy, Inject } from '@angular/core';
import {
  BehaviorSubject,
  Observable,
  Subject,
  Subscription,
  filter,
  map,
  takeUntil,
  scan,
  shareReplay,
  distinctUntilChanged,
  switchMap,
  merge,
  of,
  from,
  finalize
} from 'rxjs';
import { ChatService } from './chat.service';
import {
  RoomModel,
  RoomDescriptor,
} from '../models/room.model';
import {
  UserModel,
  UserModelSummary,
} from '../models/user.model';


@Injectable({
  providedIn: 'root'
})
export class RoomManagerService implements OnDestroy {
  // State
  private readonly rooms = new Map<string, RoomDescriptor>();

  // Subscriptions
  private chatEventsSubscription?: Subscription;


  constructor(
    private chatService: ChatService,
    @Inject(Window) private window: Window
  ) {

  }


  private async fetchRoomData(roomId: string): Promise<RoomModel> {
    // Implement room data fetching logic
    // This could be from cache, API, or ChatService

    // For now, return a mock room
    return {
      id: roomId,
      name: `Room ${roomId}`,
      type: 'group',
      memberCount: 0,
      //isMuted: false,
      //isStarred: false,

      createdAt: Date.now(),
    } as RoomModel;
  }

  // Lifecycle

  ngOnDestroy(): void {
    if (this.chatEventsSubscription) {
      this.chatEventsSubscription.unsubscribe();
    }

    // Close all rooms on service destruction
    //this.closeAllRooms('service_destroyed').catch(console.error);

  }
}
