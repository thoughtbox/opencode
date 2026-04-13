import importlib.util
import sys
import tempfile
import unittest
from pathlib import Path
from types import ModuleType


def install_mempalace_stubs():
    mempalace = ModuleType("mempalace")
    config = ModuleType("mempalace.config")
    convo_miner = ModuleType("mempalace.convo_miner")
    normalize = ModuleType("mempalace.normalize")
    palace = ModuleType("mempalace.palace")

    class DummyConfig:
        @property
        def palace_path(self):
            return "/tmp/mempalace-test-palace"

    def chunk_exchanges(content):
        chunks = []
        current = []
        chunk_index = 0
        for line in content.splitlines():
            if line.startswith("> ") and current:
                chunks.append({"content": "\n".join(current), "chunk_index": chunk_index})
                chunk_index += 1
                current = [line]
            elif line.strip() or current:
                current.append(line)
        if current:
            chunks.append({"content": "\n".join(current), "chunk_index": chunk_index})
        return chunks

    config.MempalaceConfig = DummyConfig
    convo_miner.chunk_exchanges = chunk_exchanges
    convo_miner.detect_convo_room = lambda content: "general"
    normalize.normalize = lambda filepath: Path(filepath).read_text(encoding="utf-8")
    palace.get_collection = lambda palace_path: None

    sys.modules.setdefault("mempalace", mempalace)
    sys.modules["mempalace.config"] = config
    sys.modules["mempalace.convo_miner"] = convo_miner
    sys.modules["mempalace.normalize"] = normalize
    sys.modules["mempalace.palace"] = palace


install_mempalace_stubs()


MODULE_PATH = Path(__file__).resolve().parent.parent / "mempalace-autosave-sync.py"
SPEC = importlib.util.spec_from_file_location("mempalace_autosave_sync", MODULE_PATH)
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class FakeCollection:
    def __init__(self):
        self.rows = {}
        self.upsert_calls = []
        self.delete_calls = []

    def get(self, where=None, include=None):
        source_file = where.get("source_file") if where else None
        ids = []
        docs = []
        metas = []
        for drawer_id, row in self.rows.items():
            if source_file and row["metadata"].get("source_file") != source_file:
                continue
            ids.append(drawer_id)
            docs.append(row["document"])
            metas.append(row["metadata"])
        return {"ids": ids, "documents": docs, "metadatas": metas}

    def upsert(self, ids, documents, metadatas):
        self.upsert_calls.append(list(ids))
        for drawer_id, document, metadata in zip(ids, documents, metadatas):
            self.rows[drawer_id] = {"document": document, "metadata": metadata}

    def delete(self, ids):
        self.delete_calls.append(list(ids))
        for drawer_id in ids:
            self.rows.pop(drawer_id, None)


class AutosaveSyncTests(unittest.TestCase):
    def write_transcript(self, root: Path, name: str, content: str) -> Path:
        path = root / name
        path.write_text(content, encoding="utf-8")
        return path

    def test_sync_is_idempotent_for_unchanged_transcript(self):
        collection = FakeCollection()
        with tempfile.TemporaryDirectory() as temp_dir:
            transcript = self.write_transcript(
                Path(temp_dir),
                "session.txt",
                "> hello\nreply\n\n> next\nanswer\n",
            )

            first = MODULE.sync_transcript(collection, transcript, wing="opencode", agent="tester")
            second = MODULE.sync_transcript(collection, transcript, wing="opencode", agent="tester")

        self.assertGreater(first, 0)
        self.assertEqual(second, 0)
        self.assertEqual(len(collection.upsert_calls), 1)
        self.assertEqual(collection.delete_calls, [])

    def test_sync_deletes_stale_chunks_when_transcript_shrinks(self):
        collection = FakeCollection()
        with tempfile.TemporaryDirectory() as temp_dir:
            transcript = self.write_transcript(
                Path(temp_dir),
                "session.txt",
                "> hello\nreply\n\n> next\nanswer\n",
            )
            MODULE.sync_transcript(collection, transcript, wing="opencode", agent="tester")

            transcript.write_text("> hello\nreply\n", encoding="utf-8")
            changed = MODULE.sync_transcript(collection, transcript, wing="opencode", agent="tester")

        self.assertGreater(changed, 0)
        self.assertEqual(len(collection.rows), 1)
        self.assertEqual(len(collection.delete_calls), 1)


if __name__ == "__main__":
    unittest.main()
