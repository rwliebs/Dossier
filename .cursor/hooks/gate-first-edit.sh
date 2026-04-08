#!/bin/bash
# preToolUse hook (matcher: Write)
# Gates the FIRST file edit in a session behind the mandatory process checklist.
# Uses a per-conversation lock file: if the lock doesn't exist, block the edit
# and inject the checklist. Once the user approves and the agent creates the lock,
# subsequent edits pass through.
#
# Agent unlock (after user says proceed): conversation_id matches the parent chat's
# agent transcript folder name under:
#   ~/.cursor/projects/<workspace>/agent-transcripts/<conversation_id>/<conversation_id>.jsonl
# Create: mkdir -p /tmp/dossier-scope-locks && touch "/tmp/dossier-scope-locks/${conversation_id}.lock"

input=$(cat)

conversation_id=$(echo "$input" | grep -o '"conversation_id"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | grep -o '"[^"]*"$' | tr -d '"')

if [ -z "$conversation_id" ]; then
  # Can't determine conversation — fail open to avoid blocking everything
  echo '{"permission":"allow"}'
  exit 0
fi

LOCK_DIR="/tmp/dossier-scope-locks"
LOCK_FILE="$LOCK_DIR/$conversation_id.lock"

if [ -f "$LOCK_FILE" ]; then
  # Checklist already completed for this conversation — allow edits
  echo '{"permission":"allow"}'
  exit 0
fi

# First edit attempt — block it and inject the checklist
file_path=$(echo "$input" | grep -o '"path"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | grep -o '"[^"]*"$' | tr -d '"')

mkdir -p "$LOCK_DIR"

cat << EOF
{
  "permission": "deny",
  "user_message": "⛔ First file edit blocked — process checklist required before any code changes. conversation_id=${conversation_id}",
  "agent_message": "BLOCKED: You attempted to edit ${file_path} but the mandatory process checklist has not been completed for this session.\n\nYou MUST complete the following BEFORE any file edit is allowed:\n\n1. SCOPE DEFINITION — List every file you intend to modify and why. Each file must be either: (a) explicitly named by the user, or (b) directly required to solve the user's stated problem. If neither applies, ASK the user before including it.\n\n2. RULES AUDIT — List applicable rules and how you will comply.\n\n3. REQUIREMENTS AUDIT — List what the user asked for, in their words.\n\n4. UNCERTAINTY REGISTER — List knowns, unknowns, and assumptions. If assumptions exist, ASK the user.\n\n5. Present this checklist to the user and WAIT for their 'proceed' command.\n\n6. After the user says 'proceed', create the lock file at /tmp/dossier-scope-locks/${conversation_id}.lock to unlock edits.\n\nDo NOT attempt to edit any file until the user has approved the checklist."
}
EOF
exit 0
