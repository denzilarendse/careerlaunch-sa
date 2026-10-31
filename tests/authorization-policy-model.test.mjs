import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const migration = await readFile(new URL("../database/migrations/20261002_structural_upgrade.sql", import.meta.url), "utf8");
const users = { alice: "10000000-0000-4000-8000-000000000001", bob: "20000000-0000-4000-8000-000000000002" };
const drafts = [
  { user_id: users.alice, content: { marker: "ALICE_SYNTHETIC" } },
  { user_id: users.bob, content: { marker: "BOB_SYNTHETIC" } },
];
const shortlist = [
  { user_id: users.alice, opportunity_id: "30000000-0000-4000-8000-000000000001" },
  { user_id: users.bob, opportunity_id: "30000000-0000-4000-8000-000000000002" },
];
const storage = [
  { bucket_id: "candidate-documents", name: `${users.alice}/alice-synthetic.pdf` },
  { bucket_id: "candidate-documents", name: `${users.bob}/bob-synthetic.pdf` },
];
const ownsRow = (authUserId, row) => Boolean(authUserId && authUserId === row.user_id);
const ownsObject = (authUserId, object) =>
  Boolean(authUserId && object.bucket_id === "candidate-documents" && object.name.split("/")[0] === authUserId);

test("migration enables RLS and owner-scopes every CV draft operation", () => {
  assert.match(migration, /alter table public\.cv_drafts enable row level security/i);
  for (const operation of ["select", "insert", "update", "delete"]) {
    assert.match(migration, new RegExp(`create policy cv_drafts_${operation}_own[\\s\\S]*?for ${operation} to authenticated[\\s\\S]*?auth\\.uid\\(\\)\\) = user_id`, "i"));
  }
});

test("migration enables RLS and owner-scopes shortlist read, insert and delete", () => {
  assert.match(migration, /alter table public\.shortlisted_opportunities enable row level security/i);
  for (const operation of ["select", "insert", "delete"]) {
    assert.match(migration, new RegExp(`create policy shortlist_${operation}_own[\\s\\S]*?for ${operation} to authenticated[\\s\\S]*?auth\\.uid\\(\\)\\) = user_id`, "i"));
  }
});

test("migration owner-scopes all candidate-document storage operations", () => {
  for (const operation of ["select", "insert", "update", "delete"]) {
    assert.match(migration, new RegExp(`candidate_documents_${operation}_own[\\s\\S]*?for ${operation} to authenticated[\\s\\S]*?bucket_id='candidate-documents'[\\s\\S]*?storage\\.foldername\\(name\\)\\)\\[1\\]\\s*=\\s*\\(select auth\\.uid\\(\\)\\)::text`, "i"));
  }
});

test("synthetic two-account model: users only see and change their own CV drafts", () => {
  assert.deepEqual(drafts.filter((row) => ownsRow(users.alice, row)).map((row) => row.content.marker), ["ALICE_SYNTHETIC"]);
  assert.deepEqual(drafts.filter((row) => ownsRow(users.bob, row)).map((row) => row.content.marker), ["BOB_SYNTHETIC"]);
  assert.equal(ownsRow(users.alice, drafts[1]), false);
  assert.equal(ownsRow(users.bob, drafts[0]), false);
  assert.equal(ownsRow(null, drafts[0]), false);
  assert.equal(ownsRow(users.alice, { user_id: users.bob }), false); // forged cross-user insert/update
});

test("synthetic two-account model: shortlist and storage objects remain owner-isolated", () => {
  assert.deepEqual(shortlist.filter((row) => ownsRow(users.alice, row)).map((row) => row.user_id), [users.alice]);
  assert.equal(ownsRow(users.alice, shortlist[1]), false);
  assert.deepEqual(storage.filter((object) => ownsObject(users.alice, object)).map((object) => object.name), [`${users.alice}/alice-synthetic.pdf`]);
  assert.equal(ownsObject(users.alice, storage[1]), false);
  assert.equal(ownsObject(null, storage[0]), false);
});
