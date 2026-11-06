---
description: Pointer to the argent skill; the full argent rule lives in ~/.claude/skills/argent/SKILL.md so it loads only in sessions that use argent
alwaysApply: true
---

Before the first argent MCP tool call (`mcp__argent__*`) or `argent` CLI command in a session, or before
driving an iOS simulator, physical iPhone, Android emulator, Chromium (CDP) app or Fire TV device, load the
`argent` skill. It holds the availability check, device selection, the tapping rule and the skill routing.
