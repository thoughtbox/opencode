import { createHash } from "node:crypto"
import { chmod, mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"

const sessionCache = new Map()

function createSessionState() {
  return {
    messages: new Map(),
    nextSequence: 0,
    hydrated: false,
    dirty: false,
    pendingFlush: null,
  }
}

function getSessionState(sessionID) {
  let state = sessionCache.get(sessionID)
  if (!state) {
    state = createSessionState()
    sessionCache.set(sessionID, state)
  }
  return state
}

function mergeSessionStates(target, source) {
  for (const message of source.messages.values()) {
    let existing = target.messages.get(message.id)
    if (!existing) {
      existing = createMessageState(target, message.id, message.sessionID)
      existing.sequence = message.sequence
      target.messages.set(message.id, existing)
    }

    existing.role = message.role || existing.role
    existing.created = message.created || existing.created

    for (const partID of message.partOrder) {
      const part = message.parts.get(partID)
      if (!part) continue
      if (!existing.parts.has(partID)) {
        existing.partOrder.push(partID)
      }
      existing.parts.set(partID, part)
    }
  }

  target.nextSequence = Math.max(target.nextSequence, source.nextSequence)
  target.hydrated = true
}

function createMessageState(state, messageID, sessionID) {
  return {
    id: messageID,
    sessionID,
    role: null,
    created: 0,
    sequence: state.nextSequence++,
    parts: new Map(),
    partOrder: [],
  }
}

function getMessageState(sessionID, messageID) {
  const state = getSessionState(sessionID)
  let message = state.messages.get(messageID)
  if (!message) {
    message = createMessageState(state, messageID, sessionID)
    state.messages.set(messageID, message)
    state.dirty = true
  }
  return message
}

function orderedMessages(state) {
  return Array.from(state.messages.values()).sort((left, right) => {
    const leftCreated = Number(left.created || 0)
    const rightCreated = Number(right.created || 0)

    if (leftCreated > 0 && rightCreated > 0 && leftCreated !== rightCreated) {
      return leftCreated - rightCreated
    }

    return left.sequence - right.sequence
  })
}

function cleanText(value) {
  return String(value || "").replace(/\r\n/g, "\n").trim()
}

function collapseLines(value) {
  return cleanText(value).split("\n").map((line) => line.trim()).filter(Boolean).join(" ")
}

function sanitizePart(part) {
  if (!part || !part.id || !part.type) {
    return null
  }

  if (part.type === "text") {
    return {
      id: part.id,
      type: "text",
      ignored: Boolean(part.ignored),
      text: cleanText(part.text),
    }
  }

  if (part.type === "tool") {
    return {
      id: part.id,
      type: "tool",
      tool: String(part.tool || "tool"),
      status: String(part.state?.status || "unknown"),
    }
  }

  if (part.type === "patch") {
    return {
      id: part.id,
      type: "patch",
      files: Array.isArray(part.files) ? part.files.map(String).slice(0, 20) : [],
    }
  }

  if (part.type === "agent") {
    return {
      id: part.id,
      type: "agent",
      name: String(part.name || "agent"),
    }
  }

  if (part.type === "subtask") {
    return {
      id: part.id,
      type: "subtask",
      agent: String(part.agent || "subtask"),
    }
  }

  return null
}

function storePart(message, part) {
  const sanitized = sanitizePart(part)
  if (!sanitized) {
    return false
  }

  if (!message.parts.has(sanitized.id)) {
    message.partOrder.push(sanitized.id)
  }

  message.parts.set(sanitized.id, sanitized)
  return true
}

function applyMessageInfo(info) {
  if (!info?.id || !info.sessionID) {
    return
  }

  const state = getSessionState(info.sessionID)
  const message = getMessageState(info.sessionID, info.id)
  const previousRole = message.role
  const previousCreated = message.created

  message.role = info.role || previousRole
  message.created = Number(info.time?.created || previousCreated || 0)
  state.dirty = state.dirty || previousRole !== message.role || previousCreated !== message.created
}

function applyMessagePart(part) {
  if (!part?.messageID || !part.sessionID) {
    return
  }

  const state = getSessionState(part.sessionID)
  const message = getMessageState(part.sessionID, part.messageID)
  if (storePart(message, part)) {
    state.dirty = true
  }
}

function removeMessagePart(sessionID, messageID, partID) {
  const state = sessionCache.get(sessionID)
  const message = state?.messages.get(messageID)
  if (!message || !message.parts.has(partID)) {
    return
  }

  message.parts.delete(partID)
  message.partOrder = message.partOrder.filter((value) => value !== partID)
  state.dirty = true
}

function removeMessage(sessionID, messageID) {
  const state = sessionCache.get(sessionID)
  if (!state || !state.messages.delete(messageID)) {
    return
  }

  state.dirty = true
}

function loadSessionEntries(sessionID, entries) {
  const state = createSessionState()
  for (const entry of entries) {
    const info = entry?.info
    if (!info?.id) {
      continue
    }

    const message = createMessageState(state, info.id, sessionID)
    message.role = info.role || null
    message.created = Number(info.time?.created || 0)

    for (const part of Array.isArray(entry?.parts) ? entry.parts : []) {
      storePart(message, part)
    }

    state.messages.set(info.id, message)
  }

  state.hydrated = true
  state.dirty = true
  sessionCache.set(sessionID, state)
  return state
}

function renderAssistantFallback(parts) {
  const lines = []

  for (const part of parts) {
    if (part.type === "tool") {
      lines.push(`[tool:${part.tool}:${part.status}]`)
      continue
    }

    if (part.type === "patch" && part.files.length > 0) {
      lines.push(`[patch:${part.files.join(", ")}]`)
      continue
    }

    if (part.type === "agent") {
      lines.push(`[agent:${part.name}]`)
      continue
    }

    if (part.type === "subtask") {
      lines.push(`[subtask:${part.agent}]`)
    }
  }

  return lines
}

function renderMessageContent(message) {
  const parts = message.partOrder.map((id) => message.parts.get(id)).filter(Boolean)
  const text = parts
    .filter((part) => part.type === "text" && !part.ignored)
    .map((part) => cleanText(part.text))
    .filter(Boolean)

  if (text.length > 0) {
    return message.role === "user" ? collapseLines(text.join("\n\n")) : text.join("\n\n")
  }

  if (message.role !== "assistant") {
    return null
  }

  const fallback = renderAssistantFallback(parts)
  return fallback.length > 0 ? fallback.join("\n") : null
}

function renderSessionTranscript(state) {
  const lines = []
  let activeUser = null
  let assistantReplies = []

  const flush = () => {
    if (!activeUser) {
      assistantReplies = []
      return
    }

    lines.push(`> ${activeUser}`)
    if (assistantReplies.length > 0) {
      lines.push(assistantReplies.join("\n\n"))
    }
    lines.push("")

    activeUser = null
    assistantReplies = []
  }

  for (const message of orderedMessages(state)) {
    const content = renderMessageContent(message)
    if (!content) {
      continue
    }

    if (message.role === "user") {
      flush()
      activeUser = content
      continue
    }

    if (message.role === "assistant" && activeUser) {
      assistantReplies.push(content)
    }
  }

  flush()

  const transcript = lines.join("\n").trim()
  return transcript ? `${transcript}\n` : null
}

function coerceData(result) {
  if (Array.isArray(result)) return result
  if (Array.isArray(result?.data)) return result.data
  return []
}

function autosaveRoot(directory) {
  return process.env.MEMPALACE_AUTOSAVE_DIR || path.join(directory, ".mempalace-autosave")
}

async function ensurePrivateDir(directoryPath) {
  await mkdir(directoryPath, { recursive: true, mode: 0o700 })
  try {
    await chmod(directoryPath, 0o700)
  } catch {
    // Best-effort on filesystems that ignore chmod semantics.
  }
}

async function writePrivateFile(filePath, content) {
  await writeFile(filePath, content, { mode: 0o600 })
  try {
    await chmod(filePath, 0o600)
  } catch {
    // Best-effort on filesystems that ignore chmod semantics.
  }
}

async function readMarker(root, sessionID) {
  const markerPath = path.join(root, ".state", `${sessionID || "unknown-session"}.marker`)

  try {
    return (await readFile(markerPath, "utf8")).trim()
  } catch {
    return ""
  }
}

async function writeMarker(root, sessionID, marker) {
  const stateDir = path.join(root, ".state")
  await ensurePrivateDir(stateDir)
  await writePrivateFile(path.join(stateDir, `${sessionID || "unknown-session"}.marker`), `${marker}\n`)
}

function transcriptMarker(transcript) {
  return createHash("sha256").update(transcript).digest("hex")
}

async function writeTranscript({ directory, sessionID, transcript }) {
  const root = autosaveRoot(directory)
  const sessionDir = path.join(root, "sessions")
  const transcriptPath = path.join(sessionDir, `${sessionID || "unknown-session"}.txt`)

  await ensurePrivateDir(root)
  await ensurePrivateDir(sessionDir)
  await writePrivateFile(transcriptPath, transcript)

  return { root, transcriptPath }
}

async function hydrateSession(client, sessionID) {
  const current = getSessionState(sessionID)
  const messages = coerceData(await client.session.messages({ path: { id: sessionID } }))
  const hydrated = loadSessionEntries(sessionID, messages)

  if (current !== hydrated) {
    mergeSessionStates(current, hydrated)
    current.dirty = true
    sessionCache.set(sessionID, current)
    return current
  }

  return hydrated
}

async function runSync({ $, directory, transcriptPath }) {
  const python = process.env.MEMPALACE_PYTHON
  if (!python) return

  const scriptPath = path.join(directory, "mempalace-autosave-sync.py")
  await $`${python} ${scriptPath} ${transcriptPath} --wing ${path.basename(directory)}`
}

async function logWarn(client, message, extra) {
  await client.app.log({
    body: {
      service: "mempalace-autosave",
      level: "warn",
      message,
      extra,
    },
  })
}

async function flushSession({ $, client, directory, sessionID }) {
  let state = getSessionState(sessionID)

  if (!state.hydrated) {
    try {
      state = await hydrateSession(client, sessionID)
    } catch (error) {
      await logWarn(client, "MemPalace autosave could not hydrate session messages", {
        sessionID,
        error: error instanceof Error ? error.message : String(error),
      })
      return
    }
  }

  if (!state.dirty) {
    return
  }

  const transcript = renderSessionTranscript(state)
  if (!transcript) {
    state.dirty = false
    return
  }

  const root = autosaveRoot(directory)
  const marker = transcriptMarker(transcript)
  if ((await readMarker(root, sessionID)) === marker) {
    state.dirty = false
    return
  }

  let output
  try {
    output = await writeTranscript({ directory, sessionID, transcript })
  } catch (error) {
    await logWarn(client, "MemPalace autosave could not write transcript", {
      sessionID,
      error: error instanceof Error ? error.message : String(error),
    })
    return
  }

  try {
    await runSync({ $, directory, transcriptPath: output.transcriptPath })
    await writeMarker(output.root, sessionID, marker)
    state.dirty = false
  } catch (error) {
    await logWarn(client, "MemPalace autosave sync failed", {
      sessionID,
      error: error instanceof Error ? error.message : String(error),
    })
  }
}

async function enqueueFlush(sessionID, task) {
  const state = getSessionState(sessionID)
  const previous = state.pendingFlush || Promise.resolve()
  const next = previous.catch(() => {}).then(task)

  state.pendingFlush = next.finally(() => {
    if (state.pendingFlush === next) {
      state.pendingFlush = null
    }
  })

  return state.pendingFlush
}

export const MemPalaceAutosavePlugin = async ({ $, directory, client }) => {
  return {
    event: async ({ event }) => {
      if (!event) {
        return
      }

      if (event.type === "message.updated") {
        applyMessageInfo(event.properties?.info)
        return
      }

      if (event.type === "message.part.updated") {
        applyMessagePart(event.properties?.part)
        return
      }

      if (event.type === "message.part.removed") {
        removeMessagePart(event.properties?.sessionID, event.properties?.messageID, event.properties?.partID)
        return
      }

      if (event.type === "message.removed") {
        removeMessage(event.properties?.sessionID, event.properties?.messageID)
        return
      }

      if (event.type === "session.deleted") {
        sessionCache.delete(event.properties?.info?.id)
        return
      }

      if (event.type === "session.idle") {
        const sessionID = event.properties?.sessionID || "unknown-session"
        await enqueueFlush(sessionID, () => flushSession({ $, client, directory, sessionID }))
      }
    },
  }
}
