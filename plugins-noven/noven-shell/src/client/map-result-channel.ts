/** Command capability for an explicitly requested map result in a reading surface. */
import type { WidgetSend } from './widgets.tsx'

/**
 * Limit a result writer to one module and the two map result commands.
 * @param moduleId - Module that owns the consumed generation request.
 * @param write - Persistence owner, including its revision and failure handling.
 * @returns A sender that rejects editor commands and other modules.
 */
export function mapResultChannel(moduleId: string, write: WidgetSend): WidgetSend {
  return command => {
    if ((command.kind !== 'record_map_terrain' && command.kind !== 'write_map_document') || command.moduleId !== moduleId) {
      return Promise.resolve(false)
    }
    return write(command)
  }
}
