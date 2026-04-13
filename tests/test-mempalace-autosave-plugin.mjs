import assert from "node:assert/strict"
import { mkdtemp, readFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { pathToFileURL } from "node:url"

async function loadPlugin() {
  const moduleUrl = pathToFileURL(path.resolve(".opencode/plugins/mempalace-autosave.js")).href
  return import(moduleUrl)
}

function createToolTagMatcher(commandRecorder) {
  return async (strings, ...values) => {
    commandRecorder.push({ strings: Array.from(strings), values })
  }
}

function createClient(events) {
  return {
    session: {
      messages: async () => ({ data: [] }),
    },
    app: {
      log: async (entry) => {
        events.logs.push(entry)
      },
    },
  }
}

async function runPluginEvent(plugin, event) {
  await plugin.event({ event })
}

async function testSanitizesToolOutput() {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "opencode-mempalace-plugin-"))
  process.env.MEMPALACE_AUTOSAVE_DIR = path.join(tempDir, "autosave")
  process.env.MEMPALACE_PYTHON = "/usr/bin/python3"

  const { MemPalaceAutosavePlugin } = await loadPlugin()
  const calls = []
  const events = { logs: [] }
  const plugin = await MemPalaceAutosavePlugin({
    $: createToolTagMatcher(calls),
    directory: tempDir,
    client: createClient(events),
  })

  await runPluginEvent(plugin, {
    type: "message.updated",
    properties: {
      info: {
        id: "user-1",
        sessionID: "session-a",
        role: "user",
        time: { created: 1 },
      },
    },
  })
  await runPluginEvent(plugin, {
    type: "message.part.updated",
    properties: {
      part: {
        id: "user-part-1",
        sessionID: "session-a",
        messageID: "user-1",
        type: "text",
        text: "show me secrets",
      },
    },
  })
  await runPluginEvent(plugin, {
    type: "message.updated",
    properties: {
      info: {
        id: "assistant-1",
        sessionID: "session-a",
        role: "assistant",
        time: { created: 2 },
      },
    },
  })
  await runPluginEvent(plugin, {
    type: "message.part.updated",
    properties: {
      part: {
        id: "tool-part-1",
        sessionID: "session-a",
        messageID: "assistant-1",
        type: "tool",
        tool: "bash",
        state: {
          status: "completed",
          output: "API_KEY=super-secret-token",
        },
      },
    },
  })
  await runPluginEvent(plugin, {
    type: "session.idle",
    properties: {
      sessionID: "session-a",
    },
  })

  const transcriptPath = path.join(process.env.MEMPALACE_AUTOSAVE_DIR, "sessions", "session-a.txt")
  const transcript = await readFile(transcriptPath, "utf8")

  assert.match(transcript, /^> show me secrets/m)
  assert.match(transcript, /\[tool:bash:completed\]/)
  assert.doesNotMatch(transcript, /super-secret-token/)
  assert.equal(calls.length, 1)
  assert.equal(events.logs.length, 0)
}

async function testSkipsNoopIdleFlushes() {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "opencode-mempalace-plugin-"))
  process.env.MEMPALACE_AUTOSAVE_DIR = path.join(tempDir, "autosave")
  process.env.MEMPALACE_PYTHON = "/usr/bin/python3"

  const { MemPalaceAutosavePlugin } = await loadPlugin()
  const calls = []
  const events = { logs: [] }
  const plugin = await MemPalaceAutosavePlugin({
    $: createToolTagMatcher(calls),
    directory: tempDir,
    client: createClient(events),
  })

  await runPluginEvent(plugin, {
    type: "message.updated",
    properties: {
      info: {
        id: "user-1",
        sessionID: "session-b",
        role: "user",
        time: { created: 1 },
      },
    },
  })
  await runPluginEvent(plugin, {
    type: "message.part.updated",
    properties: {
      part: {
        id: "user-part-1",
        sessionID: "session-b",
        messageID: "user-1",
        type: "text",
        text: "hello",
      },
    },
  })
  await runPluginEvent(plugin, {
    type: "message.updated",
    properties: {
      info: {
        id: "assistant-1",
        sessionID: "session-b",
        role: "assistant",
        time: { created: 2 },
      },
    },
  })
  await runPluginEvent(plugin, {
    type: "message.part.updated",
    properties: {
      part: {
        id: "assistant-part-1",
        sessionID: "session-b",
        messageID: "assistant-1",
        type: "text",
        text: "hi there",
      },
    },
  })
  await runPluginEvent(plugin, {
    type: "session.idle",
    properties: {
      sessionID: "session-b",
    },
  })
  await runPluginEvent(plugin, {
    type: "session.idle",
    properties: {
      sessionID: "session-b",
    },
  })

  assert.equal(calls.length, 1)
  assert.equal(events.logs.length, 0)
}

async function main() {
  await testSanitizesToolOutput()
  await testSkipsNoopIdleFlushes()
  console.log("plugin tests passed")
}

await main()
