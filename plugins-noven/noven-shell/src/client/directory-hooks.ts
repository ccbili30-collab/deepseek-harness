import { useSyncExternalStoreWithSelector } from 'use-sync-external-store/shim/with-selector'
import type { HostObservable, SnapshotSelectorHook } from '@deepseek-ai/dsh-client-ui-slots'

/**
 * Bind a raw observable to the selector hooks used by directly composed directory entries.
 * @param source - Observable owned by the current canvas Session.
 * @returns A stable React selector hook for the source.
 */
export function bindSnapshotSelector<T>(source: HostObservable<T>): SnapshotSelectorHook<T> {
  const subscribe = (listener: () => void): (() => void) => source.subscribe(listener)
  const getSnapshot = (): T => source.getSnapshot()
  return function useSelector<S>(selector: (value: T) => S, isEqual?: (left: S, right: S) => boolean): S {
    return useSyncExternalStoreWithSelector(subscribe, getSnapshot, undefined, selector, isEqual)
  }
}
