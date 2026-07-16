#!/usr/bin/env bash
#
# Runs every *_test.sh in test/. No test framework is used anywhere in this repo
# (see the spec's Testing Decisions) — each test file is a plain bash runner that
# exits non-zero on failure. New seams add their own test/<seam>_test.sh here.
set -u

here="$(cd "$(dirname "$0")" && pwd)"
status=0

for t in "$here"/*_test.sh; do
  [ -e "$t" ] || continue
  printf '=== %s ===\n' "$(basename "$t")"
  bash "$t" || status=1
  printf '\n'
done

if [ "$status" -eq 0 ]; then
  printf 'All test files passed.\n'
else
  printf 'Some test files FAILED.\n'
fi
exit "$status"
