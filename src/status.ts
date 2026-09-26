export type UndoKind = 'place' | 'delete' | 'clear'

/** Status line for every undo path, including undo when the stack is empty. */
export function undoStatus(kind: UndoKind | null): string {
  if (kind === 'place') return 'Took that brick back'
  if (kind === 'delete') return 'Put that brick back'
  if (kind === 'clear') return 'Brought your bricks back'
  return 'Nothing to undo'
}
