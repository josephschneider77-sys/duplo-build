import { undoStatus } from './status.ts'

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(msg)
}

const cleared = 'All cleared — undo if that was a whoops'

assert(undoStatus(null) === 'Nothing to undo', undoStatus(null))
assert(undoStatus('place') === 'Took that brick back', undoStatus('place'))
assert(undoStatus('delete') === 'Put that brick back', undoStatus('delete'))
assert(undoStatus('clear') === 'Brought your bricks back', undoStatus('clear'))

for (const kind of ['place', 'delete', 'clear'] as const) {
  const msg = undoStatus(kind)
  assert(msg !== cleared, `${kind} must replace the clear status`)
  assert(msg !== undoStatus(null), `${kind} is not the empty undo`)
}

const messages = new Set(['place', 'delete', 'clear'].map((kind) => undoStatus(kind as 'place' | 'delete' | 'clear')))
assert(messages.size === 3, 'each undo path has its own status')

console.log('status checks ok')
