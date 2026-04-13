#!/usr/bin/env python3

import argparse
import hashlib
from datetime import datetime
from pathlib import Path

from mempalace.config import MempalaceConfig
from mempalace.convo_miner import chunk_exchanges, detect_convo_room
from mempalace.normalize import normalize
from mempalace.palace import get_collection


def stable_wing(value: str) -> str:
  normalized = value.strip().lower().replace("-", "_").replace(" ", "_")
  normalized = "".join(ch for ch in normalized if ch.isalnum() or ch == "_")
  return normalized or "opencode"


def stable_id(source_file: str, chunk_index: int) -> str:
  digest = hashlib.sha256(f"{source_file}:{chunk_index}".encode("utf-8")).hexdigest()[:24]
  return f"drawer_autosave_{digest}"


SYNC_META_FIELDS = (
  "wing",
  "room",
  "source_file",
  "chunk_index",
  "added_by",
  "ingest_mode",
  "extract_mode",
  "autosave",
)


def sync_transcript(collection, transcript_path: Path, wing: str, agent: str) -> int:
  source_file = str(transcript_path.resolve())
  content = normalize(source_file)

  existing = collection.get(where={"source_file": source_file}, include=["documents", "metadatas"])
  existing_ids = set(existing.get("ids", []))
  existing_docs = dict(zip(existing.get("ids", []), existing.get("documents", [])))
  existing_meta = dict(zip(existing.get("ids", []), existing.get("metadatas", [])))

  if not content.strip():
    if existing_ids:
      collection.delete(ids=list(existing_ids))
    return 0

  chunks = chunk_exchanges(content)
  room = detect_convo_room(content)

  if not chunks:
    if existing_ids:
      collection.delete(ids=list(existing_ids))
    return 0

  ids = [stable_id(source_file, chunk["chunk_index"]) for chunk in chunks]
  now = datetime.now().isoformat()

  next_metas = [
    {
      "wing": wing,
      "room": room,
      "source_file": source_file,
      "chunk_index": chunk["chunk_index"],
      "added_by": agent,
      "filed_at": now,
      "ingest_mode": "convos",
      "extract_mode": "exchange",
      "autosave": True,
    }
    for chunk in chunks
  ]

  upsert_ids = []
  upsert_docs = []
  upsert_meta = []

  for drawer_id, chunk, meta in zip(ids, chunks, next_metas):
    previous_doc = existing_docs.get(drawer_id)
    previous_meta = existing_meta.get(drawer_id) or {}

    same_doc = previous_doc == chunk["content"]
    same_meta = all(previous_meta.get(field) == meta[field] for field in SYNC_META_FIELDS)
    if same_doc and same_meta:
      continue

    upsert_ids.append(drawer_id)
    upsert_docs.append(chunk["content"])
    upsert_meta.append(meta)

  if upsert_ids:
    collection.upsert(ids=upsert_ids, documents=upsert_docs, metadatas=upsert_meta)

  stale_ids = sorted(existing_ids - set(ids))
  if stale_ids:
    collection.delete(ids=stale_ids)

  return len(upsert_ids) + len(stale_ids)


def main() -> int:
  parser = argparse.ArgumentParser(description="Sync OpenCode autosave transcripts into MemPalace")
  parser.add_argument("path", help="Transcript file or autosave directory")
  parser.add_argument("--wing", default="opencode", help="Wing name for synced transcripts")
  parser.add_argument("--agent", default="opencode-autosave", help="Recorded added_by value")
  parser.add_argument("--palace", default=None, help="Override palace path")
  args = parser.parse_args()

  palace_path = args.palace or MempalaceConfig().palace_path
  wing = stable_wing(args.wing)
  target = Path(args.path).expanduser().resolve()
  collection = get_collection(palace_path)

  files = [target] if target.is_file() else sorted(target.rglob("*.txt"))
  files = [file for file in files if "/.state/" not in str(file)]

  total = 0
  for file in files:
    total += sync_transcript(collection, file, wing=wing, agent=args.agent)

  print(f"Synced {len(files)} transcript file(s), {total} changed drawer(s)")
  return 0


if __name__ == "__main__":
  raise SystemExit(main())
