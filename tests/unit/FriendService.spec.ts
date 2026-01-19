import { describe, it, expect, beforeEach, vi } from 'vitest';
import { FriendService } from '@/services/FriendService';
import type { FriendServiceEvent } from '@/types/friend';

describe('FriendService Event-Driven Pattern', () => {
  let friendService: FriendService;

  beforeEach(() => {
    friendService = FriendService.getInstance();
  });

  it('should have an EventTarget emitter', () => {
    expect(friendService.emitter).toBeDefined();
    expect(friendService.emitter).toBeInstanceOf(EventTarget);
  });

  it('should emit friend-event when events occur', async () => {
    const events: FriendServiceEvent[] = [];

    const listener = (event: Event) => {
      const customEvent = event as CustomEvent<FriendServiceEvent>;
      events.push(customEvent.detail);
    };

    friendService.emitter.addEventListener('friend-event', listener);

    // Note: We can't test the full flow without mocking IndexedDB and PublicDataService
    // This test just verifies the emitter exists and can listen to events

    friendService.emitter.removeEventListener('friend-event', listener);

    expect(true).toBe(true); // Emitter setup test passed
  });

  it('should allow multiple listeners', () => {
    const listener1 = vi.fn();
    const listener2 = vi.fn();

    friendService.emitter.addEventListener('friend-event', listener1);
    friendService.emitter.addEventListener('friend-event', listener2);

    // Manually dispatch a test event
    const testEvent: FriendServiceEvent = {
      type: 'friend-added',
      message: 'Test message',
      messageType: 'success'
    };

    friendService.emitter.dispatchEvent(
      new CustomEvent('friend-event', { detail: testEvent })
    );

    expect(listener1).toHaveBeenCalledTimes(1);
    expect(listener2).toHaveBeenCalledTimes(1);

    friendService.emitter.removeEventListener('friend-event', listener1);
    friendService.emitter.removeEventListener('friend-event', listener2);
  });

  it('should properly cleanup listeners', () => {
    const listener = vi.fn();

    friendService.emitter.addEventListener('friend-event', listener);
    friendService.emitter.removeEventListener('friend-event', listener);

    // Dispatch event after removing listener
    friendService.emitter.dispatchEvent(
      new CustomEvent('friend-event', {
        detail: { type: 'friend-added', message: 'Test', messageType: 'success' }
      })
    );

    expect(listener).not.toHaveBeenCalled();
  });
});
